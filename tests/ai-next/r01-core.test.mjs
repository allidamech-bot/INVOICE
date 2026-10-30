import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_CONTRACT_NAMES,
  AI_NEXT_SCHEMA_VERSION,
} from '../../dist/src/ai-next/domain/contracts.js';
import {
  validateCoreContract, assertCoreContract, validateAuthenticatedScope,
} from '../../dist/src/ai-next/domain/validation.js';
import {
  canTransition, transitionTask, requestCancellation, restartRequiresNewTask,
} from '../../dist/src/ai-next/domain/state-machine.js';
import {
  SyntheticTurnJournal, exactScopeKey,
} from '../../dist/src/ai-next/domain/turn-journal.js';
import {
  resolveSourcePolicy, resolveDraftItemReference,
} from '../../dist/src/ai-next/domain/source-reference.js';

const TS = '2026-10-30T12:00:00.000Z';
const later = n => '2026-10-30T12:00:'+String(n).padStart(2,'0')+'.000Z';
const H = 'a'.repeat(64);
const scope = (overrides={}) => ({
  ownerUid:'synthetic-owner-1',accountId:'acct1',companyId:'co1',branchId:'br1',
  threadId:'th1',actorId:'user1',role:'owner',scopeType:'business',
  authorizationVersion:1,...overrides,
});
const base = () => ({schemaVersion:1,scope:scope()});
const makeTask = (overrides={}) => ({
  ...base(),taskId:'task1',threadId:'th1',turnId:'turn1',taskType:'conversation',
  state:'created',revision:0,stateVersion:0,startedAt:TS,updatedAt:TS,completedAt:null,
  stageIndex:0,progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:TS},
  currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,lastError:null,
  cancellable:true,retryPolicy:'safe_only',executionOperationId:null,...overrides,
});
const makeTurn = () => ({
  ...base(),turnId:'turn1',threadId:'th1',userMessageId:'m1',requestId:'r1',
  idempotencyKey:'idem1',sequenceNumber:1,parentTurnId:null,
  userMessage:{text:'السلام عليكم',languageHint:'ar',attachedSourceIds:[]},
  mode:'controller',receivedAt:TS,stateVersion:0,selectedSourceIds:[],
  taskId:'task1',lifecycle:'received',outputResultId:null,
});
const makeCoverage = (overrides={}) => ({
  ...base(),coverageId:'cov1',documentId:'doc1',extractionRunId:'run1',sourceSha256:H,
  expectedPageCount:1,observedPageCount:1,expectedSheets:[],observedSheets:[],
  expectedTableRows:[{tableId:'table1',count:1}],observedTableRows:[{tableId:'table1',count:1}],
  perSegment:[{segmentId:'page1',expected:true,read:true,parsed:true,validated:true,
    missingLocatorIds:[],duplicateLocatorIds:[],status:'complete',failureCode:null}],
  status:'complete',unprocessedSegments:[],unresolvedRows:[],blockers:[],
  methodSummary:'synthetic',verifiedAt:TS,...overrides,
});
const makeEvidence = () => ({
  ...base(),evidenceId:'ev1',documentId:'doc1',fileObjectId:'file1',sourceSha256:H,
  documentRevision:1,extractionRunId:'run1',
  locator:{pageNumber:1,sheetName:null,tableId:'table1',rowId:'row1',
    columnId:null,cellReference:null,segmentIndex:0,boundingBox:null},
  fieldName:'price',rawValue:'مفقود',normalizedValue:null,normalizedUnit:null,currency:null,
  language:'ar',extractionMethod:'selectable_text',provenanceStatus:'missing',
  confidence:0.5,conflictsWithEvidenceIds:[],correctionOfEvidenceId:null,
  createdAt:TS,verifiedBy:null,
});
const makeIntent = () => ({
  ...base(),intentId:'intent1',turnId:'turn1',action:'prepare_quote',subjectRef:null,
  sourcePolicy:'uploaded_only',referencedSourceIds:['file1'],argumentFacts:[],
  unresolvedReferences:[],missingFields:['selling_price'],contradictoryFields:[],
  executable:false,confidence:0.75,
});
const makeModel = () => ({
  ...base(),assessmentId:'assess1',evaluatedAt:TS,
  model:{providerId:'provider1',modelId:'model1',registryVersion:'v1',
    supportedCapabilities:['text'],modalityLimits:{maxImages:0,maxPages:null},
    contextWindow:16384},
  requestNeeds:{taskType:'dialogue',inputModalities:['text'],inputEstimateTokens:100,
    requiredOutputSchema:'text',privacyClass:'public_synthetic'},
  accountEligibility:'free_verified',priceEligibility:'verified_zero',privacyEligibility:'approved',
  capabilityEligible:true,healthEligible:true,eligible:true,reasons:[],
  budget:{maxRequests:2,timeoutMs:20000,maxAllowedCost:'0'},
  fallbackGroupId:null,
});
const makeTool = () => ({
  ...base(),toolCallId:'tool1',taskId:'task1',toolId:'products.search',toolSchemaVersion:1,
  operationType:'read',validatedInput:{q:'synthetic'},validatedInputHash:H,
  requiredPermissions:['read'],evidenceIds:[],sourceCompletenessStatus:'complete',
  idempotencyKey:'t1',expectedBusinessRevision:null,approvalReceiptId:null,
  preconditions:[],state:'validated',resultRef:null,errorCategory:null,
});
const makeDraft = () => ({
  ...base(),draftId:'draft1',draftRevision:1,threadId:'th1',kind:'quotation',
  status:'unsaved',sourceIds:['file1'],sourceManifestHash:H,
  lineItems:[{lineId:'line1',description:'Item A',quantity:'2',unit:'PCS',
    sellingUnitPrice:null,currency:'USD',evidenceRefs:['ev1']}],
  explicitCustomerId:'customer1',currency:'USD',
  fieldStatus:[{field:'selling_price',status:'missing'}],
  immutableRevisionHash:H,createdAt:TS,updatedAt:TS,undoBaseRevision:null,
  editEvents:[],businessValidation:{valid:false,blockers:['missing_price']},
  approvalReceiptId:null,
});
const makeApproval = () => ({
  ...base(),approvalReceiptId:'approval1',taskId:'task1',
  actorId:'user1',verifiedRole:'owner',authPolicyVersion:1,toolId:'quote.save',
  operationId:'operation1',draftId:'draft1',draftRevision:1,
  immutableRevisionHash:H,sourceManifestHash:H,expectedBusinessRevision:'v3',
  issuedAt:TS,expiresAt:later(55),revokedAt:null,approvalAction:'accepted',
  serverIntegrityTag:'synthetic-server-token-do-not-use',consumedAt:null,executionResultRef:null,
});
const makeResult = () => ({
  ...base(),resultId:'res1',turnId:'turn1',taskId:'task1',status:'review_required',
  answer:'Missing selling prices',evidenceIds:['ev1'],coverageIds:['cov1'],
  sourceIds:['file1'],draftRef:'draft1',approvalRef:null,businessResultRef:null,
  verifiedActions:[],missingFacts:['selling_price'],warnings:[],diagnosticsRef:null,
  createdAt:TS,finalStateVersion:3,
});
const fixtures = {
  ConversationTurn:makeTurn,GroundedIntent:makeIntent,
  DocumentEvidence:makeEvidence,Coverage:makeCoverage,TaskState:makeTask,
  ModelEligibility:makeModel,ToolCall:makeTool,ReviewDraft:makeDraft,
  ApprovalReceipt:makeApproval,TurnResult:makeResult,
};

