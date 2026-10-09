import test from 'node:test';
import assert from 'node:assert/strict';
import {todayIso} from '../dist/src/lib/id.js';
import {createPurchase,createPurchaseItem,createSupplier} from '../dist/src/lib/operations.js';
import {purchasePayableSummary,supplierAccounts,supplierPayablesByCurrency,supplierStatement,voidSupplierPayment,normalizeSupplierPayment,assertSupplierPaymentInvariant} from '../dist/src/lib/payables.js';
import {treasuryProjection} from '../dist/src/lib/treasury-ledger.js';

function fixture(){
  const supplier={...createSupplier(),nameEn:'Audit Supplier',defaultCurrency:'USD'};
  const purchase=createPurchase([],[supplier],'USD');
  purchase.number='PUR-AUDIT-001';
  purchase.status='posted';
  purchase.date='2026-10-01';
  purchase.dueDate='2026-10-05';
  purchase.postedAt='2026-10-01T12:00:00.000Z';
  purchase.items=[{...createPurchaseItem(),quantity:'1',unitCost:'1000'}];
  const earlier={id:'payment-earlier',purchaseId:purchase.id,currency:'USD',amount:'200',date:'2026-10-02'};
  const later={...earlier,id:'payment-later',date:'2026-10-20',amount:'500'};
  return{supplier,purchase,earlier,later};
}

test('as-of supplier payable excludes future payments while current balances include them',()=>{
  const {supplier,purchase,earlier,later}=fixture(),payments=[earlier,later];
  const past=purchasePayableSummary(purchase,payments,'2026-10-09');
  assert.equal(past.total,'1000.00');
  assert.equal(past.paid,'200.00');
  assert.equal(past.remaining,'800.00');
  const asOf=supplierPayablesByCurrency([purchase],payments,'2026-10-09');
  assert.equal(asOf[0].paid,'200.00');
  assert.equal(asOf[0].remaining,'800.00');
  const statement=supplierStatement(supplier.id,[purchase],payments,'2026-10-09')[0];
  assert.equal(statement.paid,'200.00');
  assert.equal(statement.remaining,'800.00');
  assert.equal(statement.entries.length,2);
  assert.equal(statement.entries.at(-1).balance,'800.00');
  const laterView=purchasePayableSummary(purchase,payments,'2026-10-21');
  assert.equal(laterView.paid,'700.00');
  assert.equal(laterView.remaining,'300.00');
});

test('supplier balances, account list and statements exclude future and late-posted purchases',()=>{
  const {supplier,purchase}=fixture();
  const future={...purchase,id:'purchase-future',number:'PUR-AUDIT-002',date:'2026-10-20',postedAt:'2026-10-20T09:00:00.000Z'};
  const backdatedLater={...purchase,id:'purchase-late-post',number:'PUR-AUDIT-003',date:'2026-09-20',postedAt:'2026-10-20T09:00:00.000Z'};
  const hiddenSupplier={...createSupplier(),id:'hidden-supplier',nameEn:'Future Supplier'};
  const hiddenPurchase={...future,id:'hidden-future',supplierSnapshot:{...purchase.supplierSnapshot,sourceSupplierId:hiddenSupplier.id}};
  const purchases=[purchase,future,backdatedLater,hiddenPurchase];
  const asOf=supplierPayablesByCurrency(purchases,[],'2026-10-09');
  assert.equal(asOf.length,1);
  assert.equal(asOf[0].purchases,'1000.00');
  assert.equal(asOf[0].remaining,'1000.00');
  assert.equal(supplierAccounts([supplier,hiddenSupplier],purchases,[],'2026-10-09').length,1);
  const statement=supplierStatement(supplier.id,purchases,[],'2026-10-09')[0];
  assert.equal(statement.purchases,'1000.00');
  assert.equal(statement.entries.length,1);
  assert.equal(statement.entries[0].reference,purchase.number);
  assert.equal(supplierPayablesByCurrency(purchases,[],'2026-10-21')[0].purchases,'4000.00');
});

test('late-entered backdated supplier payment never changes an earlier payable snapshot',()=>{
  const {supplier,purchase,earlier}=fixture();
  const backdated={...earlier,id:'payment-entered-later',date:'2026-10-03',
    createdAt:'2026-10-20T12:00:00.000Z',amount:'350'};
  const payments=[earlier,backdated];
  const historic=purchasePayableSummary(purchase,payments,'2026-10-09');
  assert.equal(historic.paid,'200.00');
  assert.equal(historic.remaining,'800.00');
  const historicStatement=supplierStatement(supplier.id,[purchase],payments,'2026-10-09')[0];
  assert.equal(historicStatement.entries.length,2);
  assert.equal(historicStatement.remaining,'800.00');
  const current=purchasePayableSummary(purchase,payments,'2026-10-21');
  assert.equal(current.paid,'550.00');
  assert.equal(current.remaining,'450.00');
});

