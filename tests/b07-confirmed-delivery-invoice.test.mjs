import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {
  createConfirmedDeliveryInvoiceDraft, linkedDeliveryInvoice, invoiceSourceDelivery, assertDeliveryInvoiceIntegrity, assertDeliveryInvoiceLedgerContinuity
} from '../dist/src/lib/sales-delivery-invoice.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {todayIso,addDaysIso} from '../dist/src/lib/id.js';
import {defaultOwnerMember} from '../dist/src/lib/governance.js';
import {normalizePaymentRecord,invoicePaymentSummary,assertInvoicePaymentInvariant} from '../dist/src/lib/payments.js';
import {salesOrderInvoiceProgress} from '../dist/src/lib/sales-order-progress.js';

function setup(defaultPaymentTermPresetId=''){
  const v=emptyVault(),now=new Date().toISOString();
  if(defaultPaymentTermPresetId)v.company.commercial.defaultPaymentTermPresetId=defaultPaymentTermPresetId;
  const customer={id:'customer-inv-01',companyNameEn:'Riyadh FMCG',companyNameAr:'شركة الرياض',
    contactPerson:'Buyer',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
  v.customers=[customer];
  const quote=createBlankDocument('proforma','QUO-2026-INVOICE-01',v.company);
  quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(customer);
  quote.items=[
    {...quote.items[0],id:'cookie-line',descriptionEn:'Cookies',descriptionAr:'بسكويت',quantity:'12',unit:'Carton',unitPrice:'10'},
    {...quote.items[0],id:'candy-line',descriptionEn:'Candy',descriptionAr:'حلوى',quantity:'6',unit:'Carton',unitPrice:'25'}
  ];
  assert.deepEqual(validateDocument(quote),{});
  v.documents=[quote];v.documentEvents.push(validatedCommercialTrackingEvent(v,quote.id,'accepted'));
  const accepted=acceptSalesOrder(v,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
    customerReference:'PO-INV-1',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
  return{vault:accepted.vault,quote,order:accepted.order};
}
function confirmed(vault,quote,quantities=['4','2'],reference='POD-A'){
  const draft=createLinkedDeliveryDraft(vault,quote.id);
  const note={...draft.document,status:'final',
    items:draft.document.items.map((line,i)=>({...line,quantity:quantities[i]}))};
  assert.deepEqual(validateDocument(note),{});
  const issued={...draft.vault,documents:draft.vault.documents.map(doc=>doc.id===note.id?note:doc)};
  return{note,vault:confirmSalesDelivery(issued,{
    deliveryNoteId:note.id,expectedDeliveryNoteUpdatedAt:note.updatedAt,confirmed:true,
    deliveredDate:todayIso(),reference
  }).vault};
}
test('Batch 7 — exact partially delivered lines become unissued invoice draft, no stock/AR/payment posting',()=>{
  const {vault,quote,order}=setup(),a=confirmed(vault,quote);
  const result=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id);
  assert.equal(result.created,true);
  assert.equal(result.invoice.kind,'invoice');
  assert.equal(result.invoice.status,'draft');
  assert.equal(result.invoice.convertedFromId,quote.id);
  assert.equal(result.invoice.currency,order.currency);
  assert.equal(result.invoice.customerSnapshot.sourceCustomerId,order.customerId);
  assert.deepEqual(result.invoice.items.map(x=>x.quantity),['4','2']);
  assert.deepEqual(result.invoice.items.map(x=>x.unitPrice),['10','25']);
  assert.equal(result.invoice.adjustments.shippingEnabled,false);
  assert.equal(result.invoice.adjustments.discountEnabled,false);
  assert.equal(result.invoice.adjustments.otherChargesEnabled,false);
  assert.match(result.invoice.terms.remarks,/POD-A/);
  assert.equal(linkedDeliveryInvoice(a.note.id,result.vault.documents,result.vault.documentEvents)?.id,result.invoice.id);
  assert.equal(invoiceSourceDelivery(result.invoice.id,result.vault.documents,result.vault.documentEvents)?.id,a.note.id);
  for(const key of ['payments','supplierPayments','purchases','inventoryMovements','treasuryEntries']){
    assert.deepEqual(result.vault[key],a.vault[key],key+' must remain untouched');
  }
  assert.doesNotThrow(()=>assertDeliveryInvoiceIntegrity(result.vault.documents,result.vault.documentEvents));
});
test('Batch 7 — invoice inherits normal Net 30 customer receivable due date',()=>{
  const {vault,quote}=setup('term-net30');
  const receipt=confirmed(vault,quote,['4','1'],'POD-NET30');
  const created=createConfirmedDeliveryInvoiceDraft(receipt.vault,receipt.note.id);
  assert.equal(created.invoice.status,'draft');
  assert.equal(created.invoice.paymentTermPresetId,'term-net30');
  assert.equal(created.invoice.terms.paymentTerms,'Net 30');
  assert.equal(created.invoice.dueDate,addDaysIso(created.invoice.issueDate,30));
  assert.equal(created.invoice.items.length,2);
});
test('Batch 7 — repeated request reopens the SAME invoice draft without another number',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const first=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id);
  const again=createConfirmedDeliveryInvoiceDraft(first.vault,a.note.id);
  assert.equal(again.created,false);
  assert.equal(again.invoice.id,first.invoice.id);
  assert.equal(again.vault,first.vault);
});
test('Batch 7 — shipment 2 can create a separate invoice without rebilling shipment 1',()=>{
  const {vault,quote}=setup(),first=confirmed(vault,quote,['4','1'],'POD-1');
  const invoiced=createConfirmedDeliveryInvoiceDraft(first.vault,first.note.id);
  const next=confirmed(invoiced.vault,quote,['8','5'],'POD-2');
  const second=createConfirmedDeliveryInvoiceDraft(next.vault,next.note.id);
  assert.notEqual(invoiced.invoice.id,second.invoice.id);
  assert.deepEqual(invoiced.invoice.items.map(x=>x.quantity),['4','1']);
  assert.deepEqual(second.invoice.items.map(x=>x.quantity),['8','5']);
  assert.doesNotThrow(()=>assertDeliveryInvoiceIntegrity(second.vault.documents,second.vault.documentEvents));
});
test('Batch 7 — cannot invoice unconfirmed or draft delivery evidence',()=>{
  const {vault,quote}=setup(),draft=createLinkedDeliveryDraft(vault,quote.id);
  assert.throws(()=>createConfirmedDeliveryInvoiceDraft(draft.vault,draft.document.id),/issued Delivery Note/);
  const final={...draft.document,status:'final'};
  const issued={...draft.vault,documents:draft.vault.documents.map(x=>x.id===final.id?final:x)};
  assert.throws(()=>createConfirmedDeliveryInvoiceDraft(issued,final.id),/Confirm actual delivery/);
});
test('Batch 7 — linked invoice quantities, price, customer, currency, product identity cannot diverge',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const r=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id),original=r.invoice;
  for(const patch of [
    {items:original.items.map((x,i)=>i===0?{...x,quantity:'12'}:x)},
    {items:original.items.map((x,i)=>i===0?{...x,unitPrice:'9'}:x)},
    {items:original.items.map((x,i)=>i===0?{...x,descriptionEn:'Tampered'}:x)},
    {currency:'EUR'},
    {convertedFromId:'other-quote'},
    {customerSnapshot:{...original.customerSnapshot,sourceCustomerId:'other'}},
  ]){
    const docs=r.vault.documents.map(x=>x.id===original.id?{...x,...patch}:x);
    assert.throws(()=>assertDeliveryInvoiceIntegrity(docs,r.vault.documentEvents),/Invoice|invoice|فاتورة/);
  }
  assert.throws(()=>assertDeliveryInvoiceIntegrity(r.vault.documents.filter(x=>x.id!==original.id),r.vault.documentEvents),/invoice source|invoice link|invoice|Invoice/);
});
test('Batch 7 — voided linked invoices cannot strand confirmed delivery evidence',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const created=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id);
  const voided={...created.invoice,status:'final',lifecycleStatus:'voided'};
  const nextDocs=created.vault.documents.map(doc=>doc.id===voided.id?voided:doc);
  assert.throws(()=>assertDeliveryInvoiceIntegrity(nextDocs,created.vault.documentEvents),
    /Delivery invoice source, customer or line count changed/);
});

