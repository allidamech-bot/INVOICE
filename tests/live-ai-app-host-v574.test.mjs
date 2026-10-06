import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import advisorHandler from '../api/ai-advisor-v2.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function request(headers){
  const req=Readable.from([JSON.stringify({})]);
  req.method='POST';
  req.headers=headers;
  req.socket={remoteAddress:'127.0.0.1'};
  return req;
}
function response(){
  return{statusCode:0,body:null,setHeader(){},end(body){this.body=JSON.parse(String(body||'{}'));}};
}
async function invoke(headers){
  const res=response();
  await advisorHandler(request(headers),res);
  return res;
}

test('verified LOUREX app-host header allows production AI when browser Origin is absent',async()=>{
  const res=await invoke({
    host:'invoice-748rmtzc0-alidaamishs-projects.vercel.app',
    'x-requested-with':'LOUREX-Invoice',
    'x-lourex-app-host':'invoice-three-puce.vercel.app',
    'x-forwarded-for':'127.0.0.20'
  });
  assert.equal(res.statusCode,400);
  assert.equal(res.body?.code,'INVALID_CONTEXT');
});

test('untrusted declared app host remains rejected when browser Origin is absent',async()=>{
  const res=await invoke({
    host:'invoice-748rmtzc0-alidaamishs-projects.vercel.app',
    'x-requested-with':'LOUREX-Invoice',
    'x-lourex-app-host':'attacker-project.vercel.app',
    'x-forwarded-for':'127.0.0.21'
  });
  assert.equal(res.statusCode,403);
  assert.equal(res.body?.code,'AI_ORIGIN_REJECTED');
});

test('all AI entry points recognize the verified app-host intent header',async()=>{
  const files=[
    'api/ai-core.js','api/ai-advisor-v2.js','api/ai-conversation-v3.js','api/ai-inbox.js',
    'api/customer-capture-ai.js','api/supplier-capture-ai.js','api/supplier-document-ai.js',
    'api/product-source-ai.js','api/product-import-ai.js','api/quote-source-ai.js'
  ];
  for(const file of files){
    const source=await read(file);
    assert.match(source,/x-lourex-app-host/,`${file} must read the explicit LOUREX app host`);
    assert.match(source,/trustedDeclaredAppHost\(request\)/,`${file} must validate the declared app host`);
    assert.match(source,/requestedWith!=='LOUREX-Invoice'/,`${file} must retain request-intent enforcement`);
  }
  const client=await read('src/lib/ai-request.ts');
  assert.match(client,/X-LOUREX-App-Host':window\.location\.host/);
});
