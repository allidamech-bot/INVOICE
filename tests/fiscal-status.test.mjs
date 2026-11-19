import test from 'node:test';
import assert from 'node:assert/strict';
import {createFiscalStatusService} from '../api/_fiscal/status-service.js';
import {createFiscalStatusHandler} from '../api/_fiscal/status-handler.js';
import {fiscalQaProject,fiscalQaIdentity} from '../api/_fiscal/status-runtime.js';
const owner={uid:'qa-owner',role:'owner'},workspaceId='qa-company',documentId='qa-doc',egsId='qa-egs';
const base='fiscalPrivateV1/'+owner.uid+'/workspaces/'+workspaceId;
const config={accountUid:owner.uid,workspaceId,environment:'simulation',syntheticOnly:true,statusReadEnabled:true};
const issue={...config,documentId,egsId,status:'cleared',mode:'clearance',version:3,warnings:false,clearedArtifactDigest:'a'.repeat(64),secret:'not-for-client',invoiceHash:'not-for-client'};
const command={operation:'status',workspaceId,documentId};
function fixture(){
  const data=new Map([[base,config],[base+'/issues/'+documentId,issue],[base+'/egs/'+egsId,{...config,egsId}]]);
  let reads=0;
  const db={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>{reads++;return {exists:data.has(ref.path),data:()=>structuredClone(data.get(ref.path))};}})};
  return {data,service:createFiscalStatusService(db),reads:()=>reads};
}
function request(patch={}){return {method:'POST',headers:{host:'qa.example.test',origin:'https://qa.example.test','x-requested-with':'LOUREX-Invoice','content-type':'application/json',authorization:'Bearer '+'a'.repeat(128)},body:command,...patch};}
async function call(handler,req=request()){
  const result={headers:{}};await handler(req,{set statusCode(v){result.status=v;},setHeader(k,v){result.headers[k]=v;},end(body){result.body=JSON.parse(body);}});return result;
}
test('read-only projection reveals no credentials or artifacts',async()=>{
  const f=fixture();assert.deepEqual(await f.service(owner,command),{environment:'simulation',documentId,status:'cleared',mode:'clearance',version:3,warnings:false});
  assert.deepEqual(await f.service(owner,{...command,documentId:'not-existing'}),{environment:'simulation',documentId:'not-existing',status:'not-prepared'});
});
test('account/workspace and synthetic enrollment boundaries fail closed',async()=>{
  const f=fixture();for(const [identity,req] of [[{...owner,uid:'other'},command],[{...owner,role:'viewer'},command],[owner,{...command,workspaceId:'other'}]])await assert.rejects(f.service(identity,req),/FORBIDDEN/);
  for(const patch of [{syntheticOnly:false},{statusReadEnabled:false},{environment:'production'},{accountUid:'other'}]){f.data.set(base,{...config,...patch});await assert.rejects(f.service(owner,command),/FORBIDDEN/);}
});
test('malformed issue and cross-environment EGS cannot claim clearance',async()=>{
  const f=fixture();for(const patch of [{mode:'reporting'},{clearedArtifactDigest:null},{accountUid:'other'},{documentId:'other'},{version:0},{status:'unknown'}]){f.data.set(base+'/issues/'+documentId,{...issue,...patch});await assert.rejects(f.service(owner,command),/UNAVAILABLE/);}
  f.data.set(base+'/issues/'+documentId,issue);f.data.set(base+'/egs/'+egsId,{...config,egsId,environment:'production'});await assert.rejects(f.service(owner,command),/UNAVAILABLE/);
});
test('HTTP command verifies identity before reading status and rejects injected state',async()=>{
  const f=fixture();const handler=createFiscalStatusHandler({getRuntime:async()=>({verifyIdentity:async()=>owner,status:f.service})});
  const initial=f.reads();for(const body of [{...command,status:'cleared'},{...command,accountUid:'other'},{...command,operation:'submit'},{...command,workspaceId:'../foo'}])assert.equal((await call(handler,request({body}))).status,400);
  assert.equal(f.reads(),initial);
  const result=await call(handler);assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.body.status,'cleared');assert.doesNotMatch(JSON.stringify(result.body),/secret|invoiceHash|ArtifactDigest/);
});
test('HTTP rejects origin, method, missing token, revoked identity and oversized body',async()=>{
  const f=fixture();const handler=createFiscalStatusHandler({getRuntime:async()=>({verifyIdentity:async()=>owner,status:f.service})});
  const h=request().headers;assert.equal((await call(handler,request({method:'GET'}))).status,405);assert.equal((await call(handler,request({headers:{...h,origin:'https://other.test'}}))).status,403);assert.equal((await call(handler,request({headers:{...h,authorization:''}}))).status,401);assert.equal((await call(handler,request({body:' '.repeat(2049)}))).status,413);
  const revoked=createFiscalStatusHandler({getRuntime:async()=>({verifyIdentity:async()=>{throw Error('secret');},status:f.service})});assert.deepEqual((await call(revoked)).body,{code:'FISCAL_AUTH_INVALID'});
  const disabled=createFiscalStatusHandler({getRuntime:async()=>{throw Error('secret');}});assert.equal((await call(disabled)).status,503);assert.equal(f.reads(),0);
});
test('QA runtime refuses production, emulator and wrong project tokens',()=>{
  const env={VERCEL_ENV:'preview',LOUREX_FISCAL_STATUS_ENABLED:'true',LOUREX_FISCAL_QA_PROJECT_ID:'lourex-fiscal-qa'};
  const project=fiscalQaProject(env);assert.equal(project,'lourex-fiscal-qa');
  for(const patch of [{VERCEL_ENV:'production'},{LOUREX_FISCAL_STATUS_ENABLED:'false'},{LOUREX_FISCAL_QA_PROJECT_ID:'lourex-invoice'},{FIRESTORE_EMULATOR_HOST:'localhost:8080'},{FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'}])assert.throws(()=>fiscalQaProject({...env,...patch}));
  const decoded={uid:owner.uid,sub:owner.uid,aud:project,iss:'https://securetoken.google.com/'+project,firebase:{sign_in_provider:'password'}};assert.deepEqual(fiscalQaIdentity(decoded,project),owner);
  for(const patch of [{aud:'lourex-invoice'},{lourexAiRole:'viewer'},{lourexWorkspaceUid:'other'},{sub:'other'},{firebase:{sign_in_provider:'anonymous'}}])assert.throws(()=>fiscalQaIdentity({...decoded,...patch},project));
});