test('Batch 7 — invoice issue date and immutable event document numbers remain tied to delivered evidence',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const created=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id);
  const older={...created.invoice,issueDate:'2020-01-01'};
  assert.throws(()=>assertDeliveryInvoiceIntegrity(
    created.vault.documents.map(x=>x.id===older.id?older:x),created.vault.documentEvents
  ),/issue date cannot precede confirmed delivery/);
  const corruptedEvent={...created.vault,documentEvents:created.vault.documentEvents.map(e=>
    e.documentId===created.invoice.id&&e.note.startsWith('@lourex:sales-order:delivery-invoice:v1:')
      ?{...e,relatedDocumentNumber:'WRONG-DN'}:e)};
  assert.throws(()=>assertDeliveryInvoiceIntegrity(corruptedEvent.documents,corruptedEvent.documentEvents),
    /Issued Delivery Note source has changed/);
});

test('Batch 7 — delivery-linked invoice provenance cannot redirect customer or currency',()=>{
  const {vault,quote}=setup(),receipt=confirmed(vault,quote,['4','1'],'POD-IDENTITY');
  const created=createConfirmedDeliveryInvoiceDraft(receipt.vault,receipt.note.id);
  const marker='@lourex:sales-order:delivery-invoice:v1:';
  const event=created.vault.documentEvents.find(item=>item.documentId===created.invoice.id&&item.note.startsWith(marker));
  assert.ok(event);
  const payload=JSON.parse(event.note.slice(marker.length));
  const rewrite=(patch,invoicePatch={},eventPatch={})=>{
    const docs=created.vault.documents.map(doc=>doc.id===created.invoice.id?{...doc,...invoicePatch}:doc);
    const events=created.vault.documentEvents.map(item=>item.id===event.id?
      {...item,note:marker+JSON.stringify({...payload,...patch}),...eventPatch}:item);
    return[docs,events];
  };
  const [wrongCustomerDocs,wrongCustomerEvents]=rewrite({customerId:'wrong-customer'},{
    customerSnapshot:{...created.invoice.customerSnapshot,sourceCustomerId:'wrong-customer'}
  });
  assert.throws(()=>assertDeliveryInvoiceIntegrity(wrongCustomerDocs,wrongCustomerEvents),/matching physical-delivery evidence/);
  const [wrongCurrencyDocs,wrongCurrencyEvents]=rewrite({currency:'EUR'},{currency:'EUR'},{currency:'EUR'});
  assert.throws(()=>assertDeliveryInvoiceIntegrity(wrongCurrencyDocs,wrongCurrencyEvents),/matching physical-delivery evidence/);
  const [normalDocs,badEventCurrency]=rewrite({}, {}, {currency:'EUR'});
  assert.throws(()=>assertDeliveryInvoiceIntegrity(normalDocs,badEventCurrency),/matching physical-delivery evidence/);
});

