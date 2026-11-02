import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {verifyR07FirebasePrincipal}
  from '../../api/_ai-next/firebase-principal.js';
import {R07B3AdminMembershipStore,R07B3_COLLECTION}
  from '../../dist/src/ai-next/security/admin-membership-store.js';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION,
  R07D_EDIT_RECEIPT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {R07NPreviewSession}
  from '../../dist/src/ai-next/ui/r07n-preview-session.js';
import {createR07RTrustedOfflineReviewSession}
  from '../../dist/src/ai-next/coordinator/r07r-trusted-review-session.js';
import {R07QTrustedSemanticGateway}
  from '../../dist/src/ai-next/router/trusted-semantic-gateway.js';
import {R07OLocalPreviewHandler,R07OLocalHttpPreviewPort,
  R07O_PUBLIC_ENDPOINT_ENABLED,R07O_LOCAL_ROUTE,R07O_MAX_REQUEST_BYTES}
  from '../../dist/src/ai-next/security/r07o-local-http.js';

const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
if(project!=='demo-ai-next-r07h'||!process.env.FIRESTORE_EMULATOR_HOST?.match(
  /^(127\.0\.0\.1|localhost):[0-9]{2,5}$/))
  throw Error('R07O_FIRESTORE_EMULATOR_REQUIRED');
const app=initializeApp({projectId:project},'r07o-integration');
after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await deleteApp(app);
});
const db=getFirestore(app);
const at=new Date('2026-10-31T16:00:00.000Z');
const now=Math.floor(at.getTime()/1000),uid='r07o-owner';
const env={schemaVersion:1,accountId:'r07o-account',companyId:'r07o-company',
  branchId:'r07o-branch',threadId:'r07o-private-thread',scopeType:'business'};
const scope={ownerUid:uid,actorId:uid,...env,role:'owner',
  authorizationVersion:4};
delete scope.schemaVersion;
const payload={sub:uid,iat:now-40,exp:now+3600,auth_time:now-120,
  firebase:{sign_in_provider:'password'}};
const token=[Buffer.from(JSON.stringify({alg:'RS256',kid:'qa-test-only'}))
  .toString('base64url'),Buffer.from(JSON.stringify(payload))
  .toString('base64url'),'x'.repeat(140)].join('.');
let acl;
const principal={verify:(value,timestamp)=>verifyR07FirebasePrincipal(
  value,timestamp,async checked=>{
    if(checked!==token)throw Error('TEST_SIGNER_REJECTED');
    return {uid,role:'owner'};
  }),
};
const membership=new R07B3AdminMembershipStore(db);
const coordinator=new R07MFastLocalCoordinator({
  journal:new R07JExperimentalIndexedJournal(db,true),
  draftStore:new R07DExperimentalFirestoreDraftStore(db),
  principal,membership,clock:()=>new Date(at),
});
let server,endpoint,handler,port;
const getUrl=()=>endpoint+R07O_LOCAL_ROUTE;
const transport=async input=>{
  // Node fetch is not a browser. Simulate browser-injected Origin and
  // Sec-Fetch-Site (browser JS must NOT set these headers manually).
  const headers=new Headers(input.headers);
  headers.set('Origin',endpoint);headers.set('Sec-Fetch-Site','same-origin');
  return fetch(new Request(input,{headers}));
};
const direct=(operation,payload,opts={})=>{
  const headers={
    'Origin':endpoint,'Sec-Fetch-Site':'same-origin',
    'Authorization':'Bearer '+token,'Content-Type':'application/json',
    ...(opts.headers??{}),
  };
  return fetch(getUrl(),{method:'POST',headers,
    body:JSON.stringify({operation,payload}),redirect:'manual'});
};
const greeting={...env,requestId:'request-greeting',
  idempotencyKey:'idem-greeting',userMessageId:'user-greeting',
  message:'السلام عليكم',mode:'advisor'};
const quote={...env,requestId:'request-quote',
  idempotencyKey:'idem-quote',userMessageId:'user-quote',
  message:'أنشئ مسودة عرض سعر',mode:'controller'};
const identity=id=>()=>({
  requestId:'r07o-'+id+'-req',idempotencyKey:'r07o-'+id+'-key',
  userMessageId:'r07o-'+id+'-user',
});
const createSession=id=>new R07NPreviewSession(scope,env,port,identity(id));

