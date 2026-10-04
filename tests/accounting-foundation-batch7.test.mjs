import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {normalizePaymentRecord} from '../dist/src/lib/payments.js';
import {appendTreasuryEntry,createTreasuryAccount,createTreasuryEntry,voidTreasuryEntry,treasuryProjection,treasuryTotals,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment} from '../dist/src/lib/payables.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {outputVatReport} from '../dist/src/lib/tax-vat.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {setUiLanguage} from '../dist/src/lib/i18n.js';
import {createCreditNoteDraft,assertDocumentLifecycleInvariant} from '../dist/src/lib/document-lifecycle.js';
function fixture(){const vault=emptyVault(),account=createTreasuryAccount({label:'Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});vault.treasuryAccounts=[account];
 const invoice=createBlankDocument('invoice','INV-7',vault.company);invoice.status='final';invoice.customerSnapshot={sourceCustomerId:'c1',companyNameEn:'Atlas',companyNameAr:'أطلس'};invoice.items=[{...invoice.items[0],descriptionEn:'Valve',descriptionAr:'صمام',quantity:'10',unitPrice:'10',unitCost:'6'}];vault.documents=[invoice];
 const payment=normalizePaymentRecord(invoice,[],{id:'p1',amount:'30.00',date:invoice.issueDate,method:'bank-transfer',reference:'PAY-7',notes:''},vault.documents);vault.payments=[payment];
 const entry={...createTreasuryEntry('collection','USD'),workspaceId:'default',branchId:'main',amount:'30.00',toAccountId:account.id,sourceType:'customer-payment',sourceId:payment.id};return{vault,account,invoice,payment,entry};}

test('approved collection appends once and reconciles to its unchanged canonical source',()=>{
 const {vault,entry,account}=fixture(),original=structuredClone(vault),saved=appendTreasuryEntry(vault,entry);assert.deepEqual(vault,original);assert.deepEqual(saved.payments,vault.payments);assert.deepEqual(saved.documents,vault.documents);
 const rows=treasuryProjection(saved.payments,[],[],saved.treasuryEntries,[]);assert.equal(rows.length,1);assert.equal(rows[0].key,`treasury:${entry.id}`);assert.equal(treasuryTotals(rows,'USD').inflow,'30.00');assert.equal(treasuryAccountBalance(account.id,saved.treasuryEntries),'30.00');
});

test('stale/deleted/ambiguous or financially invalid payment sources reject without posting',()=>{
 for(const change of [v=>v.payments=[],v=>v.payments[0].amount='40.00',v=>v.payments[0].currency='EUR',v=>v.payments[0].currency='',v=>v.payments.push({...v.payments[0]}),v=>v.documents=[],v=>v.documents[0].lifecycleStatus='voided',v=>v.payments[0].date='bad-date',v=>v.payments[0].customerId='another',v=>v.payments[0].branchId='other']){const {vault,entry}=fixture();change(vault);const original=structuredClone(vault);assert.throws(()=>appendTreasuryEntry(vault,entry));assert.deepEqual(vault,original);}
});

test('latest account existence, activity, scope and currency are mandatory even with no accounts',()=>{
 for(const change of [v=>v.treasuryAccounts=[],v=>v.treasuryAccounts[0].active=false,v=>v.treasuryAccounts[0].currency='EUR',v=>v.treasuryAccounts[0].branchId='other',v=>v.treasuryAccounts.push({...v.treasuryAccounts[0]}),v=>v.appSettings.activeWorkspaceId='other']){const {vault,entry}=fixture();change(vault);assert.throws(()=>appendTreasuryEntry(vault,entry));assert.equal(vault.treasuryEntries.length,0);}
 const {vault,entry}=fixture();assert.throws(()=>appendTreasuryEntry(vault,{...entry,currency:''}));
});

test('duplicate allocation/ID is rejected; explicit void permits auditable replacement',()=>{
 const {vault,entry,account}=fixture(),saved=appendTreasuryEntry(vault,entry);assert.throws(()=>appendTreasuryEntry(saved,entry),/already/);assert.throws(()=>appendTreasuryEntry(saved,{...entry,id:'other'}),/allocated/);
 const voided=voidTreasuryEntry(entry,'Allocation correction');const corrected=appendTreasuryEntry({...saved,treasuryEntries:[voided]},{...entry,id:'replacement'});assert.equal(corrected.treasuryEntries.length,2);assert.equal(corrected.treasuryEntries[0].voidReason,'Allocation correction');assert.equal(treasuryAccountBalance(account.id,corrected.treasuryEntries),'30.00');assert.equal(treasuryProjection(corrected.payments,[],[],corrected.treasuryEntries,[]).length,1);
 assert.throws(()=>appendTreasuryEntry(vault,{...entry,reconciledAt:'2026-10-01'}),/unreconciled/);
});

function payableFixture(){const base=fixture(),supplier={...createSupplier(),nameEn:'Supply'},item={id:'i1',sku:'A-1',descriptionEn:'Valve',descriptionAr:'صمام',unit:'PCS',lastUnitCost:'6',lastCostCurrency:'USD'};const purchase=createPurchase([],[supplier],'USD');purchase.items=[{...createPurchaseItem(item),quantity:'2',unitCost:'6'}];const posted=postPurchase(purchase,[item]).purchase;const payment=normalizeSupplierPayment(posted,supplier,[],createSupplierPayment(posted,supplier,[]));base.vault.suppliers=[supplier];base.vault.purchases=[posted];base.vault.supplierPayments=[payment];const entry={...createTreasuryEntry('supplier-payment','USD'),workspaceId:'default',branchId:'main',amount:payment.amount,fromAccountId:base.account.id,sourceType:'supplier-payment',sourceId:payment.id};return{...base,entry};}

test('supplier allocation requires a real current posted purchase and matching source amount/currency',()=>{
 const {vault,entry}=payableFixture(),saved=appendTreasuryEntry(vault,entry);assert.deepEqual(saved.purchases,vault.purchases);assert.deepEqual(saved.supplierPayments,vault.supplierPayments);assert.equal(treasuryTotals(treasuryProjection([],saved.supplierPayments,[],saved.treasuryEntries,[]),'USD').outflow,'12.00');
 for(const change of [v=>v.purchases[0].status='reversed',v=>v.purchases=[],v=>v.supplierPayments=[],v=>v.supplierPayments[0].amount='13',v=>v.supplierPayments[0].currency='EUR',v=>v.supplierPayments[0].supplierId='another']){const {vault,entry}=payableFixture();change(vault);assert.throws(()=>appendTreasuryEntry(vault,entry));assert.equal(vault.treasuryEntries.length,0);}
});

test('same-currency transfer is operationally neutral; cross-currency posting is rejected',()=>{
 const {vault,account}=fixture(),cash=createTreasuryAccount({label:'Cash',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});vault.treasuryAccounts.push(cash);
 const entry={...createTreasuryEntry('transfer','USD'),workspaceId:'default',branchId:'main',amount:'10.00',fromAccountId:account.id,toAccountId:cash.id},saved=appendTreasuryEntry(vault,entry),totals=treasuryTotals(treasuryProjection([],[],[],saved.treasuryEntries,[]),'USD');assert.equal(totals.net,'0.00');assert.equal(totals.internalTransfers,'10.00');assert.equal(treasuryAccountBalance(account.id,saved.treasuryEntries),'-10.00');assert.equal(treasuryAccountBalance(cash.id,saved.treasuryEntries),'10.00');
 cash.currency='EUR';assert.throws(()=>appendTreasuryEntry(vault,entry),/currency/);
});

test('management reports reconcile to deterministic sales/receivables/tax sources and withhold unknown profit',()=>{
 const {vault,invoice}=fixture();invoice.adjustments.taxEnabled=true;invoice.adjustments.taxPercent='5';
 const euro={...structuredClone(invoice),id:'eur-invoice',number:'EUR-7',currency:'EUR',items:invoice.items.map(item=>({...item,unitCost:''}))};const draft={...invoice,id:'draft',status:'draft'},delivery={...invoice,id:'delivery',kind:'delivery-note'};const documents=[invoice,euro,draft,delivery];
 const report=financialReportByCurrency(documents,vault.payments,'',invoice.issueDate),receivables=receivablesByCurrency(documents,vault.payments,invoice.issueDate),tax=outputVatReport(documents,'',invoice.issueDate);
 assert.equal(report.length,2);for(const row of report){assert.equal(row.outstanding,receivables.find(r=>r.currency===row.currency).outstanding);assert.equal(row.invoiced,calculateTotals((row.currency==='USD'?invoice:euro).items,invoice.adjustments).grandTotal);assert.equal(tax.currencies.find(r=>r.currency===row.currency).outputVat,'5.00');}
 assert.equal(report.find(row=>row.currency==='EUR').profitComplete,false);assert.equal(report.find(row=>row.currency==='EUR').grossProfit,'');assert.equal(report.find(row=>row.currency==='USD').grossProfit,'40.00');assert.equal(tax.inputVatSupported,false);
});

test('new source-change guidance remains Arabic and cannot cause an automatic posting',()=>{
 setUiLanguage('ar');try{const {vault,entry}=fixture();vault.payments[0].amount='40';assert.throws(()=>appendTreasuryEntry(vault,entry),/تغير مبلغ الدفعة/);assert.equal(vault.treasuryEntries.length,0);}finally{setUiLanguage('en');}
});

test('opening balance is cash position, not a collection; allocation and explicit void do not double-count payment movement',()=>{
 const {vault,account,entry}=fixture();
 const opening={...createTreasuryEntry('opening-balance','USD'),workspaceId:'default',branchId:'main',amount:'100.00',toAccountId:account.id};
 const withOpening=appendTreasuryEntry(vault,opening),allocated=appendTreasuryEntry(withOpening,entry);
 const rows=treasuryProjection(allocated.payments,[],[],allocated.treasuryEntries,[]);
 assert.equal(treasuryAccountBalance(account.id,allocated.treasuryEntries),'130.00');assert.equal(treasuryTotals(rows,'USD').inflow,'30.00');assert.equal(treasuryTotals(rows,'USD').net,'30.00');
 const corrected={...allocated,treasuryEntries:[opening,voidTreasuryEntry(entry,'Wrong account')]};
 const after=treasuryProjection(corrected.payments,[],[],corrected.treasuryEntries,[]);
 assert.equal(after.filter(row=>row.source==='collection').length,1);assert.equal(treasuryTotals(after,'USD').net,'30.00');assert.equal(treasuryAccountBalance(account.id,corrected.treasuryEntries),'100.00');
 assert.deepEqual(corrected.documents,vault.documents);assert.deepEqual(corrected.payments,vault.payments);
});

test('issued credits reconcile net sales, receivables and output VAT as-of while future, voided and draft sources stay excluded',()=>{
 const {vault,invoice}=fixture();invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-01';invoice.adjustments.taxEnabled=true;invoice.adjustments.taxPercent='5';
 const fullCredit={...createCreditNoteDraft(invoice,'CN-7-CLOSEOUT','105.00'),status:'final',issueDate:'2026-10-02'};
 assertDocumentLifecycleInvariant(fullCredit,[invoice,fullCredit],[]);
 const future={...structuredClone(invoice),id:'future',number:'FUTURE',issueDate:'2026-11-01'},voided={...structuredClone(invoice),id:'void',number:'VOID',lifecycleStatus:'voided'},draft={...structuredClone(invoice),id:'draft',number:'DRAFT',status:'draft'};
 const documents=[invoice,fullCredit,future,voided,draft];
 const before=financialReportByCurrency(documents,[],'','2026-10-01')[0];assert.equal(before.invoiced,'105.00');assert.equal(before.outstanding,'105.00');assert.equal(outputVatReport(documents,'','2026-10-01').currencies[0].outputVat,'5.00');
 const after=financialReportByCurrency(documents,[],'','2026-10-02')[0];assert.equal(after.invoiced,'0.00');assert.equal(after.netSales,'0.00');assert.equal(after.outstanding,'0.00');assert.equal(after.grossProfit,'0.00');
 assert.equal(receivablesByCurrency(documents,[],'2026-10-02')[0].outstanding,'0.00');
 const tax=outputVatReport(documents,'','2026-10-02');assert.equal(tax.currencies[0].outputVat,'0.00');assert.equal(tax.rows.length,2);assert.equal(tax.inputVatSupported,false);
});