test('Batch 7 — customer legal name and VAT registration remain tied to accepted quotation',()=>{
  const {vault,quote}=setup(),receipt=confirmed(vault,quote,['4','1'],'POD-CUSTOMER-LEGAL');
  const result=createConfirmedDeliveryInvoiceDraft(receipt.vault,receipt.note.id);
  for(const customerPatch of [{companyNameEn:'Unrelated Buyer'},{vatTaxNumber:'FAKE-VAT-99'},{commercialRegistration:'FAKE-CR'}]){
    const mutated=result.vault.documents.map(doc=>doc.id===result.invoice.id
      ?{...doc,customerSnapshot:{...doc.customerSnapshot,...customerPatch}}:doc);
    assert.throws(()=>assertDeliveryInvoiceIntegrity(mutated,result.vault.documentEvents),
      /customer legal identity differs/);
  }
});

test('Batch 7 — duplicate offline invoices for one confirmed note fail merge',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const left=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id).vault;
  const right=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id).vault;
  const combinedDocuments=[...left.documents,...right.documents.filter(x=>x.kind==='invoice')];
  const combinedEvents=[...left.documentEvents,...right.documentEvents.filter(x=>x.note.startsWith('@lourex:sales-order:delivery-invoice:v1:'))];
  assert.throws(()=>assertDeliveryInvoiceIntegrity(combinedDocuments,combinedEvents),/Concurrent invoices conflict/);
  assert.throws(()=>mergeVaultIntent(a.vault,left,right));
});


