import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import aiCoreHandler from '../api/ai-core.js';
import advisorHandler from '../api/ai-advisor-v2.js';

function request({origin,host='invoice-deployment.vercel.app',ip='v562'}){
  const req=Readable.from(['{}']);
  req.method='POST';
  req.headers={
    host,
    origin,
    'x-forwarded-host':host,
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':ip
  };
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

async function run(handler,origin,host){
  const res=response();
  await handler(request({origin,host}),res);
  return res;
}

test('v562 accepts the official production alias even when Vercel forwards the deployment host',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    for(const handler of [advisorHandler,aiCoreHandler]){
      const res=await run(handler,'https://invoice-three-puce.vercel.app','invoice-abc123-alidaamishs-projects.vercel.app');
      assert.equal(res.statusCode,400);
      assert.equal(res.body?.code,'INVALID_CONTEXT');
    }
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('v562 keeps foreign origins rejected even when the browser-intent header is present',async()=>{
  const previous=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL='invoice-three-puce.vercel.app';
  try{
    for(const handler of [advisorHandler,aiCoreHandler]){
      const res=await run(handler,'https://attacker.example','invoice-abc123-alidaamishs-projects.vercel.app');
      assert.equal(res.statusCode,403);
      assert.match(String(res.body?.code||''),/ORIGIN_REJECTED/);
    }
  }finally{
    if(previous===undefined)delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL=previous;
  }
});

test('v562 accepts Vercel deployment and branch URLs as project-owned origins',async()=>{
  const previousUrl=process.env.VERCEL_URL;
  const previousBranch=process.env.VERCEL_BRANCH_URL;
  process.env.VERCEL_URL='invoice-deploy-xyz.vercel.app';
  process.env.VERCEL_BRANCH_URL='invoice-git-feature-alidaamishs-projects.vercel.app';
  try{
    const deploy=await run(advisorHandler,'https://invoice-deploy-xyz.vercel.app','internal-forwarded.vercel.app');
    assert.equal(deploy.statusCode,400);
    assert.equal(deploy.body?.code,'INVALID_CONTEXT');
    const branch=await run(aiCoreHandler,'https://invoice-git-feature-alidaamishs-projects.vercel.app','internal-forwarded.vercel.app');
    assert.equal(branch.statusCode,400);
    assert.equal(branch.body?.code,'INVALID_CONTEXT');
  }finally{
    if(previousUrl===undefined)delete process.env.VERCEL_URL;else process.env.VERCEL_URL=previousUrl;
    if(previousBranch===undefined)delete process.env.VERCEL_BRANCH_URL;else process.env.VERCEL_BRANCH_URL=previousBranch;
  }
});
