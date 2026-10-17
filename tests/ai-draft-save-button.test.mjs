import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

const draft=()=>({capability:'document.createDraft',kind:'proforma',customerId:'',customerDraft:{companyNameEn:'QA Buyer',companyNameAr:''},currency:'USD',language:'en',items:[{savedItemId:'',descriptionEn:'QA Carton',descriptionAr:'',quantity:'12',unit:'Carton',unitPrice:'125'}],incoterm:'',paymentTerms:'',deliveryTime:'',validity:'14 days',remarks:'',notes:'',label:'QA quotation',rationale:'Explicit user request'});
async function setup(){
 const vault=emptyVault();vault.company.nameEn='QA';
 const {runtime,host}=await compiledReliabilityHarness(vault);const h=host();let writes=0;
 h.approveProposal=async()=>{writes++;h.state.proposal=null;return{id:'saved-qa',summary:'QA draft saved'};};
 runtime.installIntelligenceRuntime(h);await runtime.refreshIntelligenceWorkspace(h);
 stageKernelArtifact(h.__intelligenceKernel,draft());
 return{vault,runtime,h,writes:()=>writes,artifact:h.__intelligenceKernel.artifact};
}
test('one explicit Save click signs and approves the visible draft without PDF or review acknowledgement',async()=>{
 const {runtime,h,artifact,writes}=await setup();
 assert.equal(h.state.__workspaceReviewedProposal,undefined);
 await runtime.saveIntelligenceDraft(h,artifact.id,artifact.revision);
 assert.equal(h.state.error,'');assert.equal(writes(),1);
 assert.equal(h.__foundationReceipts.at(-1).state,'applied');
 assert.equal(h.state.__workspacePdfAutoStart,undefined,'saving must not generate a PDF');
});
test('double Save click is serialized and cannot duplicate the mutation',async()=>{
 const {runtime,h,artifact,writes}=await setup();
 await Promise.all([runtime.saveIntelligenceDraft(h,artifact.id,artifact.revision),runtime.saveIntelligenceDraft(h,artifact.id,artifact.revision)]);
 assert.equal(writes(),1);
});
test('incomplete draft and stale revision fail before save',async()=>{
 for(const variant of ['incomplete','stale']){
  const {runtime,h,artifact,writes}=await setup();
  if(variant==='incomplete')artifact.proposal.items[0].quantity='';
  await runtime.saveIntelligenceDraft(h,artifact.id,artifact.revision+(variant==='stale'?1:0));
  assert.equal(writes(),0);assert.ok(h.state.error);
 }
});
test('a role/data change since display cannot be silently accepted by the Save shortcut',async()=>{
 const {runtime,h,vault,artifact,writes}=await setup();
 h.__foundationVault=structuredClone(vault);
 vault.teamMembers[0].role='viewer';
 await runtime.saveIntelligenceDraft(h,artifact.id,artifact.revision);
 assert.equal(writes(),0);assert.ok(h.state.error);
});
