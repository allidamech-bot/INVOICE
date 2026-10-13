import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {previewOnlyWorkingDraft} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,normalizeConversationKernel,stageKernelArtifact,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f03'};
function fixture(){
 const vault=emptyVault();
 const customer={id:'f03-buyer',workspaceId:'default',companyNameEn:'Followup Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 vault.customers=[customer];
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 const plan={version:1,goal:'Prepare an unsaved quotation',calls:[{id:'prep-1',tool:'quotation.prepare',reason:'review only',args:{
  customerId:customer.id,currency:'USD',language:'bilingual',
  items:[{descriptionEn:'Red Bull',quantity:'10',unit:'CTN',unitPrice:'20'},
   {descriptionEn:'Monster',quantity:'5',unit:'CTN',unitPrice:'30'},
   {descriptionEn:'Snickers',quantity:'2',unit:'CTN',unitPrice:'40'}],
  incoterm:'CIF',paymentTerms:'30 days',notes:'Arabic sticker included'
 }}]};
 const executed=executeAiToolPlan(runtime,plan);
 const draft=previewOnlyWorkingDraft(plan,executed.results,runtime);
 assert.ok(draft);const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft);
 return{vault,kernel};
}
function revise(kernel,vault,message){
 return reviseKernelDraft(kernel,kernel.artifact.proposal,message,workspaceDrafting(vault),'ar');
}
test('F03 multi-turn exact edits retain original customer, lines and terms without any save',()=>{
 const {vault,kernel}=fixture();const base=structuredClone(kernel.artifact.proposal);
 assert.equal(workspaceDocument(kernel,vault,'ar').subtotal,'430.00');
 const edited=revise(kernel,vault,'غيّر كمية الصنف 3 إلى 26');
 assert.equal(edited.changed,true);
 const hydrated=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
 assert.equal(hydrated.artifact.proposal.items[2].quantity,'26');
 assert.equal(workspaceDocument(hydrated,vault,'en').subtotal,'1390.00');
 assert.equal(hydrated.artifact.proposal.customerId,base.customerId);
 assert.equal(hydrated.artifact.proposal.notes,base.notes);
 assert.equal(hydrated.artifact.proposal.incoterm,base.incoterm);
 assert.equal(hydrated.artifact.proposal.paymentTerms,base.paymentTerms);
 assert.deepEqual(hydrated.artifact.proposal.items.slice(0,2),base.items.slice(0,2));
 assert.equal(hydrated.artifact.lineIds.length,3);
 assert.equal(new Set(hydrated.artifact.lineIds).size,3);
 assert.deepEqual(vault.documents,[]);
 assert.deepEqual(vault.documentEvents,[]);
 const pdf=prepareAiPdfPreview(hydrated,vault,'ar');
 assert.equal(pdf.items[2].quantity,'26');
 assert.equal(pdf.number,'UNSAVED-PREVIEW');
});
test('F03 price correction restores last exact value without losing the third item or prior quantity',()=>{
 const {vault,kernel}=fixture();
 assert.equal(revise(kernel,vault,'غيّر كمية الصنف 3 إلى 26').changed,true);
 assert.equal(revise(kernel,vault,'غيّر سعر الصنف 3 إلى 26').changed,true);
 assert.equal(kernel.artifact.proposal.items[2].unitPrice,'26');
 assert.equal(revise(kernel,vault,'ارجع السعر السابق').changed,true);
 assert.equal(kernel.artifact.proposal.items[2].unitPrice,'40');
 assert.equal(kernel.artifact.proposal.items[2].quantity,'26');
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'1390.00');
 assert.equal(revise(kernel,vault,'redo').changed,true);
 assert.equal(kernel.artifact.proposal.items[2].unitPrice,'26');
 assert.equal(vault.documents.length,0);
});
test('F03 unsupported or ambiguous follow-ups cannot replace complete working quote',()=>{
 const {vault,kernel}=fixture();const before=structuredClone(kernel);
 const attempt=revise(kernel,vault,'غير كمية كل الأصناف بشكل مختلف');
 assert.equal(attempt,null);
 assert.deepEqual(kernel,before);
 assert.equal(revise(kernel,vault,'ارجع السعر السابق').changed,false);
 assert.equal(kernel.artifact.proposal.items.length,3);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'430.00');
});
test('F03 Controller source intercepts exact edits before model and prepares save only for explicit request',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const start=source.indexOf('const draftOnly='),end=source.indexOf('if(!kernel.artifact){const selected=',start);
 assert.ok(start>0&&end>start,'exact scoped follow-up interception exists');
 const flow=source.slice(start,end);
 assert.match(flow,/const saveWorkingDraft=/);
 assert.match(flow,/stampProposal\(host,p,resumed\.vault\);stageReviewedMission\(kernel,p\)/);
 assert.match(flow,/await persistKernel\(host\);return;/);
 assert.match(flow,/const exactDraftFollowup=/);
 assert.match(flow,/reviseKernelDraft\(next,original,message,drafting/);
 assert.match(flow,/if\(result\?\.changed\)/);
 assert.match(flow,/host\.__intelligenceKernel=next/);
 assert.match(flow,/proposal:null,review:null/);
 assert.doesNotMatch(flow,/mutateVaultSafely|saveDocument\(|postInvoice\(/);
 const confirmAt=flow.indexOf('if(draftOnly&&saveWorkingDraft)'),editAt=flow.indexOf('if(draftOnly&&exactDraftFollowup)');
 assert.ok(confirmAt<editAt,'explicit save goes through approval preparation; edit is no-save');
 const askAt=source.indexOf('await ask(raw);');
 assert.ok(end<askAt,'follow-up is handled before generic AI planner');
});

test('F03 live command regex recognizes exact Arabic edits and save gate, but not generic business talk',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const literal=name=>{
   const line=source.split('\\n').find(row=>row.includes('const '+name+'='));
   assert.ok(line,name+' must exist');
   const code=line.slice(line.indexOf('=')+1,line.lastIndexOf('.test(message);'));
   return Function('message','return '+code+'.test(message);');
 };
 const revise=literal('exactDraftFollowup'),save=literal('saveWorkingDraft');
 for(const command of ['غيّر كمية الصنف 3 إلى 26','غيّر سعر الصنف 3 إلى 26','ارجع السعر السابق','undo','change quantity line 3 to 26'])
   assert.equal(revise(command),true,command);
 for(const command of ['احفظها','احفظ المسودة','prepare to save this draft'])assert.equal(save(command),true,command);
 for(const command of ['حلّل الأرباح','كم فاتورة صدرت؟','هل هذا السعر جيد؟']){
   assert.equal(revise(command),false,command);assert.equal(save(command),false,command);
 }
});
