import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {confirmedSalesDeliveries,salesDeliveryBalances} from '../dist/src/lib/sales-delivery-flow.js';
import {todayIso} from '../dist/src/lib/id.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiConfirmPhysicalDeliveryIntent,parseAiConfirmPhysicalDeliveryRequest,prepareAiDeliveryConfirmation,applyAiDeliveryConfirmation} from '../dist/src/lib/ai-operational-delivery-confirmation.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

function fixture(){
 const vault=emptyVault(),now=new Date().toISOString();
 const customer={id:'customer-1',companyNameEn:'Riyadh Client',companyNameAr:'عميل الرياض',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
  vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 vault.customers=[customer];
 const quote=createBlankDocument('proforma','QUO-2026-0056',vault.company);
 quote.status='final';quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[
  {...quote.items[0],id:'quote-line-1',descriptionEn:'Red Bull',descriptionAr:'ريد بول',quantity:'8',unit:'CTN',unitPrice:'26'},
  {...quote.items[0],id:'quote-line-2',descriptionEn:'Monster',descriptionAr:'مونستر',quantity:'5',unit:'CTN',unitPrice:'22'}
 ];
 assert.deepEqual(validateDocument(quote),{});
 vault.documents=[quote];
 vault.documentEvents.push(validatedCommercialTrackingEvent(vault,quote.id,'accepted'));
 const accepted=acceptSalesOrder(vault,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
  orderDate:todayIso(),requestedDeliveryDate:todayIso(),customerReference:'CUST-001'});
 const d=createLinkedDeliveryDraft(accepted.vault,quote.id);
 const issued={...d.document,status:'final',
  items:d.document.items.map((x,i)=>({...x,quantity:i===0?'3':'2'}))};
 assert.deepEqual(validateDocument(issued),{});
 const ready={...d.vault,documents:d.vault.documents.map(x=>x.id===issued.id?issued:x)};
 return{vault:ready,issued,quote,order:accepted.order};
}
const command=(number,date=todayIso(),reference='POD-101')=>
 'سجّل تأكيد التسليم لسند '+number+'، المرجع '+reference+'، التاريخ '+date;
