import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR05TrustedRegistry} from '../../api/_ai-next/trusted-model-registry.js';

const baseline=()=>buildR05TrustedRegistry({env:{},now:'2026-10-30T14:00:00Z'});
const groqEnv=()=>({
  GROQ_API_KEY:'synthetic-test-do-not-log',
  LOUREX_AI_GROQ_FREE_ACCOUNT_VERIFIED:'true',
  LOUREX_AI_GROQ_ZERO_COST_MODELS:'openai/gpt-oss-120b',
  LOUREX_AI_GROQ_QUOTA_AVAILABLE_VERIFIED:'true',
  LOUREX_AI_NEXT_APPROVED_PROVIDERS:'groq',
  LOUREX_AI_APPROVED_PRIVATE_PROVIDERS:'groq',
});
const record=(all,p,m)=>all.models.find(x=>x.providerId===p&&x.modelId===m);
test('server registry defaults to zero authorized inference candidates',()=>{
  const r=baseline();
  assert.ok(r.models.length>0);
  assert.ok(r.models.every(x=>!x.credentialsPresent||!x.accountFreeVerified||
    !x.modelZeroCostVerified||!x.privacyApproved||!x.quotaAvailable));
  assert.ok(r.models.every(x=>!/mistral/i.test(x.modelId)));
});
test('requires explicit account, per-model zero price, quota and privacy evidence',()=>{
  const r=buildR05TrustedRegistry({env:groqEnv()});
  const allowed=record(r,'groq','openai/gpt-oss-120b');
  assert.equal(allowed.credentialsPresent,true);
  assert.equal(allowed.accountFreeVerified,true);
  assert.equal(allowed.modelZeroCostVerified,true);
  assert.equal(allowed.quotaAvailable,true);
  assert.equal(allowed.privacyApproved,true);
  assert.equal(record(r,'groq','qwen/qwen3.8-27b').modelZeroCostVerified,false);
});
test('free catalog claim alone cannot approve missing credentials',()=>{
  const env=groqEnv();delete env.GROQ_API_KEY;
  assert.equal(record(buildR05TrustedRegistry({env}),'groq','openai/gpt-oss-120b').credentialsPresent,false);
});
test('unverified account quota blocks provider',()=>{
  const env=groqEnv();delete env.LOUREX_AI_GROQ_QUOTA_AVAILABLE_VERIFIED;
  assert.equal(record(buildR05TrustedRegistry({env}),'groq','openai/gpt-oss-120b').quotaAvailable,false);
});
test('privacy permission is independent from free eligibility',()=>{
  const env=groqEnv();delete env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS;
  const a=record(buildR05TrustedRegistry({env}),'groq','openai/gpt-oss-120b');
  assert.equal(a.modelZeroCostVerified,true);assert.equal(a.privacyApproved,false);
});
test('OpenRouter free model ID and zero catalog listing never grant account cost proof',()=>{
  const json={data:[
    {id:'synthetic/model:free',pricing:{prompt:'0',completion:'0'},
      architecture:{input_modalities:['text'],output_modalities:['text']}},
    {id:'synthetic/paid:free',pricing:{prompt:'0.01',completion:'0'},
      architecture:{input_modalities:['text'],output_modalities:['text']}},
  ]};
  const r=buildR05TrustedRegistry({
    env:{OPENROUTER_API_KEY:'synthetic',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',
      LOUREX_AI_NEXT_APPROVED_PROVIDERS:'openrouter',
      LOUREX_AI_APPROVED_PRIVATE_PROVIDERS:'openrouter'},
    catalogResponses:{openrouter:json},
  });
  assert.ok(record(r,'openrouter','synthetic/model:free'));
  assert.equal(record(r,'openrouter','synthetic/model:free').accountFreeVerified,false);
  assert.equal(record(r,'openrouter','synthetic/model:free').modelZeroCostVerified,false);
  assert.equal(record(r,'openrouter','synthetic/paid:free'),undefined);
});
test('dynamic Gemini metadata adds candidates without authorizing pricing',()=>{
  const r=buildR05TrustedRegistry({
    env:{GEMINI_API_KEY:'synthetic',LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED:'true'},
    catalogResponses:{gemini:{models:[{
      name:'models/gemini-2.5-pro',supportedGenerationMethods:['generateContent'],
    }]}},
  });
  assert.ok(record(r,'gemini','gemini-2.5-pro'));
  assert.equal(record(r,'gemini','gemini-2.5-pro').modelZeroCostVerified,false);
});
test('disallowed Mistral excluded from Groq catalog injection',()=>{
  const r=buildR05TrustedRegistry({
    env:{},catalogResponses:{groq:{models:[
      {model:'mistral-synthetic',capabilities:['TEXT']},
      {model:'synthetic-allowed',capabilities:['TEXT']},
    ]}},
  });
  assert.ok(record(r,'groq','synthetic-allowed'));
  assert.equal(record(r,'groq','mistral-synthetic'),undefined);
});
test('secret content is never returned in candidate metadata',()=>{
  const env=groqEnv();
  const r=buildR05TrustedRegistry({env});
  assert.equal(JSON.stringify(r).includes(env.GROQ_API_KEY),false);
});