test('reversal recorded after cutoff does not erase supplier debt from earlier reports',()=>{
  const {supplier,purchase}=fixture();
  const reversed={...purchase,status:'reversed',reversedAt:'2026-10-20T11:00:00.000Z'};
  const past=purchasePayableSummary(reversed,[],'2026-10-09');
  assert.equal(past.remaining,'1000.00');
  assert.equal(past.state,'overdue');
  const historical=supplierPayablesByCurrency([reversed],[],'2026-10-09');
  assert.equal(historical.length,1);
  assert.equal(historical[0].remaining,'1000.00');
  const accounts=supplierAccounts([supplier],[reversed],[],'2026-10-09');
  assert.equal(accounts.length,1);
  const priorStatement=supplierStatement(supplier.id,[reversed],[],'2026-10-09')[0];
  assert.equal(priorStatement.remaining,'1000.00');
  assert.equal(priorStatement.entries.length,1);
  const current=purchasePayableSummary(reversed,[],'2026-10-21');
  assert.equal(current.state,'reversed');
  assert.equal(current.remaining,'0.00');
  assert.deepEqual(supplierPayablesByCurrency([reversed],[],'2026-10-21'),[]);
  assert.deepEqual(supplierStatement(supplier.id,[reversed],[],'2026-10-21'),[]);
});

test('payables table never shows future or not-yet-posted purchases absent from its totals',async()=>{
  globalThis.React??={createElement:()=>({}),Component:class{constructor(props){this.props=props;}}};
  const {SupplierPayablesPage}=await import('../dist/src/components/SupplierPayablesPage.js');
  const today=todayIso(),future=new Date(Date.parse(today+'T12:00:00.000Z')+15*86400000).toISOString().slice(0,10);
  const {supplier,purchase}=fixture();
  const current={...purchase,id:'current-purchase',number:'PUR-CURRENT',date:today,postedAt:today+'T08:00:00.000Z'};
  const futureDated={...purchase,id:'future-dated',number:'PUR-FUTURE',date:future,postedAt:today+'T08:00:00.000Z'};
  const latePosted={...purchase,id:'late-posted',number:'PUR-LATE',date:'2026-01-01',postedAt:future+'T08:00:00.000Z'};
  const purchases=[current,futureDated,latePosted];
  const view=new SupplierPayablesPage({suppliers:[supplier],purchases,supplierPayments:[]});
  assert.deepEqual(view.postedPurchases().map(row=>row.id),['current-purchase']);
  assert.equal(supplierPayablesByCurrency(purchases,[],today)[0].purchases,'1000.00');
});

test('voiding a supplier payment retains earlier balances but excludes it from current payables and treasury',()=>{
  const {supplier,purchase}=fixture();
  const original={id:'audit-voided-payment',purchaseId:purchase.id,purchaseNumber:purchase.number,
    supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',currency:'USD',
    amount:'200.00',date:'2026-10-02',method:'bank-transfer',reference:'PAY-TEST',notes:'',
    createdAt:'2026-10-02T10:00:00.000Z',updatedAt:'2026-10-02T10:00:00.000Z'};
  const voided=voidSupplierPayment(original,'Incorrect payment reference');
  assert.equal(voided.id,original.id);
  assert.equal(voided.amount,original.amount);
  assert.ok(voided.voidedAt&&voided.voidReason);
  assert.equal(purchasePayableSummary(purchase,[voided],'2026-10-08').paid,'200.00');
  assert.equal(supplierStatement(supplier.id,[purchase],[voided],'2026-10-08')[0].entries.length,2);
  assert.equal(purchasePayableSummary(purchase,[voided],voided.voidedAt.slice(0,10)).paid,'0.00');
  assert.equal(supplierStatement(supplier.id,[purchase],[voided],voided.voidedAt.slice(0,10))[0].entries.length,1);
  assert.equal(treasuryProjection([],[voided],[],[],[]).length,0);
  assert.doesNotThrow(()=>assertSupplierPaymentInvariant([purchase],[supplier],[voided]));
  const corrected=normalizeSupplierPayment(purchase,supplier,[voided],{...original,id:'audit-corrected-payment',amount:'1000.00',voidedAt:'',voidReason:''});
  assert.equal(corrected.amount,'1000.00','cancelled payment must not count toward the active purchase limit');
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[voided],voided),/voided/i);
  assert.throws(()=>voidSupplierPayment(voided,'void twice'),/already voided/);
  const reversed={...purchase,status:'reversed',reversedAt:'2026-10-21T12:00:00.000Z'};
  assert.doesNotThrow(()=>assertSupplierPaymentInvariant([reversed],[supplier],[voided]));
});