test('Batch 7 — final partial-delivery invoice uses canonical receivables without double collection',()=>{
  const {vault,quote}=setup();
  const first=confirmed(vault,quote,['4','1'],'POD-PAY-1');
  const invoiceOne=createConfirmedDeliveryInvoiceDraft(first.vault,first.note.id);
  const second=confirmed(invoiceOne.vault,quote,['8','5'],'POD-PAY-2');
  const invoiceTwo=createConfirmedDeliveryInvoiceDraft(second.vault,second.note.id);
  const draft=invoiceOne.invoice,issued={...draft,status:'final'};
  const issuedSecond={...invoiceTwo.invoice,status:'final'};
  const documents=invoiceTwo.vault.documents.map(doc=>doc.id===issued.id?issued:doc.id===issuedSecond.id?issuedSecond:doc);
  const at=todayIso();
  const payment=(id,amount,invoice=issued)=>({
    id,invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:invoice.customerSnapshot.sourceCustomerId,customerNameEn:'Riyadh FMCG',customerNameAr:'',
    currency:invoice.currency,amount,date:at,method:'bank-transfer',reference:id,notes:'',
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  });
  assert.throws(()=>normalizePaymentRecord(draft,[],payment('premature','1'),documents),
    /Payments can only be recorded against an active final invoice/);
  assert.deepEqual([invoicePaymentSummary(issued,[],at,documents).total,
    invoicePaymentSummary(issuedSecond,[],at,documents).total],['65.00','205.00']);
  const firstPayment=normalizePaymentRecord(issued,[],payment('payment-20','20.00'),documents);
  const partial=invoicePaymentSummary(issued,[firstPayment],at,documents);
  assert.equal(partial.status,'partially-paid');
  assert.equal(partial.remaining,'45.00');
  assert.throws(()=>normalizePaymentRecord(issued,[firstPayment],payment('excess','45.01'),documents),
    /cannot exceed the remaining invoice balance/);
  const balancePayment=normalizePaymentRecord(issued,[firstPayment],payment('payment-45','45.00'),documents);
  assert.equal(invoicePaymentSummary(issued,[firstPayment,balancePayment],at,documents).status,'paid');
  assert.equal(invoicePaymentSummary(issuedSecond,[firstPayment,balancePayment],at,documents).status,'unpaid');
  assert.equal(invoicePaymentSummary(issuedSecond,[firstPayment,balancePayment],at,documents).remaining,'205.00');
  assert.doesNotThrow(()=>assertInvoicePaymentInvariant(issued,[firstPayment,balancePayment],documents));
  assert.doesNotThrow(()=>assertDeliveryInvoiceIntegrity(documents,invoiceTwo.vault.documentEvents));
  const secondPayment=normalizePaymentRecord(issuedSecond,[firstPayment,balancePayment],
    payment('payment-205','205.00',issuedSecond),documents);
  assert.equal(invoicePaymentSummary(issuedSecond,[firstPayment,balancePayment,secondPayment],at,documents).status,'paid');
});

