import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/ai-core.js';
import {testFirebaseBearer,withTestFirebaseKeys} from './fixtures/firebase-ai-auth.mjs';
import {testFirebaseBearer,withTestFirebaseKeys} from './fixtures/firebase-ai-auth.mjs';

function request(headers,body='{}'){
  const req=Readable.from([body]);
  req.method='POST';
  req.headers={...headers,authorization:testFirebaseBearer()};
  req.socket={remoteAddress:'127.0.0.1'};
  return req;
}
function response(){
  return {statusCode:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},end(body){this.body=body?JSON.parse(body):null;}};
}

test('production canonical origin is accepted when Vercel invokes the function on a different deployment host',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=withTestFirebaseKeys(originalFetch);
  try{
    const req=request({
      host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app',
      origin:'https://invoice-three-puce.vercel.app',
      'x-requested-with':'LOUREX-Invoice',
      'sec-fetch-site':'cross-site',
      'x-forwarded-for':'127.0.0.1',
      authorization:testFirebaseBearer()
    });
    const res=response();
    const previousFetch=globalThis.fetch;
    globalThis.fetch=withTestFirebaseKeys(previousFetch);
    try{await handler(req,res);}finally{globalThis.fetch=previousFetch;}
    assert.notEqual(res.statusCode,403);
    assert.equal(res.statusCode,400);
    assert.equal(res.body?.code,'INVALID_CONTEXT');
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('foreign origin remains rejected even when production canonical host is configured',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=withTestFirebaseKeys(originalFetch);
  try{
    const req=request({
      host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app',
      origin:'https://attacker.example',
      'x-requested-with':'LOUREX-Invoice',
      'sec-fetch-site':'cross-site',
      'x-forwarded-for':'127.0.0.2'
    });
    const res=response();
    await handler(req,res);
    assert.equal(res.statusCode,403);
    assert.equal(res.body?.code,'ORIGIN_REJECTED');
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});