test('R07O local endpoint remains disabled and no production public route is touched',()=>{
  assert.equal(R07O_PUBLIC_ENDPOINT_ENABLED,false);
  assert.equal(R07O_LOCAL_ROUTE,'/__ai_next_r07o_local_preview__');
  assert.notEqual(R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION);
});
test('local-only guard rejects production / non-emulator and invalid origins',()=>{
  assert.throws(()=>new R07OLocalPreviewHandler({
    allowedOrigin:'https://invoice-three-puce.vercel.app',
    projectId:'demo-ai-next-r07h',emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
    coordinator,
  }),/R07O_INVALID_LOCAL_ORIGIN/);
  assert.throws(()=>new R07OLocalPreviewHandler({
    allowedOrigin:'http://127.0.0.1:4321',projectId:'demo-ai-next-r07h',
    emulatorHost:'localhost:9000',coordinator,
  }),/R07O_LOCAL_EMULATOR_GUARD/);
  assert.throws(()=>new R07OLocalHttpPreviewPort({
    allowedOrigin:'https://example.com',token:async()=>token,
  }),/R07O_INVALID_LOCAL_ORIGIN/);
});
test('start an isolated loopback-only Node HTTP listener backed by Firestore Emulator',async()=>{
  const member={schemaVersion:1,ownerUid:uid,actorUid:uid,active:true,
    authorizationVersion:4,memberships:[{
      accountId:env.accountId,companyId:env.companyId,
      branchId:env.branchId,active:true,permittedRoles:['owner'],
    }],
  };
  acl=db.collection(R07B3_COLLECTION).doc(uid);
  await acl.set(member);
  server=createServer(async(req,res)=>{
    try{
      const chunks=[];let bytes=0;
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>R07O_MAX_REQUEST_BYTES+1024)break;
        chunks.push(chunk);
      }
      const body=Buffer.concat(chunks);
      const headers=req.headers;
      const request=new Request(
        'http://127.0.0.1:'+server.address().port+(req.url??'/'),{
          method:req.method,headers,
          body:req.method==='POST'?body:undefined,
        });
      const result=await handler.handle(request);
      res.statusCode=result.status;
      for(const [key,value] of result.headers)res.setHeader(key,value);
      res.end(Buffer.from(await result.arrayBuffer()));
    }catch{res.writeHead(500);res.end('local-test-transport-error');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  endpoint='http://127.0.0.1:'+server.address().port;
  handler=new R07OLocalPreviewHandler({
    allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
    emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,coordinator,
  });
  port=new R07OLocalHttpPreviewPort({
    allowedOrigin:endpoint,token:async()=>token,transport,
  });
  assert.equal(new URL(endpoint).hostname,'127.0.0.1');
});
test('real local HTTP greeting is authenticated, isolated, no-store, no paid provider',async()=>{
  const response=await direct('accept',greeting);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(response.headers.get('set-cookie'),null);
  const result=await response.json();
  assert.equal(result.status,'completed');
  assert.equal(result.providerCalls,0);
  assert.equal(result.financialSaved,false);
  const view=await port.current(env);
  assert.equal(view.view.task.state,'completed');
  assert.equal(view.view.turn.idempotencyKey,'idem-greeting');
  assert.equal(view.authoritativeForFinancialExecution,false);
});
test('R07O preview adapter round-trip over actual loopback HTTP creates ONLY unsaved quote',async()=>{
  const s=createSession('quote');
  const result=await s.send({text:quote.message,mode:'controller',sourceIds:[]});
  assert.deepEqual(result,{accepted:true});
  assert.equal(s.getView().draft.kind,'quotation');
  assert.equal(s.getView().draft.approvalReceiptId,null);
  assert.equal(s.getView().draft.status,'needs_review');
  assert.equal(s.getView().currentTask.state,'completed');
  assert.equal(s.getView().messages.length,2);
  const count=(await db.collection(R07D_DRAFT_COLLECTION).get()).size;
  assert.equal(count,1);
  const reread=await s.loadVerifiedHistory();
  assert.equal(reread.messages.length,4);
});
test('strict HTTP: reject cross-site requests, GET, cookies, missing auth, bad payload',async()=>{
  const prior=(await db.collection(R07M_FAST_COLLECTION).get()).size;
  for(const [name,request,status] of [
    ['origin',direct('accept',greeting,{headers:{Origin:'https://evil.example'}}),403],
    ['fetch-site',direct('accept',greeting,{headers:{'Sec-Fetch-Site':'cross-site'}}),403],
    ['cookie',direct('accept',greeting,{headers:{Cookie:'sid=attack'}}),403],
    ['bearer',direct('accept',greeting,{headers:{Authorization:'Bearer invalid'}}),401],
    ['bad-envelope',direct('accept',{...greeting,role:'owner'}),400],
    ['forged branch',direct('accept',{...greeting,branchId:'evil'}),403],
    ['forged JWT',direct('current',env,{headers:{Authorization:
      'Bearer '+token.slice(0,-2)+'aa'}}),403],
  ]){
    const response=await request;
    assert.equal(response.status,status,name);
    assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  const get=await fetch(getUrl(),{method:'GET'});
  assert.equal(get.status,405);
  assert.equal((await db.collection(R07M_FAST_COLLECTION).get()).size,prior);
});
test('bad request shapes, oversized bodies and unsupported content type fail closed',async()=>{
  const post=(value,header='application/json')=>fetch(getUrl(),{
    method:'POST',headers:{Origin:endpoint,'Sec-Fetch-Site':'same-origin',
      Authorization:'Bearer '+token,'Content-Type':header},
    body:value,
  });
  assert.equal((await post('{"operation":"current","payload":{},"extra":1}')).status,400);
  assert.equal((await post(JSON.stringify({operation:'approve',payload:env}))).status,400);
  assert.equal((await post('x'.repeat(R07O_MAX_REQUEST_BYTES+5))).status,400);
  assert.equal((await post('{}','text/plain')).status,415);
});
test('exact membership revocation forbids current, history and replay without leakage',async()=>{
  const original=(await acl.get()).data();
  await acl.set({...original,active:false});
  try{
    for(const operation of ['current','history','accept']){
      const response=await direct(operation,operation==='accept'?quote:env);
      assert.equal(response.status,403,operation);
      const body=await response.text();
      assert.equal(body.includes(uid),false);
      assert.equal(body.includes(token),false);
      assert.equal(body.includes(env.companyId),false);
    }
  }finally{await acl.set(original);}
  const prior=await port.current(env);
  assert.equal(prior.view.task.state,'completed');
});
test('API rejects changed idempotency key replay without creating duplicate turns',async()=>{
  const original=await direct('accept',greeting);assert.equal(original.status,200);
  const changed=await direct('accept',{...greeting,message:'مرحبا'});
  assert.equal(changed.status,409);
  const full=await port.history(env);
  assert.equal(full.turns.length,2);
});

test('unified edit HTTP extension is disabled by default, then receipt-verified via loopback',async()=>{
  const reviewEnv={...env,threadId:'r07o-loopback-unified-review'};
  const createdResponse=await direct('accept',{
    ...reviewEnv,requestId:'unified-origin-request',
    idempotencyKey:'unified-origin-key',
    userMessageId:'unified-origin-user',
    message:'أنشئ مسودة عرض سعر',mode:'controller',
  });
  assert.equal(createdResponse.status,200);
  const created=await createdResponse.json();
  assert.equal(created.draft.draftRevision,1);
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const drafts=new R07DExperimentalFirestoreDraftStore(db);
  let calls=0;
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    principal,membership,journal,draftStore:drafts,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'r07o-verified-customer':null},
    syntheticInterpreter:{interpret:async()=>{calls++;return{
      action:'edit_draft',subject:null,reference:'active_draft',
      facts:[{name:'customer_name',value:'شركة النور'}],
      sourceIds:[],missingFields:[],
    };}},
    clock:()=>new Date(at),
  });
  const reviewCoordinator=new R07MFastLocalCoordinator({
    journal,draftStore:drafts,principal,membership,
    offlineReviewBridge:session.bridge,
    offlineReviewReceiptStore:drafts,
    allowOfflineUnifiedReviewEdit:true,
    clock:()=>new Date(at),
  });
  const input={
    turn:{...reviewEnv,requestId:'unified-edit-request',
      idempotencyKey:'unified-edit-key',
      userMessageId:'unified-edit-user',
      message:'خلي العميل شركة النور',mode:'controller'},
    originTurnId:created.turnId,
    expectedDraftRevision:created.draft.draftRevision,
    expectedDraftHash:created.draft.immutableRevisionHash,
  };
  const before=await drafts.read(scope,created.turnId);
  assert.equal(before,null,'thread-isolated draft cannot be read from another scope');
  const original=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:reviewCoordinator,
    });
    assert.equal((await direct('review_edit',input)).status,403);
    assert.equal((await direct('review_draft',input)).status,403);
    const sameScope={...scope,threadId:reviewEnv.threadId};
    assert.equal((await drafts.read(sameScope,created.turnId)).draftRevision,1);
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:reviewCoordinator,allowOfflineReviewEditPreview:true,
    });
    const first=await direct('review_edit',input);
    assert.equal(first.status,200);
    assert.equal(first.headers.get('cache-control'),'no-store, max-age=0');
    const applied=await first.json();
    assert.equal(applied.status,'applied_unsaved_review');
    assert.equal(applied.appliedDraftRevision,2);
    assert.equal(applied.financialSaved,false);
    assert.equal(applied.providerCalls,0);
    assert.equal(calls,1);
    const client=new R07OLocalHttpPreviewPort({
      allowedOrigin:endpoint,token:async()=>token,transport,
    });
    const replay=await client.reviewEdit(input);
    assert.equal(replay.replayed,true);
    assert.equal(replay.appliedDraftHash,applied.appliedDraftHash);
    assert.equal(calls,1,'duplicate HTTP request must not interpret twice');
    const exact=await drafts.read(sameScope,created.turnId);
    assert.equal(exact.draftRevision,2);
    assert.equal(exact.explicitCustomerId,'r07o-verified-customer');
    assert.equal(exact.approvalReceiptId,null);
    const history=await client.history(reviewEnv);
    assert.equal(history.turns.length,2);
    assert.equal(history.tasks.at(-1).taskType,'unsaved_review_edit');
    assert.equal(history.messages.filter(m=>m.turnId===applied.turnId&&
      m.role==='assistant').length,1);
    assert.equal(history.checkpointRefs.filter(c=>c.taskId===applied.taskId).length,2);
    assert.equal((await direct('review_edit',{...input,
      turn:{...input.turn,message:'غير العميل لشركة أخرى'}})).status,409);
    assert.equal((await direct('review_edit',{...input,
      turn:{...input.turn,branchId:'foreign-branch'}})).status,403);
    const aclBefore=(await acl.get()).data();
    try{
      await acl.set({...aclBefore,active:false});
      assert.equal((await direct('review_edit',input)).status,403);
    }finally{await acl.set(aclBefore);}
    assert.equal(calls,1);
    assert.equal((await drafts.read(sameScope,created.turnId)).draftRevision,2);
  }finally{handler=original;}
});


