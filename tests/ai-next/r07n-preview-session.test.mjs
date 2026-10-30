import test from 'node:test';
import assert from 'node:assert/strict';
import {R07NPreviewSession,R07N_PREVIEW_BRIDGE_ACTIVATED,
  r07nCurrentToR06,r07nHistoryToR06}
  from '../../dist/src/ai-next/ui/r07n-preview-session.js';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {assertR06Scope}
  from '../../dist/src/ai-next/ui/view-model.js';
const NOW=new Date('2026-10-31T14:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const clone=x=>structuredClone(x);
const envelope=(changes={})=>({
  schemaVersion:1,accountId:'account-r07k',companyId:'company-r07k',
  branchId:'branch-r07k',threadId:'thread-r07k',scopeType:'business',
  requestId:'request-one',idempotencyKey:'turn-request-one',
  userMessageId:'user-msg-one',message:'السلام عليكم',mode:'advisor',...changes,
});
const historyRequest=(changes={})=>({
  schemaVersion:1,accountId:'account-r07k',companyId:'company-r07k',
  branchId:'branch-r07k',threadId:'thread-r07k',scopeType:'business',...changes,
});
class SharedTransactionalFirestore{
  docs=new Map();lock=Promise.resolve();reads=0;writes=0;
  collection(name){
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION].includes(name))
      throw Error('UNEXPECTED_COLLECTION');
    return {doc:id=>({id:name+':'+id,get:async()=>this.snapshot(name+':'+id)})};
  }
  snapshot(id){
    this.reads++;
    const data=this.docs.get(id);
    return {exists:data!==undefined,
      data:()=>data===undefined?undefined:clone(data)};
  }
  async runTransaction(action){
    const prior=this.lock;let unlock;
    const pending=new Promise(resolve=>{unlock=resolve;});
    this.lock=prior.then(()=>pending);await prior;
    try{
      const edits=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id)||edits.has(ref.id))
            throw Error('ALREADY_EXISTS');
          edits.set(ref.id,clone(value));
        },
        set:(ref,value)=>edits.set(ref.id,clone(value)),
      };
      const result=await action(tx);
      for(const [key,value] of edits){
        this.docs.set(key,value);this.writes++;
      }
      return result;
    }finally{unlock();}
  }
}
const principal=(role='owner')=>({
  verify:async()=>({uid:'signed-r07k',role,
    tokenIssuedAt:epoch-100,tokenExpiresAt:epoch+3600,
    authenticatedAt:epoch-200,anonymous:false}),
});
const membership=(role='owner')=>({
  readForActor:async()=>({ownerUid:'signed-r07k',actorUid:'signed-r07k',
    accountId:'account-r07k',companyId:'company-r07k',
    branchId:'branch-r07k',active:true,authorizationVersion:1,
    permittedRoles:[role]}),
});
const harness=(db=new SharedTransactionalFirestore(),override={})=>{
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const draftStore=override.draftStore??new R07DExperimentalFirestoreDraftStore(db);
  const deps={journal,draftStore,principal:override.principal??principal(),
    membership:override.membership??membership(),clock:()=>new Date(NOW)};
  return {db,journal,draftStore,deps,
    coordinator:new R07MFastLocalCoordinator(deps)};
};
const TOKEN='signed-synthetic-token-not-a-live-account';


const scope={ownerUid:'signed-r07k',accountId:'account-r07k',
  companyId:'company-r07k',branchId:'branch-r07k',
  threadId:'thread-r07k',actorId:'signed-r07k',role:'owner',
  scopeType:'business',authorizationVersion:1};
const env=historyRequest();
const port=(coordinator,overrides={})=>({
  accept:request=>coordinator.accept(TOKEN,request),
  current:envelope=>coordinator.current(TOKEN,envelope),
  history:envelope=>coordinator.history(TOKEN,envelope),
  ...overrides,
});
const identity=(key='r07n-one')=>()=>({
  requestId:key+'-request',idempotencyKey:key+'-idempotency',
  userMessageId:key+'-message',
});
const session=(h,key='r07n-one',overrides={})=>
  new R07NPreviewSession(scope,env,port(h.coordinator,overrides),identity(key));
const send=(s,text='السلام عليكم',mode='advisor',signal)=>
  s.send({text,mode,sourceIds:[],signal});