test('R01 declares exactly 10 versioned contracts',()=>{
  assert.equal(AI_NEXT_SCHEMA_VERSION,1);
  assert.equal(CORE_CONTRACT_NAMES.length,10);
  assert.equal(Object.keys(fixtures).length,10);
  for(const name of CORE_CONTRACT_NAMES){
    const sample=fixtures[name]();
    assert.deepEqual(validateCoreContract(name,sample),{ok:true,value:sample},name);
    assert.strictEqual(assertCoreContract(name,sample),sample);
  }
});
test('each contract rejects absent/future schema version, unknown field and nested extensions',()=>{
  for(const name of CORE_CONTRACT_NAMES){
    const sample=fixtures[name]();
    for(const changed of [{...sample,schemaVersion:2},{...sample,schemaVersion:undefined},
      {...sample,unexpectedTrustFlag:true}])
      assert.equal(validateCoreContract(name,changed).ok,false,name);
    assert.equal(validateCoreContract(name,{...sample,scope:{...scope(),unexpected:true}}).ok,false,name);
    assert.equal(validateCoreContract(name,JSON.parse(JSON.stringify(sample))).ok,true,name);
  }
});
test('scope rejects unverified/malformed role and owner changes',()=>{
  assert.equal(validateAuthenticatedScope(scope()),true);
  assert.equal(validateAuthenticatedScope(scope({role:'root'})),false);
  assert.equal(validateAuthenticatedScope(scope({authorizationVersion:0})),false);
  assert.notEqual(exactScopeKey(scope()),exactScopeKey(scope({accountId:'foreign'})));
});
test('task cannot move to illegal or terminal transitions',()=>{
  const t=makeTask();
  assert.equal(canTransition('created','completed'),false);
  assert.throws(()=>transitionTask(t,'completed',{expectedStateVersion:0,now:later(1)}),/INVALID_STATE_TRANSITION/);
  const u=transitionTask(t,'understanding',{expectedStateVersion:0,now:later(1)});
  assert.equal(u.stateVersion,1);
  assert.equal(t.state,'created');
  assert.throws(()=>transitionTask(u,'processing',{expectedStateVersion:0,now:later(2)}),/STALE_STATE_VERSION/);
  const cancelled=requestCancellation(u,1,later(2));
  assert.equal(cancelled.state,'cancelled');
  assert.throws(()=>transitionTask(cancelled,'understanding',{expectedStateVersion:2,now:later(3)}),/INVALID_STATE_TRANSITION/);
  assert.throws(()=>restartRequiresNewTask(cancelled,cancelled.taskId),/RESTART_REQUIRES/);
  assert.doesNotThrow(()=>restartRequiresNewTask(cancelled,'replacement-task'));
});
test('financial execute is impossible from pending approval in R01',()=>{
  const t=makeTask({state:'awaiting_approval',approvalId:'approval1'});
  assert.equal(canTransition('awaiting_approval','executing'),false);
  assert.throws(()=>transitionTask(t,'executing',{expectedStateVersion:0,now:later(1)}),/INVALID_STATE_TRANSITION/);
  assert.equal(validateCoreContract('ToolCall',{...makeTool(),operationType:'execute',
    approvalReceiptId:'approval1',expectedBusinessRevision:'v1',state:'queued'}).ok,false);
  assert.equal(validateCoreContract('GroundedIntent',{...makeIntent(),action:'execute_approved',
    missingFields:[],executable:true}).ok,false);
});
test('cannot complete an incomplete or missing source',()=>{
  const t=makeTask({state:'processing',sourceIds:['file1']});
  assert.throws(()=>transitionTask(t,'completed',{expectedStateVersion:0,now:later(1)}),/INCOMPLETE_SOURCE_COVERAGE/);
  assert.throws(()=>transitionTask(t,'completed',{expectedStateVersion:0,now:later(1),
    coverage:{documentSources:[{sourceId:'file1',status:'partial'}]}}),/INCOMPLETE_SOURCE_COVERAGE/);
  const done=transitionTask(t,'completed',{expectedStateVersion:0,now:later(1),
    coverage:{documentSources:[{sourceId:'file1',status:'complete'}]}});
  assert.equal(done.completedAt,later(1));
  const partial=makeCoverage({status:'complete',unprocessedSegments:['page2']});
  assert.equal(validateCoreContract('Coverage',partial).ok,false);
  assert.equal(validateCoreContract('Coverage',makeCoverage({expectedTableRows:[{tableId:'table1',count:null}]})).ok,false);
  assert.equal(validateCoreContract('Coverage',makeCoverage({expectedPageCount:35,observedPageCount:34})).ok,false);
});
test('cancel after a started external operation is not reported as no-effect cancellation',()=>{
  const uncertain=makeTask({state:'executing',approvalId:'approval1',
    executionOperationId:'op1',cancellable:false});
  const next=requestCancellation(uncertain,0,later(1));
  assert.equal(next.state,'needs_reconciliation');
  assert.throws(()=>transitionTask(next,'completed',{expectedStateVersion:1,now:later(2)}),/UNVERIFIED_OPERATION/);
  assert.throws(()=>transitionTask(next,'failed',{expectedStateVersion:1,now:later(2)}),/UNVERIFIED_OPERATION/);
  const verified=transitionTask(next,'failed',{expectedStateVersion:1,now:later(2),
    reconciliationVerified:true});
  assert.equal(verified.state,'failed');
});
test('progress is based on observed bounded values, not arbitrary spinner',()=>{
  const t=makeTask();
  assert.throws(()=>transitionTask(t,'understanding',{expectedStateVersion:0,now:later(1),
    progress:{completedUnits:9,totalUnits:2,unitType:'steps'}}),/INVALID_PROGRESS/);
  assert.equal(validateCoreContract('TaskState',makeTask({progress:{
    completedUnits:2,totalUnits:1,unitType:'pages',observedAt:TS}})).ok,false);
});
test('source and field provenance cannot be silently marked verified',()=>{
  assert.equal(validateCoreContract('DocumentEvidence',{...makeEvidence(),
    provenanceStatus:'verified',verifiedBy:null}).ok,false);
  assert.equal(validateCoreContract('GroundedIntent',{...makeIntent(),
    missingFields:['price'],executable:true}).ok,false);
  assert.equal(validateCoreContract('ReviewDraft',{...makeDraft(),status:'ready_for_approval'}).ok,false);
  assert.equal(validateCoreContract('ReviewDraft',{...makeDraft(),
    lineItems:[makeDraft().lineItems[0],makeDraft().lineItems[0]]}).ok,false);
  assert.equal(validateCoreContract('TurnResult',{...makeResult(),
    status:'completed',verifiedActions:[{operationId:'op1',persistedObjectId:'invoice1',
      persistedObjectType:'invoice',verifiedAt:TS}]}).ok,false);
});
test('approval is bound to actor/role/version and rejected grants cannot execute',()=>{
  assert.equal(validateCoreContract('ApprovalReceipt',{...makeApproval(),actorId:'another'}).ok,false);
  assert.equal(validateCoreContract('ApprovalReceipt',{...makeApproval(),verifiedRole:'viewer'}).ok,false);
  assert.equal(validateCoreContract('ApprovalReceipt',{...makeApproval(),
    approvalAction:'revoked',consumedAt:later(1)}).ok,false);
  assert.equal(validateCoreContract('ApprovalReceipt',{...makeApproval(),expiresAt:TS}).ok,false);
});
test('eligible models must satisfy free account, privacy and health policy',()=>{
  assert.equal(validateCoreContract('ModelEligibility',makeModel()).ok,true);
  for(const changed of [{privacyEligibility:'denied'},{priceEligibility:'unknown'},
    {accountEligibility:'quota_exhausted'},{capabilityEligible:false},{healthEligible:false}])
    assert.equal(validateCoreContract('ModelEligibility',{...makeModel(),...changed}).ok,false);
});
test('synthetic journal: exact request retries are idempotent and immutable',()=>{
  const j=new SyntheticTurnJournal();
  const input={scope:scope(),requestId:'req1',idempotencyKey:'idem1',userMessageId:'msg1',
    message:'أنشئ مسودة عرض سعر',languageHint:'ar',mode:'controller'};
  const a=j.begin(input,TS);
  const b=j.begin(input,TS);
  assert.equal(a.replayed,false);
  assert.equal(b.replayed,true);
  assert.equal(a.turn.turnId,b.turn.turnId);
  a.task.state='completed';a.turn.userMessage.text='TAMPER';
  assert.equal(j.get({scope:input.scope,idempotencyKey:input.idempotencyKey}).task.state,'created');
  assert.equal(j.sizeForTests(),1);
  assert.throws(()=>j.begin({...input,message:'change to another customer'},TS),/IDEMPOTENCY_COLLISION/);
});
test('synthetic journal: same thread enforces one active owner, other tenants isolated',()=>{
  const j=new SyntheticTurnJournal();
  const input={scope:scope(),requestId:'req1',idempotencyKey:'i1',userMessageId:'m1',
    message:'السلام عليكم',languageHint:'ar',mode:'advisor'};
  const a=j.begin(input,TS);
  assert.throws(()=>j.begin({...input,idempotencyKey:'i2',userMessageId:'m2',
    requestId:'req2'},TS),/CONCURRENT_TURN/);
  assert.equal(j.get({scope:scope({companyId:'co2'}),idempotencyKey:'i1'}),null);
  const b=j.begin({...input,scope:scope({accountId:'acct2'}),idempotencyKey:'i2'},TS);
  assert.notEqual(a.turn.turnId,b.turn.turnId);
  assert.throws(()=>j.transition({scope:scope({companyId:'co2'}),
    idempotencyKey:'i1',taskId:a.task.taskId,next:'understanding',
    options:{expectedStateVersion:0,now:later(1)}}),/FORBIDDEN/);
  assert.equal(j.transition({scope:input.scope,idempotencyKey:'i1',taskId:a.task.taskId,
    next:'understanding',options:{expectedStateVersion:0,now:later(1)}}).state,'understanding');
});
test('sequential turns preserve parent identity and increasing sequence without duplication',()=>{
  const journal=new SyntheticTurnJournal();
  const input={scope:scope(),requestId:'r1',idempotencyKey:'k1',
    userMessageId:'m1',message:'مرحبا',languageHint:'ar',mode:'advisor'};
  const first=journal.begin(input,TS);
  let state=journal.transition({scope:input.scope,idempotencyKey:'k1',taskId:first.task.taskId,
    next:'understanding',options:{expectedStateVersion:0,now:later(1)}});
  state=journal.transition({scope:input.scope,idempotencyKey:'k1',taskId:first.task.taskId,
    next:'processing',options:{expectedStateVersion:1,now:later(2)}});
  state=journal.transition({scope:input.scope,idempotencyKey:'k1',taskId:first.task.taskId,
    next:'completed',options:{expectedStateVersion:2,now:later(3)}});
  const second=journal.begin({...input,requestId:'r2',idempotencyKey:'k2',
    userMessageId:'m2',message:'تابع',languageHint:'ar'},later(4));
  assert.equal(second.turn.parentTurnId,first.turn.turnId);
  assert.equal(second.turn.sequenceNumber,2);
  assert.equal(journal.sizeForTests(),2);
  assert.equal(journal.begin({...input,requestId:'r2',idempotencyKey:'k2',
    userMessageId:'m2',message:'تابع',languageHint:'ar'},later(4)).turn.turnId,second.turn.turnId);
});
test('file follow-ups never silently substitute company records',()=>{
  const s=[{sourceId:'file1',fileName:'doc.pdf',complete:true,
    scopeKey:'scoped'},{sourceId:'file2',fileName:'doc2.pdf',complete:true,scopeKey:'scoped'}];
  const q=message=>resolveSourcePolicy({message,expectedScopeKey:'scoped',
    selectedSourceIds:['file1'],sources:s});
  assert.deepEqual(q('اعرض كل المنتجات في هذا الملف'),{
    status:'resolved',policy:'uploaded_only',sourceIds:['file1']});
  assert.deepEqual(q('Show all products in my company'),{
    status:'resolved',policy:'company_only',sourceIds:[]});
  assert.equal(resolveSourcePolicy({message:'Create quotation from this file',
    expectedScopeKey:'scoped',selectedSourceIds:[],sources:s}).reason,'missing_source');
  assert.equal(resolveSourcePolicy({message:'اعرض هذا الملف',
    expectedScopeKey:'scoped',selectedSourceIds:['file1','file2'],sources:s}).reason,'ambiguous_source');
  assert.equal(resolveSourcePolicy({message:'اعرض هذا الملف',
    expectedScopeKey:'scoped',selectedSourceIds:['file1'],
    sources:[{...s[0],complete:false}]}).reason,'source_incomplete');
  assert.equal(resolveSourcePolicy({message:'اعرض هذا الملف',
    expectedScopeKey:'scoped',selectedSourceIds:['file1'],
    sources:[{...s[0],scopeKey:'another'}]}).reason,'source_scope_mismatch');
});
test('natural follow-ups keep exact draft line identity, not guessed index or stale revision',()=>{
  const stable=['a','b','c'];
  assert.deepEqual(resolveDraftItemReference({expectedRevision:2,currentRevision:2,
    lineIds:stable,ordinal:2}),{status:'resolved',lineId:'b'});
  assert.equal(resolveDraftItemReference({expectedRevision:2,currentRevision:3,
    lineIds:stable,ordinal:2}).reason,'stale_revision');
  assert.equal(resolveDraftItemReference({expectedRevision:2,currentRevision:2,
    lineIds:stable,explicitLineId:'x'}).reason,'missing_item');
  assert.equal(resolveDraftItemReference({expectedRevision:2,currentRevision:2,
    lineIds:['a','a'],ordinal:2}).reason,'ambiguous_item');
});
test('malformed nested JSON payloads and price assumptions fail contract validation',()=>{
  assert.equal(validateCoreContract('ToolCall',{...makeTool(),
    validatedInput:{data:()=>process.exit(1)}}).ok,false);
  assert.equal(validateCoreContract('ToolCall',{...makeTool(),validatedInputHash:'not_sha256'}).ok,false);
  assert.equal(validateCoreContract('ReviewDraft',{...makeDraft(),
    lineItems:[{...makeDraft().lineItems[0],sellingUnitPrice:'1e6'}]}).ok,false);
  assert.equal(validateCoreContract('ReviewDraft',{...makeDraft(),
    lineItems:[{...makeDraft().lineItems[0],currency:'SYP',sellingUnitPrice:'25'}],
    fieldStatus:[{field:'selling_price',status:'verified'}],
    status:'ready_for_approval',businessValidation:{valid:true,blockers:[]}}).ok,false);
  assert.equal(validateCoreContract('ReviewDraft',{...makeDraft(),
    lineItems:[{...makeDraft().lineItems[0],currency:'USD',sellingUnitPrice:'25'}],
    fieldStatus:[{field:'selling_price',status:'verified'}],
    status:'ready_for_approval',businessValidation:{valid:true,blockers:[]}}).ok,true);
  // No implicit currency conversion: a line must already match the draft currency.
});
