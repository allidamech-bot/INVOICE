import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import advisorHandler from '../api/ai-advisor-v2.js';

function responseRecorder(){
  return{
    statusCode:0,
    headers:new Map(),
    body:null,
    setHeader(name,value){this.headers.set(String(name).toLowerCase(),String(value));},
    end(body){this.body=JSON.parse(String(body||'{}'));}
  };
}

async function invoke(headers){
  const req=Readable.from([JSON.stringify({})]);
  req.method='POST';
  req.headers=headers;
  req.socket={remoteAddress:'127.0.0.1'};
  const res=responseRecorder();
  await advisorHandler(req,res);
  return res;
}

test('production alias remains accepted when Vercel exposes a deployment host and same-site metadata',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    const res=await invoke({
      host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app',
      origin:'https://invoice-three-puce.vercel.app',
      'sec-fetch-site':'same-site',
      'x-requested-with':'LOUREX-Invoice',
      'x-forwarded-for':'127.0.0.1'
    });
    assert.equal(res.statusCode,400);
    assert.equal(res.body?.code,'INVALID_CONTEXT');
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('exact host fallback accepts non-cross-site browser metadata',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    origin:'https://invoice-three-puce.vercel.app',
    'sec-fetch-site':'none',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.2'
  });
  assert.equal(res.statusCode,400);
  assert.equal(res.body?.code,'INVALID_CONTEXT');
});

test('explicit cross-site requests remain rejected even with the LOUREX intent header',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    origin:'https://evil.example',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.3'
  });
  assert.equal(res.statusCode,403);
  assert.equal(res.body?.code,'AI_ORIGIN_REJECTED');
});