test('real HTTP lost ACK after R07D receipt: unchanged key recovers without second inference',async()=>{
  const reviewEnv={...env,threadId:'r07o-loopback-lost-ack-review'};
  const originalCreate=await direct('accept',{
    ...reviewEnv,requestId:'lost-ack-origin-request',
    idempotencyKey:'lost-ack-origin-key',
    userMessageId:'lost-ack-origin-user',
    message:'أنشئ مسودة عرض سعر',mode:'controller',
  });
  assert.equal(originalCreate.status,200);
  const created=await originalCreate.json();
  assert.equal(created.draft.draftRevision,1);
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const drafts=new R07DExperimentalFirestoreDraftStore(db);
  let interpretations=0;
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    principal,membership,journal,draftStore:drafts,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'r07o-lost-ack-customer':null},
    syntheticInterpreter:{interpret:async()=>{
      interpretations++;
      return {action:'edit_draft',subject:null,reference:'active_draft',
        facts:[{name:'customer_name',value:'شركة النور'}],
        sourceIds:[],missingFields:[]};
    }},
    clock:()=>new Date(at),
  });
  const reviewCoordinator=new R07MFastLocalCoordinator({
    journal,draftStore:drafts,principal,membership,
    offlineReviewBridge:session.bridge,
    offlineReviewReceiptStore:drafts,
    allowOfflineUnifiedReviewEdit:true,
    clock:()=>new Date(at),
  });
  const reviewInput={
    turn:{...reviewEnv,requestId:'lost-ack-edit-request',
      idempotencyKey:'lost-ack-edit-key',
      userMessageId:'lost-ack-edit-user',
      message:'خلي العميل شركة النور',mode:'controller'},
    originTurnId:created.turnId,
    expectedDraftRevision:created.draft.draftRevision,
    expectedDraftHash:created.draft.immutableRevisionHash,
  };
  const before=(await db.collection(R07D_EDIT_RECEIPT_COLLECTION).get()).size;
  const originalHandler=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:reviewCoordinator,allowOfflineReviewEditPreview:true,
    });
    const dropped=new R07OLocalHttpPreviewPort({
      allowedOrigin:endpoint,token:async()=>token,
      transport:async request=>{
        const response=await transport(request);
        assert.equal(response.status,200,'server must finish edit first');
        throw Error('TEST_LOST_HTTP_ACK_AFTER_COMMIT');
      },
    });
    await assert.rejects(dropped.reviewEdit(reviewInput),
      /TEST_LOST_HTTP_ACK_AFTER_COMMIT/);
    const scoped={...scope,threadId:reviewEnv.threadId};
    assert.equal((await drafts.read(scoped,created.turnId)).draftRevision,2);
    assert.equal(interpretations,1);
    assert.equal((await db.collection(R07D_EDIT_RECEIPT_COLLECTION).get()).size,
      before+1,'one atomic edit receipt');
    const restored=new R07OLocalHttpPreviewPort({
      allowedOrigin:endpoint,token:async()=>token,transport,
    });
    const result=await restored.reviewEdit(reviewInput);
    assert.equal(result.status,'applied_unsaved_review');
    assert.equal(result.replayed,true);
    assert.equal(result.appliedDraftRevision,2);
    assert.equal(result.financialSaved,false);
    assert.equal(result.providerCalls,0);
    assert.equal(interpretations,1,'manual retry must never re-interpret');
    const audit=await restored.history(reviewEnv);
    assert.equal(audit.tasks.at(-1).taskType,'unsaved_review_edit');
    assert.equal(audit.tasks.at(-1).state,'completed');
    assert.equal(audit.checkpointRefs.filter(c=>c.taskId===result.taskId).length,2);
    assert.equal(audit.messages.filter(m=>m.turnId===result.turnId&&
      m.role==='assistant').length,1);
    assert.equal((await drafts.read(scoped,created.turnId)).draftRevision,2);
  }finally{handler=originalHandler;}
});
test('R07O client rejects fabricated success payload without receipt or revision',async()=>{
  const invalid=new R07OLocalHttpPreviewPort({
    allowedOrigin:'http://127.0.0.1:43122',
    token:async()=>token,
    transport:async()=>new Response(JSON.stringify({
      status:'applied_unsaved_review',financialSaved:false,
      providerCalls:0,turnId:'fake-turn',taskId:'fake-task',
      threadId:env.threadId,reply:'تم التعديل',replayed:false,
      conversationRevision:3,appliedDraftRevision:null,
      appliedDraftHash:null,
    }),{status:200,headers:{'Content-Type':'application/json'}}),
  });
  await assert.rejects(invalid.reviewEdit({
    turn:{...quote,requestId:'forged-response-request',
      idempotencyKey:'forged-response-key',
      userMessageId:'forged-response-user',
      message:'خلي العميل شركة النور'},
    originTurnId:'fixture-origin',expectedDraftRevision:1,
    expectedDraftHash:'a'.repeat(64),
  }),/R07O_UNVERIFIED_REVIEW_RESPONSE/);
});

