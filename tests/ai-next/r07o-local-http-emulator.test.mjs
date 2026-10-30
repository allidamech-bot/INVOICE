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
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {R07NPreviewSession}
  from '../../dist/src/ai-next/ui/r07n-preview-session.js';
import {R07OLocalPreviewHandler,R07OLocalHttpPreviewPort,
  R07O_PUBLIC_ENDPOINT_ENABLED,R07O_LOCAL_ROUTE,R07O_MAX_REQUEST_BYTES}
  from '../../dist/src/ai-next/security/r07o-local-http.js';

const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
if(project!=='demo-ai-next-r07h'||!process.env.FIRESTORE_EMULATOR_HOST?.match(
  /^(127\.0\.0\.1|localhost):[0-9]{2,5}$/))
  throw Error('R07O_FIRESTORE_EMULATOR_REQUIRED');
const app=initializeApp({projectId:project},'r07o-integration');
after(async()=>{await deleteApp(app);});
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
  after(()=>new Promise(resolve=>server.close(resolve)));
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
