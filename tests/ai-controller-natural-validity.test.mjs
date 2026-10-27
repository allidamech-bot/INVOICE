import test from 'node:test';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
import {interpretDraftMessage} from '../dist/src/lib/ai-draft-message.js';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

async function fixture(){
 const vault=emptyVault();vault.customers=[{id:'qa-horizon',workspaceId:'default',companyNameEn:'Horizon Office Solutions LLC',companyNameAr:'',email:''}];
 const before=structuredClone(vault),requests=[];
 const {runtime,host}=await compiledReliabilityHarness(vault,undefined,{requestAiJson:async(...args)=>{requests.push(args);throw new Error('Synthetic planning timeout');}});
 const h=host();h.requestController=null;let dialogue=0;h.ask=async()=>{dialogue++;h.setState({busy:false});};
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);h.__intelligenceKernel.mode='controller';
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:'qa-horizon',currency:'USD',language:'en',items:[100,200,853,400,500,194].map((price,i)=>({savedItemId:'',descriptionEn:'Synthetic item '+(i+1),descriptionAr:'',quantity:'1',unit:'PCS',unitPrice:String(price)})),incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',label:'Synthetic six-line draft',rationale:'unsaved'};
 stageKernelArtifact(h.__intelligenceKernel,proposal);
 return {h,vault,before,requests,dialogue:()=>dialogue};
}
function released(h){assert.equal(h.state.busy,false);assert.equal(h.__foundationTurnBusy,false);assert.equal(h.state.__workspaceTurnPending,false);assert.equal(h.requestController,null);}
const phrases=['خلي صلاحية العرض ١٢ يوم','خلي صلاحية العرض ۱۲ يوم','غير صلاحية عرض السعر إلى 12 يوم','بدي العرض يضل صالح اتناشر يوم','Set quotation validity to 12 days','خلي الصلاحية 12 days from quotation date','غير الصلاحية إلى 12 يوم وبعدين افتح معاينة PDF','غيّر الصلاحية إلى 12 days ثم أعد تجهيز معاينة PDF','غيّر صلاحية العرض إلى 12 يومًا','خلي صلاحية العرض 12 يوم وبعدين ورجيني المعاينة'];
for(const phrase of phrases)test('Controller interprets validity and optional preview locally: '+phrase,async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,27,12)});
 const {h,vault,before,requests}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(phrase);
 assert.equal(h.__intelligenceKernel.artifact.proposal.validity,'12 days');
 assert.equal(workspaceDocument(h.__intelligenceKernel,vault,'en').subtotal,'2247.00');
 assert.deepEqual(h.__intelligenceKernel.artifact.proposal.items,old.proposal.items);assert.deepEqual(h.__intelligenceKernel.artifact.lineIds,old.lineIds);
 const preview=prepareAiPdfPreview(h.__intelligenceKernel,vault,'en');assert.equal(preview.issueDate,'2026-10-27');assert.equal(preview.dueDate,'2026-11-08');
 if(interpretDraftMessage(phrase).preview)assert.ok(h.state.__workspacePdfAutoStart,'preview targets revised artifact');
 assert.equal(requests.length,0);assert.deepEqual(vault,before);released(h);
 await h.ask('undo');assert.equal(h.__intelligenceKernel.artifact.proposal.validity,old.proposal.validity);
 await h.ask('redo');assert.equal(h.__intelligenceKernel.artifact.proposal.validity,'12 days');
 await h.ask('احفظ المسودة');assert.ok(h.state.proposal?.foundationApproval);assert.deepEqual(vault,before);
});
for(const phrase of ['شو إجمالي العرض؟','١٢٣٤','abcxyz','خلي الصلاحية 12 يوم ثم احفظ العرض','خلي الصلاحية 12 يوم ثم غير السعر','خلي الصلاحية 12 أو 20 يوم','لا تغير الصلاحية إلى 12 يوم'])test('read or clarify safely without changing the active draft: '+phrase,async()=>{
 const {h,vault,before,requests}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(phrase);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.equal(requests.length,0);assert.deepEqual(vault,before);released(h);
 if(phrase==='شو إجمالي العرض؟')assert.match(h.state.messages.at(-1).text,/2247.00 USD/);
});
test('greeting remains ordinary dialogue; semantic routing remains available for deeper requests',async()=>{
 assert.deepEqual(interpretDraftMessage('مرحبا'),{kind:'other'});
 assert.deepEqual(interpretDraftMessage('Compare these delivery options'),{kind:'other'});
 const {h,requests,dialogue}=await fixture();await h.ask('مرحبا');assert.equal(dialogue(),1);assert.equal(requests.length,0);
});
test('Advisor validity wording never executes a Controller edit',async()=>{
 const {h,vault,before,requests,dialogue}=await fixture();h.__intelligenceKernel.mode='advisor';const old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('خلي صلاحية العرض 12 يوم');assert.equal(dialogue(),1);assert.equal(requests.length,0);assert.deepEqual(h.__intelligenceKernel.artifact,old);assert.deepEqual(vault,before);
});
