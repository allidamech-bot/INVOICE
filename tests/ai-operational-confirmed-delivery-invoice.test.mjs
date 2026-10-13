import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmSalesDelivery} from '../dist/src/lib/sales-delivery-flow.js';
import {linkedDeliveryInvoice,assertDeliveryInvoiceIntegrity} from '../dist/src/lib/sales-delivery-invoice.js';
import {todayIso} from '../dist/src/lib/id.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiConfirmedInvoiceDraftIntent,requestedInvoiceDeliveryNumber,prepareAiConfirmedDeliveryInvoice,applyAiConfirmedDeliveryInvoiceApproval} from '../dist/src/lib/ai-operational-delivery-invoice-draft.js';

function fixture(){
 const v=emptyVault(),now=new Date().toISOString();
 const customer={id:'buyer-0077',companyNameEn:'Riyadh Buyer',companyNameAr:'مشتري الرياض',
  contactPerson:'Buyer',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
  phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 v.customers=[customer];
 const quote=createBlankDocument('proforma','QUO-2026-0077',v.company);
 quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[
  {...quote.items[0],id:'q-line-1',descriptionEn:'Red Bull',descriptionAr:'ريد بول',quantity:'10',unit:'CTN',unitPrice:'26'},
  {...quote.items[0],id:'q-line-2',descriptionEn:'Monster',descriptionAr:'مونستر',quantity:'7',unit:'CTN',unitPrice:'22'}
 ];
 assert.deepEqual(validateDocument(quote),{});
 v.documents=[quote];v.documentEvents.push(validatedCommercialTrackingEvent(v,quote.id,'accepted'));
 const accepted=acceptSalesOrder(v,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
  customerReference:'CUST-PO-77',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
 const draft=createLinkedDeliveryDraft(accepted.vault,quote.id);
 const issued={...draft.document,status:'final',
  items:draft.document.items.map((row,i)=>({...row,quantity:i===0?'3':'2'}))};
 assert.deepEqual(validateDocument(issued),{});
 const beforeConfirm={...draft.vault,documents:draft.vault.documents.map(x=>x.id===issued.id?issued:x)};
 const delivered=confirmSalesDelivery(beforeConfirm,{deliveryNoteId:issued.id,
  expectedDeliveryNoteUpdatedAt:issued.updatedAt,reference:'POD-0077',deliveredDate:todayIso(),
  notes:'signed POD',confirmed:true});
 return{vault:delivered.vault,delivery:issued,quote,customer};
}
const command=number=>'أنشئ مسودة فاتورة من سند التسليم '+number;
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Confirmed DN invoice intent requires exact single source, never mixes issuance and payment',()=>{
 const {delivery}=fixture();
 for(const q of [command(delivery.number),'Create invoice draft from confirmed delivery '+delivery.number]){
  assert.equal(isAiConfirmedInvoiceDraftIntent(q),true,q);
  assert.equal(requestedInvoiceDeliveryNumber(q),delivery.number,q);
 }
 for(const q of [command(delivery.number)+' ثم أصدر الفاتورة',
  command(delivery.number)+' وخصم المخزون',
  'Issue invoice from '+delivery.number,
  'افتح PDF '+delivery.number]){
  assert.equal(isAiConfirmedInvoiceDraftIntent(q),false,q);
 }
 assert.equal(requestedInvoiceDeliveryNumber(command(delivery.number)+' و DN-2026-9999'),null);
 assert.equal(requestedInvoiceDeliveryNumber('أنشئ مسودة فاتورة'),null);
});
test('Controller previews every partial delivery line at original price and does not mutate vault',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const result=await orchestrateAiToolRequest({message:command(f.delivery.number),vault:f.vault,
  context:context('controller'),language:'ar'});
 assert.equal(result.plannedBy,'local');
 assert.equal(result.plan.calls.length,1);
 assert.equal(result.proposal?.tool,'sales.createConfirmedInvoiceDraft');
 const review=result.proposal.args;
 assert.equal(review.deliveryNoteId,f.delivery.id);
 assert.equal(review.lineCount,2);
 assert.match(review.preview.join('\n'),/Qty 3 CTN \| Unit price 26 USD/);
 assert.match(review.preview.join('\n'),/Qty 2 CTN \| Unit price 22 USD/);
 assert.match(result.answer,/موافقتك/);
 assert.deepEqual(f.vault,before);
 const advisor=await orchestrateAiToolRequest({message:command(f.delivery.number),vault:f.vault,
  context:context('advisor'),language:'ar'});
 assert.equal(advisor?.proposal?.tool==='sales.createConfirmedInvoiceDraft',false);
 assert.deepEqual(f.vault,before);
});
test('Separate approval saves one UNISSUED invoice for confirmed delivered quantities, no stock/collection',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareAiConfirmedDeliveryInvoice(f.vault,f.delivery.number);
 const out=applyAiConfirmedDeliveryInvoiceApproval(f.vault,review),invoice=out.invoice;
 assert.equal(invoice.kind,'invoice');assert.equal(invoice.status,'draft');
 assert.equal(invoice.number,review.expectedInvoiceNumber);
 assert.deepEqual(invoice.items.map(row=>row.quantity),['3','2']);
 assert.deepEqual(invoice.items.map(row=>row.unitPrice),['26','22']);
 assert.equal(invoice.customerSnapshot.sourceCustomerId,f.customer.id);
 assert.equal(linkedDeliveryInvoice(f.delivery.id,out.vault.documents,out.vault.documentEvents)?.id,invoice.id);
 assert.doesNotThrow(()=>assertDeliveryInvoiceIntegrity(out.vault.documents,out.vault.documentEvents));
 for(const key of ['inventoryMovements','payments','purchases','supplierPayments','savedItems','treasuryEntries'])
  assert.deepEqual(out.vault[key],before[key],'draft save must not post '+key);
 assert.deepEqual(f.vault,before);
 assert.throws(()=>applyAiConfirmedDeliveryInvoiceApproval(out.vault,review),/already exists|changed|duplicate/);
});
test('Draft cannot be approved after delivery, numbering, customer or scope changed',()=>{
 const f=fixture(),review=prepareAiConfirmedDeliveryInvoice(f.vault,f.delivery.number);
 const moved={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiConfirmedDeliveryInvoiceApproval(moved,review),/branch changed/);
 const revision={...f.vault,documents:f.vault.documents.map(x=>x.id===f.delivery.id?{...x,updatedAt:'2099-01-01T00:00:00.000Z'}:x)};
 assert.throws(()=>applyAiConfirmedDeliveryInvoiceApproval(revision,review));
 const unissued={...f.vault,documents:f.vault.documents.map(x=>x.id===f.delivery.id?{...x,status:'draft'}:x)};
 assert.throws(()=>prepareAiConfirmedDeliveryInvoice(unissued,f.delivery.number),/issued and active/);
 const renumber={...f.vault,appSettings:{...f.vault.appSettings,numbering:{...f.vault.appSettings.numbering,invoiceLast:999}}};
 assert.throws(()=>applyAiConfirmedDeliveryInvoiceApproval(renumber,review),/numbering|changed/);
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.throws(()=>applyAiConfirmedDeliveryInvoiceApproval(viewer,review));
});
test('Sales actor and owner can approve signed invoice draft; viewer cannot and tampering is rejected',async()=>{
 const f=fixture(),review=prepareAiConfirmedDeliveryInvoice(f.vault,f.delivery.number);
 const proposal={capability:'tool.execute',tool:'sales.createConfirmedInvoiceDraft',args:review,
  label:'Review invoice draft',rationale:'Unissued invoice from physically confirmed delivery'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'invoice-draft'};
 for(const role of ['owner','sales']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,lineCount:1}}),/payload changed/);
 }
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.equal(foundationActionAllowed(viewer,proposal,scope),false);
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/A signed invoice DRAFT approval is required/);
 assert.match(actions,/applyAiConfirmedDeliveryInvoiceApproval\(vault,review\)/);
});
