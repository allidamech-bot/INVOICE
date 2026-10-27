import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {auditInventoryValuationCutover} from '../dist/src/lib/inventory-cost-cutover-audit.js';
const issueDate='2026-10-21';
function source(){
 const vault=emptyVault(),supplier={...createSupplier(),id:'test-supplier',nameEn:'Supplier'};
 const item={id:'test-stock',sku:'QA-STOCK',descriptionEn:'Carton',descriptionAr:'',
  unit:'Carton',inventoryTracking:'tracked',workspaceId:'default',branchId:'main',
  lastUnitPrice:'20.00',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',
  createdAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z'};
 const scope={workspaceId:'default',branchId:'main',itemId:item.id,
   warehouseId:defaultWarehouseId('main'),functionalCurrency:'USD'};
 vault.savedItems=[item];vault.suppliers=[supplier];
 function buy(id,quantity,cost,freight,date){
  const p=createPurchase(vault.purchases,[supplier],'USD');
  Object.assign(p,{id,number:'QA-'+id,date,dueDate:date,workspaceId:'default',
   branchId:'main',currency:'USD',freight,duty:'0.00',otherCosts:'0.00'});
  p.items=[{...createPurchaseItem(item),id:'line-'+id,quantity,unitCost:cost}];
  const posted=postPurchase(p,vault.savedItems,vault.inventoryMovements);
  vault.purchases.push(posted.purchase);
  vault.inventoryMovements.push(...posted.movements.map(m=>({...m,workspaceId:'default',branchId:'main'})));
  vault.savedItems=posted.savedItems;
 }
 buy('p1','4','5.00','4.00','2026-10-19');
 buy('p2','2','9.00','2.00','2026-10-20');
 const doc=createBlankDocument('invoice','INV-TEST',vault.company);
 Object.assign(doc,{id:'test-invoice',number:'INV-TEST',status:'final',
  kind:'invoice',role:'standard',issueDate,dueDate:issueDate,
  workspaceId:'default',branchId:'main',currency:'USD'});
 doc.items=[{...doc.items[0],id:'test-line',descriptionEn:'Carton',unit:'Carton',
  quantity:'3',unitPrice:'20',unitCost:'10.00',stockTreatment:'tracked',
  savedItemId:item.id,skuSnapshot:item.sku}];
 const posted=postIssuedInvoiceStock(vault,doc);
 assert.equal(posted.created,true);
 vault.inventoryMovements=posted.vault.inventoryMovements;
 vault.documents.push(doc);
 const policy={workspaceId:scope.workspaceId,branchId:scope.branchId,
  warehouseId:scope.warehouseId,itemId:scope.itemId,functionalCurrency:'USD',
  proposedBy:'unauthenticated-qa-operator',policyEvidenceId:'qa-method-reference',
  proposedAsOfDate:'2026-10-27',costingMethod:'moving-weighted-average',
  itemClass:'interchangeable',openingBasis:'verified-zero',openingEvidenceId:'qa-opening-zero'};
 const evidence={scope,orderedMovementIds:vault.inventoryMovements.map(m=>m.id),
  movements:vault.inventoryMovements,purchases:vault.purchases,documents:vault.documents};
 return {vault,policy,evidence};
}
const audit=(s)=>auditInventoryValuationCutover(s);
const codes=r=>r.blockers.map(x=>x.code);

test('22 cutover: validated source cost chain is only evidence-complete, NEVER production ready',()=>{
 const s=source(),old=JSON.stringify(s);
 const result=audit(s);
 assert.equal(result.evidenceCoverage,'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS');
 assert.equal(result.evaluatedMovementCount,3);
 assert.equal(result.calculatedQuantity,'3.0000');
 assert.equal(result.calculatedCarryingValue,'22.000000000000');
 assert.equal(result.frozenInvoiceCOGS,'30.00');
 assert.equal(result.modeledSaleCOGS,'22.00');
 assert.equal(result.historicInvoiceDifference,'8.00');
 assert.equal(result.ownerApprovalAuthenticated,false);
 assert.equal(result.accountingJournalVerified,false);
 assert.equal(result.productionReady,false);
 assert.deepEqual(codes(result),['NO_POSTED_GENERAL_LEDGER','UNVERIFIED_PERIOD_AUTHORITY',
  'UNVERIFIED_OWNER_SIGNATURE','UNVERIFIED_NET_REALISABLE_VALUE']);
 assert.equal(JSON.stringify(s),old,'read-only audit must not modify sources');
});

test('22 cutover: missing explicit policy cannot inherit USD from app display currency',()=>{
 const s=source();delete s.policy;
 const r=audit(s);
 assert.equal(r.evidenceCoverage,'INCOMPLETE');
 assert.ok(codes(r).includes('MISSING_POLICY_EVIDENCE'));
 assert.equal(r.productionReady,false);
});

test('22 cutover: FX scope and non-interchangeable stocks cannot be approved by WAC',()=>{
 const s=source();
 for(const itemClass of ['non-interchangeable','other']){
  const r=audit({...s,policy:{...s.policy,itemClass}});
  assert.ok(codes(r).includes('UNSUPPORTED_ITEM_CLASS'));
  assert.equal(r.evidenceCoverage,'INCOMPLETE');
 }
 const changed=audit({...s,policy:{...s.policy,functionalCurrency:'EUR'}});
 assert.ok(codes(changed).includes('MISSING_POLICY_EVIDENCE'));
});

test('22 cutover: missing or ambiguous workspace, branch or catalog source blocks',()=>{
 const s=source();
 for(const key of ['workspaces','branches','savedItems']){
  const vault=structuredClone(s.vault);
  vault[key]=[];
  const out=audit({...s,vault,evidence:{...s.evidence,
    movements:vault.inventoryMovements,purchases:vault.purchases,documents:vault.documents}});
  assert.ok(codes(out).includes('SCOPE_NOT_FOUND'));
 }
});

test('22 cutover: claimed zero opening contradicts an actual opening movement',()=>{
 const s=source(),vault=structuredClone(s.vault);
 vault.inventoryMovements.unshift({...vault.inventoryMovements[0],id:'qa-opening',
   type:'opening',sourceId:'',sourceNumber:'',quantity:'2',date:'2026-10-18',
   unitCost:'6',currency:'USD',evidence:undefined});
 const evidence={...s.evidence,movements:vault.inventoryMovements,
  orderedMovementIds:vault.inventoryMovements.map(m=>m.id)};
 const result=audit({...s,vault,evidence});
 assert.ok(codes(result).includes('UNVERIFIED_OPENING'));
 assert.equal(result.productionReady,false);
});

test('22 cutover: unproved opening claim must not be accepted as a verified balance',()=>{
 const s=source(),result=audit({...s,policy:{...s.policy,
   openingBasis:'documented-opening',openingEvidenceId:'missing-opening-file'}});
 assert.ok(codes(result).includes('UNVERIFIED_OPENING'));
});

test('22 cutover: valid IDs with changed movement COST must not substitute genuine vault evidence',()=>{
 const s=source(),tampered=structuredClone(s.evidence);
 tampered.movements[0].unitCost='900.00';
 const r=audit({...s,evidence:tampered});
 assert.ok(codes(r).includes('INCOMPLETE_CHRONOLOGY'));
 assert.equal(r.evidenceCoverage,'INCOMPLETE');
 assert.equal(r.productionReady,false);
});

test('22 cutover: id-stable forged invoice or posted purchase is not authentic source evidence',()=>{
 const s=source();
 for(const key of ['documents','purchases']){
  const modified=structuredClone(s.evidence);
  if(key==='documents')modified.documents[0].items[0].unitCost='0.00';
  else modified.purchases[0].items[0].unitCost='900';
  const r=audit({...s,evidence:modified});
  assert.ok(codes(r).includes('UNVERIFIED_MOVEMENTS'));
 }
});

test('22 cutover: unverified chronology or later stock movements block cutover simulation',()=>{
 const s=source();
 const reordered=structuredClone(s.evidence);
 reordered.orderedMovementIds=[reordered.orderedMovementIds[2],
   reordered.orderedMovementIds[0],reordered.orderedMovementIds[1]];
 const r=audit({...s,evidence:reordered});
 assert.ok(codes(r).includes('SOURCE_RECONCILIATION_FAILED'));
 const late=audit({...s,policy:{...s.policy,proposedAsOfDate:'2026-10-19'}});
 assert.ok(codes(late).includes('INCOMPLETE_CHRONOLOGY'));
});

test('22 cutover: unsupported physical movement always blocks even with an owner claim',()=>{
 const s=source(),vault=structuredClone(s.vault);
 const transfer={...vault.inventoryMovements[0],id:'test-transfer',type:'transfer',
   quantity:'1',date:'2026-10-22',
   fromWarehouseId:s.evidence.scope.warehouseId,toWarehouseId:'another-warehouse'};
 vault.inventoryMovements.push(transfer);
 const r=audit({...s,vault,evidence:{...s.evidence,
   movements:vault.inventoryMovements,
   orderedMovementIds:vault.inventoryMovements.map(row=>row.id)}});
 assert.ok(codes(r).includes('SOURCE_RECONCILIATION_FAILED'));
});

test('22 cutover: receipt-only warehouse evidence still cannot prove double-entry GL',()=>{
 const s=source(),vault=structuredClone(s.vault);
 vault.inventoryMovements=vault.inventoryMovements.filter(row=>row.type==='purchase');
 vault.documents=[];
 const r=audit({...s,vault,evidence:{...s.evidence,movements:vault.inventoryMovements,
   documents:[],orderedMovementIds:vault.inventoryMovements.map(row=>row.id)}});
 assert.equal(r.evidenceCoverage,'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS');
 assert.equal(r.calculatedCarryingValue,'44.000000000000');
 assert.equal(r.productionReady,false);
 assert.ok(codes(r).includes('NO_POSTED_GENERAL_LEDGER'));
});
