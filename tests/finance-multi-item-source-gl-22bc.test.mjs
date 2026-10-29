import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {inspectMultiItemSourceBoundStockGl} from '../dist/src/lib/finance-multi-item-source-gl-preview.js';

const controls={
  workspaceId:'default',branchId:'main',functionalCurrency:'USD',asOfDate:'2026-10-27',
  currencyMinorDigits:2,inventoryAssetAccountId:'asset:inventory',
  supplierPayableAccountId:'liability:supplier',salesCogsAccountId:'expense:cogs',
  inventoryAllowanceAccountId:'contra:nrv',impairmentExpenseAccountId:'expense:nrv'
};
function scenario(extraReceipt=false){
  const vault=emptyVault(),now='2026-10-19T12:00:00.000Z';
  const supplier={...createSupplier(),id:'supplier-QA',nameEn:'QA supplier'};
  const makeItem=(id,sku)=>({
    id,sku,descriptionEn:sku,descriptionAr:'',unit:'Carton',
    workspaceId:'default',branchId:'main',inventoryTracking:'tracked',
    lastUnitCost:'',lastCostCurrency:'',lastUnitPrice:'25.00',lastCurrency:'USD',
    createdAt:now,updatedAt:now
  });
  const a=makeItem('item-A','QA-A'),b=makeItem('item-B','QA-B');
  vault.savedItems=[a,b];vault.suppliers=[supplier];
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{
    id:'purchase-AB',number:'PUR-AB',date:'2026-10-20',dueDate:'2026-10-25',
    workspaceId:'default',branchId:'main',currency:'USD',
    freight:'6.00',duty:'3.00',otherCosts:'2.00',
    items:[
      {...createPurchaseItem(a),id:'p-line-A',quantity:'4',unitCost:'6.00'},
      {...createPurchaseItem(b),id:'p-line-B',quantity:'2',unitCost:'10.00'}
    ]
  });
  const posted=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);
  assert.equal(posted.movements.length,2);
  assert.equal(posted.purchase.items[0].landedUnitCost,'7.5000');
  assert.equal(posted.purchase.items[1].landedUnitCost,'12.5000');
  vault.purchases.push({...posted.purchase,workspaceId:'default',branchId:'main'});
  vault.inventoryMovements.push(...posted.movements.map(row=>({...row,workspaceId:'default',branchId:'main'})));
  vault.savedItems=posted.savedItems;
  if(extraReceipt){
    const again=createPurchase(vault.purchases,[supplier],'USD');
    Object.assign(again,{
      id:'purchase-A2',number:'PUR-A2',date:'2026-10-21',dueDate:'2026-10-26',
      workspaceId:'default',branchId:'main',currency:'USD',
      freight:'0.00',duty:'0.00',otherCosts:'0.00',
      items:[{...createPurchaseItem(a),id:'p-line-A2',quantity:'4',unitCost:'9.00'}]
    });
    const more=postPurchase(again,vault.savedItems,vault.inventoryMovements);
    vault.purchases.push({...more.purchase,workspaceId:'default',branchId:'main'});
    vault.inventoryMovements.push(...more.movements.map(row=>({...row,workspaceId:'default',branchId:'main'})));
    vault.savedItems=more.savedItems;
  }
  const invoice=createBlankDocument('invoice','INV-MULTI-22',vault.company);
  Object.assign(invoice,{id:'invoice-AB',number:'INV-MULTI-22',issueDate:'2026-10-22',
    dueDate:'2026-10-22',status:'final',role:'standard',currency:'USD',
    workspaceId:'default',branchId:'main'});
  invoice.customerSnapshot={
    sourceCustomerId:'customer-QA',companyNameEn:'QA buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  };
  invoice.items=[a,b].map((item,i)=>({
    ...invoice.items[0],id:'s-line-'+item.id,
    descriptionEn:item.descriptionEn,descriptionAr:'',unit:'Carton',
    quantity:i===0?'2':'1',unitPrice:'25.00',unitCost:'100.00',
    stockTreatment:'tracked',savedItemId:item.id,skuSnapshot:item.sku
  }));
  const sale=postIssuedInvoiceStock(vault,invoice);
  assert.equal(sale.created,true);
  const movements=sale.vault.inventoryMovements.map(row=>({
    ...row,workspaceId:'default',branchId:'main'
  }));
  const evidence={
    warehouseId:'warehouse:main',movements,purchases:vault.purchases,
    documents:[invoice],orderedMovementIds:movements.map(row=>row.id)
  };
  // Use the actual default location from the domain, not a QA assumption.
  // The two individual WAC projections must value these source movements.
  const amounts=extraReceipt
    ?['30.00','25.00','36.00','16.50','12.50']
    :['30.00','25.00','15.00','12.50'];
  const journals=movements.map((row,i)=>{
    const receipt=row.type==='purchase',amount=amounts[i];
    return{
      id:'GL-MULTI-'+i,sourceKind:receipt?'purchase-receipt':'sales-stock-issue',
      sourceMovementId:row.id,effectiveDate:row.date,
      workspaceId:'default',branchId:'main',currency:'USD',
      lines:receipt?[
        {accountId:controls.inventoryAssetAccountId,direction:'debit',amount},
        {accountId:controls.supplierPayableAccountId,direction:'credit',amount}
      ]:[
        {accountId:controls.salesCogsAccountId,direction:'debit',amount},
        {accountId:controls.inventoryAssetAccountId,direction:'credit',amount}
      ]
    };
  });
  return {evidence,journals,controls:{...controls},vault};
}
const inspect=s=>inspectMultiItemSourceBoundStockGl(s.controls,s.evidence,s.journals);
const deny=s=>assert.throws(()=>inspect(s),
  /ALIF_22_MULTI_ITEM_GL_NOT_READY|ALIF_22_POSTED_LEDGER_NOT_READY|ALIF_22_JOURNAL_NOT_READY|ALIF_22_GL_UNTRUSTED|ALIF_22_COST_EVIDENCE_REQUIRED/);

