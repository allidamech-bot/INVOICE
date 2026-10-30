import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R06_NEXT_CONVERSATION_ENABLED,R06_MAX_VISIBLE_MESSAGES,
  R06_MAX_ATTACHMENTS_PER_SELECTION,R06_FINANCE_EDITOR_LINE_LIMIT,
  r06DocumentState,r06DocumentLabel,r06ObservedProgress,r06DraftBlockers,
  r06VisibleMemories,assertR06Scope,
} from '../../dist/src/ai-next/ui/view-model.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const scope={
  ownerUid:'owner',accountId:'acct',companyId:'co',branchId:'br',
  threadId:'th',actorId:'actor',role:'owner',scopeType:'business',
  authorizationVersion:1,
};
const coverage=(status='complete')=>({status,expectedPageCount:35,observedPageCount:35});
const attachment=(overrides={})=>({
  sourceId:'source-1',scopeKey:exactScopeKey(scope),fileName:'عرض.pdf',format:'PDF',
  upload:'uploaded',parse:'parsed',coverage:coverage(),
  humanReview:'verified',serverAuthorizedForQuotation:true,
  selected:true,errorCode:null,...overrides,
});
const view=(overrides={})=>({
  scope,threadId:'th',messages:[],attachments:[attachment()],
  currentTask:null,draft:null,memories:[],...overrides,
});
test('R06 standalone app remains disabled until explicit release',()=>{
  assert.equal(R06_NEXT_CONVERSATION_ENABLED,false);
  assert.equal(R06_MAX_ATTACHMENTS_PER_SELECTION,10);
  assert.equal(R06_FINANCE_EDITOR_LINE_LIMIT,120);
  assert.equal(R06_MAX_VISIBLE_MESSAGES,80);
});
test('successfully uploaded is not falsely reported as parsed',()=>{
  assert.equal(r06DocumentState(attachment({parse:'not_started',coverage:null})),'uploaded');
  assert.match(r06DocumentLabel('uploaded'),/لم تُفحص/);
});
test('parsing progress cannot become quotation ready',()=>{
  assert.equal(r06DocumentState(attachment({parse:'parsing'})),'parsing');
  assert.equal(r06DocumentState(attachment({upload:'uploading'})),'upload_pending');
});
test('partial and unreviewed documents block ready status',()=>{
  assert.equal(r06DocumentState(attachment({parse:'partial'})),'partial');
  assert.equal(r06DocumentState(attachment({coverage:coverage('partial')})),'partial');
  assert.equal(r06DocumentState(attachment({humanReview:'needs_review'})),'needs_review');
  assert.equal(r06DocumentState(attachment({serverAuthorizedForQuotation:false})),'needs_review');
});
test('only verified, complete, server-authorized attachment becomes quote-ready label',()=>{
  assert.equal(r06DocumentState(attachment()),'ready_for_quotation');
});
test('malformed failed upload and parse statuses are visible as blocked',()=>{
  assert.equal(r06DocumentState(attachment({upload:'failed'})),'blocked');
  assert.equal(r06DocumentState(attachment({parse:'failed'})),'blocked');
});
test('no fictional progress when task has no observed completion',()=>{
  assert.equal(r06ObservedProgress(null),null);
  assert.equal(r06ObservedProgress({progress:{completedUnits:0,totalUnits:null,unitType:'pages'}}),null);
  assert.equal(r06ObservedProgress({progress:{completedUnits:8,totalUnits:35,unitType:'pages'}}),'8 / 35 pages');
  assert.throws(()=>r06ObservedProgress({progress:{completedUnits:36,totalUnits:35,unitType:'pages'}}),
    /R06_INVALID_PROGRESS/);
});
test('different company, thread and source cannot render under current scope',()=>{
  assert.doesNotThrow(()=>assertR06Scope(view(),scope));
  assert.throws(()=>assertR06Scope(view({threadId:'other'}),scope),/SCOPE_MISMATCH/);
  assert.throws(()=>assertR06Scope(view({scope:{...scope,companyId:'other'}}),scope),/SCOPE_MISMATCH/);
  assert.throws(()=>assertR06Scope(view({attachments:[attachment({scopeKey:'other'})]}),scope),/SCOPE_MISMATCH/);
  assert.throws(()=>assertR06Scope(view({memories:[{memoryId:'m',scopeKey:'other',
    approved:true,text:'test',expiresAt:null,revokedAt:null}]}),scope),/SCOPE_MISMATCH/);
});
test('long-term memory shown only while approved, unexpired and not revoked',()=>{
  const key=exactScopeKey(scope),now='2026-10-30T16:00:00.000Z';
  const base={scopeKey:key,approved:true,revokedAt:null,expiresAt:null,text:'synthetic'};
  const v=view({memories:[
    {memoryId:'ok',...base},
    {memoryId:'unapproved',...base,approved:false},
    {memoryId:'expired',...base,expiresAt:'2026-10-29T00:00:00.000Z'},
    {memoryId:'revoked',...base,revokedAt:'2026-10-30T00:00:00.000Z'},
  ]});
  assert.deepEqual(r06VisibleMemories(v,now).map(m=>m.memoryId),['ok']);
});
test('draft is not approvable solely because line count is within limit',()=>{
  const draft={status:'needs_review',businessValidation:{valid:false,blockers:['CUSTOMER_REQUIRED']},
    lineItems:[]};
  assert.deepEqual(r06DraftBlockers(draft),['CUSTOMER_REQUIRED','REVIEW_REQUIRED']);
});
test('draft with over 120 items explicitly blocks review rather than truncating',()=>{
  const draft={status:'ready_for_approval',businessValidation:{valid:true,blockers:[]},
    lineItems:Array.from({length:121},(_,i)=>({lineId:'line-'+i}))};
  assert.deepEqual(r06DraftBlockers(draft),['EDITOR_120_LINES_LIMIT']);
});
