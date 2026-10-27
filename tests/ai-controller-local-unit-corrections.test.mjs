import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

async function fixture(){
 const vault=emptyVault();vault.customers=[{id:'qa-horizon',workspaceId:'default',companyNameEn:'Horizon Office Solutions LLC',companyNameAr:'',email:''}];
 const before=structuredClone(vault),requests=[];
 const {runtime,host}=await compiledReliabilityHarness(vault,undefined,{requestAiJson:async(...args)=>{requests.push(args);throw new Error('Synthetic planning timeout');}});
 const h=host();h.requestController=null;let dialogue=0;h.ask=async()=>{dialogue++;throw new Error('Unexpected dialogue fallback');};
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);h.__intelligenceKernel.mode='controller';
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:'qa-horizon',currency:'USD',language:'en',items:[100,200,300,400,500,194].map((price,i)=>({savedItemId:'',descriptionEn:'Synthetic item '+(i+1),descriptionAr:'',quantity:'1',unit:i<3?'':'PCS',unitPrice:String(price)})),incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',label:'Synthetic six-line draft',rationale:'unsaved'};
 stageKernelArtifact(h.__intelligenceKernel,proposal);
 return {h,vault,before,requests,dialogue:()=>dialogue};
}
function released(h){assert.equal(h.state.busy,false);assert.equal(h.__foundationTurnBusy,false);assert.equal(h.state.__workspaceTurnPending,false);assert.equal(h.requestController,null);}
test('real Controller runtime corrects explicit units and price locally as one undoable unsaved revision',async()=>{
 const {h,vault,before,requests,dialogue}=await fixture();
 const old=structuredClone(h.__intelligenceKernel.artifact),document=()=>workspaceDocument(h.__intelligenceKernel,vault,'en');
 assert.equal(document().subtotal,'1694.00');
 await h.ask('غيّر وحدة الأسطر 1 و2 و3 إلى PCS ثم غيّر سعر الصنف 3 إلى 853 USD');
 assert.equal(document().subtotal,'2247.00');assert.equal(h.__intelligenceKernel.artifact.proposal.items.length,6);
 assert.deepEqual(h.__intelligenceKernel.artifact.proposal.items.map(row=>row.unit),Array(6).fill('PCS'));
 assert.deepEqual(h.__intelligenceKernel.artifact.lineIds,old.lineIds);
 assert.equal(h.__intelligenceKernel.artifact.proposal.customerId,'qa-horizon');
 await h.ask('undo');assert.deepEqual(h.__intelligenceKernel.artifact.proposal,old.proposal);assert.equal(document().subtotal,'1694.00');
 await h.ask('redo');assert.equal(document().subtotal,'2247.00');
 await h.ask('احفظ المسودة');assert.ok(h.state.proposal?.foundationApproval);assert.deepEqual(vault,before);
 assert.equal(requests.length,0);assert.equal(dialogue(),0);released(h);
});
for(const message of ['صحح المسودة والإجمالي إلى 2247 USD','غيّر وحدة الأسطر 1 و2 و99 إلى PCS','غيّر وحدة السطر 1 إلى PCS ثم غيّر سعر الصنف 99 إلى 12 USD'])test('unsupported or invalid correction is immediate, atomic and retryable: '+message,async()=>{
 const {h,vault,before,requests,dialogue}=await fixture();const old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(message);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.equal(requests.length,0);assert.equal(dialogue(),0);assert.deepEqual(vault,before);released(h);
 await h.ask('غيّر وحدة السطر 1 إلى PCS');assert.equal(h.__intelligenceKernel.artifact.proposal.items[0].unit,'PCS');assert.equal(requests.length,0);released(h);
});
test('unit and quantity edits revoke an existing save review without persisting a document',async()=>{
 const {h,vault,before,requests}=await fixture();
 await h.ask('غيّر وحدة الأسطر 1 و2 و3 إلى PCS');await h.ask('احفظ المسودة');assert.ok(h.state.proposal?.foundationApproval);
 await h.ask('غيّر وحدة السطر 2 إلى BOX ثم غيّر كمية الصنف 2 إلى 2');
 assert.equal(h.__intelligenceKernel.artifact.proposal.items[1].unit,'BOX');assert.equal(h.__intelligenceKernel.artifact.proposal.items[1].quantity,'2');
 assert.equal(h.state.proposal,null);assert.equal(h.state.review,null);assert.equal(h.__intelligenceKernel.artifact.proposal.foundationApproval,undefined);
 assert.deepEqual(vault,before);assert.equal(requests.length,0);released(h);
});
