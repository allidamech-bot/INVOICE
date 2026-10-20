import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,convertToInvoice} from '../dist/src/lib/documents.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {receivablesByCurrency,customerStatement} from '../dist/src/lib/receivables.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const reopen=value=>JSON.parse(JSON.stringify(value));
const asOf='2026-10-20';

test('saved quotation converts and settles through two receipts without duplication on merge replay',()=>{
  let vault=emptyVault();
  const customer={id:'qa-saved-cycle-buyer',companyNameEn:'Synthetic service buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:'',notes:'',preferredCurrency:'USD',
    paymentTermsPresetId:'',creditLimit:'',workspaceId:'default',branchId:'main',
    createdAt:'2026-10-01T09:00:00.000Z',updatedAt:'2026-10-01T09:00:00.000Z'};
  vault={...vault,customers:[customer]};
  let quote=createBlankDocument('proforma','QUO-QA-SAVED-CYCLE',vault.company);
  Object.assign(quote,{id:'qa-saved-cycle-quote',workspaceId:'default',branchId:'main',
    currency:'USD',language:'en',issueDate:'2026-10-01',dueDate:'2026-10-31',
    createdAt:'2026-10-01T09:00:00.000Z',customerSnapshot:customerSnapshotFrom(customer)});
  quote.items=[{...quote.items[0],id:'qa-saved-cycle-line',descriptionEn:'Synthetic service',
    quantity:'2',unit:'Service',unitPrice:'100.00',unitCost:'0',stockTreatment:'non-stock'}];
  quote.adjustments={...quote.adjustments,discountEnabled:true,discountMode:'percent',
    discountValue:'10',shippingEnabled:false,otherChargesEnabled:false,taxEnabled:true,taxPercent:'20'};
  vault=reopen(mergeVaultIntent(vault,{...vault,documents:[quote]},vault));
  quote=vault.documents[0];
  assert.equal(calculateTotals(quote.items,quote.adjustments).grandTotal,'216.00');
  const finalQuote={...quote,status:'final'};
  vault=reopen(mergeVaultIntent(vault,{...vault,documents:[finalQuote]},vault));
  const sourceBefore=JSON.stringify(vault.documents[0]);
  let invoice=convertToInvoice(vault.documents[0],'INV-QA-SAVED-CYCLE');
  assert.notEqual(invoice.id,quote.id);
  assert.notEqual(invoice.items[0].id,quote.items[0].id);
  assert.equal(invoice.convertedFromId,quote.id);
  for(const key of ['workspaceId','branchId','currency'])assert.equal(invoice[key],quote[key],key);
  assert.deepEqual(invoice.customerSnapshot,quote.customerSnapshot);
  assert.deepEqual(invoice.companySnapshot,quote.companySnapshot);
  assert.deepEqual(invoice.items.map(({id,...item})=>item),quote.items.map(({id,...item})=>item));
  Object.assign(invoice,{issueDate:'2026-10-02',dueDate:'2026-10-31',createdAt:'2026-10-02T09:00:00.000Z'});
  vault=reopen(mergeVaultIntent(vault,{...vault,documents:[...vault.documents,invoice]},vault));
  invoice={...vault.documents.find(doc=>doc.id===invoice.id),status:'final'};
  vault=reopen(mergeVaultIntent(vault,{...vault,documents:vault.documents.map(doc=>doc.id===invoice.id?invoice:doc)},vault));
  assert.equal(JSON.stringify(vault.documents.find(doc=>doc.id===quote.id)),sourceBefore);
  const receipt=(state,id,amount,date)=>normalizePaymentRecord(invoice,state.payments,{
    id,amount,date,method:'bank-transfer',reference:id,notes:'',
    createdAt:date+'T10:00:00.000Z'
  },state.documents);
  const first=receipt(vault,'qa-saved-cycle-receipt-1','80.00','2026-10-03');
  vault=reopen(mergeVaultIntent(vault,{...vault,payments:[first]},vault));
  let summary=invoicePaymentSummary(invoice,vault.payments,asOf,vault.documents);
  assert.equal(summary.total,'216.00');
  assert.equal(summary.paid,'80.00');
  assert.equal(summary.remaining,'136.00');
  assert.equal(summary.status,'partially-paid');
  const partial=reopen(vault);
  const second=receipt(partial,'qa-saved-cycle-receipt-2','136.00','2026-10-04');
  const intended={...partial,payments:[...partial.payments,second]};
  vault=reopen(mergeVaultIntent(partial,intended,reopen(intended)));
  vault=reopen(mergeVaultIntent(partial,reopen(vault),reopen(vault)));
  assert.equal(vault.payments.length,2);
  assert.equal(new Set(vault.documents.map(doc=>doc.id)).size,2);
  assert.equal(new Set(vault.payments.map(payment=>payment.id)).size,2);
  summary=invoicePaymentSummary(invoice,vault.payments,asOf,vault.documents);
  assert.equal(summary.paid,'216.00');
  assert.equal(summary.remaining,'0.00');
  assert.equal(summary.status,'paid');
  const ar=receivablesByCurrency(vault.documents,vault.payments,asOf).find(row=>row.currency==='USD');
  assert.equal(ar.billed,'216.00');assert.equal(ar.paid,'216.00');assert.equal(ar.outstanding,'0.00');
  const statement=customerStatement(customer.id,vault.documents,vault.payments,asOf)[0];
  assert.equal(statement.entries.length,3);
  assert.equal(statement.entries.at(-1).balance,'0.00');
  const report=financialReportByCurrency(vault.documents,vault.payments,'2026-10-01',asOf)[0];
  assert.equal(report.invoiced,'216.00');assert.equal(report.collected,'216.00');
  assert.equal(report.outstanding,'0.00');assert.equal(report.issuedInvoices,1);
  const before=JSON.stringify(vault);
  assert.throws(()=>receipt(vault,'qa-excess-receipt','0.01','2026-10-05'),/exceed.*remaining invoice balance/i);
  for(const foreign of [{...second,branchId:'foreign-branch'},{...second,workspaceId:'foreign-company'}]){
    assert.throws(()=>mergeVaultIntent(partial,{...partial,payments:[...partial.payments,foreign]},partial),
      /same company and branch as its invoice/i);
  }
  assert.equal(JSON.stringify(vault),before,'rejected operations cannot partially change settled data');
});
