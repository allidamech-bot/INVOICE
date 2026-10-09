import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyFirebaseIdToken} from '../api/_ai/firebase-auth.js';
import core from '../api/ai-core.js';
import advisor from '../api/ai-advisor-v2.js';
import conversation from '../api/ai-conversation-v3.js';
import inbox from '../api/ai-inbox.js';
import customer from '../api/customer-capture-ai.js';
import supplier from '../api/supplier-capture-ai.js';
import supplierDocument from '../api/supplier-document-ai.js';
import product from '../api/product-source-ai.js';
import mapping from '../api/product-import-ai.js';
import quote from '../api/quote-source-ai.js';
import quotePricing from '../api/quote-pricing-intent.js';
import removeBackground from '../api/remove-background.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const kid='fixture-key';
const jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'};
function token(patch={}){
  const now=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({aud:'lourex-invoice',iss:'https://securetoken.google.com/lourex-invoice',
    sub:'test-account',iat:now-10,exp:now+3600,auth_time:now-30,...patch})).toString('base64url');
  const data=header+'.'+payload;
  return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
function request(authorization='',origin='https://invoice-three-puce.vercel.app'){
  const req=Readable.from(['{}']);
  req.method='POST';
  req.headers={host:'invoice-three-puce.vercel.app',origin,'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'192.0.2.21',...(authorization?{authorization}:{} )};
  req.socket={remoteAddress:'192.0.2.21'};
  return req;
}
function response(){
  return{statusCode:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},
    end(text){this.body=JSON.parse(String(text||'{}'));}};
}

test('all paid AI endpoints require a verified account, including background removal',async()=>{
  const handlers=[core,advisor,conversation,inbox,customer,supplier,supplierDocument,product,mapping,quote,quotePricing,removeBackground];
  for(const handler of handlers){
    const res=response();
    await handler(request(),res);
    assert.equal(res.statusCode,401,handler.name);
    assert.equal(res.body?.code,'AI_AUTH_REQUIRED');
  }
});
test('signed Google Firebase token is accepted while wrong project, issuer and expired tokens fail',async()=>{
  const previous=globalThis.fetch;
  let keyRequests=0;
  globalThis.fetch=async url=>{
    if(!String(url).includes('/service_accounts/v1/jwk/'))throw new Error('AI provider must not be called by auth tests.');
    keyRequests+=1;
    return{ok:true,headers:new Headers({'cache-control':'public, max-age=300'}),json:async()=>({keys:[jwk]})};
  };
  try{
    assert.equal((await verifyFirebaseIdToken(token())).uid,'test-account');
    const res=response();await core(request('Bearer '+token()),res);
    assert.equal(res.statusCode,400);
    assert.equal(res.body?.code,'INVALID_CONTEXT');
    const priceRes=response();await quotePricing(request('Bearer '+token()),priceRes);
    assert.equal(priceRes.statusCode,400);
    assert.equal(priceRes.body?.code,'EMPTY_INSTRUCTION');
    assert.equal(keyRequests,1);
    for(const changed of [{aud:'different-project'},{iss:'https://securetoken.google.com/other'},{exp:1},{sub:''}]){
      await assert.rejects(verifyFirebaseIdToken(token(changed)),/Invalid Firebase ID token/);
    }
    await assert.rejects(verifyFirebaseIdToken(token().slice(0,-3)+'abc'),/Invalid Firebase ID token/);
    const foreign=response();await core(request('Bearer '+token(),'https://untrusted.example'),foreign);
    assert.equal(foreign.statusCode,403);
  }finally{globalThis.fetch=previous;}
});
