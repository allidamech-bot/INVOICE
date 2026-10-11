import test from 'node:test';
import assert from 'node:assert/strict';

const project='demo-lourex-pinless';
const origin='http://127.0.0.1:8080';
const db='/v1/projects/'+project+'/databases/(default)/documents';
const subject={company:{nameEn:'LOUREX QA'},documents:[],customers:[]};
const url=path=>origin+db+path;
const firebaseValue=value=>{
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='number')return {integerValue:String(value)};
  if(Array.isArray(value))return {arrayValue:{values:value.map(firebaseValue)}};
  if(value===null)return {nullValue:null};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,firebaseValue(v)]))}};
};
const token=uid=>{
  const now=Math.floor(Date.now()/1000);
  const base64url=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  return base64url({alg:'none',typ:'JWT'})+'.'+base64url({
    iss:'https://securetoken.google.com/'+project,aud:project,
    user_id:uid,sub:uid,auth_time:now,iat:now,exp:now+3600,
    firebase:{identities:{},sign_in_provider:'password'}
  })+'.';
};
async function rest(uid,method,path,body){
  const headers={'Content-Type':'application/json'};
  if(uid)headers.Authorization='Bearer '+token(uid);
  const response=await fetch(url(path),{method,headers,body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.text()};
}
test('Firestore rules isolate actual V2 workspace and recovery history by Firebase UID',async()=>{
  // A real emulator (not a fake Firestore object) evaluates firestore.rules.
  const alice='qa-alice',bob='qa-bob';
  const data={fields:{format:{stringValue:'LOUREX_PLAIN_WORKSPACE_V2'},revision:{stringValue:'rev-1'},
    payload:firebaseValue(subject)}};
  const own=await rest(alice,'PATCH','/users/'+alice+'/workspace/meta',data);
  assert.equal(own.status,200,'owner should write own manifest: '+own.body);
  const ownRead=await rest(alice,'GET','/users/'+alice+'/workspace/meta');
  assert.equal(ownRead.status,200,'owner should read own manifest: '+ownRead.body);
  for(const path of ['/users/'+alice+'/workspace/meta',
    '/users/'+alice+'/workspace/chunk-rev-1-00000',
    '/users/'+alice+'/workspaceHistory/rev-1']){
    const outsider=await rest(bob,'GET',path);
    assert.equal(outsider.status,403,'other Firebase UID must not read '+path+': '+outsider.body);
    const anonymous=await rest(null,'GET',path);
    assert.equal(anonymous.status,403,'unsigned request must not read '+path+': '+anonymous.body);
  }
  const overwrite=await rest(bob,'PATCH','/users/'+alice+'/workspace/meta',data);
  assert.equal(overwrite.status,403,'another UID must not overwrite account manifest');
  const deleteResult=await rest(bob,'DELETE','/users/'+alice+'/workspace/meta');
  assert.equal(deleteResult.status,403,'another UID must not delete business data');
  const restore=await rest(alice,'GET','/users/'+alice+'/workspace/meta');
  assert.equal(restore.status,200,'all unauthorized operations must leave owner data intact');
});