test('multi-item invoice + one freight/duty purchase: allocate once and reconcile full AP, WAC and trial balance',()=>{
  const s=scenario(),before=JSON.stringify(s);
  const result=inspect(s);
  assert.equal(result.receiptCount,2);
  assert.equal(result.issueCount,2);
  assert.equal(result.productCount,2);
  assert.deepEqual(result.purchases.map(x=>[x.lineCount,x.supplierPayable,x.summedValuedReceipts]),
    [[2,'55.00','55.00']]);
  assert.equal(result.calculatedSalesCost,'27.50');
  assert.equal(result.calculatedGrossInventory,'27.50');
  assert.equal(result.trialBalance.totalDebitBalances,'55.00');
  assert.equal(result.trialBalance.totalCreditBalances,'55.00');
  assert.equal(result.trialBalance.trialBalance.find(x=>x.accountId===controls.supplierPayableAccountId).creditBalance,'55.00');
  for(const flag of ['sourceAuthenticated','allocationPolicyApproved','postingApproved','generalLedgerVerified','productionReady'])
    assert.equal(result[flag],false);
  assert.equal(JSON.stringify(s),before,'preview must not mutate business records');
});

test('multi-item source GL: additional purchase applies chronological moving average independently by product',()=>{
  const s=scenario(true),result=inspect(s);
  assert.equal(result.receiptCount,3);
  assert.equal(result.issueCount,2);
  assert.equal(result.productCount,2);
  assert.deepEqual(result.purchases.map(x=>x.supplierPayable),['55.00','36.00']);
  assert.equal(result.calculatedGrossInventory,'62.00');
  assert.equal(result.calculatedSalesCost,'29.00');
  assert.equal(result.trialBalance.totalDebitBalances,'91.00');
  assert.equal(result.trialBalance.totalCreditBalances,'91.00');
});

test('multi-item GL: compensating item-cost fraud still fails though total purchase payable and balanced journals agree',()=>{
  const s=scenario();
  // 4 × 8.50 + 2 × 10.50 still equals USD 55, while the canonical
  // purchase with USD 11 landed charges requires 4 × 7.50 + 2 × 12.50.
  const p=s.evidence.purchases[0];
  p.items[0].landedUnitCost='8.50';p.items[1].landedUnitCost='10.50';
  s.evidence.movements[0].unitCost='8.50';
  s.evidence.movements[1].unitCost='10.50';
  for(const [i,amount] of ['34.00','21.00','17.00','10.50'].entries())
    for(const line of s.journals[i].lines)line.amount=amount;
  deny(s);
});

test('multi-item GL: changed original freight, one missing receipt, new untracked expense row and duplicate purchase line fail closed',()=>{
  const a=scenario();a.evidence.purchases[0].freight='7.00';deny(a);
  const b=scenario();
  b.evidence.movements.splice(1,1);
  b.evidence.orderedMovementIds.splice(1,1);
  b.journals.splice(1,1);
  deny(b);
  const c=scenario();
  c.evidence.purchases[0].items.push({...c.evidence.purchases[0].items[0],
    id:'nonstock-expense',savedItemId:''});
  deny(c);
  const d=scenario();
  d.evidence.purchases[0].items[1].id=d.evidence.purchases[0].items[0].id;
  deny(d);
});

test('multi-item GL: duplicate document, missing movement, source reassignment, wrong GL and backdating fail closed',()=>{
  const a=scenario();a.evidence.purchases.push(structuredClone(a.evidence.purchases[0]));deny(a);
  const b=scenario();b.evidence.documents.push(structuredClone(b.evidence.documents[0]));deny(b);
  const c=scenario();c.evidence.movements[0].sourceId='unknown-purchase';deny(c);
  const d=scenario();d.journals[1].lines[1].accountId='liability:wrong';deny(d);
  const e=scenario();e.controls.asOfDate='2026-10-21';deny(e);
  const f=scenario();f.evidence.orderedMovementIds.reverse();deny(f);
  const g=scenario();g.evidence.movements[0].workspaceId='another-company';deny(g);
});

test('multi-item GL: journal amount mismatch and fractional minor-unit sale remain blocked',()=>{
  const a=scenario();a.journals[2].lines.forEach(x=>x.amount='14.00');deny(a);
  const b=scenario();
  b.evidence.purchases[0].freight='6.01';
  deny(b);
});
