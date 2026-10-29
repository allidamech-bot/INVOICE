import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId} from '../dist/src/lib/warehouses.js';
import {inspectSourceBoundStockGl} from '../dist/src/lib/finance-source-bound-stock-gl-preview.js';

const controls={
 workspaceId:'default',branchId:'main',functionalCurrency:'USD',asOfDate:'2026-10-27',
 currencyMinorDigits:2,inventoryAssetAccountId:'asset:inventory',
 supplierPayableAccountId:'liability:supplier',
 salesCogsAccountId:'expense:cogs',
 inventoryAllowanceAccountId:'contra:nrv',impairmentExpenseAccountId:'expense:nrv'
};
function state(){
 const vault=emptyVault(),supplier={...createSupplier(),id:'QA-supplier',nameEn:'QA supplier'};
 const item={id:'QA-item',sku:'QA-CARTON',descriptionEn:'Test carton',descriptionAr:'',
  unit:'Carton',workspaceId:'default',branchId:'main',inventoryTracking:'tracked',
  lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'20.00',lastCurrency:'USD',
  createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'};
 vault.savedItems=[item];vault.suppliers=[supplier];
 return {vault,item,supplier};
}
function buy(s,id,qty,cost,date){
 const p=createPurchase(s.vault.purchases,[s.supplier],'USD');
 Object.assign(p,{id,number:'PUR-'+id,date,dueDate:date,currency:'USD',
  workspaceId:'default',branchId:'main',freight:'0.00',duty:'0.00',otherCosts:'0.00'});
 p.items=[{...createPurchaseItem(s.item),id:'line-'+id,quantity:qty,unitCost:cost}];
 const posted=postPurchase(p,s.vault.savedItems,s.vault.inventoryMovements);
 s.vault.purchases.push({...posted.purchase,workspaceId:'default',branchId:'main'});
 s.vault.inventoryMovements.push(...posted.movements.map(m=>({...m,workspaceId:'default',branchId:'main'})));
 s.vault.savedItems=posted.savedItems;
 return s;
}
function sell(s,quantity='3'){
 const doc=createBlankDocument('invoice','INV-QA-22',s.vault.company);
 Object.assign(doc,{id:'QA-invoice',number:'INV-QA-22',issueDate:'2026-10-22',dueDate:'2026-10-22',
  status:'final',role:'standard',currency:'USD',workspaceId:'default',branchId:'main'});
 doc.customerSnapshot={sourceCustomerId:'QA-customer',companyNameEn:'QA Buyer',
  companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
  phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 doc.items=[{...doc.items[0],id:'line-sold',descriptionEn:'Test carton',unit:'Carton',
  quantity,unitPrice:'20.00',unitCost:'10.00',stockTreatment:'tracked',
  savedItemId:s.item.id,skuSnapshot:s.item.sku}];
 const result=postIssuedInvoiceStock(s.vault,doc);
 assert.equal(result.created,true);
 s.vault={...result.vault,documents:[...s.vault.documents,doc]};
 return s;
}
function scenario(quantity='3'){
 const s=sell(buy(buy(state(),'b1','4','6','2026-10-19'),
  'b2','2','10','2026-10-20'),quantity);
 const scope={workspaceId:'default',branchId:'main',
  warehouseId:defaultWarehouseId('main'),itemId:s.item.id,functionalCurrency:'USD'};
 const evidence={scope,orderedMovementIds:s.vault.inventoryMovements.map(m=>m.id),
  movements:s.vault.inventoryMovements,purchases:s.vault.purchases,documents:s.vault.documents};
 const amounts=['24.00','20.00',quantity==='3'?'22.00':'7.33'];
 const journals=s.vault.inventoryMovements.map((movement,i)=>{
  const receipt=i<2,amount=amounts[i];
  return{id:'GL-'+i,sourceKind:receipt?'purchase-receipt':'sales-stock-issue',
   sourceMovementId:movement.id,effectiveDate:movement.date,
   workspaceId:'default',branchId:'main',currency:'USD',
   lines:receipt?[
    {accountId:controls.inventoryAssetAccountId,direction:'debit',amount},
    {accountId:controls.supplierPayableAccountId,direction:'credit',amount}
   ]:[
    {accountId:controls.salesCogsAccountId,direction:'debit',amount},
    {accountId:controls.inventoryAssetAccountId,direction:'credit',amount}
   ]};
 });
 return{evidence,journals,s};
}
const inspect=(s,c=controls)=>inspectSourceBoundStockGl(c,s.evidence,s.journals);
const deny=(s,c=controls)=>assert.throws(()=>inspect(s,c),
 /ALIF_22_SOURCE_BOUND_GL_NOT_READY|ALIF_22_POSTED_LEDGER_NOT_READY|ALIF_22_JOURNAL_NOT_READY|ALIF_22_GL_UNTRUSTED|ALIF_22_COST_EVIDENCE_REQUIRED/);

test('22 source GL: each receipt and final invoice issue exactly matches its source valuation',()=>{
 const s=scenario(),original=JSON.stringify(s);
 const r=inspect(s);
 assert.equal(r.sourceMovementCount,3);
 assert.equal(r.sourceMatchedWithinSyntheticEvidence,true);
 assert.equal(r.calculatedGrossInventory,'22.00');
 assert.equal(r.calculatedSalesCost,'22.00');
 assert.equal(r.trialBalance.grossInventoryAsset,'22.00');
 assert.equal(r.trialBalance.salesCogsExpense,'22.00');
 assert.equal(r.trialBalance.totalDebitBalances,'44.00');
 assert.equal(r.trialBalance.totalCreditBalances,'44.00');
 for(const flag of ['sourceAuthenticated','postingApproved','generalLedgerVerified','productionReady'])
  assert.equal(r[flag],false);
 assert.equal(r.trialBalance.trustedPostingCommitted,false);
 assert.equal(JSON.stringify(s),original,'no source or journal mutation');
});

test('22 source GL: balanced but wrong WAC amount cannot counterfeit source',()=>{
 const s=scenario();
 s.journals[2].lines.forEach(line=>line.amount='30.00');
 deny(s);
});

test('22 source GL: missing, duplicated, shuffled and unrelated journals are rejected',()=>{
 const s=scenario();
 deny({...s,journals:s.journals.slice(0,2)});
 deny({...s,journals:[...s.journals,s.journals[2]]});
 deny({...s,journals:[s.journals[1],s.journals[0],s.journals[2]]});
 const extra=structuredClone(s);
 extra.journals[1].sourceMovementId='invented-identity';deny(extra);
 const nrv=structuredClone(s);
 nrv.journals[2].sourceKind='nrv-write-down';deny(nrv);
});

test('22 source GL: debit/credit accounts, date, company and currency remain strict',()=>{
 for(const modify of [
  x=>x.journals[0].lines[1].accountId='other:liability',
  x=>x.journals[1].effectiveDate='2026-10-23',
  x=>x.journals[1].workspaceId='other-company',
  x=>x.journals[1].currency='EUR',
  x=>x.journals[2].lines[1].amount='21.00',
  x=>x.journals[2].lines[0].direction='credit'
 ]){
  const s=structuredClone(scenario());modify(s);deny(s);
 }
});

test('22 source GL: original invoice stock proof, purchase landed cost and chronology cannot be forged',()=>{
 const a=structuredClone(scenario());
 a.evidence.movements[2].note='forged';deny(a);
 const b=structuredClone(scenario());
 b.evidence.movements[0].unitCost='999';deny(b);
 const c=structuredClone(scenario());
 c.evidence.orderedMovementIds=[c.evidence.orderedMovementIds[1],
  c.evidence.orderedMovementIds[0],c.evidence.orderedMovementIds[2]];deny(c);
});

test('22 source GL: a balanced trial balance never authenticates ambiguous purchase or invoice IDs',()=>{
 const a=scenario();
 a.evidence.purchases.push(structuredClone(a.evidence.purchases[0]));
 deny(a);

 const b=scenario();
 b.evidence.documents.push(structuredClone(b.evidence.documents[0]));
 deny(b);
});

test('22 source GL: supplier AP mapping refuses freight or multi-line liability allocation guesses',()=>{
 const s=scenario();s.evidence.purchases[0].freight='1.00';deny(s);
 const t=scenario();t.evidence.purchases[1].items.push({
  ...t.evidence.purchases[1].items[0],id:'different-line',savedItemId:'other-product'
 });deny(t);
});

test('22 source GL: cross currency source cannot be treated as same-currency supplier payable',()=>{
 const s=scenario();
 s.evidence.movements[0].currency='EUR';deny(s);
 const a=scenario();a.evidence.documents[0].currency='EUR';deny(a);
 deny(scenario(),{...controls,functionalCurrency:'EUR'});
});

test('22 source GL: sub-cent moving average issue requires explicit future rounding policy',()=>{
 deny(scenario('1'));
});

test('22 source GL: source-less empty ledger and manual opening are not accepted as verified zero',()=>{
 const empty=scenario();
 empty.evidence={...empty.evidence,orderedMovementIds:[],movements:[],
  purchases:[],documents:[]};empty.journals=[];
 deny(empty);
});
