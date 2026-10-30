import test from 'node:test';
import assert from 'node:assert/strict';
import {newReviewDraft,SyntheticDraftEditor,assertDraftIntegrity,R04_LIVE_WRITES_ENABLED}
  from '../../dist/src/ai-next/guarded-finance/drafts.js';
import {ScopedApprovalGate,SyntheticApprovalStore,syntheticApprovalKey}
  from '../../dist/src/ai-next/guarded-finance/approvals.js';
import {decideToolCall} from '../../dist/src/ai-next/guarded-finance/tool-policy.js';
import {validateCoreContract} from '../../dist/src/ai-next/domain/validation.js';

const NOW='2026-10-30T15:00:00.000Z';
const at=n=>'2026-10-30T15:00:'+String(n).padStart(2,'0')+'.000Z';
const H='a'.repeat(64);
const scope=(overrides={})=>({
  ownerUid:'synthetic-owner',accountId:'account-a',companyId:'company-a',
  branchId:'branch-a',threadId:'thread-a',actorId:'synthetic-owner',
  role:'owner',scopeType:'business',authorizationVersion:1,...overrides,
});
const line=(id,qty='2',price='15.50')=>({
  lineId:id,description:'Synthetic item '+id,quantity:qty,
  unit:'CTN',sellingUnitPrice:price,currency:'USD',evidenceRefs:[],
});
const draftArgs=(x={})=>({
  scope:scope(),draftId:'draft-1',kind:'quotation',sourceIds:[],
  sourceManifestHash:H,lineItems:[line('l1'),line('l2','3','22')],
  customerId:'customer-123',currency:'USD',now:NOW,...x,
});
const make=async (override={})=>SyntheticDraftEditor.create(
  await newReviewDraft(draftArgs(override))
);
async function review(editor,change={}){
  const d=editor.view();
  return editor.review({expectedRevision:d.draftRevision,actorId:d.scope.actorId,
    now:at(2),checkedLineIds:d.lineItems.map(l=>l.lineId),
    currentSourceCoverages:[],businessRevision:'vault-r1',
    businessValidationPassed:true,
    trustedSourceManifestHash:d.sourceManifestHash,trustedEvidence:[],...change});
}
async function gateFor(editor,opts={}){
  const key=await syntheticApprovalKey();
  const approvals=new SyntheticApprovalStore();
  let current=editor.view();
  let business='vault-r1';
  let enabled=true;
  const trusted={
    async loadReviewDraft(){return {
      draft:structuredClone(current),reviewedBusinessRevision:'vault-r1',
      reviewedSourceManifestHash:current.sourceManifestHash,
      reviewedByActorId:current.scope.actorId,
    };},
    async currentBusinessRevision(){return business;},
    async canCreateQuoteDraft(){return enabled;},
  };
  const gate=new ScopedApprovalGate(key,approvals,trusted);
  const refresh=()=>{current=editor.view();};
  const businessChange=x=>{business=x;};
  const disable=()=>{enabled=false;};
  return {gate,refresh,businessChange,disable,store:approvals};
}
const approveInput=(d,more={})=>({
  scope:d.scope,taskId:'task1',approvalId:'approval1',operationId:'operation1',
  durationSeconds:90,issuedAt:at(3),
  approval:{control:'approve_current_revision',actorId:d.scope.actorId,
    draftId:d.draftId,reviewedDraftRevision:d.draftRevision,
    reviewedDraftHash:d.immutableRevisionHash,
    acknowledgedBusinessRevision:'vault-r1',submittedAt:at(3),interactionId:'button-1'},
  ...more,
});
const toolCall=(opts={})=>({
  schemaVersion:1,scope:scope(),toolCallId:'call-1',taskId:'task1',
  toolId:'quotation.prepare',toolSchemaVersion:1,operationType:'prepare',
  validatedInput:{customerId:'customer-123'},
  validatedInputHash:H,requiredPermissions:['draft.prepare'],evidenceIds:[],
  sourceCompletenessStatus:'complete',idempotencyKey:'idem1',
  expectedBusinessRevision:null,approvalReceiptId:null,preconditions:[],
  state:'proposed',resultRef:null,errorCategory:null,...opts,
});
const permission=(p='draft.prepare')=>new Set([p]);

