import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

let attemptedNetwork=0,keyReads=0;
function forbidNetwork(){attemptedNetwork++;throw new Error('External network is forbidden in package QA');}
for(const [mod,keys] of [[http,['get','request']],[https,['get','request']],[net,['connect','createConnection']],[tls,['connect']]])
  for(const key of keys)mod[key]=forbidNetwork;
syncBuiltinESMExports();
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const kid='synthetic-period-package-key',jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
globalThis.fetch=async url=>{
  if(String(url)!=='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')return forbidNetwork();
  keyReads++;return new Response(JSON.stringify({keys:[jwk]}),{headers:{'cache-control':'max-age=300','content-type':'application/json'}});
};

// Imports resolve only from this copied package, in a new process without any
// inherited credentials. The parent also denies filesystem reads outside it.
const {default:core}=await import('../../api/ai-core.js');
const {loadCompiledFinance}=await import('../../api/_accounting/compiled-finance-loader.js');
const {encodeWorkspace,decodeWorkspace}=await import('../../api/_accounting/period-format.js');
const {getApps}=await import('firebase-admin/app');
assert.equal(getApps().length,0,'Importing the package must not initialize a production database');
const [{emptyVault},{closedPeriodState,assertClosedPeriodUnchanged}]=await Promise.all([
  loadCompiledFinance('defaults'),loadCompiledFinance('period')
]);
const vault=emptyVault(),boundary={workspaceId:'default',through:'2026-10-21'};
vault.expenses=[{id:'qa-expense',workspaceId:'default',branchId:'main',date:'2026-10-01',
  category:'other',description:'Synthetic package QA',amount:'5.00',currency:'USD',supplierId:'',reference:'',notes:'',
  createdAt:'2026-10-01T12:00:00.000Z',updatedAt:'2026-10-01T12:00:00.000Z'}];
const encoded=encodeWorkspace(vault,'b'.repeat(32));
assert.deepEqual(decodeWorkspace(encoded.meta,encoded.chunks),vault);
assert.equal(closedPeriodState(vault,boundary).sources.expenses[0].amount,'5.00');
const changed=structuredClone(vault);changed.expenses[0].amount='6.00';
assert.throws(()=>assertClosedPeriodUnchanged(vault,changed,[boundary]),/closed period/i);

function token(patch={}){
  const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify({sub:'qa-package-owner',aud:'lourex-invoice',
    iss:'https://securetoken.google.com/lourex-invoice',iat:now-10,auth_time:now-20,exp:now+3600,
    firebase:{sign_in_provider:'password'},...patch})).toString('base64url');
  return head+'.'+body+'.'+sign('RSA-SHA256',Buffer.from(head+'.'+body),privateKey).toString('base64url');
}
const destination=new URL(process.argv[2],'https://qa-period.example');
assert.equal(destination.pathname,'/api/ai-core');
assert.equal(destination.searchParams.get('lourexPeriod'),'1');
const input={operation:'inspect',opId:'a'.repeat(32),expectedRevision:'b'.repeat(32),expectedGeneration:0};
async function request({auth='',origin='https://qa-period.example',method='POST',body=input,query=false}={}){
  const req={method,url:destination.pathname+destination.search,body,
    ...(query?{url:destination.pathname,query:Object.fromEntries(destination.searchParams)}:{}),
    headers:{host:'qa-period.example',origin,'x-requested-with':'LOUREX-Invoice',...(auth?{authorization:'Bearer '+auth}:{})}};
  const response={statusCode:0,headers:{},setHeader(key,value){this.headers[key]=value;},end(text){this.body=JSON.parse(text);}};
  await core(req,response);assert.equal(response.headers['Cache-Control'],'no-store');return response;
}
assert.equal((await request()).statusCode,401);
assert.equal((await request({method:'GET'})).statusCode,405);
assert.equal((await request({origin:'https://foreign.example'})).statusCode,403);
assert.equal((await request({auth:token({lourexAiRole:'viewer'})})).statusCode,403);
assert.equal((await request({auth:token({lourexAiRole:'owner',lourexWorkspaceUid:'someone-else'})})).statusCode,401);
assert.equal((await request({auth:token(),body:{...input,uid:'someone-else'}})).statusCode,400);
for(const query of [false,true]){
  const disabled=await request({auth:token(),query});
  assert.equal(disabled.statusCode,503);assert.equal(disabled.body.code,'PERIOD_SERVICE_UNAVAILABLE');
}
assert.ok(keyReads>0,'Signed synthetic JWT must exercise key verification');
assert.equal(attemptedNetwork,0,'Package QA attempted external I/O');
assert.equal(getApps().length,0,'Disabled service must not initialize Firebase');
console.log('PERIOD_PACKAGE_PROBE_PASS',JSON.stringify({transportCases:8,syntheticKeys:true,externalRequests:attemptedNetwork,databaseApps:0}));
