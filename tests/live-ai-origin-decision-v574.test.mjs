import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import advisorHandler from '../api/ai-advisor-v2.js';

function request(headers){
  const req=Readable.from([JSON.stringify({})]);
  req.method='POST';
  req.headers=headers;
  req.socket={remoteAddress:headers['x-forwarded-for']||'127.0.0.1'};
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

test('origin-omitting browser request is accepted only with same-origin fetch metadata and LOUREX intent',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    'sec-fetch-site':'same-origin',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.41'
  });
  assert.equal(res.statusCode,401);
  assert.equal(res.body?.code,'AI_AUTH_REQUIRED');
});

test('origin-omitting cross-site request remains rejected',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.42'
  });
  assert.equal(res.statusCode,403);
  assert.equal(res.body?.code,'AI_ORIGIN_REJECTED');
  assert.match(res.body?.message||'',/diag:origin-missing-cross-site/);
});

test('missing LOUREX request intent remains rejected even with same-origin metadata',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    origin:'https://invoice-three-puce.vercel.app',
    'sec-fetch-site':'same-origin',
    'x-forwarded-for':'127.0.0.43'
  });
  assert.equal(res.statusCode,403);
  assert.equal(res.body?.code,'AI_ORIGIN_REJECTED');
  assert.match(res.body?.message||'',/diag:intent/);
});

test('foreign cross-site origin remains rejected',async()=>{
  const res=await invoke({
    host:'invoice-three-puce.vercel.app',
    origin:'https://attacker.example',
    'sec-fetch-site':'cross-site',
    'x-requested-with':'LOUREX-Invoice',
    'x-forwarded-for':'127.0.0.44'
  });
  assert.equal(res.statusCode,403);
  assert.equal(res.body?.code,'AI_ORIGIN_REJECTED');
  assert.match(res.body?.message||'',/diag:fetch-cross-site/);
});
