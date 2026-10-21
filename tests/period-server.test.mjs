import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createWorkspaceCommitHandler} from '../api/_accounting/workspace-handler.js';
import {validatePeriodCommand,decodeWorkspace,encodeWorkspace} from '../api/_accounting/period-format.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import core from '../api/ai-core.js';

const opId='a'.repeat(32),revision='b'.repeat(32);
const command={operation:'commit',opId,expectedRevision:revision,expectedGeneration:1};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const kid='period-server-qa',jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
function token(patch={}){
  const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify({sub:'qa-period-owner',aud:'lourex-invoice',iss:'https://securetoken.google.com/lourex-invoice',iat:now-10,auth_time:now-20,exp:now+3600,firebase:{sign_in_provider:'password'},...patch})).toString('base64url');
  return head+'.'+body+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+body),privateKey).toString('base64url');
}
function req(auth='',body=command,extra={}){
  const r=Readable.from([JSON.stringify(body)]);r.method='POST';
  r.headers={host:'invoice-three-puce.vercel.app',origin:'https://invoice-three-puce.vercel.app','x-requested-with':'LOUREX-Invoice',...extra,...(auth?{authorization:'Bearer '+auth}:{})};return r;
}
function res(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};}

test('command contract rejects UID/path/operator injection and requires explicit revision/generation',()=>{
  assert.deepEqual(validatePeriodCommand(command),command);
  for(const patch of [{uid:'other'},{path:'users/other/workspace/meta'},{role:'owner'},{expectedRevision:null},{expectedGeneration:-1},{opId:'../../x'},{operation:'delete'},{expectedGeneration:1.2}])
    assert.throws(()=>validatePeriodCommand({...command,...patch}));
  assert.throws(()=>validatePeriodCommand({...command,operation:'close',workspaceId:'default',through:'2026-02-29',reason:'QA'}));
  assert.throws(()=>validatePeriodCommand({...command,operation:'reopen',workspaceId:'default',reason:' '}));
});
test('chunk verification preserves the actual JSON and rejects missing, changed or oversized inputs',()=>{
  const v=emptyVault(),encoded=encodeWorkspace(v,revision);
  assert.deepEqual(decodeWorkspace(encoded.meta,encoded.chunks),v);
  assert.throws(()=>decodeWorkspace(encoded.meta,[]));
  assert.throws(()=>decodeWorkspace({...encoded.meta,sha256:'0'.repeat(64)},encoded.chunks));
  assert.throws(()=>decodeWorkspace({...encoded.meta,bytes:45_000_001},encoded.chunks));
  assert.throws(()=>decodeWorkspace(encoded.meta,encoded.chunks.map(c=>({...c,data:c.data.slice(0,-4)}))));
  assert.throws(()=>decodeWorkspace({...encoded.meta,schemaVersion:999},encoded.chunks));
});
test('endpoint authenticates the signed Firebase owner before invoking any trusted store',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,headers:new Headers({'cache-control':'max-age=300'}),json:async()=>({keys:[jwk]})});
  const calls=[],handler=createWorkspaceCommitHandler({getService:()=>({execute:async(identity,input)=>{calls.push({identity,input});return{revision,generation:2};}})});
  try{
    for(const auth of ['',token({aud:'other'}),token({exp:1}),token({firebase:{sign_in_provider:'anonymous'}}),token().slice(0,-4)+'abcd']){
      const response=res();await handler(req(auth),response);assert.equal(response.statusCode,401);
    }
    for(const role of ['viewer','finance','sales','admin','purchasing']){
      const response=res();await handler(req(token({lourexAiRole:role})),response);assert.equal(response.statusCode,403);
    }
    const cross=res();await handler(req(token({lourexAiRole:'owner',lourexWorkspaceUid:'another'})),cross);assert.equal(cross.statusCode,401);
    assert.equal(calls.length,0);
    const good=res();await handler(req(token()),good);assert.equal(good.statusCode,200);
    assert.equal(calls[0].identity.uid,'qa-period-owner');assert.equal(calls[0].identity.role,'owner');assert.deepEqual(calls[0].input,command);
    const foreign=res();await handler(req(token(),command,{origin:'https://evil.example'}),foreign);assert.equal(foreign.statusCode,403);
    const injected=res();await handler(req(token(),{...command,uid:'another'}),injected);assert.equal(injected.statusCode,400);
    assert.equal(calls.length,1);
  }finally{globalThis.fetch=previous;}
});
test('endpoint bounds input and returns safe failures without exposing upstream credentials',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,headers:new Headers({'cache-control':'max-age=300'}),json:async()=>({keys:[jwk]})});
  const handler=createWorkspaceCommitHandler({getService:()=>{throw new Error('private_key=DO_NOT_EXPOSE');}});
  try{
    const huge=res();await handler(req(token(),{...command,padding:'x'.repeat(17000)}),huge);assert.equal(huge.statusCode,413);
    const failed=res();await handler(req(token()),failed);assert.equal(failed.statusCode,503);assert.doesNotMatch(JSON.stringify(failed.body),/private_key|DO_NOT_EXPOSE/);
    assert.equal(failed.headers['Cache-Control'],'no-store');
  }finally{globalThis.fetch=previous;}
});
test('Arabic reasons survive a request split inside a UTF-8 character',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,headers:new Headers({'cache-control':'max-age=300'}),json:async()=>({keys:[jwk]})});
  const reason='إقفال أكتوبر',input={...command,operation:'close',workspaceId:'default',through:'2026-10-31',reason};
  const bytes=Buffer.from(JSON.stringify(input)),split=bytes.indexOf(0xd8)+1;
  const request=Readable.from([bytes.subarray(0,split),bytes.subarray(split)]),template=req(token());request.method='POST';request.headers=template.headers;
  let saved;const handler=createWorkspaceCommitHandler({getService:()=>({execute:async(_identity,value)=>{saved=value.reason;return{revision,generation:2};}})});
  try{const response=res();await handler(request,response);assert.equal(response.statusCode,200);assert.equal(saved,reason);}finally{globalThis.fetch=previous;}
});
test('the public financial alias uses deterministic transport without a thirteenth function or AI request',async()=>{
  const previous=globalThis.fetch,enabled=process.env.LOUREX_PERIOD_SERVER_ENABLED;
  process.env.LOUREX_PERIOD_SERVER_ENABLED='false';
  globalThis.fetch=async url=>{assert.match(String(url),/service_accounts\/v1\/jwk/);return{ok:true,headers:new Headers({'cache-control':'max-age=300'}),json:async()=>({keys:[jwk]})};};
  try{
    const request=req(token());request.query={lourexPeriod:'1'};const response=res();await core(request,response);
    assert.equal(response.statusCode,503);assert.equal(response.body.code,'PERIOD_SERVICE_UNAVAILABLE');
    const foreign=req(token());foreign.query={lourexPeriod:'1'};foreign.headers.origin='https://evil.example';const denied=res();await core(foreign,denied);assert.equal(denied.statusCode,403);
  }finally{globalThis.fetch=previous;if(enabled===undefined)delete process.env.LOUREX_PERIOD_SERVER_ENABLED;else process.env.LOUREX_PERIOD_SERVER_ENABLED=enabled;}
});