test('R04 live writes are permanently disabled at this stage',async()=>{
  assert.equal(R04_LIVE_WRITES_ENABLED,false);
  const editor=await make();const {gate}=await gateFor(editor);
  assert.throws(()=>gate.execute(),/R04_LIVE_EXECUTION_DISABLED/);
});
test('new quote is unsaved/review required; no price inferred from product costs',async()=>{
  const d=await newReviewDraft(draftArgs({lineItems:[line('a','1',null)]}));
  assert.equal(d.status,'needs_review');assert.equal(d.businessValidation.valid,false);
  assert.equal(d.lineItems[0].sellingUnitPrice,null);
  assert.ok(d.businessValidation.blockers.some(x=>x.includes('LINE_UNVERIFIED')));
  assert.equal(validateCoreContract('ReviewDraft',d).ok,true);
  await assertDraftIntegrity(d);
});
test('stable line ID edit changes only the identified line; revision and hash rotate',async()=>{
  const editor=await make(),before=editor.view();
  const result=await editor.edit({expectedRevision:1,now:at(1),
    change:{kind:'line_patch',lineId:'l2',patch:{quantity:'8'}}});
  assert.equal(result.draftRevision,2);
  assert.equal(result.lineItems[0].quantity,'2');
  assert.equal(result.lineItems[1].quantity,'8');
  assert.notEqual(before.immutableRevisionHash,result.immutableRevisionHash);
  assert.equal(result.approvalReceiptId,null);
  await assertDraftIntegrity(result);
});
test('stale edit, incorrect line, unexpected field and conflicting line IDs are blocked',async()=>{
  const editor=await make();
  await assert.rejects(editor.edit({expectedRevision:2,now:at(1),
    change:{kind:'set_customer',customerId:'other'}}),/STALE_DRAFT_REVISION/);
  await assert.rejects(editor.edit({expectedRevision:1,now:at(1),
    change:{kind:'line_patch',lineId:'no-such-line',patch:{quantity:'5'}}}),/INVALID_LINE_TARGET/);
  await assert.rejects(editor.edit({expectedRevision:1,now:at(1),
    change:{kind:'append_line',line:line('l1')}}),/LINE_CAP_OR_ID_COLLISION/);
  assert.equal(editor.view().draftRevision,1);
});
test('120-row finance-editor cap applies even if source extraction has 10,000 rows',async()=>{
  const max=Array.from({length:120},(_,i)=>line('row-'+i));
  const editor=await make({lineItems:max});
  await assert.rejects(editor.edit({expectedRevision:1,now:at(1),
    change:{kind:'append_line',line:line('row-120')}}),/LINE_CAP_OR_ID_COLLISION/);
  await assert.rejects(newReviewDraft(draftArgs({lineItems:[...max,line('overflow')]})),
    /INVALID_NEW_DRAFT/);
  assert.equal(editor.view().lineItems.length,120);
});
test('explicit review needs all stable row IDs, selected customer, exact currency and role',async()=>{
  const editor=await make();
  await assert.rejects(review(editor,{checkedLineIds:['l1']}),/NOT_ALL_LINE_ITEMS_REVIEWED/);
  await assert.rejects(review(editor,{actorId:'foreign'}),/STALE_OR_FOREIGN_REVIEW/);
  await assert.rejects(review(editor,{businessValidationPassed:false}),/FINANCIAL_REVIEW_NOT_AUTHORIZED/);
  const rejected=await make({scope:scope({scopeType:'personal'})});
  await assert.rejects(review(rejected),/FINANCIAL_REVIEW_NOT_AUTHORIZED/);
  assert.equal(editor.view().status,'needs_review');
});
test('blank selling price remains a blocker even if user marks all rows reviewed',async()=>{
  const editor=await make({lineItems:[line('a','4',null)]});
  await assert.rejects(review(editor),/INCOMPLETE_DRAFT/);
  assert.equal(editor.view().lineItems[0].sellingUnitPrice,null);
});
test('mixed currency and bad quantity cannot be promoted to approval',async()=>{
  const editor=await make({lineItems:[line('a','2','10'),{...line('b','5','2'),currency:'EUR'}]});
  await assert.rejects(review(editor),/INCOMPLETE_DRAFT/);
  const bad=await make({lineItems:[line('a','0','10')]});
  await assert.rejects(review(bad),/INCOMPLETE_DRAFT/);
});
test('R02 unverified/missing/partial coverage blocks review and source evidence claims',async()=>{
  const editor=await make({sourceIds:['doc-one']});
  await assert.rejects(review(editor),/SOURCE_COVERAGE_MISMATCH/);
  const d=editor.view();
  const coverage={
    schemaVersion:1,scope:d.scope,coverageId:'coverage1',documentId:'doc-one',
    extractionRunId:'run1',sourceSha256:H,expectedPageCount:1,observedPageCount:1,
    expectedSheets:[],observedSheets:[],expectedTableRows:[],observedTableRows:[],
    perSegment:[{segmentId:'page:1',expected:true,read:true,parsed:true,
      validated:false,missingLocatorIds:[],duplicateLocatorIds:[],
      status:'needs_review',failureCode:null}],
    status:'needs_review',unprocessedSegments:[],unresolvedRows:[],
    blockers:[],methodSummary:'synthetic OCR',verifiedAt:null,
  };
  await assert.rejects(review(editor,{currentSourceCoverages:[coverage]}),/SOURCE_NOT_FULLY_VERIFIED/);
  await assert.rejects(review(editor,{currentSourceCoverages:[{
    ...coverage,status:'complete',verifiedAt:NOW,
    perSegment:coverage.perSegment.map(x=>({...x,status:'complete',validated:true})),
    scope:scope({companyId:'foreign'}),
  }]}),/SOURCE_NOT_FULLY_VERIFIED/);
});
test('manifest revision mismatch blocks otherwise complete synthetic source review',async()=>{
  const editor=await make();
  await assert.rejects(review(editor,{
    trustedSourceManifestHash:'b'.repeat(64),
  }),/SOURCE_MANIFEST_CHANGED/);
});
test('document-derived quote cannot be ready until each selling price has explicit verified evidence',async()=>{
  const editor=await make({sourceIds:['uploaded-file-1']});
  const d=editor.view();
  const coverage={
    schemaVersion:1,scope:d.scope,coverageId:'cov',documentId:'uploaded-file-1',
    extractionRunId:'run1',sourceSha256:H,expectedPageCount:1,observedPageCount:1,
    expectedSheets:[],observedSheets:[],expectedTableRows:[],observedTableRows:[],
    perSegment:[{segmentId:'page:1',expected:true,read:true,parsed:true,
      validated:true,missingLocatorIds:[],duplicateLocatorIds:[],
      status:'complete',failureCode:null}],
    status:'complete',unprocessedSegments:[],unresolvedRows:[],
    blockers:[],methodSummary:'synthetic human checked',verifiedAt:NOW,
  };
  await assert.rejects(review(editor,{
    currentSourceCoverages:[coverage],
  }),/LINE_SOURCE_EVIDENCE_REQUIRED/);
});
test('same approval ID with altered UI interaction is collision not duplicate acknowledgement',async()=>{
  const editor=await make();const d=await review(editor),{gate}=await gateFor(editor);
  const initial=approveInput(d);
  await gate.issue(initial);
  const modified={...initial,approval:{...initial.approval,interactionId:'button-2'}};
  await assert.rejects(gate.issue(modified),/APPROVAL_OPERATION_COLLISION/);
});
test('approved review rotates revision and integrity hash; undo and redo do not resurrect approval',async()=>{
  const editor=await make();
  const ready=await review(editor);
  assert.equal(ready.status,'ready_for_approval');
  assert.equal(ready.businessValidation.valid,true);
  assert.ok(ready.fieldStatus.every(x=>x.status==='verified'));
  assert.equal(ready.draftRevision,2);
  await assertDraftIntegrity(ready);
  const undo=await editor.undo(2,at(4));
  assert.equal(undo.draftRevision,3);assert.equal(undo.status,'needs_review');
  assert.equal(undo.approvalReceiptId,null);
  const redo=await editor.redo(3,at(5));
  assert.equal(redo.draftRevision,4);assert.equal(redo.status,'needs_review');
  assert.equal(redo.approvalReceiptId,null);
  assert.notEqual(ready.immutableRevisionHash,redo.immutableRevisionHash);
});
test('approval can only be issued with an explicit matching UI review event',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate}=await gateFor(editor);
  const rejected=approveInput(d);
  await assert.rejects(gate.issue({...rejected,approval:{...rejected.approval,
    control:'accept_the_model_suggestion'}}),/EXPLICIT_HUMAN_APPROVAL_REQUIRED/);
  await assert.rejects(gate.issue({...rejected,approval:{...rejected.approval,
    reviewedDraftHash:'f'.repeat(64)}}),/REVIEWED_DRAFT_CHANGED/);
  const receipt=await gate.issue(rejected);
  assert.equal(receipt.approvalAction,'accepted');
  assert.equal(receipt.draftRevision,d.draftRevision);
  assert.equal(receipt.immutableRevisionHash,d.immutableRevisionHash);
  assert.ok(/^[0-9a-f]{64}$/.test(receipt.serverIntegrityTag));
  assert.equal(receipt.consumedAt,null);
});
test('same approval is idempotent under parallel requests; operation collision rejected',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate}=await gateFor(editor);
  const args=approveInput(d);
  const results=await Promise.all(Array.from({length:8},()=>gate.issue(args)));
  assert.equal(new Set(results.map(x=>x.serverIntegrityTag)).size,1);
  await assert.rejects(gate.issue({...args,operationId:'different-op'}),
    /APPROVAL_OPERATION_COLLISION/);
  await assert.rejects(gate.issue({...args,approvalId:'other-approval'}),
    /APPROVAL_OPERATION_COLLISION/);
});
test('approval proves only read-only planning, not live financial write permission',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate}=await gateFor(editor);
  await gate.issue(approveInput(d));
  const checked=await gate.verify({scope:d.scope,approvalId:'approval1',
    draftId:d.draftId,businessRevision:'vault-r1',now:at(4)});
  assert.equal(checked.eligibleForReadOnlyPlanning,true);
  assert.equal(checked.liveExecutionAuthorized,false);
  assert.throws(()=>gate.execute(),/R04_LIVE_EXECUTION_DISABLED/);
});
test('changed business revision blocks issuing or reusing approval',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate,businessChange}=await gateFor(editor);
  businessChange('vault-r2');
  await assert.rejects(gate.issue(approveInput(d)),/BUSINESS_REVISION_CHANGED/);
  businessChange('vault-r1');
  await gate.issue(approveInput(d));
  businessChange('vault-r2');
  await assert.rejects(gate.verify({scope:d.scope,approvalId:'approval1',
    draftId:d.draftId,businessRevision:'vault-r1',now:at(4)}),
    /BUSINESS_REVISION_CHANGED/);
});
test('editing a reviewed document invalidates the previously issued receipt',async()=>{
  const editor=await make();const reviewed=await review(editor);
  const {gate,refresh}=await gateFor(editor);
  await gate.issue(approveInput(reviewed));
  await editor.edit({expectedRevision:2,now:at(4),
    change:{kind:'line_patch',lineId:'l2',patch:{sellingUnitPrice:'19'}}});
  refresh();
  await assert.rejects(gate.verify({scope:scope(),approvalId:'approval1',
    draftId:'draft-1',businessRevision:'vault-r1',now:at(5)}),
    /DRAFT_NOT_REVIEWED_OR_SCOPE_MISMATCH/);
});
test('rejected and revoked approvals leave durable-in-process tombstones',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate}=await gateFor(editor);
  await gate.issue(approveInput(d));
  const revoked=await gate.invalidate({scope:d.scope,approvalId:'approval1',
    actorId:d.scope.actorId,action:'revoked',now:at(5)});
  assert.equal(revoked.approvalAction,'revoked');assert.equal(revoked.revokedAt,at(5));
  await assert.rejects(gate.verify({scope:d.scope,approvalId:'approval1',
    draftId:d.draftId,businessRevision:'vault-r1',now:at(6)}),
    /APPROVAL_INVALID_EXPIRED_OR_REVOKED/);
  await assert.rejects(gate.invalidate({scope:d.scope,approvalId:'approval1',
    actorId:d.scope.actorId,action:'revoked',now:at(7)}),
    /APPROVAL_TERMINAL_TOMBSTONE/);
  await assert.rejects(gate.issue(approveInput(d)),/APPROVAL_TERMINAL_TOMBSTONE/);
});
test('expiry and changed role/branch/company/actor reject receipt reuse',async()=>{
  const editor=await make();const d=await review(editor);
  const {gate}=await gateFor(editor);
  await gate.issue(approveInput(d));
  await assert.rejects(gate.verify({scope:d.scope,approvalId:'approval1',
    draftId:d.draftId,businessRevision:'vault-r1',now:'2026-10-30T15:03:00.000Z'}),
    /APPROVAL_INVALID_EXPIRED_OR_REVOKED/);
  for(const changed of [{branchId:'different'},{companyId:'different'},
    {role:'sales'},{actorId:'different'},{authorizationVersion:2}]){
    await assert.rejects(gate.verify({scope:scope(changed),approvalId:'approval1',
      draftId:d.draftId,businessRevision:'vault-r1',now:at(5)}),
      /APPROVAL_INVALID_EXPIRED_OR_REVOKED/);
  }
});
test('viewer, personal mode and sales role without independent finance ACL cannot approve',async()=>{
  for(const changed of [{scopeType:'personal'},{role:'viewer'},{role:'purchasing'}]){
    const editor=await make({scope:scope(changed)});
    const {gate}=await gateFor(editor);
    const d=editor.view();
    await assert.rejects(gate.issue(approveInput(d)),/FINANCIAL_ROLE_OR_SCOPE_DENIED|DRAFT_NOT_REVIEWED_OR_SCOPE_MISMATCH/);
  }
  const editor=await make();const d=await review(editor);
  const {gate,disable}=await gateFor(editor);disable();
  await assert.rejects(gate.issue(approveInput(d)),/FINANCIAL_ROLE_OR_SCOPE_DENIED/);
});
test('tool policy permits only exact allowlisted read/calculate/prepare with real server permission',()=>{
  const prepared=decideToolCall({scope:scope(),mode:'controller',
    call:toolCall(),authoritativePermissions:permission(),trustedSourceStatuses:[]});
  assert.equal(prepared.permitted,true);
  assert.equal(prepared.needsHumanReview,true);
  assert.equal(prepared.liveFinancialWritesEnabled,false);
  const advisor=decideToolCall({scope:scope(),mode:'advisor',call:toolCall(),
    authoritativePermissions:permission(),trustedSourceStatuses:[]});
  assert.equal(advisor.reason,'ADVISOR_READ_ONLY');
  const noPermission=decideToolCall({scope:scope(),mode:'controller',call:toolCall(),
    authoritativePermissions:new Set(),trustedSourceStatuses:[]});
  assert.equal(noPermission.reason,'MISSING_SERVER_PERMISSION');
});
test('model requested execution, wrong scope and incomplete source cannot be routed',()=>{
  const execute=toolCall({operationType:'execute',toolId:'document.createDraft',
    expectedBusinessRevision:'vault-r1',approvalReceiptId:'approval1'});
  const r=decideToolCall({scope:scope(),mode:'controller',call:execute,
    authoritativePermissions:permission(),trustedSourceStatuses:[]});
  assert.equal(r.permitted,false);
  const other=decideToolCall({scope:scope(),mode:'controller',
    call:toolCall({scope:scope({companyId:'other'})}),
    authoritativePermissions:permission(),trustedSourceStatuses:[]});
  assert.equal(other.reason,'TOOL_SCOPE_MISMATCH');
  const incomplete=decideToolCall({scope:scope(),mode:'controller',call:toolCall(),
    authoritativePermissions:permission(),
    trustedSourceStatuses:[{sourceId:'file1',complete:false}]});
  assert.equal(incomplete.reason,'UNVERIFIED_SOURCE_COVERAGE');
});