test('R07N receipt-aware preview requires audited R07M/R07D proof after lost HTTP reply',async()=>{
  const reviewEnv={...env,threadId:'r07n-receipt-preview-ui'};
  const reviewScope={...scope,threadId:reviewEnv.threadId};
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const drafts=new R07DExperimentalFirestoreDraftStore(db);
  let interpretations=0;
  const sessionBridge=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    principal,membership,journal,draftStore:drafts,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'r07n-preview-verified-customer':null},
    syntheticInterpreter:{interpret:async()=>{
      interpretations++;
      return {action:'edit_draft',subject:null,reference:'active_draft',
        facts:[{name:'customer_name',value:'شركة النور'}],
        sourceIds:[],missingFields:[]};
    }},
    clock:()=>new Date(at),
  });
  const reviewCoordinator=new R07MFastLocalCoordinator({
    journal,draftStore:drafts,principal,membership,
    offlineReviewBridge:sessionBridge.bridge,
    offlineReviewReceiptStore:drafts,allowOfflineUnifiedReviewEdit:true,
    clock:()=>new Date(at),
  });
  const originalHandler=handler;
  let drop=true,lie=true,forgeDraft=true;
  try{
    const live=new R07OLocalHttpPreviewPort({
      allowedOrigin:endpoint,token:async()=>token,transport,
    });
    const uiPort={
      accept:request=>live.accept(request),
      current:request=>live.current(request),
      history:request=>live.history(request),
      reviewDraft:async request=>{
        const result=await live.reviewDraft(request);
        if(forgeDraft){
          forgeDraft=false;
          return {...result,draft:{...result.draft,
            scope:{...result.draft.scope,companyId:'forged-company'}}};
        }
        return result;
      },
      reviewEdit:async request=>{
        const response=await live.reviewEdit(request);
        if(drop){drop=false;throw Error('LOST_HTTP_REPLY_AFTER_RECEIPT');}
        if(lie){lie=false;return {...response,appliedDraftHash:'0'.repeat(64)};}
        return response;
      },
    };
    let nextKey=0;
    const localUi=new R07NPreviewSession(
      reviewScope,reviewEnv,uiPort,
      ()=>identity('r07n-preview-'+(++nextKey))());
    assert.deepEqual(await localUi.send({
      text:'أنشئ مسودة عرض سعر',mode:'controller',sourceIds:[],
    }),{accepted:true});
    const draft=localUi.getView().draft;
    assert.equal(draft?.draftRevision,1);
    const originTurnId=localUi.getView().currentTask.turnId;
    const edit={
      turn:{...reviewEnv,...identity('r07n-preview-2')(),
        message:'خلي العميل شركة النور',mode:'controller'},
      originTurnId,expectedDraftRevision:1,
      expectedDraftHash:draft.immutableRevisionHash,
    };
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:reviewCoordinator,allowOfflineReviewEditPreview:true,
    });
    assert.deepEqual(await localUi.send({text:'خلي العميل شركة النور',mode:'controller',sourceIds:[]}),{accepted:false});
    assert.deepEqual(localUi.unresolvedReviewForManualRecovery(),edit);
    assert.equal(localUi.getView().draft.draftRevision,1);
    assert.equal(interpretations,1);
    assert.equal((await drafts.read(reviewScope,originTurnId)).draftRevision,2);
    await assert.rejects(localUi.send({text:'خلي العميل شخص آخر',
      mode:'controller',sourceIds:[]}),/R07N_PENDING_REVIEW_MISMATCH/);
    // A shaped but forged R07O success must NOT clear pending review.
    assert.deepEqual(await localUi.send({text:'خلي العميل شركة النور',mode:'controller',sourceIds:[]}),{accepted:false});
    assert.deepEqual(localUi.unresolvedReviewForManualRecovery(),edit);
    assert.equal(interpretations,1);
    // Valid HTTP acknowledgement with forged draft scope still fails.
    assert.deepEqual(await localUi.send({text:'خلي العميل شركة النور',mode:'controller',sourceIds:[]}),{accepted:false});
    assert.deepEqual(localUi.unresolvedReviewForManualRecovery(),edit);
    assert.equal(interpretations,1);
    const result=await localUi.send({text:'خلي العميل شركة النور',mode:'controller',sourceIds:[]});
    assert.deepEqual(result,{accepted:true});
    assert.equal(localUi.unresolvedReviewForManualRecovery(),null);
    const view=localUi.getView();
    assert.equal(view.draft?.draftRevision,2,
      'R07N must render the receipt-verified revision only');
    assert.equal(view.draft?.explicitCustomerId,'r07n-preview-verified-customer');
    assert.equal(view.draft?.approvalReceiptId,null);
    assert.equal(nextKey,2,'retry and forged replies cannot create new IDs');
    assert.equal(view.messages.filter(x=>x.role==='assistant').length,2);
    assert.equal(view.currentTask.taskType,'unsaved_review_edit');
    assert.equal(view.currentTask.state,'completed');
    assert.equal(interpretations,1,'retries and forged outputs must still create one revision');
    assert.equal((await drafts.read(reviewScope,originTurnId)).draftRevision,2);
    const originalAcl=(await acl.get()).data();
    try{
      await acl.set({...originalAcl,active:false});
      await assert.rejects(live.reviewDraft(edit),/R07O_SECURE_CALL_FAILED/);
    }finally{await acl.set(originalAcl);}
    // An old revision is never valid again, even after verified UI refresh.
    await assert.rejects(localUi.reviewEdit({...edit,turn:{
      ...edit.turn,requestId:'fresh-review-request',
      idempotencyKey:'fresh-review-key',userMessageId:'fresh-review-user',
    }}),/R07N_REVIEW_ORIGIN_NOT_VERIFIED/);
  }finally{handler=originalHandler;}
});

