import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopedConversationLedger,SyntheticAtomicEventBackend,projectEvents,MAX_R03_EVENTS} from '../../dist/src/ai-next/conversation-state/event-store.js';
import {ScopedKnowledgeService,SyntheticKnowledgeBackend,knowledgeScopeKey} from '../../dist/src/ai-next/conversation-state/knowledge.js';
import {authorizeConversationRequest} from '../../dist/src/ai-next/conversation-state/auth-boundary.js';
import {prepareContext,classifyResume} from '../../dist/src/ai-next/conversation-state/context.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const T='2026-10-30T14:00:00.000Z';
const at=n=>'2026-10-30T14:00:'+String(n).padStart(2,'0')+'.000Z';
const H='b'.repeat(64);
const scope=(opts={})=>({ownerUid:'synthetic-owner',accountId:'acc1',companyId:'company1',
  branchId:'branch1',threadId:'thread1',actorId:'synthetic-owner',
  role:'owner',scopeType:'business',authorizationVersion:1,...opts});
const makeTurn=(s=scope(),opts={})=>({
  schemaVersion:1,scope:s,turnId:'turn1',threadId:s.threadId,userMessageId:'u1',
  requestId:'req1',idempotencyKey:'turnKey1',sequenceNumber:1,parentTurnId:null,
  userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},mode:'controller',
  receivedAt:T,stateVersion:0,selectedSourceIds:[],taskId:'task1',
  lifecycle:'received',outputResultId:null,...opts,
});
const makeTask=(s=scope(),opts={})=>({
  schemaVersion:1,scope:s,taskId:'task1',threadId:s.threadId,turnId:'turn1',
  taskType:'conversation',state:'created',revision:0,stateVersion:0,
  startedAt:T,updatedAt:T,completedAt:null,stageIndex:0,
  progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:T},
  currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
  lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,...opts,
});
const append=(ledger,s=scope(),body,eid='evt1',key='idem1',now=T,expectedRevision=0)=>
  ledger.append({scope:s,expectedRevision,eventId:eid,idempotencyKey:key,body,now});
