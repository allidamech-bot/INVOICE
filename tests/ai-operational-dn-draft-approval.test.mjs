import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {createLinkedDeliveryDraft} from '../dist/src/lib/delivery-flow.js';
import {todayIso} from '../dist/src/lib/id.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {operationalDeliveryDraftRequested,requestedDeliverySalesOrderNumber,prepareOperationalDeliveryDraft,applyOperationalDeliveryDraftApproval} from '../dist/src/lib/ai-operational-dn-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const number='SO-QUO-2026-0056';
const cmd='جهّز مسودة سند تسليم من أمر البيع '+number;
function fixture(){
 const vault=emptyVault(),now=new Date().toISOString();
 const customer={id:'customer-1',companyNameEn:'Riyadh Distribution',companyNameAr:'توزيع الرياض',
  contactPerson:'Ahmed',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
  phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 vault.customers=[customer];
 const quote=createBlankDocument('proforma','QUO-2026-0056',vault.company);
 quote.status='final';quote.currency='USD';
 quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[
  {...quote.items[0],id:'qline1',descriptionEn:'Red Bull',descriptionAr:'ريد بول',quantity:'4',unit:'CTN',unitPrice:'26'},
  {...quote.items[0],id:'qline2',descriptionEn:'Monster',descriptionAr:'مونستر',quantity:'3',unit:'CTN',unitPrice:'22'}
 ];
 assert.deepEqual(validateDocument(quote),{});
 vault.documents=[quote];
 vault.documentEvents.push(validatedCommercialTrackingEvent(vault,quote.id,'accepted'));
 const accepted=acceptSalesOrder(vault,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
  customerReference:'CUST-PO-556',orderDate:todayIso(),requestedDeliveryDate:todayIso(),notes:''});
 assert.equal(accepted.order.salesOrderNumber,number);
 return{vault:accepted.vault,quote};
}
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('DN draft command parses only one exact accepted Sales Order, not shipping or stock posting',()=>{
 for(const message of [cmd,'Create delivery note from sales order '+number,
  'أنشئ سند التسليم من أمر البيع SO-QUO-٢٠٢٦-٠٠٥٦']){
  assert.equal(operationalDeliveryDraftRequested(message),true,message);
  assert.equal(requestedDeliverySalesOrderNumber(message),number);
 }
 for(const message of ['أكد تسليم '+number,'جهّز سند تسليم من '+number+' واعتمد الترحيل',
   'جهّز سند تسليم من '+number+' ثم اخصم المخزون']){
  if(operationalDeliveryDraftRequested(message))
    assert.equal(requestedDeliverySalesOrderNumber(message),null,message);
 }
 assert.equal(requestedDeliverySalesOrderNumber('جهّز سند تسليم من '+number+' و SO-QUO-2026-0077'),null);
});
test('Controller prepares unissued DN from accepted SO with ALL outstanding lines and no saved movement',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const result=await orchestrateAiToolRequest({message:cmd,vault:f.vault,context:context('controller'),language:'ar'});
 assert.equal(result.plannedBy,'local');
 assert.equal(result.proposal?.capability,'tool.execute');
 assert.equal(result.proposal?.tool,'sales.createDeliveryDraft');
 assert.equal(result.proposal?.args?.salesOrderNumber,number);
 assert.equal(result.proposal?.args?.lineCount,2);
 assert.equal(result.proposal?.preview?.length,7);
 assert.match(result.answer,/موافقتك/);
 assert.deepEqual(f.vault,before);
 const advisor=await orchestrateAiToolRequest({message:cmd,vault:f.vault,context:context('advisor'),language:'ar'});
 assert.equal(advisor?.proposal?.tool==='sales.createDeliveryDraft',false);
 assert.deepEqual(f.vault,before);
});
test('Separate approval creates one linked delivery-note DRAFT and never marks delivered or deducts stock',()=>{
 const f=fixture(),before=structuredClone(f.vault);
 const review=prepareOperationalDeliveryDraft(f.vault,number);
 assert.equal(review.lineCount,2);
 const result=applyOperationalDeliveryDraftApproval(f.vault,review);
 const doc=result.document;
 assert.equal(doc.kind,'delivery-note');
 assert.equal(doc.status,'draft');
 assert.deepEqual(doc.items.map(row=>row.quantity),['4','3']);
 assert.match(doc.terms.remarks,/SO-QUO-2026-0056/);
 assert.equal(result.vault.documentEvents.at(-1).relatedDocumentId,f.quote.id);
 assert.equal(result.vault.inventoryMovements.length,0);
 for(const key of ['payments','purchases','supplierPayments','treasuryEntries','savedItems'])
  assert.deepEqual(result.vault[key],before[key]);
 assert.deepEqual(f.vault,before);
 assert.throws(()=>prepareOperationalDeliveryDraft(result.vault,number),/unconfirmed delivery-note/);
 assert.throws(()=>applyOperationalDeliveryDraftApproval(result.vault,review),/unconfirmed delivery-note/);
});
test('Preflight rejects unaccepted SO, changed quotation, branch mismatch and unsanctioned users',()=>{
 const f=fixture(),review=prepareOperationalDeliveryDraft(f.vault,number);
 const noOrder={...f.vault,documentEvents:f.vault.documentEvents.filter(ev=>!ev.note.startsWith('@lourex:sales-order:accepted:v1:'))};
 assert.throws(()=>prepareOperationalDeliveryDraft(noOrder,number),/accepted Sales Order/);
 const stale={...f.vault,documents:[{...f.quote,updatedAt:'2099-01-01T00:00:00.000Z'}]};
 assert.throws(()=>applyOperationalDeliveryDraftApproval(stale,review));
 const moved={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyOperationalDeliveryDraftApproval(moved,review),/branch changed/);
 const role={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'purchasing'}]};
 assert.throws(()=>applyOperationalDeliveryDraftApproval(role,review));
 const unrelated=structuredClone(f.vault);
 unrelated.documentEvents.push({...unrelated.documentEvents.at(-1),id:'concurrent-change',
  note:'@lourex:sales-order:accepted:v1:{"tampered":true}'});
 assert.throws(()=>applyOperationalDeliveryDraftApproval(unrelated,review));
});
test('Signed DN draft requires Sales permission and exact unchanged review',async()=>{
 const f=fixture(),review=prepareOperationalDeliveryDraft(f.vault,number);
 const proposal={capability:'tool.execute',tool:'sales.createDeliveryDraft',args:review,label:'DN review',rationale:'Unsaved SO delivery'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'dn-test'};
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
 assert.match(actions,/Signed delivery-draft approval is required/);
 assert.match(actions,/applyOperationalDeliveryDraftApproval\(vault,review\)/);
});
