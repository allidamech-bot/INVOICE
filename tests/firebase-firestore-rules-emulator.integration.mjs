import test from 'node:test';
import assert from 'node:assert/strict';

const project='demo-lourex-ai-integration-719';
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
const token=(uid,claims={})=>{
  const now=Math.floor(Date.now()/1000);
  const base64url=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  return base64url({alg:'none',typ:'JWT'})+'.'+base64url({
    iss:'https://securetoken.google.com/'+project,aud:project,
    user_id:uid,sub:uid,auth_time:now,iat:now,exp:now+3600,
    firebase:{identities:{},sign_in_provider:'password'},...claims
  })+'.';
};
async function rest(uid,method,path,body,claims={}){
  const headers={'Content-Type':'application/json'};
  if(uid)headers.Authorization='Bearer '+token(uid,claims);
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

test('Owner-only release denies all delegated and invalid role claims at Firestore cloud write boundary',async()=>{
  const uid='qa-role-bound';
  const path='/users/'+uid+'/workspace/meta';
  const body={fields:{format:{stringValue:'LOUREX_PLAIN_WORKSPACE_V2'},revision:{stringValue:'roles-baseline'},payload:firebaseValue(subject)}};
  const owner=await rest(uid,'PATCH',path,body,{lourexAiRole:'owner',lourexWorkspaceUid:uid});
  assert.equal(owner.status,200,'signed owner should retain cloud writes: '+owner.body);
  const viewer={lourexAiRole:'viewer',lourexWorkspaceUid:uid};
  const canRead=await rest(uid,'GET',path,undefined,viewer);
  assert.equal(canRead.status,200,'verified viewer retains read-only access: '+canRead.body);
  for(const claims of [viewer,...['admin','finance','sales','purchasing'].map(lourexAiRole=>({lourexAiRole,lourexWorkspaceUid:uid})),{lourexAiRole:'invalid'},{lourexAiRole:null},
    {lourexAiRole:'owner',lourexWorkspaceUid:'other-account'},
    {firebase:{identities:{},sign_in_provider:'anonymous'}}]){
    const write=await rest(uid,'PATCH',path,body,claims);
    assert.equal(write.status,403,'Forbidden claim must not write workspace: '+JSON.stringify(claims));
    const remove=await rest(uid,'DELETE',path,undefined,claims);
    assert.equal(remove.status,403,'Forbidden claim must not delete workspace: '+JSON.stringify(claims));
  }
  const after=await rest(uid,'GET',path,undefined,{lourexAiRole:'owner'});
  assert.equal(after.status,200,'denied changes must preserve owner data: '+after.body);
  const legacy=await rest(uid,'PATCH',path,body);
  assert.equal(legacy.status,200,'existing single-UID owners without custom claims remain supported: '+legacy.body);
});

test('Viewer cannot create, mutate or revoke owner share links; anonymous portal retains expiring read',async()=>{
 const owner='qa-share-owner',shareId='Q'.repeat(43),path='/publicShares/'+shareId;
 const payload={fields:{
  format:{stringValue:'LOUREX_SECURE_SHARE_V1'},version:{integerValue:'1'},
  ownerUid:{stringValue:owner},documentId:{stringValue:'issued-document'},
  customerId:{stringValue:'customer-1'},expiresAt:{timestampValue:new Date(Date.now()+86400000).toISOString()},
  revokedAt:{nullValue:null},viewedAt:{nullValue:null},
  decision:{stringValue:''},customerComment:{stringValue:''}
 }};
 const viewer={lourexAiRole:'viewer'},signedOwner={lourexAiRole:'owner'};
 const viewerCreate=await rest(owner,'PATCH',path,payload,viewer);
 assert.equal(viewerCreate.status,403,'viewer cannot create public shares');
 const created=await rest(owner,'PATCH',path,payload,signedOwner);
 assert.equal(created.status,200,'owner must still create valid shares: '+created.body);
 const anonymous={firebase:{identities:{},sign_in_provider:'anonymous'}};
 const portalRead=await rest('qa-share-portal','GET',path,undefined,anonymous);
 assert.equal(portalRead.status,200,'anonymous customer may read active opaque-token share: '+portalRead.body);
 const viewerRead=await rest(owner,'GET',path,undefined,viewer);
 assert.equal(viewerRead.status,200,'viewer may view links belonging to this UID');
 const viewerUpdate=await rest(owner,'PATCH',path,payload,viewer);
 assert.equal(viewerUpdate.status,403,'viewer cannot overwrite or revoke owner share');
 const viewerDelete=await rest(owner,'DELETE',path,undefined,viewer);
 assert.equal(viewerDelete.status,403,'viewer cannot delete owner share');
 const stillActive=await rest('qa-share-portal','GET',path,undefined,anonymous);
 assert.equal(stillActive.status,200,'failed viewer mutations must not revoke customer share');
});
