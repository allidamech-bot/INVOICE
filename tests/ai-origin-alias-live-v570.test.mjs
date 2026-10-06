import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import aiCoreHandler from '../api/ai-core.js';
import advisorHandler from '../api/ai-advisor-v2.js';

function request({origin,host='invoice-internal.vercel.app',fetchSite='',ip='v570'}){
  const req=Readable.from(['{}']);
  req.method='POST';
  req.headers={
    host,
    origin,
    'x-forwarded-host':host,
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':ip
  };
  if(fetchSite)req.headers['sec-fetch-site']=fetchSite;
  req.socket={remoteAddress:ip};
  return req;
}

function response(){
  return{
    statusCode:0,
    headers:{},
    body:null,
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    end(body){this.body=JSON.parse(String(body||'{}'));}
  };
}

async function run(handler,options){
  const res=response();
  await handler(request(options),res);
  return res;
}

test('live production alias is accepted when Vercel forwards a different internal deployment host and fetch metadata is absent',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    for(const handler of [advisorHandler,aiCoreHandler]){
      const res=await run(handler,{origin:'https://invoice-three-puce.vercel.app',host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app'});
      assert.notEqual(res.statusCode,403);
      assert.doesNotMatch(String(res.body?.code||''),/ORIGIN_REJECTED/);
    }
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('explicit cross-site metadata stays rejected even when origin matches the production alias',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    for(const handler of [advisorHandler,aiCoreHandler]){
      const res=await run(handler,{origin:'https://invoice-three-puce.vercel.app',host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app',fetchSite:'cross-site'});
      assert.equal(res.statusCode,403);
      assert.match(String(res.body?.code||''),/ORIGIN_REJECTED/);
    }
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('foreign origins stay rejected when fetch metadata is absent',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    for(const handler of [advisorHandler,aiCoreHandler]){
      const res=await run(handler,{origin:'https://attacker.example',host:'invoice-pmt3rfqb7-alidaamishs-projects.vercel.app'});
      assert.equal(res.statusCode,403);
      assert.match(String(res.body?.code||''),/ORIGIN_REJECTED/);
    }
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});
