import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneDocumentCreation} from '../dist/src/lib/ai-working-draft-plan.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

async function fixture({edit=false,fail=false,active=true,mode='controller'}={}){
 const vault=emptyVault(),before=structuredClone(vault),calls=[];let h;
 const {runtime,host}=await compiledReliabilityHarness(vault,undefined,{requestAiJson:async(endpoint)=>{
  calls.push(endpoint);const a=h.__intelligenceKernel.artifact;
  return{plan:{artifactId:a.id,revision:a.revision,action:edit?'edit':'unrelated',question:'',operations:edit?[{lineId:a.lineIds[0],field:'unitPrice',value:'4',evidence:'أربعة'}]:[]}};
 }});
 h=host();h.ask=async()=>{calls.push('normal-request');if(fail)throw new Error('Synthetic creation failure');h.setState({input:'',messages:[{id:'qa-reply',role:'assistant',text:'Which selling price and customer?'}]});};
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);
 h.__intelligenceKernel.mode=mode;
 if(active)stageKernelArtifact(h.__intelligenceKernel,{capability:'document.createDraft',kind:'proforma',customerId:'',currency:'USD',language:'en',items:[{savedItemId:'',descriptionEn:'QA Carton',descriptionAr:'',quantity:'12',unit:'Carton',unitPrice:'125'}],incoterm:'',paymentTerms:'',deliveryTime:'8 days',validity:'14 days',remarks:'',notes:'',label:'QA old quotation',rationale:'unsaved'});
 return{h,calls,vault,before};
}
for(const message of ['أنشئ مسودة عرض سعر','أنشئ عرض سعر جديد','سويلي عرض سعر ب٥٠ كرتون منه','سويلي عرض سعر ب50 كرتون منه','Prepare a quotation for 50 cartons of that item'])test('standalone creation preserves an active draft and asks before starting another: '+message,async()=>{
 const {h,calls,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(message);
 assert.deepEqual(calls,[],'Neither editing nor replacement may be planned before resolving the active draft');
 assert.match(h.state.messages.at(-1).text,/جديد|new/);assert.match(h.state.messages.at(-1).text,/إنها|finish/);
 assert.equal(h.state.proposal,null);assert.equal(h.state.__workspacePdfAutoStart,undefined);
 assert.deepEqual(h.__intelligenceKernel.artifact,old,'The old draft, line IDs, revision and undo stack remain intact');
 assert.equal(h.state.__workspaceTurnPending,false);assert.deepEqual(vault,before);
});
test('same-draft Arabic price edit still uses grounded edit planner and never creation',async()=>{
 const {h,calls,vault,before}=await fixture({edit:true});const revision=h.__intelligenceKernel.artifact.revision;
 await h.ask('خلي سعر QA Carton أربعة دولارات في نفس المسودة');
 assert.deepEqual(calls,['/api/ai-inbox']);assert.equal(h.state.error,'');
 assert.equal(h.__intelligenceKernel.artifact.proposal.items[0].unitPrice,'4');
 assert.equal(h.__intelligenceKernel.artifact.revision,revision+1);assert.deepEqual(vault,before);
});
test('failed creation without an active draft leaves no artifact and releases loading',async()=>{
 const {h,calls,vault,before}=await fixture({fail:true,active:false}),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('Create a new quotation for 50 cartons');
 assert.deepEqual(calls,['normal-request']);assert.deepEqual(h.__intelligenceKernel.artifact,old);
 assert.match(h.state.error,/Synthetic creation failure/);assert.equal(h.state.__workspaceTurnPending,false);
 assert.equal(h.__foundationTurnBusy,false);assert.deepEqual(vault,before);
});
test('current-draft references and mixed edit/create requests keep the edit-planning boundary',async()=>{
 for(const message of ['جهز عرض السعر الحالي فقط','جهز عرض سعر لهذه المسودة','Create a quote from this draft',"Create a quotation? Don't create a new draft.",'Create a new quote and change the current price to four dollars']){
  const {h,calls,vault,before}=await fixture();await h.ask(message);
  assert.equal(calls[0],'/api/ai-inbox',message);assert.deepEqual(vault,before);
 }
});

for(const message of ['أنشئ مسودة عرض سعر','أنشئ عرض سعر جديد','أنشئ مسودة فاتورة','Create a new quotation'])test('explicit creation proceeds normally without an active draft: '+message,async()=>{
 const {h,calls,vault,before}=await fixture({active:false});
 await h.ask(message);
 assert.deepEqual(calls,['normal-request']);assert.equal(h.__intelligenceKernel.artifact,undefined);
 assert.match(h.state.messages.at(-1).text,/customer/);assert.deepEqual(vault,before);
});
test('bare current-draft edit asks for the missing change without creating or replacing',async()=>{
 const {h,calls,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('عدّل المسودة الحالية');
 assert.deepEqual(calls,[]);assert.match(h.state.messages.at(-1).text,/Specify the line|حدّد السطر/);assert.deepEqual(h.__intelligenceKernel.artifact,old);
 assert.deepEqual(vault,before);assert.equal(h.state.proposal,null);
});
test('Advisor creation wording retains normal read-only conversation routing',async()=>{
 const {h,calls,vault,before}=await fixture({mode:'advisor'}),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('أنشئ مسودة عرض سعر');
 assert.deepEqual(calls,['normal-request']);assert.deepEqual(h.__intelligenceKernel.artifact,old);
 assert.deepEqual(vault,before);assert.equal(h.state.proposal,null);
});
test('draft creation modifier is distinct from an existing-draft reference or negated edit',()=>{
 for(const message of ['أنشئ مسودة عرض سعر','أنشئ عرض سعر جديد','أنشئ مسودة فاتورة','جهز مسودة عرض سعر','انشئ مسودة عرض سعر'])assert.equal(standaloneDocumentCreation(message),true,message);
 for(const message of ['عدّل المسودة الحالية','أنشئ عرض سعر لهذه المسودة','أنشئ مسودة عرض سعر وعدّل السعر الحالي','لا تنشئ مسودة عرض سعر','أنشئ عرض سعر من المسودة السابقة','جهز عرض سعر للمسودة','أنشئ عرض سعر من مسودة فاتورة',"Create a quotation? Don't create a new draft."])assert.equal(standaloneDocumentCreation(message),false,message);
});

test('fully specified creation cannot silently replace an existing draft',async()=>{
 const {h,calls,vault,before}=await fixture();
 const old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('أنشئ مسودة عرض سعر لعميل QA New Buyer بصنف QA New Product عدد 2 PCS بسعر 10 USD');
 assert.deepEqual(calls,[]);assert.deepEqual(h.__intelligenceKernel.artifact,old);
 assert.equal(h.state.proposal,null);assert.deepEqual(vault,before);
 assert.match(h.state.messages.at(-1).text,/جديد/);
});