test('R07N preview remains unmounted and builds bounded R06 latest-turn view',async()=>{
  assert.equal(R07N_PREVIEW_BRIDGE_ACTIVATED,false);
  const h=harness(),s=session(h);
  assert.deepEqual(s.getView().messages,[]);
  const result=await send(s);
  assert.deepEqual(result,{accepted:true});
  const view=s.getView();
  assert.equal(view.currentTask.state,'completed');
  assert.equal(view.messages.length,2);
  assert.equal(view.messages[0].role,'user');
  assert.equal(view.messages[1].role,'assistant');
  assert.equal(view.threadId,scope.threadId);
  assert.deepEqual(view.attachments,[]);
  assert.deepEqual(view.memories,[]);
  assert.doesNotThrow(()=>assertR06Scope(view,scope));
  assert.equal(s.unresolvedForManualRecovery(),null);
});
test('R07N UI send must not claim saved invoice or authorize unsupported file',async()=>{
  const h=harness(),s=session(h);
  await assert.rejects(s.send({text:'استخرج PDF',mode:'controller',
    sourceIds:['file-unknown']}),/R07N_LOCAL_FILES_NOT_SUPPORTED/);
  assert.equal(h.db.writes,0);
  const r=await send(s,'أنشئ مسودة عرض سعر','controller');
  assert.equal(r.accepted,true);
  const view=s.getView();
  assert.equal(view.draft.kind,'quotation');
  assert.equal(view.draft.status,'needs_review');
  assert.equal(view.draft.approvalReceiptId,null);
  assert.equal(view.draft.draftRevision,1);
  assert.equal(view.messages.length,2);
});
test('R07N lost reply AFTER committed server write retains same request identity',async()=>{
  const h=harness(),seen=[];let fail=true;
  const s=session(h,'after-commit',{
    accept:async request=>{
      seen.push(structuredClone(request));
      const out=await h.coordinator.accept(TOKEN,request);
      if(fail){fail=false;throw Error('SIMULATED_NETWORK_ACK_LOSS');}
      return out;
    },
  });
  const first=await send(s);
  assert.equal(first.accepted,false);
  assert.equal(s.getView().messages.length,0);
  const saved=s.unresolvedForManualRecovery();
  assert.equal(saved.idempotencyKey,'after-commit-idempotency');
  const writes=h.db.writes;
  assert.deepEqual(await send(s),{accepted:true});
  assert.equal(s.unresolvedForManualRecovery(),null);
  assert.deepEqual(seen[0],seen[1]);
  assert.equal(h.db.writes,writes);
  const history=await h.coordinator.history(TOKEN,env);
  assert.equal(history.turns.length,1);
});
test('R07N discarded session can manually restore SAME uncertain request without duplicate',async()=>{
  const h=harness(),failing=session(h,'restart',{
    accept:async request=>{
      await h.coordinator.accept(TOKEN,request);
      throw Error('AFTER_COMMIT_BROWSER_DISCONNECTED');
    },
  });
  assert.equal((await send(failing)).accepted,false);
  const recovered=session(h,'fresh-identity');
  recovered.restoreUnresolved(failing.unresolvedForManualRecovery());
  await assert.rejects(send(recovered,'مرحبا'),/R07N_PENDING_REQUEST_MISMATCH/);
  const writes=h.db.writes;
  assert.deepEqual(await send(recovered),{accepted:true});
  assert.equal(h.db.writes,writes);
  assert.equal((await h.coordinator.history(TOKEN,env)).turns.length,1);
});
test('R07N abort before sending never writes; abort after commit keeps uncertainty',async()=>{
  const h=harness(),s=session(h,'abort');
  const first=new AbortController();first.abort();
  assert.deepEqual(await send(s,'السلام عليكم','advisor',first.signal),
    {accepted:false});
  assert.equal(h.db.writes,0);
  assert.equal(s.unresolvedForManualRecovery(),null);
  const after=new AbortController();
  const delayed=session(h,'abort-after',{
    accept:async request=>{
      const out=await h.coordinator.accept(TOKEN,request);
      after.abort();
      return out;
    },
  });
  assert.deepEqual(await send(delayed,'السلام عليكم','advisor',after.signal),
    {accepted:false});
  assert.equal(delayed.unresolvedForManualRecovery().idempotencyKey,
    'abort-after-idempotency');
});
test('R07N no fresh draft may be shown from cross-company or fabricated view',async()=>{
  const h=harness();
  await send(session(h));
  const real=await h.coordinator.current(TOKEN,env);
  const forged=structuredClone(real);
  forged.view.scopeKey='forged';
  assert.throws(()=>r07nCurrentToR06(scope,forged),/R07N_INCONSISTENT_CURRENT/);
  assert.throws(()=>r07nCurrentToR06(scope,{
    ...real,authoritativeForFinancialExecution:true,
  }),/R07N_UNSAFE_CURRENT_AUTHORITY/);
  assert.throws(()=>r07nCurrentToR06(scope,{
    ...real,view:{...real.view,task:{...real.view.task,
      scope:{...real.view.task.scope,companyId:'another-company'}}},
  }),/R07N_INCONSISTENT_CURRENT/);
  const invalid={...real,view:{...real.view,assistantReply:null}};
  assert.throws(()=>r07nCurrentToR06(scope,invalid),/R07N_INCONSISTENT_CURRENT/);
});
test('R07N explicit audited history supports multiple turns but current is one',async()=>{
  const h=harness();
  await send(session(h,'first'));
  await send(session(h,'second'),'مرحبا');
  const recent=await session(h,'third').refreshCurrent();
  assert.equal(recent.messages.length,2);
  const full=await session(h,'fourth').loadVerifiedHistory();
  assert.equal(full.messages.length,4);
  assert.equal(full.currentTask.state,'completed');
  const history=await h.coordinator.history(TOKEN,env);
  assert.equal(r07nHistoryToR06(scope,history).messages.length,4);
  assert.throws(()=>r07nHistoryToR06(scope,{
    ...history,scopeKey:'forged'}),/R07N_HISTORY_SCOPE_MISMATCH/);
});
test('R07N must re-authorize subsequent current read after server ACL revocation',async()=>{
  let authorized=true;const h=harness(undefined,{
    membership:{readForActor:async()=>authorized?membership().readForActor({}):null},
  });
  const s=session(h,'revoked',{accept:async req=>{
    const outcome=await h.coordinator.accept(TOKEN,req);
    authorized=false;
    return outcome;
  }});
  assert.deepEqual(await send(s),{accepted:false});
  assert.ok(s.unresolvedForManualRecovery());
  assert.deepEqual(s.getView().messages,[]);
  await assert.rejects(s.refreshCurrent(),/AUTH_MEMBERSHIP_DENIED/);
});
test('R07N refuses suspicious recovery metadata or changed envelope',()=>{
  const h=harness(),s=session(h);
  assert.throws(()=>s.restoreUnresolved({...envelope(),idempotencyKey:'x',
    accountId:'another'}),/R07N_INVALID_PENDING_REQUEST/);
  assert.throws(()=>new R07NPreviewSession(scope,{...env,
    branchId:'another'},port(h.coordinator)),/R07N_SCOPE_ENVELOPE_MISMATCH/);
});


