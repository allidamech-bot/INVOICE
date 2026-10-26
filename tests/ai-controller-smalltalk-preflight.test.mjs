import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

const greetings=['السلام عليكم','مرحبا','صباح الخير','كيف حالك؟','Hello','How are you?'];
async function fixture({mode='controller',failure='',edit=false}={}){
 const vault=emptyVault();vault.customers=[{id:'qa-buyer',workspaceId:'default',companyNameEn:'QA Buyer',companyNameAr:'',email:''}];
 const before=structuredClone(vault),plans=[],dialogue=[];let h,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const {runtime,host}=await compiledReliabilityHarness(vault,undefined,{requestAiJson:async(endpoint,body,_signal,timeout)=>{
  plans.push({endpoint,body,timeout});const a=h.__intelligenceKernel.artifact;
  return{plan:{artifactId:a.id,revision:a.revision,action:edit?'edit':'clarify',question:'Which exact line and price?',operations:edit?[{lineId:a.lineIds[2],field:'unitPrice',value:'26',evidence:'26'}]:[]}};
 }});
 h=host();h.ask=async message=>{
  dialogue.push(message);h.pending=true;h.setState({busy:true,error:''});
  const controller=new AbortController();h.requestController=controller;entered();
  try{
   if(failure==='error')throw new Error('Synthetic dialogue failure');
   if(failure==='cancel')await new Promise((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new DOMException('Synthetic cancellation','AbortError')),{once:true}));
   h.setState(state=>({messages:[...state.messages,{id:crypto.randomUUID(),role:'user',text:message},{id:crypto.randomUUID(),role:'assistant',text:'Dialogue result for '+message}]}));
  }finally{h.pending=false;h.requestController=null;h.setState({busy:false});}
 };
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);h.__intelligenceKernel.mode=mode;
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:'qa-buyer',currency:'USD',language:'en',items:Array.from({length:3},(_,i)=>({savedItemId:'',descriptionEn:'QA Item '+(i+1),descriptionAr:'',quantity:'2',unit:'PCS',unitPrice:'10'})),incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',label:'QA existing draft',rationale:'unsaved'};
 stageKernelArtifact(h.__intelligenceKernel,proposal);
 const revision=structuredClone(proposal);revision.items[0].unitPrice='11';stageKernelArtifact(h.__intelligenceKernel,revision);
 return{h,vault,before,plans,dialogue,started};
}
function released(h){assert.equal(h.state.busy,false);assert.equal(h.pending,false);assert.equal(h.__foundationTurnBusy,false);assert.equal(h.state.__workspaceTurnPending,false);assert.equal(h.state.__workspaceTurnSaving,false);assert.equal(h.requestController,null);}
for(const reviewed of [false,true])for(const message of greetings)test('pure social message uses one normal turn and no edit planning; review='+reviewed+': '+message,async()=>{
 const {h,vault,before,plans,dialogue}=await fixture();
 if(reviewed){await h.ask('احفظ المسودة');assert.ok(h.state.proposal?.foundationApproval);}
 const old=structuredClone(h.__intelligenceKernel.artifact),missions=structuredClone(h.__intelligenceKernel.missions),proposal=structuredClone(h.state.proposal),review=structuredClone(h.state.review);
 await h.ask(message);
 assert.deepEqual(plans,[]);assert.deepEqual(dialogue,[message]);assert.equal(h.state.messages.filter(row=>row.role==='user'&&row.text===message).length,1);
 assert.equal(h.state.messages.at(-1).text,'Dialogue result for '+message,'the normal dialogue owns the answer');
 assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(h.__intelligenceKernel.missions,missions);
 assert.deepEqual(h.state.proposal,proposal);assert.deepEqual(h.state.review,review);assert.deepEqual(vault,before);released(h);
});
for(const message of ['السلام عليكم، عدّل السعر','مرحبا غير سعر الثالث','Hello, change the price','How are you? Save the draft'])test('mixed/extra instructions cannot bypass edit planning: '+message,async()=>{
 const {h,plans,dialogue,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(message);assert.equal(plans.length,1);assert.equal(plans[0].body.mode,'working-draft-plan');assert.equal(plans[0].timeout,30000);
 assert.deepEqual(dialogue,[]);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);
});
test('third-line price change remains a grounded unsaved edit',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture({edit:true}),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('غيّر سعر الصنف الثالث إلى 26 USD');
 assert.deepEqual(dialogue,[]);assert.equal(h.state.error,'');assert.equal(h.__intelligenceKernel.artifact.proposal.items[2].unitPrice,'26');
 assert.equal(h.__intelligenceKernel.artifact.id,old.id);assert.deepEqual(h.__intelligenceKernel.artifact.lineIds,old.lineIds);
 assert.equal(h.__intelligenceKernel.artifact.revision,old.revision+1);assert.deepEqual(vault,before);
 for(const call of plans)assert.equal(call.body.mode,'working-draft-plan');
});
test('save still prepares a signed review and never saves automatically',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture();await h.ask('احفظ المسودة');
 assert.ok(h.state.proposal?.foundationApproval);assert.ok(h.__intelligenceKernel.missions.some(m=>m.steps.some(s=>s.status==='needs_approval')));
 assert.deepEqual(plans,[]);assert.deepEqual(dialogue,[]);assert.deepEqual(vault,before);
});
test('explicit creation retains the active-draft guard from PR 1101',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('أنشئ مسودة عرض سعر');assert.deepEqual(plans,[]);assert.deepEqual(dialogue,[]);
 assert.match(h.state.messages.at(-1).text,/جديد/);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);
});
test('undo remains local and keeps the document identity',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('تراجع');assert.deepEqual(plans,[]);assert.deepEqual(dialogue,[]);
 assert.equal(h.__intelligenceKernel.artifact.proposal.items[0].unitPrice,'10');assert.equal(h.__intelligenceKernel.artifact.id,old.id);assert.deepEqual(vault,before);
});
test('PDF retains its preview-only path',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('اعرض PDF');assert.equal(h.state.error,'');assert.ok(h.state.__workspacePdfAutoStart);
 assert.deepEqual(plans,[]);assert.deepEqual(dialogue,[]);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);
});
test('Advisor still uses the normal dialogue without draft planning',async()=>{
 const {h,plans,dialogue,vault,before}=await fixture({mode:'advisor'}),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('السلام عليكم');assert.deepEqual(plans,[]);assert.deepEqual(dialogue,['السلام عليكم']);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);released(h);
});
for(const failure of ['error','cancel'])test('normal dialogue '+failure+' releases waiting without retries or draft changes',async()=>{
 const {h,plans,dialogue,vault,before,started}=await fixture({failure}),old=structuredClone(h.__intelligenceKernel.artifact);
 const pending=h.ask('مرحبا');await Promise.race([started,pending]);
 if(failure==='cancel'&&h.requestController){await h.ask('مرحبا');h.requestController.abort();}
 await pending;
 assert.deepEqual(plans,[]);assert.deepEqual(dialogue,['مرحبا']);assert.match(h.state.error,/Synthetic/);
 assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);released(h);
});