/**
 * The R07P/R07Q -> R07R -> R07M/R07D chain must be tested through the
 * SAME existing loopback-only Controller. NO live provider is reachable:
 * the transport is a synthetic in-memory function and the registry contains
 * only synthetic entitlement fixtures, never actual account verification.
 */
const offlineModel=()=>({
  providerId:'groq',modelId:'fixture-only-zero-price-not-a-real-entitlement',
  registryVersion:'offline-fixture',capabilities:['TEXT','STRUCTURED_OUTPUT'],
  inputModalities:['text'],contextWindow:32000,maxImages:0,maxPages:null,
  providerEnabled:true,credentialsPresent:true,accountFreeVerified:true,
  modelZeroCostVerified:true,quotaAvailable:true,privacyApproved:true,
  healthAvailable:true,qualityTier:'capable',quotaGroupId:'offline-fixture',
});
const routedHarness=(suffix,{privateAllowed=true,modelAction='edit_draft',
  accountFreeVerified=true,modelSubject=null}={})=>{
  const reviewEnv={...env,threadId:'r07pq-review-'+suffix};
  const state={calls:0,discovery:0,privacy:0};
  const gateway=Object.assign(new R07QTrustedSemanticGateway({
    models:async()=>{state.discovery++;return [{...offlineModel(),accountFreeVerified}];},
    transport:{invoke:async ({payload})=>{
      state.calls++;
      assert.equal(payload.instruction.task,'semantic_interpretation_only');
      assert.equal(payload.utterance,'خلي العميل شركة النور');
      return {action:modelAction,subject:modelSubject,reference:'active_draft',
        facts:modelAction==='edit_draft'?
          [{name:'customer_name',value:'شركة النور'}]:[],
        sourceIds:[],missingFields:[]};
    }},
    approveBusinessData:async()=>{state.privacy++;return privateAllowed;},
    enableRoutedInference:true,
  }),{transportKind:'offline_synthetic_fixture'});
  const store=new R07DExperimentalFirestoreDraftStore(db);
  const audit=new R07JExperimentalIndexedJournal(db,true);
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    offlineRoutedReviewFixtures:true,routedInterpreter:gateway,
    principal,membership,journal:audit,draftStore:store,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'r07pq-verified-customer':null},
    clock:()=>new Date(at),
  });
  const coordinator=new R07MFastLocalCoordinator({
    journal:audit,draftStore:store,principal,membership,
    offlineReviewBridge:session.bridge,offlineReviewReceiptStore:store,
    allowOfflineUnifiedReviewEdit:true,clock:()=>new Date(at),
  });
  return {reviewEnv,state,coordinator,store};
};
const startRoutedQuotation=async reviewEnv=>{
  const request={...reviewEnv,requestId:'quote-origin-'+reviewEnv.threadId,
    idempotencyKey:'quote-key-'+reviewEnv.threadId,
    userMessageId:'quote-user-'+reviewEnv.threadId,
    message:'أنشئ مسودة عرض سعر',mode:'controller'};
  const result=await direct('accept',request);
  assert.equal(result.status,200);
  const draft=await result.json();
  assert.equal(draft.draft.draftRevision,1);
  return draft;
};
const routedInput=(reviewEnv,created)=>({
  turn:{...reviewEnv,requestId:'edit-request-'+reviewEnv.threadId,
    idempotencyKey:'edit-key-'+reviewEnv.threadId,
    userMessageId:'edit-user-'+reviewEnv.threadId,
    message:'خلي العميل شركة النور',mode:'controller'},
  originTurnId:created.turnId,expectedDraftRevision:1,
  expectedDraftHash:created.draft.immutableRevisionHash,
});
test('offline R07Q route -> one R07M task + R07D receipt + R07N current draft, no live calls',async()=>{
  const h=routedHarness('approved');
  const created=await startRoutedQuotation(h.reviewEnv);
  const original=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:h.coordinator,allowOfflineReviewEditPreview:true,
    });
    const port=new R07OLocalHttpPreviewPort({
      allowedOrigin:endpoint,token:async()=>token,transport,
    });
    const ui=new R07NPreviewSession(
      {...scope,threadId:h.reviewEnv.threadId},
      h.reviewEnv,port,identity('fixture-routed-r07n'));
    // Explicit pending from the already verified R07D origin. The UI's
    // create-draft fast path and resume protections were independently tested.
    const input=routedInput(h.reviewEnv,created);
    ui.restoreUnresolvedReview(input);
    const first=await ui.reviewEdit(input);
    assert.deepEqual(first,{accepted:true});
    const view=ui.getView();
    assert.equal(view.currentTask.taskType,'unsaved_review_edit');
    assert.equal(view.currentTask.state,'completed');
    assert.equal(view.draft?.draftRevision,2);
    assert.equal(view.draft?.explicitCustomerId,'r07pq-verified-customer');
    assert.equal(view.draft?.approvalReceiptId,null);
    assert.equal(h.state.calls,1,'single synthetic routed attempt');
    assert.equal(h.state.discovery,1);
    assert.equal(h.state.privacy,1);
    const replay=await port.reviewEdit(input);
    assert.equal(replay.replayed,true);
    assert.equal(replay.financialSaved,false);
    // These are external LIVE provider calls, not the synthetic transport.
    assert.equal(replay.providerCalls,0);
    assert.equal(h.state.calls,1,'durable replay must NOT route a second time');
    const history=await port.history(h.reviewEnv);
    assert.equal(history.turns.length,2);
    assert.equal(history.messages.filter(m=>
      m.turnId===replay.turnId&&m.role==='assistant').length,1);
    assert.equal(history.checkpointRefs.filter(c=>
      c.taskId===replay.taskId).length,2);
  }finally{handler=original;}
});
test('R07Q private consent denied -> zero model discovery, zero draft edit, R07M clarification',async()=>{
  const h=routedHarness('private-denied',{privateAllowed:false});
  const created=await startRoutedQuotation(h.reviewEnv);
  const original=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:h.coordinator,allowOfflineReviewEditPreview:true,
    });
    const input=routedInput(h.reviewEnv,created);
    const response=await direct('review_edit',input);
    assert.equal(response.status,200);
    const out=await response.json();
    assert.equal(out.status,'needs_clarification');
    assert.equal(out.appliedDraftRevision,null);
    assert.equal(out.financialSaved,false);
    assert.equal(h.state.calls,0);
    assert.equal(h.state.discovery,0);
    assert.equal(h.state.privacy,1);
    const sameScope={...scope,threadId:h.reviewEnv.threadId};
    assert.equal((await h.store.read(sameScope,created.turnId)).draftRevision,1);
    const replay=await direct('review_edit',input);
    assert.equal(replay.status,200);
    assert.equal((await replay.json()).replayed,true);
    assert.equal(h.state.privacy,1,'no repeat consent check on completed task');
  }finally{handler=original;}
});
test('R07Q model attempts financial issuance: refuse without an R07D edit receipt',async()=>{
  const h=routedHarness('unsafe-output',{modelAction:'execute_approved'});
  const created=await startRoutedQuotation(h.reviewEnv);
  const original=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:h.coordinator,allowOfflineReviewEditPreview:true,
    });
    const input=routedInput(h.reviewEnv,created);
    const response=await direct('review_edit',input);
    assert.equal(response.status,200);
    const outcome=await response.json();
    assert.equal(outcome.status,'needs_clarification');
    assert.equal(outcome.financialSaved,false);
    assert.equal(outcome.appliedDraftRevision,null);
    assert.equal(h.state.calls,1);
    const sameScope={...scope,threadId:h.reviewEnv.threadId};
    assert.equal((await h.store.read(sameScope,created.turnId)).draftRevision,1);
    const hst=await h.coordinator.history(token,h.reviewEnv);
    assert.equal(hst.checkpointRefs.filter(c=>
      c.stage==='r07r_unsaved_review_edit_receipt_v1').length,0);
  }finally{handler=original;}
});

