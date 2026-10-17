/**
 * Synthetic continuation acceptance for a declined document SAVE approval.
 * The user declined a write, not the underlying editable quotation.
 * No real database, provider, browser, or external service is accessed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {
  newConversationKernel,stageKernelArtifact,reconcileCancelledApprovals,kernelScopeKey,reviseKernelDraft
} from '../dist/src/lib/ai-conversation-kernel.js';
import {createMission,missionStep,cancelMission,pendingMissionProposal} from '../dist/src/lib/ai-mission-runner.js';
import {prepareFoundationApproval} from '../dist/src/lib/ai-foundation-approval.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'synthetic-decline-flow'};
const draft=()=>({
  capability:'document.createDraft',kind:'proforma',
  customerId:'',customerDraft:{companyNameEn:'Synthetic Invoice Trading Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:''},
  currency:'USD',language:'en',
  items:[{savedItemId:'',descriptionEn:'Synthetic chocolate cartons',
    descriptionAr:'',quantity:'3',unit:'CTN',unitPrice:'125'}],
  incoterm:'',paymentTerms:'',deliveryTime:'',validity:'14 days',
  remarks:'',notes:'',label:'Synthetic quote',rationale:'QA only'
});
const context={
  customers:[],items:[],
  defaults:{currency:'USD',language:'en',incoterm:'',paymentTerms:'',
    deliveryTime:'',validity:'14 days'},activeDocument:null
};
function harness(){
  const vault=emptyVault(),before=structuredClone(vault);
  const proposal=draft(),kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,proposal);
  const signed={...structuredClone(proposal),
    foundationApproval:prepareFoundationApproval(vault,proposal,scope)};
  kernel.artifact.proposal=signed;
  kernel.missions=[createMission(scope,signed)];
  const host={
    __intelligenceKernel:kernel,__foundationApprovalBusy:false,
    __workspaceCommandBusy:false,applying:false,
    state:{busy:false,proposal:signed,review:{text:'Review synthetic quote'}},
    setState(patch){this.state={...this.state,...patch};}
  };
  const source=readFileSync('src/lib/ai-intelligence-runtime.ts','utf8');
  const from=source.indexOf('export async function dismissIntelligenceWorkspace(');
  const to=source.indexOf('/** Discard only the exact, unsaved working document',from);
  assert.ok(from>=0&&to>from,'Use the actual current dismissal handler, not an imitation');
  const executable=ts.transpileModule(source.slice(from,to).replace('export async function','async function'),{
    compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const persisted=[];
  const dismiss=new Function('resumeVaultSession','kernelScopeKey','scopeFor',
    'missionStep','cancelMission','reconcileCancelledApprovals','persistKernel',
    'structuredClone',executable+';return dismissIntelligenceWorkspace;')(
    async()=>({vault}),kernelScopeKey,()=>scope,
    missionStep,cancelMission,reconcileCancelledApprovals,
    async h=>{persisted.push(structuredClone(h.__intelligenceKernel));},structuredClone);
  return{vault,before,host,persisted,dismiss,proposal,signed};
}

test('AI-DECLINE-01: declining a signed quote write retains every unsaved customer/line fact',async()=>{
  const h=harness();
  await h.dismiss(h.host,h.signed);
  const next=h.host.__intelligenceKernel;
  assert.ok(next.artifact,'Declining SAVE cannot delete the working quote');
  assert.equal(next.artifact.proposal.customerDraft.companyNameEn,'Synthetic Invoice Trading Buyer');
  assert.equal(next.artifact.proposal.items[0].quantity,'3');
  assert.equal(next.artifact.proposal.items[0].unitPrice,'125');
  assert.equal(next.artifact.proposal.validity,'14 days');
  assert.ok(!next.artifact.proposal.foundationApproval,'Declined authorization must be stripped');
  assert.equal(h.host.state.review,null,'Old visible approval must be cleared');
  assert.equal(h.persisted.length,1,'Decline tombstone must be persisted before clearing UI');
  assert.deepEqual(h.vault,h.before,'Decline cannot alter the real business vault');
});

test('AI-DECLINE-02: previously rejected save cannot reappear as a clickable mission',async()=>{
  const h=harness();
  await h.dismiss(h.host,h.signed);
  const next=h.host.__intelligenceKernel;
  assert.ok(next.cancelledApprovals.includes(h.signed.foundationApproval.id));
  assert.equal(next.missions[0].steps[0].status,'cancelled');
  assert.equal(pendingMissionProposal(next.missions[0]),null);
  assert.equal(next.artifact.proposal.foundationApproval,undefined);
});

test('AI-DECLINE-03: after rejection, follow-up changes quantity without losing buyer and price',async()=>{
  const h=harness();
  await h.dismiss(h.host,h.signed);
  const next=h.host.__intelligenceKernel;
  const revised=reviseKernelDraft(next,next.artifact.proposal,
    'change item 1 quantity to 12',context,'en');
  assert.equal(revised.changed,true,'A correction after rejection must remain usable');
  assert.equal(revised.proposal.customerDraft.companyNameEn,'Synthetic Invoice Trading Buyer');
  assert.equal(revised.proposal.items[0].quantity,'12');
  assert.equal(revised.proposal.items[0].unitPrice,'125');
  assert.equal(revised.proposal.validity,'14 days');
  assert.ok(!revised.proposal.foundationApproval,'Correction must not mint SAVE consent');
  const review=reviewAiDocumentProposal(revised.proposal,context,'en');
  assert.deepEqual(review.blockers,[]);
  assert.match(review.text,/Item subtotal: 1500\.00 USD/);
  assert.deepEqual(h.vault,h.before,'Revision before authorization cannot save financial records');
});