test('Batch 7 — confirmed delivery invoice evidence is append-only under offline sync',()=>{
  const {vault,quote}=setup();
  const receipt=confirmed(vault,quote,['4','1'],'POD-LEDGER');
  const created=createConfirmedDeliveryInvoiceDraft(receipt.vault,receipt.note.id);
  const events=created.vault.documentEvents;
  const link=events.find(event=>event.documentId===created.invoice.id
    &&event.note.startsWith('@lourex:sales-order:delivery-invoice:v1:'));
  assert.ok(link);
  const deleted=events.filter(event=>event.id!==link.id);
  const rewritten=events.map(event=>event.id===link.id
    ?{...event,note:event.note.replace('POD-LEDGER','POD-REWRITTEN')}:event);
  assert.throws(()=>assertDeliveryInvoiceLedgerContinuity(events,deleted,events),/append-only/);
  assert.throws(()=>assertDeliveryInvoiceLedgerContinuity(events,rewritten,events),/append-only/);
  assert.throws(()=>assertDeliveryInvoiceLedgerContinuity(events,events,deleted),/append-only/);
  assert.throws(()=>assertDeliveryInvoiceLedgerContinuity(events,events,rewritten),/append-only/);
  assert.throws(()=>mergeVaultIntent(created.vault,{...created.vault,documentEvents:deleted},created.vault),/append-only/);
  assert.throws(()=>mergeVaultIntent(created.vault,{...created.vault,documentEvents:rewritten},created.vault),/append-only/);
  assert.throws(()=>mergeVaultIntent(created.vault,created.vault,{...created.vault,documentEvents:deleted}),/append-only/);
  assert.doesNotThrow(()=>mergeVaultIntent(created.vault,created.vault,created.vault));
});

test('Batch 7 — concurrent non-link event ID cannot overwrite remote invoice proof',()=>{
  const {vault,quote}=setup();
  const physical=confirmed(vault,quote,['4','1'],'POD-CONFLICT');
  const final=createConfirmedDeliveryInvoiceDraft(physical.vault,physical.note.id);
  const marker='@lourex:sales-order:delivery-invoice:v1:';
  const invoiceEvent=final.vault.documentEvents.find(event=>event.note.startsWith(marker));
  assert.ok(invoiceEvent);
  const other={...invoiceEvent,documentId:quote.id,documentNumber:quote.number,
    type:'audit',note:'Unrelated device update',relatedDocumentId:'',relatedDocumentNumber:''};
  const conflicting={...physical.vault,documentEvents:[...physical.vault.documentEvents,other]};
  assert.throws(()=>assertDeliveryInvoiceLedgerContinuity(
    physical.vault.documentEvents,conflicting.documentEvents,final.vault.documentEvents
  ),/event ID collides/);
  assert.throws(()=>mergeVaultIntent(physical.vault,conflicting,final.vault),/event ID collides/);
});

test('Batch 7 — only authorized owner/admin/sales/finance operators may prepare an invoice',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const owner=defaultOwnerMember();
  for(const role of ['viewer','purchasing','sales','finance','owner','admin']){
    const operator={...owner,id:role,role,displayName:role};
    const scoped={...a.vault,teamMembers:[owner,operator],
      appSettings:{...a.vault.appSettings,activeTeamMemberId:role}};
    if(['viewer','purchasing'].includes(role))
      assert.throws(()=>createConfirmedDeliveryInvoiceDraft(scoped,a.note.id),/does not have permission/);
    else
      assert.equal(createConfirmedDeliveryInvoiceDraft(scoped,a.note.id).invoice.status,'draft');
  }
});