test('R07Q missing verified free entitlement fails closed before model transport',async()=>{
  const h=routedHarness('free-unverified',{accountFreeVerified:false});
  const created=await startRoutedQuotation(h.reviewEnv),old=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:h.coordinator,allowOfflineReviewEditPreview:true,
    });
    const res=await direct('review_edit',routedInput(h.reviewEnv,created));
    assert.equal(res.status,200);
    const output=await res.json();
    assert.equal(output.status,'needs_clarification');
    assert.equal(output.financialSaved,false);
    assert.equal(output.appliedDraftRevision,null);
    assert.equal(h.state.calls,0);
    assert.equal((await h.store.read({...scope,threadId:h.reviewEnv.threadId},
      created.turnId)).draftRevision,1);
    const history=await h.coordinator.history(token,h.reviewEnv);
    assert.equal(history.checkpointRefs.filter(c=>
      c.stage==='r07r_unsaved_review_edit_receipt_v1').length,0);
  }finally{handler=old;}
});
test('R07Q forged draft reference cannot modify another draft',async()=>{
  const h=routedHarness('forged-ref',{modelSubject:{
    kind:'draft',id:'other-company-draft',
  }});
  const created=await startRoutedQuotation(h.reviewEnv),old=handler;
  try{
    handler=new R07OLocalPreviewHandler({
      allowedOrigin:endpoint,projectId:'demo-ai-next-r07h',
      emulatorHost:process.env.FIRESTORE_EMULATOR_HOST,
      coordinator:h.coordinator,allowOfflineReviewEditPreview:true,
    });
    const res=await direct('review_edit',routedInput(h.reviewEnv,created));
    assert.equal(res.status,200);
    const output=await res.json();
    assert.equal(output.status,'needs_clarification');
    assert.equal(output.financialSaved,false);
    assert.equal(output.appliedDraftRevision,null);
    assert.equal(h.state.calls,1);
    assert.equal((await h.store.read({...scope,threadId:h.reviewEnv.threadId},
      created.turnId)).draftRevision,1);
    const history=await h.coordinator.history(token,h.reviewEnv);
    assert.equal(history.checkpointRefs.filter(c=>
      c.stage==='r07r_unsaved_review_edit_receipt_v1').length,0);
  }finally{handler=old;}
});
test('R07Q offline fixtures reject missing server grant and incorrect marker',()=>{
  const deps={
    offlineFixtureMode:true,offlineReceiptMode:true,
    principal,membership,journal:new R07JExperimentalIndexedJournal(db,true),
    draftStore:new R07DExperimentalFirestoreDraftStore(db),
    customers:{resolveUnique:async()=>null},
    routedInterpreter:{transportKind:'offline_synthetic_fixture',
      interpret:async()=>({ok:false,code:'OFFLINE_ONLY',calls:0})},
    clock:()=>new Date(at),
  };
  assert.throws(()=>createR07RTrustedOfflineReviewSession(deps),
    /R07R_UNSAFE_OFFLINE_INFERENCE_CONFIGURATION/);
  assert.throws(()=>createR07RTrustedOfflineReviewSession({
    ...deps,offlineRoutedReviewFixtures:true,
    routedInterpreter:{...deps.routedInterpreter,transportKind:'live'},
  }),/R07R_UNSAFE_OFFLINE_INFERENCE_CONFIGURATION/);
});
