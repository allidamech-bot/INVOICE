import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId,createWarehouseTransfer} from '../dist/src/lib/warehouses.js';
import {calculateProfitability} from '../dist/src/lib/profitability.js';
import {projectPostedValuationEvidence} from '../dist/src/lib/inventory-valuation-evidence.js';

function fixture(){
 const vault=emptyVault(),supplier={...createSupplier(),id:'qa-supplier-real-cost',nameEn:'Valuation QA'};
 const item={id:'qa-item-cost',sku:'QA-COST',descriptionEn:'Carton',descriptionAr:'',
  unit:'Carton',createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',
  lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'20.00',lastCurrency:'USD',
  usageCount:0,lastUsedAt:'',inventoryTracking:'tracked',workspaceId:'default',branchId:'main'};
 vault.savedItems=[item];vault.suppliers=[supplier];
 const scope={workspaceId:'default',branchId:'main',warehouseId:defaultWarehouseId('main'),
   itemId:item.id,functionalCurrency:'USD'};
 return{vault,item,supplier,scope};
}
function purchase(state,id,quantity,unitCost,freight='0.00',currency='USD',date='2026-10-20'){
 const v=state.vault, p=createPurchase(v.purchases,[state.supplier],currency);
 Object.assign(p,{id,number:'PUR-'+id,date,dueDate:date,workspaceId:'default',branchId:'main',currency,freight,duty:'0.00',otherCosts:'0.00'});
 p.items=[{...createPurchaseItem(state.item),id:'line-'+id,quantity,unitCost}];
 const result=postPurchase(p,v.savedItems,v.inventoryMovements);
 const scoped=result.movements.map(m=>({...m,workspaceId:'default',branchId:'main'}));
 return{...state,vault:{...v,purchases:[...v.purchases,{...result.purchase,workspaceId:'default',branchId:'main'}],
  inventoryMovements:[...v.inventoryMovements,...scoped],savedItems:result.savedItems}};
}
function sell(state,id='invoice-qa'){
 const v=state.vault,doc=createBlankDocument('invoice','INV-QA-COST',v.company);
 Object.assign(doc,{id,number:'INV-QA-COST',currency:'USD',issueDate:'2026-10-22',dueDate:'2026-10-22',
  status:'final',role:'standard',workspaceId:'default',branchId:'main'});
 doc.customerSnapshot={sourceCustomerId:'synthetic-customer',companyNameEn:'QA Buyer',
  companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',
  email:'',vatTaxNumber:'',commercialRegistration:''};
 doc.items=[{...doc.items[0],id:'line-sold',descriptionEn:'Carton',unit:'Carton',quantity:'3',
  unitPrice:'20.00',unitCost:'10.00',stockTreatment:'tracked',savedItemId:state.item.id,skuSnapshot:state.item.sku}];
 const posting=postIssuedInvoiceStock(v,doc);
 assert.equal(posting.created,true);
 return{...state,doc,vault:{...posting.vault,documents:[...v.documents,doc]}};
}
function input(state,extra={}){
 const v=state.vault;
 return{scope:state.scope,orderedMovementIds:v.inventoryMovements.map(m=>m.id),
  movements:v.inventoryMovements,purchases:v.purchases,documents:v.documents,...extra};
}
function testedSequence(){
 return sell(purchase(purchase(fixture(),'buy-1','4','5.00','4.00'),
  'buy-2','2','9.00','2.00'));
}

test('22-B real posting: source purchases at 6 and 10 lead to 22 cost of sale without revaluing invoice',()=>{
 const original=testedSequence(),before=JSON.stringify(original.vault);
 const result=projectPostedValuationEvidence(input(original));
 assert.equal(original.vault.inventoryMovements.length,3);
 assert.equal(result.costOfGoodsSold,'22.000000000000');
 assert.equal(result.balanceValue,'22.000000000000');
 assert.equal(result.balanceQuantity,'3.0000');
 assert.equal(result.steps[2].recognizedUnitCost,'7.333333333333');
 assert.equal(original.vault.inventoryMovements[2].unitCost,'10.0000','historical issue snapshot remains');
 assert.equal(calculateProfitability(original.doc).itemCost,'30.00','stored invoice is untouched');
 assert.equal(JSON.stringify(original.vault),before,'read-only projection cannot mutate the financial vault');
});

