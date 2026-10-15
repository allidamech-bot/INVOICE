import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument,validateDocument} from '../dist/src/lib/documents.js';
import {validatedCommercialTrackingEvent} from '../dist/src/lib/commercial-flow.js';
import {acceptSalesOrder} from '../dist/src/lib/sales-order-flow.js';
import {todayIso} from '../dist/src/lib/id.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {applyApprovedToolExecution} from '../dist/src/lib/ai-tool-actions.js';
import {registerVaultMutationBridge} from '../dist/src/storage/vault-mutation-bridge.js';
import {prepareFoundationApproval,assertFoundationApproval,foundationActionAllowed} from '../dist/src/lib/ai-foundation-approval.js';
import {isAiStoredQuotationInvoiceIntent,requestedStoredQuotationNumber,prepareAiStoredQuotationInvoice,applyAiStoredQuotationInvoiceApproval} from '../dist/src/lib/ai-stored-quotation-invoice.js';

function fixture(){
 const v=emptyVault(),now=new Date().toISOString();
 const customer={id:'saved-quote-buyer',companyNameEn:'Wholesale Buyer',companyNameAr:'مشتري الجملة',
  contactPerson:'Buyer',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
  phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:now,updatedAt:now};
 v.customers=[customer];
 const year=new Date().getFullYear();
 const quote=createBlankDocument('proforma','QUO-'+year+'-0214',v.company);
 quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(customer);
 quote.items=[
  {...quote.items[0],id:'source-line-1',descriptionEn:'Rice 5kg',descriptionAr:'أرز',quantity:'100',unit:'CTN',unitPrice:'18.50',unitCost:'12.00'},
  {...quote.items[0],id:'source-line-2',descriptionEn:'Sunflower Oil',descriptionAr:'زيت',quantity:'80',unit:'CTN',unitPrice:'22',unitCost:'15.50'}
 ];
 quote.terms.remarks='Confirmed prices for customer quotation';
 quote.adjustments.shippingEnabled=true;quote.adjustments.shipping='30';
 assert.deepEqual(validateDocument(quote),{});
 v.documents=[quote];
 return{vault:v,quote,customer};
}
const context=mode=>({conversationMode:mode,assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
test('Saved quote invoice intent requires explicit conversion and one exact source number',()=>{
 const {quote}=fixture();
 for(const command of ['Create invoice from quotation '+quote.number,
   'أنشئ فاتورة من عرض السعر '+quote.number,
   'حوّل عرض سعر '+quote.number+' إلى فاتورة']){
  assert.equal(isAiStoredQuotationInvoiceIntent(command),true,command);
  assert.equal(requestedStoredQuotationNumber(command),quote.number,command);
 }
 for(const command of ['لا تنشئ فاتورة من عرض السعر '+quote.number,
   'Do not create an invoice from quotation '+quote.number,
   "Please don't create an invoice from quotation "+quote.number,
   'Create a quotation from an invoice '+quote.number,
   'Show quotation '+quote.number,
   'Create invoice from confirmed delivery DN-2026-0012']){
  assert.equal(isAiStoredQuotationInvoiceIntent(command),false,command);
 }
 assert.equal(requestedStoredQuotationNumber('أنشئ فاتورة من عرض السعر'),null);
 assert.equal(requestedStoredQuotationNumber('Create invoice from quotation '+quote.number+' and QUO-2026-0999'),null);
});
test('Controller stages exact saved source instead of asking model to reconstruct invoice rows',async()=>{
 const f=fixture(),before=structuredClone(f.vault);
 for(const command of ['Create invoice from quotation '+f.quote.number,'أنشئ فاتورة من عرض السعر '+f.quote.number]){
  const result=await orchestrateAiToolRequest({message:command,vault:f.vault,context:context('controller'),language:'ar'});
  assert.equal(result.plannedBy,'local');assert.equal(result.proposal?.capability,'tool.execute');
  assert.equal(result.proposal?.tool,'document.createDraft');
  assert.equal(result.proposal?.args?.sourceId,f.quote.id);
  assert.equal(result.proposal?.args?.customerId,f.customer.id);
  assert.equal(result.proposal?.args?.lineCount,2);
  assert.match(result.proposal?.args?.preview.join('\n'),/100 CTN \| 18.50 USD/);
  assert.match(result.proposal?.args?.preview.join('\n'),/80 CTN \| 22 USD/);
  assert.match(result.answer,/موافقتك/);
 }
 assert.deepEqual(f.vault,before,'preparing a review must not write any records or consume numbering');
 const ambiguous=await orchestrateAiToolRequest({message:'أنشئ فاتورة من عرض السعر',vault:f.vault,context:context('controller'),language:'ar'});
 assert.equal(ambiguous.proposal,null);assert.match(ambiguous.answer,/رقم عرض سعر/);
});
test('Approved conversion saves one linked UNISSUED draft using exact original items, terms and events',()=>{
 const f=fixture(),before=structuredClone(f.vault),review=prepareAiStoredQuotationInvoice(f.vault,f.quote.number);
 assert.equal(review.expectedInvoiceNumber.slice(0,4),'INV-');
 assert.ok(review.evidenceSignature.length<80,'the approval must not copy original PDF or customer bytes');
 const saved=applyAiStoredQuotationInvoiceApproval(f.vault,review);
 const invoice=saved.invoice;
 assert.equal(invoice.status,'draft');assert.equal(invoice.kind,'invoice');
 assert.equal(invoice.convertedFromId,f.quote.id);assert.equal(invoice.customerSnapshot.sourceCustomerId,f.customer.id);
 assert.equal(invoice.number,review.expectedInvoiceNumber);
 assert.equal(saved.vault.appSettings.numbering.invoiceLast,Number(invoice.number.split('-').at(-1)));
 assert.deepEqual(invoice.items.map(x=>[x.descriptionEn,x.quantity,x.unit,x.unitPrice,x.unitCost]),
   f.quote.items.map(x=>[x.descriptionEn,x.quantity,x.unit,x.unitPrice,x.unitCost]));
 assert.equal(invoice.terms.paymentTerms,f.quote.terms.paymentTerms);
 assert.match(invoice.terms.remarks,/Based on Quotation/);
 assert.equal(invoice.adjustments.shipping,'30');
 assert.equal(invoice.adjustments.shippingEnabled,true);
 assert.equal(saved.vault.documentEvents.filter(x=>x.type==='converted'&&x.documentId===f.quote.id).length,1);
 assert.equal(saved.vault.documentEvents.filter(x=>x.type==='created'&&x.documentId===invoice.id).length,1);
 for(const field of ['payments','inventoryMovements','purchases','supplierPayments','treasuryEntries'])
  assert.deepEqual(saved.vault[field],before[field],'conversion cannot post '+field);
 assert.deepEqual(f.vault,before);
 assert.throws(()=>prepareAiStoredQuotationInvoice(saved.vault,f.quote.number),/already has an active linked invoice/);
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(saved.vault,review));
});
test('Changed quote, company, branch, numbering and forged review fail closed',()=>{
 const f=fixture(),review=prepareAiStoredQuotationInvoice(f.vault,f.quote.number);
 const altered={...f.vault,documents:f.vault.documents.map(doc=>doc.id===f.quote.id?
   {...doc,items:doc.items.map((item,i)=>i===0?{...item,unitPrice:'19.50'}:item)}:doc)};
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(altered,review),/changed/);
 const moved={...f.vault,appSettings:{...f.vault.appSettings,activeBranchId:'other'}};
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(moved,review),/scope|branch/);
 const numbering={...f.vault,appSettings:{...f.vault.appSettings,numbering:{...f.vault.appSettings.numbering,invoiceLast:99}}};
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(numbering,review),/changed/);
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(f.vault,{...review,lineCount:1}),/changed/);
 const draft={...f.vault,documents:[{...f.quote,status:'draft'}]};
 assert.throws(()=>prepareAiStoredQuotationInvoice(draft,f.quote.number),/issued saved quotation/);
});
test('Accepted Sales Order requires confirmed delivery and cannot be billed wholesale',()=>{
 const f=fixture(),accepted={...f.vault,documentEvents:[
   validatedCommercialTrackingEvent(f.vault,f.quote.id,'accepted')]};
 const so=acceptSalesOrder(accepted,{quotationId:f.quote.id,expectedQuotationUpdatedAt:f.quote.updatedAt,
   customerReference:'Buyer PO',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
 assert.throws(()=>prepareAiStoredQuotationInvoice(so.vault,f.quote.number),/confirmed Delivery Note/);
 const fromAi=prepareAiStoredQuotationInvoice(f.vault,f.quote.number);
 assert.throws(()=>applyAiStoredQuotationInvoiceApproval(so.vault,fromAi),/confirmed Delivery Note/);
});
test('Sales and finance operators can sign exact conversion; viewer cannot, and payload tampering fails',()=>{
 const f=fixture(),review=prepareAiStoredQuotationInvoice(f.vault,f.quote.number);
 const proposal={capability:'tool.execute',tool:'document.createDraft',args:review,
  label:'Review invoice from '+review.sourceNumber,rationale:'Save linked invoice draft'};
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'quotation-invoice'};
 for(const role of ['owner','sales','finance']){
  const vault={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role}]};
  assert.equal(foundationActionAllowed(vault,proposal,scope),true,role);
  const signed={...proposal,foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  assert.doesNotThrow(()=>assertFoundationApproval(vault,signed),role);
  assert.throws(()=>assertFoundationApproval(vault,{...signed,args:{...review,lineCount:9}}),/payload changed/);
 }
 const viewer={...f.vault,teamMembers:[{...f.vault.teamMembers[0],role:'viewer'}]};
 assert.equal(foundationActionAllowed(viewer,proposal,scope),false);
});

