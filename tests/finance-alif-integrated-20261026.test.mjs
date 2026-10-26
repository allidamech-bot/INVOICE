import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,inventoryBalances} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,treasuryProjection,treasuryTotals,treasuryLedgerTotals,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';
import {fxRateMatchForDate,convertWithFxMatch} from '../dist/src/lib/fx-rates.js';

// Alif post-merge integration acceptance: one synthetic business lifecycle.
// No Firebase client, owner login, live workspace, file writes or AI modules.
const scope={workspaceId:'default',branchId:'main'};
const date='2026-10-12',at='2026-10-12T10:00:00.000Z';
const asOf='2026-10-31';
const customerSnapshot={sourceCustomerId:'qa-customer',companyNameEn:'Synthetic Buyer',
  companyNameAr:'عميل تجريبي',contactPerson:'',addressEn:'',addressAr:'',
  city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};

function fixture(){
  let vault=emptyVault();
  const supplier={...createSupplier(),id:'qa-supplier',nameEn:'Synthetic Vendor',defaultCurrency:'USD'};
  const item={id:'qa-carton',sku:'QA-CARTON-01',descriptionEn:'QA Carton',
    descriptionAr:'كرتون تجريبي',unit:'Carton',inventoryTracking:'tracked',
    createdAt:at,updatedAt:at,...scope,lastUnitCost:'',lastCostCurrency:'',
    lastUnitPrice:'10.00',lastCurrency:'USD'};
  vault={...vault,suppliers:[supplier],savedItems:[item]};
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'qa-purchase-200',number:'PUR-2026-QA-200',date:'2026-10-01',
    dueDate:'2026-11-30',currency:'USD',...scope});
  purchase.items=[{...createPurchaseItem(item),id:'qa-purchase-line',quantity:'200',
    unitCost:'6.00',landedUnitCost:''}];
  const original=JSON.stringify(vault);
  const posted=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);
  assert.equal(JSON.stringify(vault),original,'purchase must not mutate the prior vault');
  assert.equal(posted.purchase.status,'posted');
  vault={...vault,purchases:[posted.purchase],savedItems:posted.savedItems,
    inventoryMovements:[...vault.inventoryMovements,...posted.movements]};
  const invoice=createBlankDocument('invoice','INV-2026-QA-001',vault.company);
  Object.assign(invoice,{id:'qa-invoice-20',status:'final',role:'standard',
    lifecycleStatus:'active',issueDate:'2026-10-10',dueDate:'2026-11-30',
    currency:'USD',customerSnapshot,...scope});
  invoice.items=[{...invoice.items[0],id:'qa-invoice-line',savedItemId:item.id,
    skuSnapshot:item.sku,stockTreatment:'tracked',unit:'Carton',
    descriptionEn:item.descriptionEn,quantity:'20',unitPrice:'10.00',unitCost:'6.00'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,
    shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  return{vault,item,supplier,invoice,purchase:posted.purchase};
}

test('Alif merged-head business lifecycle: 200→180 stock, AR/AP, bank allocations and no phantom cash',()=>{
  const f=fixture();
  const stock=v=>inventoryBalances(v.savedItems,v.inventoryMovements)
    .find(row=>row.item.id===f.item.id).quantity;
  assert.equal(stock(f.vault),'200','purchase posts the physical stock once');
  assert.equal(postIssuedInvoiceStock(f.vault,{...f.invoice,status:'draft'}).created,false);
  assert.equal(stock(f.vault),'200','draft invoice cannot deduct stock');

  const beforeIssue=JSON.stringify(f.vault);
  const issued=postIssuedInvoiceStock(f.vault,f.invoice);
  assert.equal(issued.created,true);
  assert.equal(JSON.stringify(f.vault),beforeIssue,'invoice posting calculation must be pure');
  assert.equal(stock(issued.vault),'180','20 units consumed from 200');
  assert.equal(postIssuedInvoiceStock(issued.vault,f.invoice).created,false,
    'replaying the same final invoice cannot debit stock again');
  assert.equal(issued.vault.inventoryMovements.filter(row=>row.sourceId===f.invoice.id).length,1,
    'one immutable stock issue per invoice line');

  let vault={...issued.vault,documents:[f.invoice]};
  const payment=normalizePaymentRecord(f.invoice,[],{id:'qa-receipt-50',
    invoiceId:f.invoice.id,invoiceNumber:f.invoice.number,customerId:'qa-customer',
    customerNameEn:'Synthetic Buyer',customerNameAr:'',date,...scope,
    currency:'USD',amount:'50.00',reference:'QA-RECEIPT',method:'bank-transfer',
    notes:'',createdAt:at,updatedAt:at},[f.invoice]);
  const supplierPayment=normalizeSupplierPayment(f.purchase,f.supplier,[],{
    id:'qa-supplier-paid-30',purchaseId:f.purchase.id,purchaseNumber:f.purchase.number,
    supplierId:f.supplier.id,supplierNameEn:f.supplier.nameEn,supplierNameAr:'',
    date,...scope,currency:'USD',amount:'30.00',reference:'QA-SUPP',
    method:'bank-transfer',notes:'',createdAt:at,updatedAt:at,
    voidedAt:'',voidReason:''});
  vault={...vault,payments:[payment],supplierPayments:[supplierPayment]};

  const bank=createTreasuryAccount({label:'Synthetic USD Bank',kind:'bank',
    currency:'USD',...scope});
  bank.id='qa-bank';
  const opening={...createTreasuryEntry('opening-balance','USD'),id:'qa-opening',
    ...scope,date:'2026-10-01',amount:'100.00',toAccountId:bank.id,
    createdAt:'2026-10-01T10:00:00.000Z'};
  vault={...vault,treasuryAccounts:[bank],treasuryEntries:[opening]};

  const unallocated=treasuryProjection(vault.payments,vault.supplierPayments,[],
    vault.treasuryEntries,[], 'USD',asOf);
  assert.equal(unallocated.filter(row=>!row.fromAccountId&&!row.toAccountId).length,2);
  assert.equal(treasuryAccountBalance(bank.id,vault.treasuryEntries),'100.00');
  assert.equal(treasuryLedgerTotals(unallocated,'USD').net,'0.00',
    'receipt and supplier payable alone cannot create bank movements');
  assert.equal(treasuryTotals(unallocated,'USD').net,'20.00',
    'legacy financial projection remains unchanged');

  const receiptEntry={...createTreasuryEntry('collection','USD'),
    id:'qa-bank-collection',...scope,date,amount:'50.00',toAccountId:bank.id,
    sourceType:'customer-payment',sourceId:payment.id,createdAt:at,updatedAt:at};
  const afterReceipt=appendTreasuryEntry(vault,receiptEntry);
  assert.throws(()=>appendTreasuryEntry(afterReceipt,
    {...receiptEntry,id:'qa-duplicate'}),/already allocated|مسبق/,
    'customer receipt cannot be linked twice');
  const payableEntry={...createTreasuryEntry('supplier-payment','USD'),
    id:'qa-bank-payable',...scope,date,amount:'30.00',fromAccountId:bank.id,
    sourceType:'supplier-payment',sourceId:supplierPayment.id,createdAt:at,updatedAt:at};
  const settled=appendTreasuryEntry(afterReceipt,payableEntry);
  const rows=treasuryProjection(settled.payments,settled.supplierPayments,
    settled.expenses,settled.treasuryEntries,settled.treasuryReconciliations,'USD',asOf);
  const kpi=treasuryLedgerTotals(rows,'USD');
  assert.deepEqual([kpi.inflow,kpi.outflow,kpi.net],['50.00','30.00','20.00']);
  assert.equal(rows.filter(row=>!row.fromAccountId&&!row.toAccountId).length,0);
  assert.equal(treasuryAccountBalance(bank.id,settled.treasuryEntries),'120.00');
  const report=treasuryPeriodReport({...scope,from:'2026-10-01',to:asOf,
    accounts:settled.treasuryAccounts,entries:settled.treasuryEntries,
    reconciliations:settled.treasuryReconciliations,
    payments:settled.payments,supplierPayments:settled.supplierPayments,
    expenses:settled.expenses,defaultCurrency:'USD'});
  assert.equal(report.accounts[0].closing,'120.00');

  const invoiceSummary=invoicePaymentSummary(f.invoice,settled.payments,asOf,settled.documents);
  assert.deepEqual([invoiceSummary.total,invoiceSummary.paid,invoiceSummary.remaining],
    ['200.00','50.00','150.00']);
  const receivables=receivablesByCurrency(settled.documents,settled.payments,asOf);
  assert.deepEqual([receivables[0].billed,receivables[0].paid,receivables[0].outstanding],
    ['200.00','50.00','150.00']);
  const payable=purchasePayableSummary(f.purchase,settled.supplierPayments,asOf);
  assert.deepEqual([payable.total,payable.paid,payable.remaining],
    ['1200.00','30.00','1170.00']);
  assert.equal(stock(settled),'180','payments and bank postings cannot change stock');
  const beforeReads=JSON.stringify(settled);
  treasuryLedgerTotals(rows,'USD');
  receivablesByCurrency(settled.documents,settled.payments,asOf);
  assert.equal(JSON.stringify(settled),beforeReads,'financial read paths must be side-effect free');
});

test('Alif merged-head: overselling fails closed; FX is explicit and never rewrites historical amounts',()=>{
  const f=fixture();
  const issued=postIssuedInvoiceStock(f.vault,f.invoice);
  const impossible={...f.invoice,id:'qa-impossible-invoice',
    items:[{...f.invoice.items[0],id:'qa-impossible-line',quantity:'181'}]};
  const snapshot=JSON.stringify(issued.vault);
  assert.throws(()=>postIssuedInvoiceStock(issued.vault,impossible),/Insufficient stock/);
  assert.equal(JSON.stringify(issued.vault),snapshot,'failed oversell cannot create a partial issue');
  const fx={id:'qa-fx',...scope,date:'2026-10-01',
    fromCurrency:'USD',toCurrency:'SAR',rate:'3.75000000',
    sourceLabel:'Synthetic Bank',notes:'',createdAt:at,updatedAt:at};
  const invalid={...fx,id:'qa-invalid',date:'2026-10-25',rate:'0'};
  const source=[invalid,fx];
  const fxBefore=JSON.stringify(source);
  const match=fxRateMatchForDate(source,'USD','SAR','2026-10-26');
  assert.equal(match?.rate.id,'qa-fx','invalid newer rate cannot override valid dated rate');
  assert.equal(convertWithFxMatch('50.00',match),'187.5');
  assert.throws(()=>convertWithFxMatch('not-a-number',match),/valid decimal/);
  assert.equal(JSON.stringify(source),fxBefore,'conversion cannot rewrite rate history');
  assert.equal(JSON.stringify(issued.vault),snapshot,'conversion cannot rewrite issued inventory');
});
