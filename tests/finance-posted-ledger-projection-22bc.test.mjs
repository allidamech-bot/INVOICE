import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,createManualInventoryMovement} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId,createWarehouseTransfer} from '../dist/src/lib/warehouses.js';
import {calculateProfitability} from '../dist/src/lib/profitability.js';
import {projectPostedValuationEvidence} from '../dist/src/lib/inventory-valuation-evidence.js';
import {reconcilePostedInvoiceCostsToWac} from '../dist/src/lib/inventory-cost-reconciliation.js';
import {inspectIllustrativeInventoryJournals} from '../dist/src/lib/inventory-journal-integrity-preview.js';

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

test('22-C: source-scoped posted invoice cost differences report a precise WAC reconciliation gap',()=>{
 const state=testedSequence(),evidence=input(state);
 const before=JSON.stringify(state.vault);
 const comparison=reconcilePostedInvoiceCostsToWac(evidence);
 assert.equal(comparison.balanceQuantity,'3.0000');
 assert.equal(comparison.balanceValue,'22.000000000000');
 assert.equal(comparison.totalFrozenInvoiceCost,'30.00');
 assert.equal(comparison.totalRoundedMovingAverageCost,'22.00');
 assert.equal(comparison.totalInvoiceCostOverValuation,'8.00');
 assert.equal(comparison.lineDifferences.length,1);
 assert.equal(comparison.lineDifferences[0].invoiceId,state.doc.id);
 assert.equal(comparison.lineDifferences[0].quantity,'3.0000');
 assert.equal(comparison.lineDifferences[0].frozenInvoiceLineCost,'30.00');
 assert.equal(comparison.lineDifferences[0].roundedMovingAverageCost,'22.00');
 assert.equal(comparison.acceptance,'BLOCKED_NO_GENERAL_LEDGER_AND_COST_CUTOVER');
 assert.equal(comparison.accountingJournalVerified,false);
 assert.equal(comparison.historicalDocumentsChanged,false);
 assert.equal(calculateProfitability(state.doc).itemCost,'30.00');
 assert.equal(JSON.stringify(state.vault),before,'source account and invoice remain unchanged');
});

test('22-C: zero variance cannot pretend to verify an absent financial journal',()=>{
 const state=testedSequence();
 const data=structuredClone(input(state));
 data.documents[0].items[0].unitCost='7.333333333333';
 const comparison=reconcilePostedInvoiceCostsToWac(data);
 assert.equal(comparison.totalInvoiceCostOverValuation,'0.00');
 assert.equal(comparison.acceptance,'BLOCKED_NO_GENERAL_LEDGER_AND_COST_CUTOVER');
 assert.equal(comparison.accountingJournalVerified,false);
});

test('22-C: incomplete final invoice unit cost never becomes a valid accountant report',()=>{
 const state=testedSequence(),data=structuredClone(input(state));
 data.documents[0].items[0].unitCost='';
 assert.throws(()=>reconcilePostedInvoiceCostsToWac(data),
  /Frozen issued invoice line is missing/);
});

test('22-C: invoice in another currency cannot be compared with functional cost without FX',()=>{
 const state=testedSequence(),data=structuredClone(input(state));
 data.documents[0].currency='EUR';
 assert.throws(()=>reconcilePostedInvoiceCostsToWac(data),
  /Invoice presentation currency is not the approved functional currency/);
});

test('22-C: missing or duplicated chronological stock evidence prevents even a comparison',()=>{
 const state=testedSequence(),data=input(state);
 assert.throws(()=>reconcilePostedInvoiceCostsToWac(
  {...data,orderedMovementIds:data.orderedMovementIds.slice(1)}
 ),/omits or adds inventory movements/);
 const duplicated=structuredClone(data);
 duplicated.movements.push({...duplicated.movements[0]});
 duplicated.orderedMovementIds.push(duplicated.movements[0].id);
 assert.throws(()=>reconcilePostedInvoiceCostsToWac(duplicated),/Duplicate or empty/);
});

test('22-C: unsupported transfer or purchase reversal must block company-wide extrapolation',()=>{
 const state=testedSequence(),data=input(state);
 const transfer={...createWarehouseTransfer(state.item,state.scope.warehouseId,
  'warehouse-unvalued','1','2026-10-23'),workspaceId:'default',branchId:'main'};
 assert.throws(()=>reconcilePostedInvoiceCostsToWac(
  {...data,movements:[...data.movements,transfer],
    orderedMovementIds:[...data.orderedMovementIds,transfer.id]}
 ),/Warehouse transfer or other-location movement/);
});

test('22-C: receipt-only source returns stock balance without inventing COGS or accepted GL',()=>{
 const state=purchase(purchase(fixture(),'first','4','5','4'),
  'second','2','9','2');
 const result=reconcilePostedInvoiceCostsToWac(input(state));
 assert.equal(result.balanceQuantity,'6.0000');
 assert.equal(result.balanceValue,'44.000000000000');
 assert.deepEqual(result.lineDifferences,[]);
 assert.equal(result.totalRoundedMovingAverageCost,'0.00');
 assert.equal(result.accountingJournalVerified,false);
});

