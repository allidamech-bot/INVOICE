import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AI_MODEL_REGISTRY,routeAiStructured} from '../api/_ai/router.js';
import {SYNTHETIC_PROVIDER_IDS,providerConfigurationSnapshot,runSyntheticProviderDiagnostic,checkProviderCredential} from '../api/_ai/provider-diagnostics.js';
test('owner-removed Mistral cannot be restored by stale keys or opt-ins',async()=>{
 const env={...process.env},oldFetch=globalThis.fetch;let calls=0;
 try{
  for(const key of ['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY','OPENROUTER_API_KEY','OLLAMA_API_KEY'])delete process.env[key];
  Object.assign(process.env,{MISTRAL_API_KEY:'synthetic-only',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_MISTRAL_FREE_VERIFIED:'true'});
  globalThis.fetch=async()=>{calls++;throw Error('removed provider must not receive any request');};
  assert.equal(AI_MODEL_REGISTRY.some(x=>x.provider==='mistral'),false);
  assert.equal(SYNTHETIC_PROVIDER_IDS.includes('mistral'),false);
  assert.equal(providerConfigurationSnapshot().some(x=>x.provider==='mistral'),false);
  for(const mode of ['single','financial'])assert.equal((await runSyntheticProviderDiagnostic('mistral',{mode})).status,'INVALID_PROVIDER');
  assert.equal((await checkProviderCredential('mistral')).status,'INVALID_PROVIDER');
  const result=await routeAiStructured({taskType:'workspace_help',externalDataClass:'public-synthetic',prompt:'synthetic',schema:{type:'OBJECT',properties:{answer:{type:'STRING'}},required:['answer']}});
  assert.equal(result.success,false);assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
test('diagnostics page no longer exposes Mistral buttons or configuration',()=>{
 const html=readFileSync('public/health.html','utf8');assert.doesNotMatch(html,/data-provider-[^=]+="mistral"/);
});
