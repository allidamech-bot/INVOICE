import test from 'node:test';
import assert from 'node:assert/strict';
import {createSign,generateKeyPairSync} from 'node:crypto';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {verifyFirebaseIdToken} from '../api/_ai/firebase-auth.js';
import aiCore from '../api/ai-core.js';
import removeBackground from '../api/remove-background.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const now=1760000000;
const certificates=async()=>({'unit-test-key':publicKey.export({type:'spki',format:'pem'})});
function token(payload={},header={}){
  const h={alg:'RS256',typ:'JWT',kid:'unit-test-key',...header};
  const p={iss:'https://securetoken.google.com/lourex-invoice',aud:'lourex-invoice',
    sub:'firebase-user-a',iat:now-60,exp:now+300,auth_time:now-600,...payload};
  const input=[h,p].map(part=>Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  const signer=createSign('RSA-SHA256');signer.update(input);signer.end();
  return input+'.'+signer.sign(privateKey).toString('base64url');
}

test('Firebase signed user token is accepted only with valid signature, issuer, audience and lifetime',async()=>{
  const valid=token();
  assert.deepEqual(await verifyFirebaseIdToken('Bearer '+valid,now,certificates),{uid:'firebase-user-a',authTime:now-600});
  assert.equal(await verifyFirebaseIdToken(null,now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer not-a-jwt',now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({aud:'another-project'}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({iss:'https://securetoken.google.com/another-project'}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({exp:now}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({iat:now+1}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({auth_time:now+1}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({sub:''}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({}, {alg:'HS256'}),now,certificates),null);
  assert.equal(await verifyFirebaseIdToken('Bearer '+token({}, {kid:'unknown'}),now,certificates),null);
  const altered=valid.slice(0,-4)+'AAAA';
  assert.equal(await verifyFirebaseIdToken('Bearer '+altered,now,certificates),null);
});

function request(){
  const req=Readable.from(['{}']);
  req.method='POST';
  req.headers={host:'invoice-three-puce.vercel.app',origin:'https://invoice-three-puce.vercel.app',
    'x-requested-with':'LOUREX-Invoice','sec-fetch-site':'same-origin',
    'x-forwarded-for':'127.0.1.99'};
  req.socket={remoteAddress:'127.0.1.99'};
  return req;
}
function response(){
  return{statusCode:0,body:null,setHeader(){},end(value){this.body=JSON.parse(value);}};
}
test('unauthenticated AI model and paid background-removal endpoints fail closed before provider access',async()=>{
  for(const handler of [aiCore,removeBackground]){
    const res=response();await handler(request(),res);
    assert.equal(res.statusCode,401);
    assert.equal(res.body?.code,'AI_AUTH_REQUIRED');
  }
});

test('every provider-backed LOUREX AI route requires verified Firebase ID token',async()=>{
  const endpoints=[
    'ai-core','ai-advisor-v2','ai-conversation-v3','ai-inbox',
    'customer-capture-ai','supplier-capture-ai','supplier-document-ai',
    'product-source-ai','product-import-ai','quote-source-ai','remove-background'
  ];
  for(const endpoint of endpoints){
    const source=await readFile(new URL(`../api/${endpoint}.js`,import.meta.url),'utf8');
    assert.match(source,/import \{requireAiAuth\} from '\.\/_ai\/firebase-auth\.js'/,endpoint);
    assert.match(source,/if\(!await requireAiAuth\(request,response,sendJson\)\)return;/,endpoint);
  }
  const requestSource=await readFile(new URL('../src/lib/ai-request.ts',import.meta.url),'utf8');
  const logoSource=await readFile(new URL('../src/lib/logo-rebuild.ts',import.meta.url),'utf8');
  const mappingSource=await readFile(new URL('../src/lib/product-import-ai.ts',import.meta.url),'utf8');
  for(const [label,source] of [['shared AI requests',requestSource],['logo AI upload',logoSource],['product mapping AI',mappingSource]]){
    assert.match(source,/const idToken=await cloudAiIdToken\(\)/,label);
    assert.match(source,/Authorization:`Bearer \$\{idToken\}`/,label);
  }
});
