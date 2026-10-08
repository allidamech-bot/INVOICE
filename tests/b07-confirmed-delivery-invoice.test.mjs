import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {
  createConfirmedDeliveryInvoiceDraft, linkedDeliveryInvoice, invoiceSourceDelivery, assertDeliveryInvoiceIntegrity
} from '../dist/src/lib/sales-delivery-invoice.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {todayIso} from '../dist/src/lib/id.js';
import {defaultOwnerMember} from '../dist/src/lib/governance.js';

function setup(){
  const v=emptyVault(),now=new Date().toISOString();
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
test('Batch 7 — duplicate offline invoices for one confirmed note fail merge',()=>{
  const {vault,quote}=setup(),a=confirmed(vault,quote);
  const left=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id).vault;
  const right=createConfirmedDeliveryInvoiceDraft(a.vault,a.note.id).vault;
  const combinedDocuments=[...left.documents,...right.documents.filter(x=>x.kind==='invoice')];
  const combinedEvents=[...left.documentEvents,...right.documentEvents.filter(x=>x.note.startsWith('@lourex:sales-order:delivery-invoice:v1:'))];
  assert.throws(()=>assertDeliveryInvoiceIntegrity(combinedDocuments,combinedEvents),/Concurrent invoices conflict/);
  assert.throws(()=>mergeVaultIntent(a.vault,left,right));
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
  assert.match(merge,/assertDeliveryInvoiceIntegrity\(documents,documentEvents\)/);
  assert.match(app,/assertDeliveryInvoiceIntegrity\(documents,documentEvents\)/);
  assert.doesNotMatch(source,/postPurchase|savePayment|inventoryMovements:\[/);
});