const ledgerControls={inventoryAccountId:'asset:inventory',salesCogsAccountId:'expense:cogs',currencyMinorDigits:2};
function illustrativeJournals(state){
 return state.vault.inventoryMovements.map((m,index)=>{
  const inbound=m.type==='purchase',amount=inbound?(index===0?'24.00':'20.00'):'22.00';
  return{id:'test-entry-'+index,sourceMovementId:m.id,date:m.date,
   workspaceId:m.workspaceId,branchId:m.branchId,currency:'USD',
   lines:inbound?[
    {accountId:ledgerControls.inventoryAccountId,direction:'debit',amount},
    {accountId:'liability:supplier',direction:'credit',amount}
   ]:[
    {accountId:ledgerControls.salesCogsAccountId,direction:'debit',amount},
    {accountId:ledgerControls.inventoryAccountId,direction:'credit',amount}
   ]};
 });
}
test('22 GL: balanced illustrative journals reproduce purchase assets and WAC COGS without posting',()=>{
 const s=testedSequence(),before=JSON.stringify(s.vault);
 const entries=illustrativeJournals(s);
 const result=inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls);
 assert.equal(result.checkedEntries,3);
 assert.equal(result.illustrativeNetInventory,'22.00');
 assert.equal(result.illustrativeTotalSalesCOGS,'22.00');
 assert.equal(result.carryingValue,'22.000000000000');
 assert.equal(result.evidenceMatched,true);
 assert.equal(result.posted,false);
 assert.equal(result.approved,false);
 assert.equal(result.productionReady,false);
 assert.equal(JSON.stringify(s.vault),before);
});
test('22 GL: a balanced journal with WRONG inventory amount still fails WAC proof',()=>{
 const s=testedSequence(),entries=illustrativeJournals(s);
 entries[2].lines[0].amount='30.00';
 entries[2].lines[1].amount='30.00';
 assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls),
  /account deltas differ/);
});
test('22 GL: unbalanced debits and credits fail even when inventory asset is correct',()=>{
 const s=testedSequence(),entries=illustrativeJournals(s);
 entries[0].lines[1].amount='23.00';
 assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls),
  /not balanced/);
});
test('22 GL: no identical source journal may be counted twice or omitted',()=>{
 const s=testedSequence(),entries=illustrativeJournals(s);
 assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries.slice(1),ledgerControls),
  /exactly one illustrative journal/);
 entries[1].sourceMovementId=entries[0].sourceMovementId;
 assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls),
  /Duplicate or missing journal/);
});
test('22 GL: isolated company/branch, effective date and original money currency are mandatory',()=>{
 const s=testedSequence();
 for(const edited of [{date:'2026-10-18'},{workspaceId:'other'},
  {branchId:'other'},{currency:'EUR'}]){
  const entries=illustrativeJournals(s);
  Object.assign(entries[0],edited);
  assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls),
   /disagrees with its verified financial source/);
 }
});
test('22 GL: account identity, money precision and strictly positive lines are mandatory',()=>{
 const s=testedSequence();
 for(const controls of [
  {...ledgerControls,inventoryAccountId:''},
  {...ledgerControls,salesCogsAccountId:ledgerControls.inventoryAccountId},
  {...ledgerControls,currencyMinorDigits:5}
 ]){
  assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),
   illustrativeJournals(s),controls),/Two distinct/);
 }
 for(const amount of ['-1','0','0.0001','abc']){
  const entries=illustrativeJournals(s);
  entries[0].lines[0].amount=amount;
  assert.throws(()=>inspectIllustrativeInventoryJournals(input(s),entries,ledgerControls),
   /currency minor units|Zero or negative/);
 }
});
test('22 GL: sub-cent WAC stock issue cannot be silently rounded into an invented GL journal',()=>{
 const s=testedSequence(),data=structuredClone(input(s)),entries=illustrativeJournals(s);
 const invoice=data.documents[0];
 invoice.items[0].quantity='1';
 const issue=data.movements.find(m=>m.type==='issue');
 issue.quantity='-1';
 const prefix='@lourex:invoice-stock:v1:';
 const original=JSON.parse(issue.note.slice(prefix.length));
 issue.note=prefix+JSON.stringify({...original,quantity:'1'});
 entries[2].lines[0].amount='7.33';
 entries[2].lines[1].amount='7.33';
 assert.throws(()=>inspectIllustrativeInventoryJournals(data,entries,ledgerControls),
  /approved rounding journal policy is missing/);
});
test('22 GL: missing source inventory history always blocks matching to hypothetical journals',()=>{
 const s=testedSequence(),e=input(s);
 assert.throws(()=>inspectIllustrativeInventoryJournals({...e,
   movements:e.movements.slice(1),orderedMovementIds:e.orderedMovementIds.slice(1)},
   illustrativeJournals(s),ledgerControls),/Receipt requires|Insufficient valued inventory/);
});
