import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

async function fixture({edit=false,fail=false}={}){
 const vault=emptyVault(),before=structuredClone(vault),calls=[];let h;
 const {runtime,host}=await compiledReliabilityHarness(vault,undefined,{requestAiJson:async(endpoint)=>{
  calls.push(endpoint);const a=h.__intelligenceKernel.artifact;
  return{plan:{artifactId:a.id,revision:a.revision,action:edit?'edit':'unrelated',question:'',operations:edit?[{lineId:a.lineIds[0],field:'unitPrice',value:'4',evidence:'أربعة'}]:[]}};
 }});
 h=host();h.ask=async()=>{calls.push('normal-request');if(fail)throw new Error('Synthetic creation failure');h.setState({input:'',messages:[{id:'qa-reply',role:'assistant',text:'Which selling price and customer?'}]});};
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);
 stageKernelArtifact(h.__intelligenceKernel,{capability:'document.createDraft',kind:'proforma',customerId:'',currency:'USD',language:'en',items:[{savedItemId:'',descriptionEn:'QA Carton',descriptionAr:'',quantity:'12',unit:'Carton',unitPrice:'125'}],incoterm:'',paymentTerms:'',deliveryTime:'8 days',validity:'14 days',remarks:'',notes:'',label:'QA old quotation',rationale:'unsaved'});
 return{h,calls,vault,before};
}
for(const message of ['سويلي عرض سعر ب٥٠ كرتون منه','سويلي عرض سعر ب50 كرتون منه','Prepare a quotation for 50 cartons of that item'])test('standalone creation avoids edit-planner round trip: '+message,async()=>{
 const {h,calls,vault,before}=await fixture(),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask(message);
 assert.deepEqual(calls,['normal-request'],'Creation must not pay for working-draft-plan before normal creation');
 assert.deepEqual(h.__intelligenceKernel.artifact,old,'The old draft stays until a valid replacement is staged');
 assert.equal(h.state.__workspaceTurnPending,false);assert.deepEqual(vault,before);
});
test('same-draft Arabic price edit still uses grounded edit planner and never creation',async()=>{
 const {h,calls,vault,before}=await fixture({edit:true});const revision=h.__intelligenceKernel.artifact.revision;
 await h.ask('خلي سعر QA Carton أربعة دولارات في نفس المسودة');
 assert.deepEqual(calls,['/api/ai-inbox']);assert.equal(h.state.error,'');
 assert.equal(h.__intelligenceKernel.artifact.proposal.items[0].unitPrice,'4');
 assert.equal(h.__intelligenceKernel.artifact.revision,revision+1);assert.deepEqual(vault,before);
});
test('failed creation preserves original working artifact and releases loading',async()=>{
 const {h,calls,vault,before}=await fixture({fail:true}),old=structuredClone(h.__intelligenceKernel.artifact);
 await h.ask('Create a new quotation for 50 cartons');
 assert.deepEqual(calls,['normal-request']);assert.deepEqual(h.__intelligenceKernel.artifact,old);
 assert.match(h.state.error,/Synthetic creation failure/);assert.equal(h.state.__workspaceTurnPending,false);
 assert.equal(h.__foundationTurnBusy,false);assert.deepEqual(vault,before);
});
test('current-draft references and mixed edit/create requests keep the edit-planning boundary',async()=>{
 for(const message of ['جهز عرض السعر الحالي فقط','جهز عرض سعر لهذه المسودة','Create a quote from this draft','Create a new quote and change the current price to four dollars']){
  const {h,calls,vault,before}=await fixture();await h.ask(message);
  assert.equal(calls[0],'/api/ai-inbox',message);assert.deepEqual(vault,before);
 }
});