test('Batch 7 — read-only SO progress separates physical quantities, invoice drafts and actual collections',()=>{
  const {vault,quote,order}=setup();
  const blank=salesOrderInvoiceProgress(order,vault.documents,vault.documentEvents,[]);
  assert.equal(blank.confirmedDeliveries,0);
  assert.equal(blank.unbilledDeliveries,0);
  assert.equal(blank.outstanding,'0.00');
  const delivery=confirmed(vault,quote,['4','1'],'POD-PROGRESS');
  const delivered=salesOrderInvoiceProgress(order,delivery.vault.documents,delivery.vault.documentEvents,[]);
  assert.deepEqual(delivered.lines.map(line=>line.delivered),['4','1']);
  assert.deepEqual(delivered.lines.map(line=>line.remaining),['8','5']);
  assert.equal(delivered.confirmedDeliveries,1);
  assert.equal(delivered.unbilledDeliveries,1);
  const draft=createConfirmedDeliveryInvoiceDraft(delivery.vault,delivery.note.id);
  const draftProgress=salesOrderInvoiceProgress(order,draft.vault.documents,draft.vault.documentEvents,[]);
  assert.equal(draftProgress.invoiceDrafts,1);
  assert.equal(draftProgress.invoicesIssued,0);
  assert.equal(draftProgress.outstanding,'0.00','draft invoice is never AR');
  const issued={...draft.invoice,status:'final'};
  const documents=draft.vault.documents.map(doc=>doc.id===issued.id?issued:doc);
  const issuedProgress=salesOrderInvoiceProgress(order,documents,draft.vault.documentEvents,[]);
  assert.equal(issuedProgress.invoiceDrafts,0);
  assert.equal(issuedProgress.invoicesIssued,1);
  assert.equal(issuedProgress.netIssued,'65.00');
  assert.equal(issuedProgress.outstanding,'65.00');
  const today=todayIso();
  const payment=normalizePaymentRecord(issued,[],{
    id:'progress-payment',invoiceId:issued.id,invoiceNumber:issued.number,
    customerId:issued.customerSnapshot.sourceCustomerId,customerNameEn:'Riyadh FMCG',customerNameAr:'',
    currency:'USD',amount:'20.00',date:today,method:'bank-transfer',reference:'BANK-PROGRESS',
    notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  },documents);
  const paid=salesOrderInvoiceProgress(order,documents,draft.vault.documentEvents,[payment]);
  assert.equal(paid.collected,'20.00');
  assert.equal(paid.outstanding,'45.00');
  assert.equal(paid.unbilledDeliveries,0);
  assert.equal(paid.currency,'USD');
});

test('Batch 7 — SO progress counts separate partial invoices and leaves drafts outside AR',()=>{
  const {vault,quote,order}=setup();
  const first=confirmed(vault,quote,['4','1'],'POD-SUM-1');
  const invoiced=createConfirmedDeliveryInvoiceDraft(first.vault,first.note.id);
  const second=confirmed(invoiced.vault,quote,['8','5'],'POD-SUM-2');
  const draftSecond=createConfirmedDeliveryInvoiceDraft(second.vault,second.note.id);
  const issuedFirst={...invoiced.invoice,status:'final'};
  const docs=draftSecond.vault.documents.map(doc=>doc.id===issuedFirst.id?issuedFirst:doc);
  const progress=salesOrderInvoiceProgress(order,docs,draftSecond.vault.documentEvents,[]);
  assert.equal(progress.confirmedDeliveries,2);
  assert.equal(progress.unbilledDeliveries,0);
  assert.equal(progress.invoiceDrafts,1);
  assert.equal(progress.invoicesIssued,1);
  assert.deepEqual(progress.lines.map(row=>row.remaining),['0','0']);
  assert.equal(progress.netIssued,'65.00');
  assert.equal(progress.outstanding,'65.00');
  assert.equal(progress.currency,'USD');
});

