import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleGeminiFreeModels,eligibleCloudflareFreeModels} from '../api/_ai/provider-free-catalog.js';
test('Gemini account list is intersected with published free text generation models',()=>{
  const m=eligibleGeminiFreeModels({models:[
    {name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3-flash-preview',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-4-argon',supportedGenerationMethods:['generateContent']},
    {name:'models/gemini-3.8-live',supportedGenerationMethods:['bidiGenerateContent']},
    {name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['countTokens']},
    {name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}
  ]});
  assert.deepEqual(m.map(row=>row.model),['gemini-3.8-flash','gemini-3-flash-preview']);
  assert.ok(m.every(row=>row.maxImages===0));
});
test('Cloudflare account list excludes billing-required and non-chat models',()=>{
 const m=eligibleCloudflareFreeModels({result:[
  {name:'@cf/meta/llama-3.2-3b-instruct',task:'text-generation'},
  {name:'@cf/zai-org/glm-5.3',task:'text-generation'},
  {name:'@cf/meta/llama-guard-3-8b',task:'text-generation'},
  {name:'@cf/openai/gpt-oss-20b',task:{name:'text-generation'}},
  {name:'@cf/openai/gpt-oss-20b',task:'text-generation'},
  {name:'@cf/qwen/qwen3.8-27b',task:'text-to-image'}
 ]});
 assert.deepEqual(m.map(row=>row.model),['@cf/meta/llama-3.2-3b-instruct','@cf/openai/gpt-oss-20b']);
});
test('unknown or malformed catalog never authorizes a chat model',()=>{
 assert.deepEqual(eligibleGeminiFreeModels({models:[{name:'models/gemini-4-argon'}]}),[]);
 assert.deepEqual(eligibleCloudflareFreeModels({result:[{name:'@cf/unknown/paid-model'}]}),[]);
 assert.deepEqual(eligibleCloudflareFreeModels(null),[]);
});

test('stalled catalog fetch ignoring abort cannot block routing',async()=>{
 const prevFetch=globalThis.fetch,prevTimer=globalThis.setTimeout;
 const originalEnv={...process.env};
 const m=await import('../api/_ai/provider-free-catalog.js?stall-fetch-regression');
 try{
   process.env.LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED='true';process.env.GEMINI_API_KEY='fixture';
   delete process.env.LOUREX_AI_CLOUDFLARE_FREE_PLAN_VERIFIED;
   globalThis.setTimeout=(fn,ms,...args)=>prevTimer(fn,0,...args);
   globalThis.fetch=async()=>new Promise(()=>{});
   assert.deepEqual(await m.verifiedAccountFreeCatalog(),[]);
 }finally{
   globalThis.fetch=prevFetch;globalThis.setTimeout=prevTimer;
   for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
   Object.assign(process.env,originalEnv);
 }
});
test('stalled catalog response body ignoring abort also expires',async()=>{
 const prevFetch=globalThis.fetch,prevTimer=globalThis.setTimeout;
 const originalEnv={...process.env};
 const m=await import('../api/_ai/provider-free-catalog.js?stall-body-regression');
 try{
   process.env.LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED='true';process.env.GEMINI_API_KEY='fixture';
   delete process.env.LOUREX_AI_CLOUDFLARE_FREE_PLAN_VERIFIED;
   globalThis.setTimeout=(fn,ms,...args)=>prevTimer(fn,0,...args);
   globalThis.fetch=async()=>({ok:true,text:async()=>new Promise(()=>{})});
   assert.deepEqual(await m.verifiedAccountFreeCatalog(),[]);
 }finally{
   globalThis.fetch=prevFetch;globalThis.setTimeout=prevTimer;
   for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
   Object.assign(process.env,originalEnv);
 }
});
