import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {newConversationKernel,stageKernelArtifact,reviseKernelDraft,normalizeConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
import {assertAiDocumentCreateApproval} from '../dist/src/lib/ai-document-approval-guard.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'packing-controller-e2e'};
const intent='أنشئ عرض سعر من المرفق';
function fixture(){
 const vault=emptyVault();
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:scope});
 const source={fileName:'sample-customer-request.xlsx',route:'quote_request',documentType:'customer_rfq',confidence:.99,
 extracted:JSON.stringify({customerName:'QA Fresh Buyer',customerEmail:'',customerPhone:'',currency:'SAR',
   incoterm:'DAP',paymentTerms:'50% advance',deliveryTime:'14 days',validity:'7 days',remarks:'Review-only QA',
   items:[
    {sku:'QA1',descriptionEn:'Strawberry dragee',descriptionAr:'',quantity:'12',unit:'CTN',unitPrice:'50',
     packing:'6 bags × 3 kg',quantityConfidence:1,quantityAmbiguous:false,productConfidence:1},
    {sku:'QA2',descriptionEn:'Almond dragee',descriptionAr:'',quantity:'3',unit:'CTN',unitPrice:'70',
     packing:'6 packs × 2.5 kg',quantityConfidence:1,quantityAmbiguous:false,productConfidence:1}
   ]})};
 return{vault,runtime,source};
}
function staged(){
 const {vault,runtime,source}=fixture(),before=structuredClone(vault);
 const draft=quoteSourceWorkingDraft([source],runtime,intent);
 assert.ok(draft,'structured upload must create a review-only proposal');
 const kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,draft);
 return{vault,before,draft,kernel};
}
function change(kernel,vault,message){
 return reviseKernelDraft(kernel,kernel.artifact.proposal,message,workspaceDrafting(vault),'ar');
}

test('Controller runtime recognizes exact Arabic packaging forms before free-form model planning',()=>{
 const source=readFileSync(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const line=source.split('\n').find(row=>row.includes('const exactDraftFollowup='));
 assert.ok(line);
 const literal=line.slice(line.indexOf('=')+1,line.lastIndexOf('.test(message);'));
 const matches=Function('message','return '+literal+'.test(message);');
 for(const input of [
   'غيّر تغليف الصنف رقم 1 إلى كرتون ٦ علب × ٣ كيلو',
   'غيّر التعبئة الصنف 1 إلى كرتون ٦ علب × ٣ كيلو',
   'غير تعبئة الصنف رقم 1 إلى كرتون ٦ علب × ٣ كيلو',
   'set packing item 1 to 6 bags × 3 kg'
 ])assert.equal(matches(input),true,input);
 for(const input of ['ما هو التغليف المناسب؟','لا تغيّر تغليف الصنف','السعر رخيص؟'])
   assert.equal(matches(input),false,input);
 assert.match(source,/reviseKernelDraft\(next,original,message,drafting/);
});

test('uploaded source -> reviewed two-line quotation -> Arabic edit -> undo/redo -> preview A4 without vault write',()=>{
 const {vault,before,kernel,draft}=staged();
 assert.equal(draft.items.length,2);
 assert.deepEqual(draft.items.map(x=>x.packing),['6 bags × 3 kg','6 packs × 2.5 kg']);
 assert.equal(workspaceDocument(kernel,vault,'ar').subtotal,'810.00');
 assert.equal(workspaceDocument(kernel,vault,'ar').rows.length,2);
 assert.equal(kernel.artifact.proposal.foundationApproval,undefined);
 const beforeIds=[...kernel.artifact.lineIds];
 const newPacking='كرتون داخل كرتون - ٦ علب × ٣ كيلو';
 const revised=change(kernel,vault,'غيّر تغليف الصنف رقم 1 إلى '+newPacking);
 assert.equal(revised.changed,true);
 assert.equal(kernel.artifact.proposal.items[0].packing,newPacking);
 assert.deepEqual(kernel.artifact.lineIds,beforeIds);
 assert.deepEqual(kernel.artifact.proposal.items.map(x=>x.quantity),['12','3']);
 assert.deepEqual(kernel.artifact.proposal.items.map(x=>x.unitPrice),['50','70']);
 const snapshot=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
 assert.equal(snapshot.artifact.proposal.items[0].packing,newPacking);
 const undone=change(snapshot,vault,'undo');
 assert.equal(undone.changed,true);
 assert.equal(snapshot.artifact.proposal.items[0].packing,'6 bags × 3 kg');
 const redone=change(snapshot,vault,'redo');
 assert.equal(redone.changed,true);
 assert.equal(snapshot.artifact.proposal.items[0].packing,newPacking);
 const review=reviewAiDocumentProposal(snapshot.artifact.proposal,workspaceDrafting(vault),'ar');
 assert.deepEqual(review.blockers,[]);
 assert.match(review.text,/كرتون داخل كرتون/);
 const pdf=prepareAiPdfPreview(snapshot,vault,'ar');
 assert.equal(pdf.appearance.showPacking,true);
 assert.equal(pdf.number,'UNSAVED-PREVIEW');
 assert.equal(pdf.items[0].packing,newPacking);
 assert.deepEqual(pdf.items.map(x=>x.quantity),['12','3']);
 assert.deepEqual(pdf.items.map(x=>x.unitPrice),['50','70']);
 assertAiDocumentCreateApproval(vault,snapshot.artifact.proposal);
 assert.deepEqual(vault,before,'approval guard is validation only, not a saved document');
 assert.equal(vault.documents.length,0);
 assert.equal(vault.documentEvents.length,0);
});

test('a missing price blocks PDF and explicit save approval even when packing is complete',()=>{
 const {vault,runtime,source}=fixture(),data=JSON.parse(source.extracted);
 data.items[1].unitPrice='';
 source.extracted=JSON.stringify(data);
 const draft=quoteSourceWorkingDraft([source],runtime,intent),kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,draft);
 assert.deepEqual(reviewAiDocumentProposal(draft,workspaceDrafting(vault),'en').blockers.length>0,true);
 assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/Complete/);
 assert.throws(()=>assertAiDocumentCreateApproval(vault,draft),/selling price/);
 assert.deepEqual(vault.documents,[]);
});

test('Advisor never stages uploaded RFQs; scope-tampered kernel cannot recover the original quote',()=>{
 const {vault,source}=fixture();
 const advisor=createAiToolRuntime(vault,{conversationMode:'advisor',assistantRuntime:scope});
 assert.equal(quoteSourceWorkingDraft([source],advisor,intent),null);
 const {kernel}=staged();
 const wrong=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),{...scope,workspaceId:'other-company'});
 assert.equal(wrong.artifact,undefined);
});