test('Signed Controller approval performs exactly one real vault mutation, then rejects replay',async()=>{
 const f=fixture();
 let saved=f.vault,writes=0;
 registerVaultMutationBridge(async mutation=>{writes+=1;saved=mutation(saved);return saved;});
 const result=await orchestrateAiToolRequest({message:'Create invoice from quotation '+f.quote.number,
   vault:saved,context:context('controller'),language:'en'});
 const proposal=result.proposal;
 assert.equal(proposal.tool,'document.createDraft');
 await assert.rejects(()=>applyApprovedToolExecution(proposal),/explicit signed approval/);
 assert.equal(writes,0);
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'signed-quotation'};
 const signed={...proposal,foundationApproval:prepareFoundationApproval(saved,proposal,scope)};
 const actual=await applyApprovedToolExecution(signed);
 assert.equal(writes,1);
 assert.match(actual.summary,/Invoice DRAFT/);
 assert.equal(actual.document?.number,proposal.args.expectedInvoiceNumber);
 assert.equal(actual.document?.convertedFromId,f.quote.id);
 const stored=saved.documents.find(doc=>doc.id===actual.id);
 assert.equal(stored?.number,proposal.args.expectedInvoiceNumber);
 assert.equal(stored?.convertedFromId,f.quote.id);
 assert.equal(stored?.status,'draft');
 assert.equal(saved.documentEvents.filter(ev=>ev.documentId===actual.id&&ev.type==='created').length,1);
 await assert.rejects(()=>applyApprovedToolExecution(signed),/changed|already|payload/);
 assert.equal(writes,2,'a second attempt may enter guarded mutation but must not commit');
 assert.equal(saved.documents.filter(doc=>doc.convertedFromId===f.quote.id).length,1);
});

test('Controller approval renders the saved invoice as a real openable conversation artifact',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('../scripts/ai-conversation-owner-stage4-tools.mjs',import.meta.url),'utf8');
 const component=await readFile(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
 assert.match(script,/savedInvoiceArtifact=step\.tool==='document\.createDraft'/);
 assert.match(script,/result\.document\.convertedFromId===step\.args\?\.sourceId/);
 assert.match(script,/artifact:savedInvoiceArtifact/);
 assert.match(component,/lourex-ai-created-artifact/);
 assert.match(component,/lourex-global-search-open/);
 assert.match(component,/Open invoice/);
});