const ctx=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Exact physical DN confirmation classifier accepts scoped AR/EN request and rejects combined stock posting',()=>{
 const f=fixture(),m=command(f.issued.number);
 assert.equal(isAiConfirmPhysicalDeliveryIntent(m),true);
 assert.deepEqual(parseAiConfirmPhysicalDeliveryRequest(m),{
  deliveryNoteNumber:f.issued.number,reference:'POD-101',deliveredDate:todayIso()});
 const en='Record delivery confirmation for delivery note '+f.issued.number+
  '; reference POD-202; date '+todayIso();
 assert.deepEqual(parseAiConfirmPhysicalDeliveryRequest(en),{
  deliveryNoteNumber:f.issued.number,reference:'POD-202',deliveredDate:todayIso()});
 for(const m of ['افتح PDF سند '+f.issued.number,'هل تم تسليم '+f.issued.number])
  assert.equal(isAiConfirmPhysicalDeliveryIntent(m),false);
 for(const m of [command(f.issued.number)+' ثم خصم المخزون',
  'Record delivery confirmation for '+f.issued.number+'; reference POD-102; date '+todayIso()+' and post stock'])
  assert.throws(()=>parseAiConfirmPhysicalDeliveryRequest(m),/cannot execute in one instruction/);
 assert.equal(parseAiConfirmPhysicalDeliveryRequest('سجّل تأكيد التسليم'),null);
 assert.equal(parseAiConfirmPhysicalDeliveryRequest('سجّل تأكيد التسليم لسند '+f.issued.number),null);
 assert.equal(parseAiConfirmPhysicalDeliveryRequest('سجّل تأكيد التسليم DN-2026-1 و DN-2026-2'),null);
});
test('Controller stages complete physical proof preview but Advisor never prepares approval',async()=>{
 const f=fixture(),before=structuredClone(f.vault),m=command(f.issued.number);
 const controller=await orchestrateAiToolRequest({message:m,vault:f.vault,context:ctx('controller'),language:'ar'});
 assert.equal(controller.plannedBy,'local');
 assert.equal(controller.proposal?.tool,'sales.confirmPhysicalDelivery');
 assert.equal(controller.proposal?.args?.lineCount,2);
 assert.equal(controller.proposal?.preview?.length,7);
 assert.match(controller.answer,/موافقة منفصلة/);
 const advisor=await orchestrateAiToolRequest({message:m,vault:f.vault,context:ctx('advisor'),language:'ar'});
 assert.equal(advisor?.proposal?.tool==='sales.confirmPhysicalDelivery',false);
 assert.deepEqual(f.vault,before);
});
test('Separate approval records physical proof and remaining balances but no stock/invoice/payable',()=>{
 const f=fixture(),before=structuredClone(f.vault),data=parseAiConfirmPhysicalDeliveryRequest(command(f.issued.number));
 const review=prepareAiDeliveryConfirmation(f.vault,data);
 assert.equal(review.lineCount,2);
 assert.match(review.preview.join('\n'),/Physical delivered quantity: 3/);
 assert.match(review.preview.join('\n'),/Physical delivered quantity: 2/);
 const confirmed=applyAiDeliveryConfirmation(f.vault,review);
 const receipts=confirmedSalesDeliveries(f.issued.id,confirmed.vault.documentEvents);
 assert.equal(receipts.length,1);
 assert.equal(receipts[0].reference,'POD-101');
 assert.deepEqual(receipts[0].lines.map(x=>x.quantity),['3','2']);
 assert.deepEqual(salesDeliveryBalances(f.order,confirmed.vault.documentEvents).map(x=>x.remaining),['5','3']);
 for(const key of ['documents','inventoryMovements','purchases','payments','supplierPayments','savedItems','treasuryEntries'])
  assert.deepEqual(confirmed.vault[key],before[key],key+' must not change');
 assert.deepEqual(f.vault,before);
 assert.throws(()=>applyAiDeliveryConfirmation(confirmed.vault,review),/already been confirmed/);
});
test('Stale, cross-branch, wrong actor or altered delivery evidence cannot be confirmed',()=>{
 const f=fixture(),review=prepareAiDeliveryConfirmation(f.vault,parseAiConfirmPhysicalDeliveryRequest(command(f.issued.number)));
 const options=[
  {...f.vault,documents:f.vault.documents.map(x=>x.id===f.issued.id?{...x,updatedAt:'2099-01-01T00:00:00.000Z'}:x)},
  {...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}},
  {...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]},
  {...f.vault,documents:f.vault.documents.map(x=>x.id===f.issued.id?{...x,status:'draft'}:x)}
 ];
 for(const altered of options)assert.throws(()=>applyAiDeliveryConfirmation(altered,review));
 assert.throws(()=>prepareAiDeliveryConfirmation(f.vault,{
  deliveryNoteNumber:f.issued.number,reference:'POD-FUTURE',deliveredDate:'2099-01-01'}));
});
test('Signed physical confirmation needs owner/sales authority and exact unchanged payload',async()=>{
 const f=fixture(),review=prepareAiDeliveryConfirmation(f.vault,parseAiConfirmPhysicalDeliveryRequest(command(f.issued.number)));
 const proposal={capability:'tool.execute',tool:'sales.confirmPhysicalDelivery',args:review,
  label:'Confirm actual delivery',rationale:'Physical delivery proof without inventory'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'confirm-dn'};
 for(const role of ['owner','sales']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed));
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,reference:'DIFFERENT'}}),/payload changed/);
 }
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.equal(foundationActionAllowed(viewer,proposal,scope),false);
 const actions=await readFile(new URL('../src/lib/ai-tool-actions.ts',import.meta.url),'utf8');
 assert.match(actions,/Signed approval of exact physical delivery proof is required/);
 assert.match(actions,/applyAiDeliveryConfirmation\(vault,review\)/);
 assert.match(actions,/confirmedSalesDeliveries\(review\.deliveryNoteId,saved\.documentEvents\)/);
});
