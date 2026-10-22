import test from 'node:test';
import assert from 'node:assert/strict';

// AI Controller PDF permission boundary, using the LOCAL Firestore emulator.
// No production Firebase credentials, real customers, or accounting writes.
const project='demo-lourex-ai-integration-719';
const origin='http://127.0.0.1:8080';
const root='projects/'+project+'/databases/(default)/documents';
const documentsUrl=origin+'/v1/'+root;
const uid='qa-ai-pdf-ordinary-user-20261023';
const viewerUid='qa-ai-pdf-viewer-20261023';

function firebaseJwt(user,claims={}){
  const now=Math.floor(Date.now()/1000);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({alg:'none',typ:'JWT'})+'.'+encode({
    iss:'https://securetoken.google.com/'+project,aud:project,
    user_id:user,sub:user,auth_time:now,iat:now,exp:now+3600,
    firebase:{identities:{},sign_in_provider:'password'},...claims
  })+'.';
}
async function request(user,method,path,body,claims={}){
  const headers={'Content-Type':'application/json'};
  if(user)headers.Authorization='Bearer '+firebaseJwt(user,claims);
  const response=await fetch(documentsUrl+path,{
    method,headers,body:body===undefined?undefined:JSON.stringify(body)
  });
  return {status:response.status,body:await response.text()};
}
function record(user,id){
  return {fields:{
    format:{stringValue:'LOUREX_SECURE_SHARE_V1'},
    version:{integerValue:'1'},ownerUid:{stringValue:user},
    documentId:{stringValue:'synthetic-issued-qa-invoice'},
    customerId:{stringValue:'synthetic-qa-customer'},
    expiresAt:{timestampValue:new Date(Date.now()+86_400_000).toISOString()},
    revokedAt:{nullValue:null},viewedAt:{nullValue:null},
    decision:{stringValue:''},customerComment:{stringValue:''},
    allowDecision:{booleanValue:false},
    snapshot:{mapValue:{fields:{id:{stringValue:'synthetic-issued-qa-invoice'},
      number:{stringValue:'INV-QA-ONLY'},currency:{stringValue:'USD'}}}}
  }};
}
function paths(user,id){
  const fingerprint='a'.repeat(64);
  return {
    share:'/publicShares/'+id,
    binding:'/users/'+user+'/documentElectronicCopies/'+fingerprint
  };
}
function createElectronicQrTransaction(user,id){
  const location=paths(user,id);
  return {writes:[
    {update:{name:root+location.share,fields:record(user,id).fields},
      currentDocument:{exists:false}},
    {update:{name:root+location.binding,fields:{
      token:{stringValue:id},
      documentId:{stringValue:'synthetic-issued-qa-invoice'},
      fingerprint:{stringValue:'a'.repeat(64)},
      createdAt:{timestampValue:new Date().toISOString()}
    }},currentDocument:{exists:false}}
  ]};
}

test('ordinary password account with NO privileged custom claims can atomically create its own QR and private binding',async()=>{
  const id='A'.repeat(43),path=paths(uid,id);
  const write=await request(uid,'POST',':commit',createElectronicQrTransaction(uid,id));
  assert.equal(write.status,200,'QR + binding should be allowed for the normal owner of a standalone account: '+write.body);
  const share=await request(uid,'GET',path.share);
  const binding=await request(uid,'GET',path.binding);
  assert.equal(share.status,200,'the standard owner must read its QR share: '+share.body);
  assert.equal(binding.status,200,'the standard owner must read its private QR binding: '+binding.body);
  assert.match(share.body,/INV-QA-ONLY/);
  assert.match(binding.body,/A{43}/);
  const unrelated='qa-ai-pdf-unrelated-uid';
  assert.equal((await request(unrelated,'GET',path.share)).status,403,
    'another signed-in account must not access the share without anonymous portal access');
  assert.equal((await request(unrelated,'GET',path.binding)).status,403,
    'another signed-in account must not read a private QR binding');
});

test('verified read-only viewer cannot create a PDF QR or its binding; rejection is atomic',async()=>{
  const id='B'.repeat(43),claims={lourexAiRole:'viewer',lourexWorkspaceUid:viewerUid};
  const denied=await request(viewerUid,'POST',':commit',createElectronicQrTransaction(viewerUid,id),claims);
  assert.equal(denied.status,403,'read-only viewer must not create the public QR or private index: '+denied.body);
  const owner=await request(viewerUid,'POST',':commit',createElectronicQrTransaction(viewerUid,id),
    {lourexAiRole:'owner',lourexWorkspaceUid:viewerUid});
  assert.equal(owner.status,200,'fresh owner-only creation proves viewer transaction did not commit either document: '+owner.body);
  const binding=await request(viewerUid,'GET',paths(viewerUid,id).binding,undefined,claims);
  assert.equal(binding.status,200,'the viewer may inspect an existing owner link, not issue one: '+binding.body);
});

test('unsigned user cannot create a share and private binding as a signed-in account',async()=>{
  const id='C'.repeat(43);
  const denied=await request(null,'POST',':commit',createElectronicQrTransaction('qa-ai-pdf-unsigned',id));
  assert.equal(denied.status,403,'missing auth must not publish synthetic QR records');
});
