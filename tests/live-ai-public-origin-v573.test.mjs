import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/ai-core.js';
import {testFirebaseBearer,withTestFirebaseKeys} from './fixtures/firebase-ai-auth.mjs';
import {testFirebaseBearer,withTestFirebaseKeys} from './fixtures/firebase-ai-auth.mjs';

function req(headers){
  const request=Readable.from([JSON.stringify({})]);
  request.method='POST';
  request.headers=headers;
  request.socket={remoteAddress:'127.0.0.1'};
  return request;
}
function res(){
  return{statusCode:0,body:null,setHeader(){},end(body){this.body=JSON.parse(String(body||'{}'));}};
}
async function invoke(headers){
  const response=res();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=withTestFirebaseKeys(originalFetch);
  try{await handler(req(headers),response);}finally{globalThis.fetch=originalFetch;}
  return response;
}

test('the verified public production alias is accepted even when Vercel invokes a deployment host',async()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=withTestFirebaseKeys(oldFetch);
  let response;try{response=await invoke({
    host:'invoice-6dw65bj10-alidaamishs-projects.vercel.app',
    origin:'https://invoice-three-puce.vercel.app',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.10',
    authorization:testFirebaseBearer()
  });
  assert.notEqual(response.statusCode,403);
  assert.equal(response.statusCode,400);
  assert.equal(response.body?.code,'INVALID_CONTEXT');
});

test('an unrelated vercel.app origin is not trusted by suffix alone',async()=>{
  const response=await invoke({
    host:'invoice-6dw65bj10-alidaamishs-projects.vercel.app',
    origin:'https://attacker-project.vercel.app',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.11'
  });
  assert.equal(response.statusCode,403);
  assert.equal(response.body?.code,'ORIGIN_REJECTED');
});

test('foreign origins remain rejected',async()=>{
  const response=await invoke({
    host:'invoice-6dw65bj10-alidaamishs-projects.vercel.app',
    origin:'https://attacker.example',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.12'
  });
  assert.equal(response.statusCode,403);
  assert.equal(response.body?.code,'ORIGIN_REJECTED');
});