test('22-C real posting: foreign purchase refuses missing FX, accepts dated identified evidence',()=>{
 let state=testedSequence();
 state=purchase(state,'foreign-3','1','12.00','0.00','EUR','2026-10-23');
 const events=input(state);
 assert.throws(()=>projectPostedValuationEvidence(events),/ALIF_22_COST_EVIDENCE_REQUIRED/);
 const foreign=state.vault.inventoryMovements.at(-1);
 const fx={id:'approved-qa-fx',date:'2026-10-23',fromCurrency:'EUR',toCurrency:'USD',
  rate:'1.25',sourceLabel:'QA documented spot'};
 const converted=projectPostedValuationEvidence(input(state,{fxByMovementId:{[foreign.id]:fx}}));
 assert.equal(converted.currency,'USD');
 assert.equal(converted.balanceQuantity,'4.0000');
 assert.equal(converted.balanceValue,'37.000000000000');
 assert.equal(state.vault.inventoryMovements.at(-1).currency,'EUR');
 assert.equal(state.vault.documents[0].items[0].unitCost,'10.00');
 assert.throws(()=>projectPostedValuationEvidence(input(state,
  {fxByMovementId:{[foreign.id]:{...fx,date:'2026-10-22'}}})),/ALIF_22_COST_EVIDENCE_REQUIRED/);
});

test('22-B real manual opening: historic unproved carrying values fail closed',()=>{
 const state=fixture(),movement={...createManualInventoryMovement(state.item,'opening','5','2026-10-19','QA opening','4','USD'),
  workspaceId:'default',branchId:'main'};
 state.vault.inventoryMovements=[movement];
 assert.throws(()=>projectPostedValuationEvidence(input(state)),/Opening quantity and documented/);
 movement.evidence={id:'qa-opening-proof',name:'open.pdf',mimeType:'application/pdf',
  size:8,dataUrl:'data:application/pdf;base64,cGRm',createdAt:'2026-10-19T12:00:00Z'};
 const accepted=projectPostedValuationEvidence(input(state));
 assert.equal(accepted.balanceQuantity,'5.0000');
 assert.equal(accepted.balanceValue,'20.000000000000');
 movement.currency='';
 assert.throws(()=>projectPostedValuationEvidence(input(state)),/ALIF_22_COST_EVIDENCE_REQUIRED/);
});

test('22-B source continuity: missing, duplicate, reordered and tampered posted events must be rejected',()=>{
 const state=testedSequence(),x=input(state),before=JSON.stringify(state.vault);
 assert.throws(()=>projectPostedValuationEvidence({...x,orderedMovementIds:x.orderedMovementIds.slice(1)}),
  /omits or adds inventory movements/);
 assert.throws(()=>projectPostedValuationEvidence({...x,orderedMovementIds:[
  x.orderedMovementIds[0],x.orderedMovementIds[0],x.orderedMovementIds[2]]}),/Duplicate or unknown/);
 assert.throws(()=>projectPostedValuationEvidence({...x,orderedMovementIds:[
  x.orderedMovementIds[2],x.orderedMovementIds[0],x.orderedMovementIds[1]]}),
  /ALIF_22_COST_EVIDENCE_REQUIRED/);
 const forgedCost=structuredClone(x);
 forgedCost.movements[0].unitCost='500.00';
 assert.throws(()=>projectPostedValuationEvidence(forgedCost),/Receipt quantity or landed unit cost/);
 const forgedProof=structuredClone(x);
 forgedProof.movements[2].note='forged';
 assert.throws(()=>projectPostedValuationEvidence(forgedProof),/stock provenance is missing/);
 const duplicates=structuredClone(x);
 duplicates.movements.push({...duplicates.movements[0]});
 duplicates.orderedMovementIds.push(duplicates.movements[0].id);
 assert.throws(()=>projectPostedValuationEvidence(duplicates),/Duplicate or empty/);
 assert.equal(JSON.stringify(state.vault),before);
});

test('22-B transfers and unscoped legacy receipts must not be silently valued or ignored',()=>{
 const state=testedSequence(),inputBase=input(state);
 const transfer={...createWarehouseTransfer(state.item,state.scope.warehouseId,'warehouse-2','1','2026-10-24'),
  workspaceId:'default',branchId:'main'};
 const v={...state,vault:{...state.vault,inventoryMovements:[...state.vault.inventoryMovements,transfer]}};
 assert.throws(()=>projectPostedValuationEvidence(input(v)),/transfer or other-location|Unsupported reversal/);
 const unscoped=structuredClone(inputBase);
 delete unscoped.movements[0].workspaceId;
 assert.throws(()=>projectPostedValuationEvidence(unscoped),/Unscoped historic movements/);
});

test('22-B purchases with multiple lines for one product need an explicit source-line identity',()=>{
 const state=testedSequence();
 const snapshot=structuredClone(input(state));
 snapshot.purchases[0].items.push({...snapshot.purchases[0].items[0],id:'another-line'});
 assert.throws(()=>projectPostedValuationEvidence(snapshot),/Ambiguous purchase lines/);
});

test('22-B no valuation output when a posted purchase or final invoice source is absent',()=>{
 const state=testedSequence(),x=input(state);
 assert.throws(()=>projectPostedValuationEvidence({...x,purchases:[]}),/Receipt requires an existing posted purchase/);
 assert.throws(()=>projectPostedValuationEvidence({...x,documents:[]}),/Issue requires an active final invoice/);
});
