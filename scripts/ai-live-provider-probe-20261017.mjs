/**
 * ONE-TIME PRODUCTION BUILD connectivity check.
 * Only synthetic probes, no CRM/accounting/customer reads or writes.
 * No secrets or provider response bodies are ever written to report/logs.
 * Remove this build hook after retrieving results. Never run in CI.
 */
import {writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const records=[];
const MARKER='LOUREX_PROBE_PASS';
const OUT='dist/ai-provider-probe-20261017.json';
const MAX_DURATION=12_000;
function available(value){return typeof value==='string'&&value.trim().length>0;}
async function check(name,configured,fn){
  const started=Date.now();
  if(!configured){records.push({provider:name,configured:false,authentication:'NOT_CONFIGURED',inference:'NOT_RUN',ms:0});return;}
  try {
    const result=await fn();
    records.push({provider:name,configured:true,authentication:result.auth,inference:result.inference||'NOT_RUN',authHttp:result.authHttp??null,inferenceHttp:result.inferenceHttp??null,ms:Date.now()-started});
  }catch(error){
    records.push({provider:name,configured:true,authentication:'CHECK_FAILED',inference:'NOT_RUN',ms:Date.now()-started,errorCategory:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_INTERNAL'});
  }
}
async function request(url,{headers={},body=null,method='GET'}={}){
  const response=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(MAX_DURATION),redirect:'error'});
  let json=null;
  if(response.ok){
    try {json=await response.json();}catch{}
  }
  return {ok:response.ok,status:response.status,json};
}
function authStatus(r){if(r.status===401||r.status===403)return'REJECTED';if(r.status===429)return'RATE_LIMITED';if(r.ok)return'ACCEPTED';return'UNVERIFIED';}
function validOpenAI(r){let payload=r.json?.result?.choices?r.json.result:r.json;let content=payload?.choices?.[0]?.message?.content;return typeof content==='string'&&content.includes(MARKER);}
function validGemini(r){return r.json?.candidates?.[0]?.content?.parts?.some(x=>String(x?.text||'').includes(MARKER))||false;}
const probeText='Public synthetic connectivity probe. Respond exactly with '+MARKER+'. No real records or financial data.';

const tests=[
  check('groq',available(process.env.GROQ_API_KEY),async()=>{
    const headers={Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'};
    const a=await request('https://api.groq.com/openai/v1/models',{headers});
    if(!a.ok)return {auth:authStatus(a),authHttp:a.status};
    const g=await request('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers,
      body:{model:'openai/gpt-oss-120b',messages:[{role:'user',content:probeText}],max_completion_tokens:70,temperature:0,reasoning_effort:'low',include_reasoning:false}});
    return{auth:'ACCEPTED',authHttp:a.status,inference:g.ok?(validOpenAI(g)?'PASS':'INVALID_RESULT'):'FAILED',inferenceHttp:g.status};
  }),
  check('gemini',available(process.env.GEMINI_API_KEY),async()=>{
    const headers={'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'};
    const a=await request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',{headers});
    if(!a.ok)return {auth:authStatus(a),authHttp:a.status};
    const g=await request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',{method:'POST',headers,
      body:{contents:[{role:'user',parts:[{text:probeText}]}],generationConfig:{temperature:0,maxOutputTokens:80}}});
    return{auth:'ACCEPTED',authHttp:a.status,inference:g.ok?(validGemini(g)?'PASS':'INVALID_RESULT'):'FAILED',inferenceHttp:g.status};
  }),
  check('cloudflare',available(process.env.CLOUDFLARE_AI_API_TOKEN)&&available(process.env.CLOUDFLARE_ACCOUNT_ID),async()=>{
    const headers={Authorization:'Bearer '+process.env.CLOUDFLARE_AI_API_TOKEN,'Content-Type':'application/json'};
    const a=await request('https://api.cloudflare.com/client/v4/user/tokens/verify',{headers});
    if(!a.ok)return {auth:authStatus(a),authHttp:a.status};
    const g=await request('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)+'/ai/v1/chat/completions',{method:'POST',headers,body:{
      model:'@cf/google/gemma-4-26b-a4b-it',messages:[{role:'user',content:probeText}],max_completion_tokens:80,temperature:0
    }});
    return{auth:'ACCEPTED',authHttp:a.status,inference:g.ok?(validOpenAI(g)?'PASS':'INVALID_RESULT'):'FAILED',inferenceHttp:g.status};
  }),
  check('openrouter',available(process.env.OPENROUTER_API_KEY),async()=>{
    const headers={Authorization:'Bearer '+process.env.OPENROUTER_API_KEY,'Content-Type':'application/json'};
    const a=await request('https://openrouter.ai/api/v1/auth/key',{headers});
    if(!a.ok)return {auth:authStatus(a),authHttp:a.status};
    const g=await request('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers,body:{
      model:'openrouter/free',messages:[{role:'user',content:probeText}],max_tokens:80,
      provider:{data_collection:'deny'}
    }});
    return{auth:'ACCEPTED',authHttp:a.status,inference:g.ok?(validOpenAI(g)?'PASS':'INVALID_RESULT'):'FAILED',inferenceHttp:g.status};
  }),
  // No generation for Mistral/Ollama until user plan confirms zero-price billing.
  check('mistral',available(process.env.MISTRAL_API_KEY),async()=>{
    const a=await request('https://api.mistral.ai/v1/models',{headers:{Authorization:'Bearer '+process.env.MISTRAL_API_KEY}});
    return{auth:authStatus(a),authHttp:a.status,inference:'BLOCKED_FREE_PLAN_UNVERIFIED'};
  }),
  check('ollama',available(process.env.OLLAMA_API_KEY),async()=>{
    const a=await request('https://ollama.com/v1/models',{headers:{Authorization:'Bearer '+process.env.OLLAMA_API_KEY}});
    return{auth:authStatus(a),authHttp:a.status,inference:'BLOCKED_FREE_PLAN_UNVERIFIED'};
  })
];
await Promise.allSettled(tests);
const report={probeVersion:'2026-10-17',id:randomUUID(),source:'isolated-build-synthetic-only',status:'complete',testedAt:new Date().toISOString(),checks:records};
mkdirSync('dist',{recursive:true});
writeFileSync(OUT,JSON.stringify(report,null,2)+'\n',{mode:0o644});
console.log('AI_LIVE_CONNECTIVITY_REPORT_WRITTEN: six provider statuses, no credentials or payloads.');
