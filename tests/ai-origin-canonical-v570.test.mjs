import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/ai-core.js';

function request(headers,body='{}'){
  const req=Readable.from([body]);
  req.method='POST';
  req.headers=headers;
  req.socket={remoteAddress:'127.0.0.1'};
  return req;
}
function response(){
  return {statusCode:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},end(body){this.body=body?JSON.parse(body):null;}};
}

test('production canonical origin is accepted when Vercel invokes the function on a different deployment host',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    const req=request({
      host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app',
      origin:'https://invoice-three-puce.vercel.app',
      'x-requested-with':'LOUREX-Invoice',
      'sec-fetch-site':'cross-site',
      'x-forwarded-for':'127.0.0.1'
    });
    const res=response();
    await handler(req,res);
    assert.notEqual(res.statusCode,403);
    assert.equal(res.statusCode,401);
    assert.equal(res.body?.code,'AI_AUTH_REQUIRED');
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('foreign origin remains rejected even when production canonical host is configured',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
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
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});