const begin=async (l,s=scope())=>append(l,s,{
  kind:'turn_started',turn:makeTurn(s),task:makeTask(s),
});
test('R03 starts empty, immutable snapshot; a stored turn survives new service instances',async()=>{
  const backend=new SyntheticAtomicEventBackend();
  const ledgerA=new ScopedConversationLedger(backend),s=scope();
  const started=await begin(ledgerA,s);
  assert.equal(started.snapshot.revision,1);
  assert.equal(started.snapshot.turns[0].userMessage.text,'مرحبا');
  const ledgerB=new ScopedConversationLedger(backend);
  const reopened=await ledgerB.snapshot(s);
  assert.deepEqual(reopened,started.snapshot);
  assert.equal(reopened.tasks[0].state,'created');
  assert.equal(reopened.scopeKey,exactScopeKey(s));
});
test('retrying exactly the same append never duplicates a turn or increments revision',async()=>{
  const backend=new SyntheticAtomicEventBackend(),ledger=new ScopedConversationLedger(backend),s=scope();
  const body={kind:'turn_started',turn:makeTurn(s),task:makeTask(s)};
  const a=await append(ledger,s,body);
  const b=await append(ledger,s,body,'evt1','idem1',T,0);
  assert.equal(a.replayed,false);assert.equal(b.replayed,true);
  assert.equal(a.event.hash,b.event.hash);
  assert.equal((await ledger.snapshot(s)).revision,1);
  await assert.rejects(append(ledger,s,{...body,turn:{...body.turn,
    userMessage:{...body.turn.userMessage,text:'change customer'}}}),/IDEMPOTENCY_COLLISION/);
});
test('parallel duplicate append is exactly one atomic committed event',async()=>{
  const backend=new SyntheticAtomicEventBackend(),ledger=new ScopedConversationLedger(backend);
  const s=scope(),body={kind:'turn_started',turn:makeTurn(s),task:makeTask(s)};
  const results=await Promise.all(Array.from({length:12},()=>append(ledger,s,body)));
  assert.equal(results.filter(r=>r.replayed).length,11);
  assert.equal((await ledger.snapshot(s)).revision,1);
});
test('distinct simultaneous writes to one revision allow exactly one, no lost update',async()=>{
  const ledger=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(ledger);
  const a=append(ledger,scope(),{kind:'message',messageId:'m1',
    turnId:'turn1',role:'user',text:'First',sourceIds:[]},'ev2','k2',at(1),1);
  const b=append(ledger,scope(),{kind:'message',messageId:'m2',
    turnId:'turn1',role:'user',text:'Second',sourceIds:[]},'ev3','k3',at(1),1);
  const outcomes=await Promise.allSettled([a,b]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.match(String(outcomes.find(x=>x.status==='rejected').reason),/STALE_EVENT_REVISION/);
  assert.equal((await ledger.snapshot(scope())).messages.length,1);
});
test('same eventId cannot be reused to disguise a different action',async()=>{
  const ledger=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(ledger);
  await assert.rejects(append(ledger,scope(),{kind:'message',messageId:'m1',turnId:'turn1',
    role:'assistant',text:'Hello',sourceIds:[]},'evt1','another',at(1),1),
  /DUPLICATE_EVENT_ID/);
});
test('tenant/branch/role/thread/authorization epoch strictly isolate stored thread events',async()=>{
  const ledger=new ScopedConversationLedger(new SyntheticAtomicEventBackend());
  await begin(ledger);
  for(const s of [scope({ownerUid:'other',actorId:'other'}),
    scope({accountId:'acc2'}),scope({companyId:'company2'}),
    scope({branchId:'branch2'}),scope({threadId:'thread2'}),
    scope({role:'viewer'}),scope({authorizationVersion:2})]){
    assert.equal((await ledger.snapshot(s)).revision,0);
    assert.equal((await ledger.snapshot(s)).turns.length,0);
  }
});
test('event hash corruption, reordering and forged body are detected, never silently loaded',async()=>{
  const b=new SyntheticAtomicEventBackend(),l=new ScopedConversationLedger(b);await begin(l);
  const key=exactScopeKey(scope());
  b.corruptForTest(key,r=>({...r,events:r.events.map((event,i)=>i===0?{
    ...event,body:{kind:'message',messageId:'forged',turnId:'turn1',
      role:'assistant',text:'Invented',sourceIds:[]}
  }:event)}));
  await assert.rejects(l.snapshot(scope()),/DAMAGED_EVENT_HASH/);
});
test('invalid transitions are rejected even if injected as event payload directly',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  const task=makeTask(scope(),{state:'executing',stateVersion:1,revision:1,
    approvalId:'fake',executionOperationId:'op',updatedAt:at(1),
    cancellable:false});
  await assert.rejects(append(l,scope(),{kind:'task_updated',task},
    'ev2','k2',at(1),1),/UNAUTHORIZED_TASK_TRANSITION/);
  const unchanged=await l.snapshot(scope());assert.equal(unchanged.revision,1);
});
test('valid task transitions retain checkpoints and never auto retry writes',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  const progress=await l.transitionTask({scope:scope(),taskId:'task1',
    expectedStateVersion:0,expectedRevision:1,nextState:'understanding',
    now:at(1),eventId:'e2',idempotencyKey:'k2'});
  assert.equal(progress.snapshot.tasks[0].state,'understanding');
  const cp=await append(l,scope(),{kind:'checkpoint',taskId:'task1',
    checkpointId:'cp1',sourceIds:[],referenceHash:H,stage:'thinking'},
  'e3','k3',at(2),2);
  assert.equal(cp.snapshot.checkpointRefs[0].checkpointId,'cp1');
  assert.equal(classifyResume(cp.snapshot)[0].resume,'read_only_rehydrate');
  await assert.rejects(l.transitionTask({scope:scope(),taskId:'task1',
    expectedStateVersion:0,expectedRevision:3,nextState:'processing',
    now:at(3),eventId:'e4',idempotencyKey:'k4'}),/STALE_STATE_VERSION/);
  assert.equal((await l.snapshot(scope())).revision,3);
});
test('repeated task transition with the same event ID is an idempotent response, not stale-state failure',async()=>{
  const ledger=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(ledger);
  const args={scope:scope(),taskId:'task1',expectedStateVersion:0,
    expectedRevision:1,nextState:'understanding',now:at(1),
    eventId:'move1',idempotencyKey:'transition-idem'};
  const a=await ledger.transitionTask(args);
  const b=await ledger.transitionTask(args);
  assert.equal(a.replayed,false);
  assert.equal(b.replayed,true);
  assert.equal(b.snapshot.revision,2);
  await assert.rejects(ledger.transitionTask({...args,nextState:'processing'}),
    /IDEMPOTENCY_COLLISION/);
  assert.equal((await ledger.snapshot(scope())).tasks[0].state,'understanding');
});
test('uncertain operation event overrides read-only recovery classification',async()=>{
  const ledger=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(ledger);
  const result=await append(ledger,scope(),{
    kind:'uncertain_execution',taskId:'task1',operationId:'finance-op-1',
    reasonCode:'OUTCOME_UNKNOWN'},'uncertain1','uncertainIdem',at(1),1);
  assert.equal(result.snapshot.uncertainOperations.length,1);
  assert.equal(classifyResume(result.snapshot)[0].resume,'reconcile_first');
});
test('uncertain operation cannot be transformed into success or cancelled guarantee',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  const uncertain=makeTask(scope(),{state:'completed',revision:1,stateVersion:1,
    updatedAt:at(1),completedAt:at(1),executionOperationId:'op-unknown'});
  await assert.rejects(append(l,scope(),{kind:'task_updated',task:uncertain},
    'e2','k2',at(1),1),/UNAUTHORIZED_TASK_TRANSITION/);
  assert.equal((await l.snapshot(scope())).tasks[0].state,'created');
});
test('malformed message referencing a foreign/unknown turn cannot be appended',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  await assert.rejects(append(l,scope(),{kind:'message',messageId:'m1',turnId:'foreign',
    role:'assistant',text:'secrets',sourceIds:[]},'e2','k2',at(1),1),/MESSAGE_TURN_MISMATCH/);
  assert.equal((await l.snapshot(scope())).messages.length,0);
});
const consent=(atTime=T)=>({approved:true,consentId:'consent-1',
  actorId:'synthetic-owner',approvedAt:atTime});