test('Batch 7 — credit notes reduce AR without miscounting confirmed physical deliveries',()=>{
  const {vault,quote,order}=setup();
  const physical=confirmed(vault,quote,['4','1'],'POD-CREDIT');
  const draft=createConfirmedDeliveryInvoiceDraft(physical.vault,physical.note.id);
  const invoice={...draft.invoice,status:'final'};
  const credit={...createCreditNoteDraft(invoice,'CRN-2026-B07','65.00'),status:'final'};
  const docs=[...draft.vault.documents.map(doc=>doc.id===invoice.id?invoice:doc),credit];
  const progress=salesOrderInvoiceProgress(order,docs,draft.vault.documentEvents,[]);
  assert.equal(progress.confirmedDeliveries,1);
  assert.equal(progress.invoicesIssued,1);
  assert.equal(progress.credits,'65.00');
  assert.equal(progress.netIssued,'0.00');
  assert.equal(progress.outstanding,'0.00');
  assert.equal(progress.collected,'0.00');
});
test('Batch 7 — sales order summary uses scoped financial data without changing the receivables owner',async()=>{
  const [orderPanel,page,source]=await Promise.all([
    readFile(new URL('../src/components/SalesOrderReview.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/sales-order-progress.ts',import.meta.url),'utf8')
  ]);
  assert.match(orderPanel,/salesOrderInvoiceProgress\(order,this\.props\.documents,events,this\.props\.payments\)/);
  assert.match(orderPanel,/<details style=\{\{minWidth:0\}\}>/);
  assert.match(orderPanel,/Delivery quantities by item/);
  assert.match(page,/SalesOrderReview quotation=\{doc\} events=\{this\.props\.documentEvents\} documents=\{this\.props\.documents\} payments=\{this\.props\.payments\}/);
  assert.match(source,/invoicePaymentSummary\(invoice,payments,undefined,documents\)/);
  assert.doesNotMatch(source,/saveVault|mutateVaultSafely|postPurchase|savePayment|localStorage/);
});
test('Batch 7 — unauthorized operators cannot use create/open to bypass invoice draft access checks',()=>{
  const {vault,quote}=setup(),first=confirmed(vault,quote);
  const created=createConfirmedDeliveryInvoiceDraft(first.vault,first.note.id);
  const owner=defaultOwnerMember();
  for(const role of ['viewer','purchasing']){
    const person={...owner,id:role,role,displayName:role};
    const scoped={...created.vault,teamMembers:[owner,person],
      appSettings:{...created.vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>createConfirmedDeliveryInvoiceDraft(scoped,first.note.id),/does not have permission/);
  }
});

test('Batch 7 — internal invoice evidence remains intact but both history panels display a readable label',async()=>{
  const [helper,commercial,lifecycle]=await Promise.all([
    readFile(new URL('../src/lib/document-event-display.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/components/CommercialFlowPanel.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/components/DocumentLifecyclePanel.tsx',import.meta.url),'utf8')
  ]);
  assert.match(helper,/note\.startsWith\('@lourex:sales-order:delivery-invoice:v1:'\)/);
  assert.match(helper,/Invoice draft prepared from confirmed physical delivery/);
  assert.match(helper,/Customer Sales Order accepted and recorded/);
  assert.match(helper,/Physical delivery confirmed against Sales Order/);
  assert.match(helper,/Delivery Note draft linked to accepted Sales Order/);
  assert.match(commercial,/documentEventDisplayNote\(event\.note\)/);
  assert.match(lifecycle,/documentEventDisplayNote\(event\.note\)/);
});

test('Batch 7 — final issuance stays human reviewed and serialized, not an AI or automatic posting',async()=>{
  const [app,page,merge,source]=await Promise.all([
    readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/storage/vault-merge.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/sales-delivery-invoice.ts',import.meta.url),'utf8')
  ]);
  assert.match(app,/createConfirmedDeliveryInvoiceDraft\(scoped,delivery\.id\)/);
  assert.match(app,/persistFullMutation\(full=>/);
  assert.match(page,/onCreateDeliveryInvoice/);
  assert.match(page,/invoiceSourceDelivery\(doc\.id,this\.props\.documents,this\.props\.documentEvents\)/);
  assert.match(page,/item\.convertedFromId===doc\.id/);
  assert.match(page,/collection\.remaining/);
  assert.match(page,/canCollect\?<Button icon="wallet"/);
  assert.match(page,/onRecordPayment\?\.\(doc\)/);
  assert.match(page,/!isDeliveryLinkedInvoice\(doc\.id,this\.props\.documentEvents\)/);
  assert.match(page,/canDelete=doc\.status!=='final'[^;]*!isDeliveryLinkedInvoice/);
  assert.match(merge,/assertDeliveryInvoiceIntegrity\(documents,documentEvents\)/);
  assert.match(app,/assertDeliveryInvoiceIntegrity\(documents,documentEvents\)/);
  assert.match(app,/A delivery-linked invoice cannot be voided/);
  assert.doesNotMatch(source,/postPurchase|savePayment|inventoryMovements:\[/);
});
