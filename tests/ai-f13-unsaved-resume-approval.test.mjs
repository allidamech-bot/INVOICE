import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,normalizeConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {resumableWorkingApproval,retireWorkingApproval} from '../dist/src/lib/ai-draft-resumption.js';
import {prepareFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {createMission} from '../dist/src/lib/ai-mission-runner.js';

function fixture(){
 const vault=emptyVault();
 const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f09'};
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:'',customerDraft:{companyNameEn:'Source Buyer',companyNameAr:'',
 contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''},
 currency:'USD',language:'en',items:[{savedItemId:'',descriptionEn:'A',descriptionAr:'',quantity:'3',unit:'CTN',unitPrice:'10'}],
 incoterm:'CIF',paymentTerms:'Net 30',deliveryTime:'',validity:'',remarks:'',notes:'',label:'Unsaved RFQ',rationale:'User source'};
 const kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,proposal);
 return{vault,kernel,proposal,scope};
}
test('F13 preview-only artifact stays an unsaved editable draft after thread restart',()=>{
 const {vault,kernel,scope}=fixture(),before=structuredClone(vault);
 const restarted=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
 assert.ok(restarted.artifact);
 assert.equal(resumableWorkingApproval(restarted,vault),null);
 assert.equal(restarted.artifact.proposal.items[0].quantity,'3');
 assert.equal(restarted.artifact.proposal.foundationApproval,undefined);
 assert.deepEqual(vault,before);
});
test('F13 only a verified scoped, explicit stamped approval can appear in review after reload',()=>{
 const {vault,kernel,scope,proposal}=fixture();
 const reviewed={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
 kernel.artifact.proposal=reviewed;
 kernel.missions=[createMission(scope,reviewed)];
 const result=resumableWorkingApproval(kernel,vault);
 assert.equal(result.foundationApproval.id,reviewed.foundationApproval.id);
 assert.equal(result.items[0].descriptionEn,'A');
 assert.ok(!kernel.cancelledApprovals?.length);
});
test('F13 changed financial baseline retires stale approval without deleting drafted lines',()=>{
 const {vault,kernel,scope,proposal}=fixture();
 const signed={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
 kernel.artifact.proposal=signed;
 kernel.missions=[createMission(scope,signed)];
 vault.customers.push({id:'changed-customer',workspaceId:'default',companyNameEn:'New Buyer',companyNameAr:''});
 assert.equal(resumableWorkingApproval(kernel,vault),null);
 assert.equal(kernel.artifact.proposal.foundationApproval,undefined);
 assert.equal(kernel.artifact.proposal.items.length,1);
 assert.deepEqual(kernel.cancelledApprovals,[signed.foundationApproval.id]);
 assert.equal(kernel.missions[0].steps[0].status,'cancelled');
 assert.match(kernel.missions[0].interruptedReason,/Review/);
 assert.equal(resumableWorkingApproval(kernel,vault),null);
});
test('F13 cross-thread and cross-branch approvals cannot be resurrected',()=>{
 for(const axis of ['threadId','branchId']){
   const {vault,kernel,scope,proposal}=fixture();
   const signed={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
   kernel.artifact.proposal=signed;
   kernel.scope={...scope,[axis]:'other'};
   assert.equal(resumableWorkingApproval(kernel,vault),null);
   assert.equal(kernel.artifact.proposal.foundationApproval,undefined);
 }
});
test('F13 runtime restores approved document only, not every kernel artifact',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 assert.match(source,/resumableWorkingApproval\(host\.__intelligenceKernel,vault\)/);
 assert.match(source,/resumableWorkingApproval\(kernel,resumed\.vault\)/);
 assert.doesNotMatch(source,/setState\(\{proposal:kernel\.artifact\.proposal\}\)/);
 assert.match(source,/host\.setState\(\{proposal:null,review:null\}\)/);
 const runtime=source.split('\n').find(line=>line.includes('const saveWorkingDraft='));
 assert.ok(runtime);
 const candidate=runtime.slice(runtime.indexOf('=')+1,runtime.lastIndexOf('.test(message);'));
 const matches=Function('message','return '+candidate+'.test(message);');
 for(const command of ['احفظها','اعتمد النسخة','اعتمد عرض السعر','approve this draft','save this draft'])assert.equal(matches(command),true,command);
 for(const command of ['هل العرض جاهز؟','لا تحفظ','لا تعتمد النسخة','قيم السعر','اعتمد كل الفواتير'])assert.equal(matches(command),false,command);
});

test('F13 editing an approved working draft cancels its previous review and keeps all lines',()=>{
 const {vault,kernel,scope,proposal}=fixture();
 const signed={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
 kernel.artifact.proposal=signed;kernel.missions=[createMission(scope,signed)];
 const next=structuredClone(kernel),id=signed.foundationApproval.id;
 next.artifact.proposal.items[0].unitPrice='20';
 delete next.artifact.proposal.foundationApproval;
 retireWorkingApproval(next,id);
 assert.equal(next.artifact.proposal.items[0].unitPrice,'20');
 assert.equal(next.artifact.proposal.foundationApproval,undefined);
 assert.equal(next.missions[0].steps[0].status,'cancelled');
 assert.deepEqual(next.cancelledApprovals,[id]);
 assert.equal(vault.documents.length,0);
});
test('F13 direct commercial changes do not mint approvals or save unless asked',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const from=source.indexOf('if(commercialCommand){'),to=source.indexOf('const draftOnly=',from);
 assert.ok(from>0&&to>from);
 const section=source.slice(from,to);
 assert.match(section,/retireWorkingApproval\(next,previousApproval.id\)/);
 assert.match(section,/delete p.foundationApproval/);
 assert.match(section,/proposal:null,review:null/);
 assert.doesNotMatch(section,/stampProposal\(host,p/);
 assert.doesNotMatch(section,/stageReviewedMission\(next,p\)/);
});

test('F13 orphan or already executed approvals are never offered again after reload',()=>{
 for(const state of ['orphan','completed','applying','uncertain','cancelled']){
   const {vault,kernel,scope,proposal}=fixture();
   const reviewed={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
   kernel.artifact.proposal=reviewed;
   if(state!=='orphan'){
     kernel.missions=[createMission(scope,reviewed)];
     kernel.missions[0].steps[0].status=state;
   }
   const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
   assert.equal(resumableWorkingApproval(restored,vault),null,state);
   assert.equal(restored.artifact.proposal.foundationApproval,undefined,state);
   assert.equal(restored.artifact.proposal.items[0].quantity,'3');
   assert.ok(restored.cancelledApprovals.includes(reviewed.foundationApproval.id));
   assert.equal(vault.documents.length,0);
 }
});
test('F13 edited draft retains complete lines after reload while cancelled approval stays retired',()=>{
 const {vault,kernel,scope,proposal}=fixture();
 const original={...structuredClone(proposal),foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
 kernel.artifact.proposal=original;kernel.missions=[createMission(scope,original)];
 const edited=structuredClone(kernel);
 edited.artifact.proposal.items[0].quantity='26';
 delete edited.artifact.proposal.foundationApproval;
 retireWorkingApproval(edited,original.foundationApproval.id);
 const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(edited)),scope);
 assert.equal(restored.artifact.proposal.items[0].quantity,'26');
 assert.equal(restored.artifact.proposal.items.length,1);
 assert.equal(restored.artifact.proposal.foundationApproval,undefined);
 assert.equal(resumableWorkingApproval(restored,vault),null);
 assert.deepEqual(restored.cancelledApprovals,[original.foundationApproval.id]);
 assert.equal(restored.missions[0].steps[0].status,'cancelled');
 assert.deepEqual(vault.documents,[]);
});
