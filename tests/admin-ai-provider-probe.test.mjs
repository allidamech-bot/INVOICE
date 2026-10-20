import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {probeConfiguredProvider} from '../api/_ai/admin-provider-probe.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('owner provider probe only accepts explicit providers and has no arbitrary prompt or model input',async()=>{
  const unknown=await probeConfiguredProvider('external-paid-vendor');
  assert.equal(unknown.status,'invalid_provider');
  const server=read('api/ai-core.js'),ui=read('public/settings-diagnostics-entry-v344.js');
  assert.match(server,/provider-probe/);
  assert.match(server,/diagnosticsOwnerUidAllowed\(request\.aiVerifiedUid,process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID\)/);
  assert.match(server,/Object\.keys\(payload\)\.length!==1/);
  assert.match(ui,/ownerDiagnosticsAllowed/);
  assert.match(ui,/X-Lourex-Admin-Diagnostics':'provider-probe'/);
  assert.doesNotMatch(ui,/process\.env\.KILO_API_KEY|process\.env\.GROQ_API_KEY/);
});

test('Kilo is pinned to the zero-cost auto/free model, tested only with a fixed synthetic problem',async()=>{
  const prior=process.env.KILO_API_KEY,originalFetch=globalThis.fetch;
  const urls=[];
  process.env.KILO_API_KEY='synthetic-kilo-token-do-not-use';
  globalThis.fetch=async (url,request)=>{
    urls.push(String(url));
    assert.equal(request.headers.Authorization,'Bearer synthetic-kilo-token-do-not-use');
    const body=JSON.parse(request.body);
    assert.equal(body.model,'kilo-auto/free');
    assert.equal(body.messages.length,1);
    assert.match(body.messages[0].content,/Synthetic arithmetic check/);
    assert.equal(body.stream,false);
    return{ok:true,status:200,json:async()=>({choices:[{message:{content:'1062.00'}}]})};
  };
  try{
    const good=await probeConfiguredProvider('kilo');
    assert.equal(good.status,'passed');
    assert.equal(good.model,'kilo-auto/free');
    assert.deepEqual(urls,['https://api.kilo.ai/api/gateway/chat/completions']);
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:'1000.00'}}]})});
    const incorrect=await probeConfiguredProvider('kilo');
    assert.equal(incorrect.status,'incorrect_answer');
    globalThis.fetch=async()=>({ok:false,status:402});
    const paid=await probeConfiguredProvider('kilo');
    assert.equal(paid.status,'payment_required');
  }finally{
    globalThis.fetch=originalFetch;
    if(prior===undefined)delete process.env.KILO_API_KEY;else process.env.KILO_API_KEY=prior;
  }
});
