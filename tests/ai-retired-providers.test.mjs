import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AI_MODEL_REGISTRY,routeAiStructured} from '../api/_ai/router.js';
import {SYNTHETIC_PROVIDER_IDS,runSyntheticProviderDiagnostic,providerConfigurationSnapshot,checkProviderCredential} from '../api/_ai/provider-diagnostics.js';
const retired=['cloudflare','gemini','kilo','openrouter'];
test('only retained providers exist in registry, diagnostics and configuration',()=>{
 assert.deepEqual([...new Set(AI_MODEL_REGISTRY.map(m=>m.provider))].sort(),['groq','ollama']);
 assert.deepEqual([...SYNTHETIC_PROVIDER_IDS].sort(),['groq','ollama']);
 assert.deepEqual(providerConfigurationSnapshot({}).map(p=>p.provider).sort(),['groq','ollama']);
});
test('removed diagnostics cannot generate even if requested directly',async()=>{
 for(const provider of retired){let calls=0;const result=await runSyntheticProviderDiagnostic(provider,{fetchImpl:async()=>{calls++;throw Error('No retired egress');}});assert.equal(result.status,'INVALID_PROVIDER');assert.equal(calls,0);const key=await checkProviderCredential(provider,{fetchImpl:async()=>{calls++;throw Error('No retired metadata');}});assert.equal(key.status,'INVALID_PROVIDER');assert.equal(calls,0);}
});
test('retired secrets cannot configure a route, including raw PDF',async()=>{
 const original={...process.env},oldFetch=globalThis.fetch;let calls=0;
 try{delete process.env.GROQ_API_KEY;delete process.env.OLLAMA_API_KEY;Object.assign(process.env,{GEMINI_API_KEY:'retired',CLOUDFLARE_AI_API_TOKEN:'retired',CLOUDFLARE_ACCOUNT_ID:'retired',OPENROUTER_API_KEY:'retired',KILO_API_KEY:'retired',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true'});
 globalThis.fetch=async()=>{calls++;throw Error('No egress');};
 for(const attachments of [[],[{kind:'image',mimeType:'image/png',data:'fake'}],[{kind:'native-document',mimeType:'application/pdf',data:'fake'}]]){const r=await routeAiStructured({taskType:'business_copilot',prompt:'Synthetic',schema:{type:'object'},attachments});assert.equal(r.success,false);}
 assert.equal(calls,0);
 }finally{for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original);globalThis.fetch=oldFetch;}
});
test('production AI adapters contain no retired endpoints or secret lookups',async()=>{
 for(const path of ['api/_ai/router.js','api/_ai/provider-diagnostics.js']){
 const s=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(s,/generativelanguage\.googleapis|api\.cloudflare\.com|openrouter\.ai|kilo\.ai|GEMINI_API_KEY|CLOUDFLARE_AI_API_TOKEN|OPENROUTER_API_KEY|KILO_API_KEY/);
 }
});

test('a four-page image source cannot silently lose a page on the retained vision model',async()=>{
 const oldKey=process.env.GROQ_API_KEY,oldFetch=globalThis.fetch;let calls=0;process.env.GROQ_API_KEY='synthetic';
 try{globalThis.fetch=async()=>{calls++;throw Error('Oversized image set must not dispatch');};
 const r=await routeAiStructured({taskType:'business_source_summary',prompt:'All pages',schema:{type:'object'},attachments:Array.from({length:4},()=>({kind:'image',mimeType:'image/png',data:'fake'}))});
 assert.equal(r.success,false);assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;}
});
