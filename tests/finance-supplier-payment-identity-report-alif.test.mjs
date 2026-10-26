import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {purchasePayableSummary,supplierPayablesByCurrency,supplierStatement,
  normalizeSupplierPayment} from '../dist/src/lib/payables.js';
import {supplierPaymentVoucher} from '../dist/src/lib/payment-voucher.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

// Alif finance-only supplier reporting contract. Pure synthetic records;
// never touches Firebase, owner data, LOUREX AI, or deployment.
const cutoff='2026-10-20';
function fixture(){
 const supplier={...createSupplier(),id:'qa-supplier-identity-a',nameEn:'Synthetic Supplier A'};
 const purchase=createPurchase([],[supplier],'USD');
 Object.assign(purchase,{id:'qa-purchase-supplier-identity',number:'PUR-QA-SUPPLIER-ID',
  status:'posted',date:'2026-10-01',dueDate:'2026-11-01',
  postedAt:'2026-10-01T10:00:00.000Z',workspaceId:'default',branchId:'main'});
 purchase.items=[{...createPurchaseItem(),id:'qa-line',quantity:'1',unitCost:'1000.00'}];
 const payment={id:'qa-payment-supplier-identity',purchaseId:purchase.id,
  purchaseNumber:purchase.number,supplierId:supplier.id,
  supplierNameEn:supplier.nameEn,supplierNameAr:'',currency:'USD',
  amount:'200.00',date:'2026-10-10',method:'bank-transfer',
  reference:'QA-SUPP-200',notes:'',workspaceId:'default',branchId:'main',
  createdAt:'2026-10-10T11:00:00.000Z',updatedAt:'2026-10-10T11:00:00.000Z'};
 return {purchase,payment,supplier};
}
function reports(purchase,payment,supplier){
 return [
 ()=>purchasePayableSummary(purchase,[payment],cutoff),
 ()=>supplierPayablesByCurrency([purchase],[payment],cutoff),
 ()=>supplierStatement(supplier.id,[purchase],[payment],cutoff)
 ];
}

test('wrong explicit supplier identity in a historical payment cannot reduce any AP report',()=>{
 const {purchase,supplier,payment}=fixture();
 const wrong={...payment,supplierId:'qa-different-supplier'};
 const before=JSON.stringify([purchase,wrong]);
 for(const read of reports(purchase,wrong,supplier))
  assert.throws(read,/recorded supplier payment supplier does not match/i);
 assert.equal(JSON.stringify([purchase,wrong]),before,'historical source must remain untouched');
 assert.throws(()=>supplierPaymentVoucher(purchase,wrong.id,[wrong],emptyVault().company),
  /supplier payment supplier does not match/i,'voucher and reports must agree');
});

test('valid supplier payment retains exact supplier AP and statement balance',()=>{
 const {purchase,supplier,payment}=fixture();
 const [summary,byCurrency,statement]=reports(purchase,payment,supplier).map(fn=>fn());
 assert.deepEqual([summary.total,summary.paid,summary.remaining],
  ['1000.00','200.00','800.00']);
 assert.deepEqual([byCurrency[0].purchases,byCurrency[0].paid,byCurrency[0].remaining],
  ['1000.00','200.00','800.00']);
 assert.deepEqual([statement[0].paid,statement[0].remaining,statement[0].entries.at(-1).balance],
  ['200.00','800.00','800.00']);
 assert.equal(supplierPaymentVoucher(purchase,payment.id,[payment],emptyVault().company).amount,
  '200.00');
});

test('missing supplier ID in a legacy stored settlement remains counted, without rewriting it',()=>{
 const {purchase,supplier,payment}=fixture();
 const legacy={...payment,supplierId:undefined};
 const frozen=JSON.stringify(legacy);
 const [summary,byCurrency,statement]=reports(purchase,legacy,supplier).map(fn=>fn());
 assert.equal(summary.paid,'200.00');
 assert.equal(summary.remaining,'800.00');
 assert.equal(byCurrency[0].paid,'200.00');
 assert.equal(statement[0].paid,'200.00');
 assert.equal(JSON.stringify(legacy),frozen);
});

test('future-dated or already voided wrong-supplier record does not poison an earlier cutoff',()=>{
 const {purchase,supplier,payment}=fixture();
 const future={...payment,supplierId:'another-supplier',date:'2026-11-10'};
 const voided={...payment,supplierId:'another-supplier',voidedAt:'2026-10-15T09:00:00.000Z',
  voidReason:'Synthetic correction'};
 for(const read of reports(purchase,future,supplier)){
  const result=read();
  assert.ok(result);
 }
 for(const read of reports(purchase,voided,supplier)){
  const result=read();
  assert.ok(result);
 }
 assert.equal(purchasePayableSummary(purchase,[future],cutoff).remaining,'1000.00');
 assert.equal(purchasePayableSummary(purchase,[voided],cutoff).remaining,'1000.00');
 assert.throws(()=>purchasePayableSummary(purchase,[future],'2026-11-12'),
  /recorded supplier payment supplier does not match/i);
 assert.throws(()=>purchasePayableSummary(purchase,[voided],'2026-10-12'),
  /recorded supplier payment supplier does not match/i);
});

test('wrong company or branch payment with a colliding purchase ID stays excluded',()=>{
 const {purchase,supplier,payment}=fixture();
 for(const wrong of [{...payment,supplierId:'wrong',branchId:'east'},
   {...payment,supplierId:'wrong',workspaceId:'company-b'}]){
  const [summary,byCurrency,statement]=reports(purchase,wrong,supplier).map(fn=>fn());
  assert.equal(summary.paid,'0.00');
  assert.equal(byCurrency[0].paid,'0.00');
  assert.equal(statement[0].entries.length,1);
 }
});

test('a historical wrong-supplier ID blocks an unrelated cloud merge without rewriting source',()=>{
 const {purchase,supplier,payment}=fixture();
 const historical={...payment,supplierId:'qa-historical-wrong-supplier'};
 const vault={...emptyVault(),suppliers:[supplier],purchases:[purchase],
  supplierPayments:[historical]};
 const frozen=JSON.stringify(vault);
 const unrelated={...vault,appSettings:{...vault.appSettings,uiLanguage:'ar'}};
 assert.throws(()=>mergeVaultIntent(vault,unrelated,structuredClone(vault)),
  /supplier payment supplier does not match/i);
 assert.equal(vault.supplierPayments[0].supplierId,historical.supplierId);
 assert.equal(JSON.stringify(vault),frozen);
 assert.throws(()=>purchasePayableSummary(purchase,vault.supplierPayments,cutoff),
  /recorded supplier payment supplier does not match/i);
});

test('a prior wrong-supplier payment blocks a new payment rather than enabling duplicate settlement',()=>{
 const {purchase,supplier,payment}=fixture();
 const wrong={...payment,supplierId:'qa-foreign-supplier'};
 const proposed={...payment,id:'qa-new-payment',amount:'100.00'};
 assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[wrong],proposed),
  /recorded supplier payment supplier does not match/i);
});