const memoryInput=(s=scope(),opts={})=>({
  scope:s,memoryId:'memory-1',content:'أفضل التعامل بالعربية',kind:'preference',
  sourceThreadId:s.threadId,sourceTurnId:'turn1',sourceDocumentId:null,
  expiresAt:'2026-11-30T00:00:00.000Z',consent:consent(),...opts,
});
test('memory cannot be auto promoted without explicit verified actor consent',async()=>{
  const store=new ScopedKnowledgeService(new SyntheticKnowledgeBackend()),s=scope();
  await assert.rejects(store.promote({...memoryInput(),consent:null}),/EXPLICIT_CONSENT_REQUIRED/);
  await assert.rejects(store.promote({...memoryInput(),consent:{...consent(),actorId:'another'}}),/EXPLICIT_CONSENT_REQUIRED/);
  await assert.rejects(store.promote({...memoryInput(),sourceThreadId:'forged-thread'}),/EXPLICIT_CONSENT_REQUIRED/);
  assert.equal((await store.list({scope:s,now:T})).length,0);
});
test('explicitly approved memory works across threads only for exactly matching owner/company/branch',async()=>{
  const backend=new SyntheticKnowledgeBackend(),store=new ScopedKnowledgeService(backend);
  const added=await store.promote(memoryInput());
  assert.equal(added.content,'أفضل التعامل بالعربية');
  const repeated=await store.promote(memoryInput());
  assert.equal(repeated.memoryId,added.memoryId);
  assert.equal((await store.list({scope:scope({threadId:'other-thread'}),now:T})).length,1);
  for(const changed of [{companyId:'other'},{branchId:'other'},
    {accountId:'other'},{actorId:'other'},{authorizationVersion:2}]){
    assert.equal((await store.list({scope:scope(changed),now:T})).length,0);
  }
});
test('revoked memory clears plaintext and tombstone defeats restoring same consent',async()=>{
  const store=new ScopedKnowledgeService(new SyntheticKnowledgeBackend());await store.promote(memoryInput());
  const revoked=await store.revoke({scope:scope(),actorId:'synthetic-owner',
    memoryId:'memory-1',now:at(3)});
  assert.equal(revoked.content,null);
  assert.equal(revoked.revokedAt,at(3));
  assert.deepEqual(await store.list({scope:scope(),now:at(4)}),[]);
  await assert.rejects(store.promote(memoryInput()),/REVOKED_TOMBSTONE/);
  assert.deepEqual((await store.exportAudit({scope:scope()})).map(x=>x.hasContent),[false]);
});
test('memory expires without being included in future conversations',async()=>{
  const store=new ScopedKnowledgeService(new SyntheticKnowledgeBackend());
  await store.promote(memoryInput(scope(),{expiresAt:'2026-10-30T14:00:03.000Z'}));
  assert.equal((await store.list({scope:scope(),now:at(2)})).length,1);
  assert.equal((await store.list({scope:scope(),now:at(3)})).length,0);
});
test('knowledge consent replay with altered text must fail without silent overwrite',async()=>{
  const store=new ScopedKnowledgeService(new SyntheticKnowledgeBackend());
  await store.promote(memoryInput());
  await assert.rejects(store.promote(memoryInput(scope(),{content:'غيره'})),
    /IDEMPOTENCY_COLLISION/);
  assert.equal((await store.list({scope:scope(),now:T}))[0].content,'أفضل التعامل بالعربية');
});
test('context window never discards authoritative history, and reports every omitted message',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  let rev=1;
  for(let i=0;i<100;i++){
    await append(l,scope(),{kind:'message',messageId:'m'+i,turnId:'turn1',
      role:i%2?'assistant':'user',text:'Synthetic '+i+' '+('x'.repeat(45)),
      sourceIds:[]},'e'+i,'k'+i,new Date(Date.parse(T)+i*1000).toISOString(),rev);
    rev++;
  }
  const snapshot=await l.snapshot(scope());
  const plan=prepareContext({scope:scope(),snapshot,memories:[],requestedSources:[],
    sources:[],maxCharacters:600,maxMessages:5,now:'2026-10-31T00:00:00.000Z'});
  assert.equal(snapshot.messages.length,100);
  assert.equal(plan.totalStoredMessages,100);
  assert.equal(plan.included.length,5);
  assert.equal(plan.excludedMessageIds.length,95);
  assert.equal(plan.boundedPrompt,true);
  assert.ok(plan.warnings.includes('MODEL_CONTEXT_WINDOW_OMITTED_OLD_MESSAGES'));
});
test('context blocks unreviewed/missing source and cannot claim entire file from pointers alone',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  const snapshot=await l.snapshot(scope());
  const p={scopeKey:exactScopeKey(scope()),documentId:'doc1',sourceSha256:H,
    coverageStatus:'partial',pageCount:35,reviewed:false,manifestRef:'manifest-1'};
  const plan=prepareContext({scope:scope(),snapshot,memories:[],
    requestedSources:['doc1','doc2'],sources:[p],maxCharacters:1000,maxMessages:10,now:T});
  assert.equal(plan.sourceCoverageComplete,false);
  assert.deepEqual(plan.unresolvedSources,['doc2','doc1']);
  assert.equal(plan.canClaimCompleteFileAnswer,false);
  const foreign=prepareContext({scope:scope(),snapshot,memories:[],
    requestedSources:['doc1'],sources:[{...p,scopeKey:'foreign'}],
    maxCharacters:1000,maxMessages:10,now:T});
  assert.deepEqual(foreign.unresolvedSources,['doc1']);
});
test('context never accepts foreign or revoked memory provided by untrusted caller',async()=>{
  const l=new ScopedConversationLedger(new SyntheticAtomicEventBackend());await begin(l);
  const s=scope(),snapshot=await l.snapshot(s);
  const memory={schemaVersion:1,memoryId:'m1',ownerKey:'foreign',content:'secret',
    kind:'fact',sourceThreadId:'thread1',sourceTurnId:'turn1',sourceDocumentId:null,
    consentId:'c1',approvedByActorId:'synthetic-owner',createdAt:T,
    expiresAt:'2026-11-30T00:00:00.000Z',revokedAt:null,version:1};
  const input={scope:s,snapshot,memories:[memory],requestedSources:[],
    sources:[],maxCharacters:1000,maxMessages:10,now:T};
  await assert.rejects(async()=>prepareContext(input),/FOREIGN_OR_REVOKED_MEMORY/);
});
test('server scope rejects UI role spoofing, wrong workspace membership and unsupported multi-UID sharing',async()=>{
  const principal={uid:'owner',tokenIssuedAt:100,tokenExpiresAt:500,
    authenticatedAt:100,role:'owner',anonymous:false};
  const membership={ownerUid:'owner',accountId:'acc1',companyId:'company1',
    branchId:'branch1',actorUid:'owner',permittedRoles:['owner'],
    authorizationVersion:1,active:true};
  const service={async verifyFirebaseBearer(){return principal;},
    async membershipFor(){return membership;}};
  const input={bearerToken:'token'.repeat(10),requestedAccountId:'acc1',
    requestedCompanyId:'company1',requestedBranchId:'branch1',
    requestedThreadId:'thread1',scopeType:'business',serverNowEpochSeconds:200,service};
  const verified=await authorizeConversationRequest(input);
  assert.equal(verified.actorId,'owner');
  await assert.rejects(authorizeConversationRequest({...input,requestedCompanyId:'foreign'}),/MEMBERSHIP_DENIED/);
  await assert.rejects(authorizeConversationRequest({...input,serverNowEpochSeconds:500}),/INVALID_PRINCIPAL/);
  await assert.rejects(authorizeConversationRequest({...input,service:{
    ...service,async membershipFor(){return {...membership,ownerUid:'other'}}}}),
    /MULTI_UID_NOT_YET_SUPPORTED/);
  await assert.rejects(authorizeConversationRequest({...input,service:{
    async verifyFirebaseBearer(){return {...principal,role:'viewer'};},
    async membershipFor(){return membership;}}}),/MEMBERSHIP_DENIED/);
});