test('R07N quote confirmation cannot pass missing draft or mismatched draft reference',async()=>{
  const h=harness();
  const requestIdentity='quote-proof';
  const noDraft=session(h,requestIdentity,{
    accept:async req=>{
      const accepted=await h.coordinator.accept(TOKEN,req);
      return {...accepted,draft:null};
    },
  });
  const result=await send(noDraft,'أنشئ مسودة عرض سعر','controller');
  assert.equal(result.accepted,false);
  assert.equal(noDraft.getView().draft,null);
  assert.ok(noDraft.unresolvedForManualRecovery());
  const fromServer=await h.coordinator.current(TOKEN,env);
  const original=await h.coordinator.accept(TOKEN,{
    ...env,...identity(requestIdentity)(),message:'أنشئ مسودة عرض سعر',
    mode:'controller',
  });
  assert.throws(()=>r07nCurrentToR06(scope,fromServer,{
    ...original.draft,draftId:'draft-of-some-other-turn',
  }),/R07N_INCONSISTENT_CURRENT/);
  // A passive refresh can safely show task status but no unaudited draft;
  // retrying the exact request recovers its verified server draft.
  const after=await noDraft.refreshCurrent();
  assert.equal(after.currentTask.state,'completed');
  assert.equal(after.draft,null);
  const restored=session(h,'fresh');
  restored.restoreUnresolved(noDraft.unresolvedForManualRecovery());
  assert.deepEqual(await send(restored,'أنشئ مسودة عرض سعر','controller'),
    {accepted:true});
  assert.equal(restored.getView().draft.draftId,original.draft.draftId);
});
test('R07N rejects a forged completed reply from a different request identity',async()=>{
  const h=harness();
  const sessionWithLie=session(h,'server-lie',{
    accept:async req=>{
      const response=await h.coordinator.accept(TOKEN,req);
      return {...response,turnId:'different-turn'};
    },
  });
  assert.deepEqual(await send(sessionWithLie),{accepted:false});
  assert.ok(sessionWithLie.unresolvedForManualRecovery());
  assert.equal(sessionWithLie.getView().messages.length,0);
});
