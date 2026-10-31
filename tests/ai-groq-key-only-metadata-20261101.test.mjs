/**
 * Groq no-inference server-key metadata checks, tested with a synthetic
 * in-memory fetch. Never contacts Groq or uses a real secret.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkProviderCredential} from '../api/_ai/provider-diagnostics.js';

const KEY='offline-test-groq-credential';
async function withKey(value,fn){
  const previous=process.env.GROQ_API_KEY;
  if(value===null)delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY=value;
  try{return await fn();}finally{
    if(previous===undefined)delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY=previous;
  }
}
const reply=status=>({ok:status>=200&&status<300,status,
  headers:{get:()=>null},body:{cancel:async()=>{}},
  text:async()=>{throw Error('Never read provider model list or any account data');}});

test('Groq owner verification is exactly one authenticated GET, no inference',async()=>{
  await withKey(KEY,async()=>{
    let calls=0;
    const result=await checkProviderCredential('groq',{fetchImpl:async(url,options)=>{
      calls++;
      assert.equal(url,'https://api.groq.com/openai/v1/models');
      assert.equal(options.method,'GET');
      assert.equal(options.body,undefined);
      assert.equal(options.cache,'no-store');
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer '+KEY);
      assert.equal(options.headers.Accept,'application/json');
      return reply(200);
    }});
    assert.equal(calls,1);
    assert.equal(result.provider,'groq');
    assert.equal(result.model,'openai/gpt-oss-120b');
    assert.equal(result.status,'KEY_AUTHENTICATED');
    assert.equal(result.inference,false);
    assert.equal(result.freePlanVerified,undefined);
    assert.equal(result.quotaVerified,undefined);
    assert.equal(result.billingVerified,undefined);
    assert.doesNotMatch(JSON.stringify(result),/offline-test-groq-credential/u);
  });
});

test('Groq absent server key fails closed without sending any upstream call',async()=>{
  await withKey(null,async()=>{
    const r=await checkProviderCredential('groq',{fetchImpl:async()=>{
      throw Error('No remote call permitted');
    }});
    assert.equal(r.status,'NOT_CONFIGURED');
    assert.equal(r.inference,false);
  });
});

test('Groq key failures expose only safe status, no response or secret',async()=>{
  await withKey(KEY,async()=>{
    for(const [http,expected] of [
      [401,'KEY_REJECTED'],[403,'ACCESS_DENIED'],
      [429,'RATE_LIMITED'],[500,'PROVIDER_UNAVAILABLE'],
    ]){
      const result=await checkProviderCredential('groq',{
        fetchImpl:async()=>reply(http),
      });
      assert.equal(result.status,expected);
      assert.equal(result.inference,false);
      assert.doesNotMatch(JSON.stringify(result),/offline-test-groq-credential/u);
    }
  });
});

test('Groq key check is owner-gated and cannot launch without explicit click',()=>{
  const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const api=get('api/ai-core.js'),ui=get('public/health.js'),html=get('public/health.html');
  const authenticated=api.indexOf('if(!await requireAiFirebaseAuth(request,response))return;');
  const probe=api.indexOf("request.headers['x-lourex-admin-diagnostics']==='provider-probe'");
  const owner=api.indexOf('diagnosticsOwnerUidAllowed(request.aiVerifiedUid,process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID)',probe);
  const check=api.indexOf('await checkProviderCredential(provider)',probe);
  assert.ok(authenticated>=0&&probe>authenticated&&owner>probe&&check>owner);
  assert.match(api,/diagnosticRateAllowed\(request\.aiVerifiedUid,provider\)/u);
  assert.match(api,/mode==='key-check'&&!\['groq','gemini','ollama'\]\.includes\(provider\)/u);
  assert.match(ui,/button\.addEventListener\('click',async\(\)=>/u);
  assert.match(html,/data-provider-key-check="groq"/u);
  assert.match(html,/data-provider-key-result="groq"/u);
  assert.match(ui,/body:JSON\.stringify\(\{provider,mode:'key-check'\}\)/u);
  assert.doesNotMatch(ui,/GROQ_API_KEY|https:\/\/api\.groq\.com/u);
});
