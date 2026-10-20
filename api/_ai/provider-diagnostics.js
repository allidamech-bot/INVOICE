// Owner-triggered, synthetic-only AI provider smoke test.
// It never reads client context, business records, or provider fallback routing.
const SYNTHETIC_PROMPT='Synthetic accounting arithmetic test with NO customer or business data. An example order has 8 items priced at 125 USD each. Apply a 10% discount to the subtotal, then 18% tax to the discounted total. Reply ONLY with the numeric final total (no currency symbol, letters, separators or explanation).';
const MODEL={groq:'openai/gpt-oss-120b',cloudflare:'@cf/google/gemma-4-26b-a4b-it',gemini:'gemini-2.5-flash-lite',kilo:'kilo-auto/free'};
const MAX_RESPONSE_BYTES=24_000;
const PROVIDER_TIMEOUT_MS=12_000;

export const SYNTHETIC_PROVIDER_IDS=Object.freeze(Object.keys(MODEL));

function settingsFor(provider){
  switch(provider){
    case 'groq': return{key:process.env.GROQ_API_KEY?.trim(),url:'https://api.groq.com/openai/v1/chat/completions'};
    case 'cloudflare':{
      const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
      return{key:process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),url:account?'https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/ai/v1/chat/completions':'',account};
    }
    case 'gemini':return{key:process.env.GEMINI_API_KEY?.trim(),url:'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'};
    case 'kilo':return{key:process.env.KILO_API_KEY?.trim(),url:'https://ai-gateway.kilo.ai/api/v1/chat/completions'};
    default:return null;
  }
}
function payloadFor(provider){
  if(provider==='gemini')return{contents:[{role:'user',parts:[{text:SYNTHETIC_PROMPT}]}],generationConfig:{temperature:0,maxOutputTokens:120}};
  return{model:MODEL[provider],messages:[{role:'user',content:SYNTHETIC_PROMPT}],temperature:0,
    ...(provider==='groq'||provider==='cloudflare'?{max_completion_tokens:160}:{max_tokens:120}),
    ...(provider==='cloudflare'?{options:{rejectIfBusy:true}}:{})};
}
function compactText(root,provider){
  if(provider==='gemini')return root?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('')||'';
  const choices=root?.choices||root?.result?.choices;
  const content=choices?.[0]?.message?.content;
  return typeof content==='string'?content:'';
}
function safeCategory(status){
  if(status===401||status===403)return'KEY_REJECTED';
  if(status===402)return'PAYMENT_REQUIRED';
  if(status===429)return'RATE_LIMITED';
  if(status===400||status===404||status===422)return'MODEL_UNAVAILABLE';
  return status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR';
}
function validTotal(text){
  const clean=String(text||'').trim().replace(/^\`{3}(?:text)?\s*|\s*\`{3}$/g,'').trim();
  if(!/^[0-9]{1,9}(?:\.[0-9]{1,2})?$/.test(clean))return false;
  return Math.abs(Number(clean)-1062)<0.005;
}
export async function runSyntheticProviderDiagnostic(provider,{fetchImpl=fetch}={}){
  if(typeof provider!=='string'||!Object.prototype.hasOwnProperty.call(MODEL,provider))return{status:'INVALID_PROVIDER'};
  const model=MODEL[provider],cfg=settingsFor(provider);
  if(!cfg?.key||!cfg.url)return{provider,model,status:'NOT_CONFIGURED',latencyMs:0,correct:false};
  const started=Date.now();
  const controller=new AbortController();
  let timeout;
  const deadline=new Promise((_,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new Error('DIAGNOSTIC_TIMEOUT'));},PROVIDER_TIMEOUT_MS);
  });
  try{
    const headers={'Content-Type':'application/json',...(provider==='gemini'?{'x-goog-api-key':cfg.key}:{Authorization:'Bearer '+cfg.key})};
    const request=(async()=>{
      const response=await fetchImpl(cfg.url,{method:'POST',headers,body:JSON.stringify(payloadFor(provider)),signal:controller.signal});
      // Bound a stalled or maliciously oversized JSON response. Nothing logged.
      const declared=Number(response.headers?.get?.('content-length')||0);
      if(declared>MAX_RESPONSE_BYTES)return{status:'INVALID_RESPONSE'};
      const raw=await response.text();
      if(raw.length>MAX_RESPONSE_BYTES)return{status:'INVALID_RESPONSE'};
      if(!response.ok)return{status:safeCategory(response.status)};
      let parsed;try{parsed=JSON.parse(raw);}catch{return{status:'INVALID_RESPONSE'};}
      const answer=compactText(parsed,provider);
      if(!answer||answer.length>400)return{status:'INVALID_RESPONSE'};
      return{status:validTotal(answer)?'PASSED':'WRONG_ANSWER'};
    })();
    const result=await Promise.race([request,deadline]);
    return{provider,model,status:result.status,latencyMs:Date.now()-started,correct:result.status==='PASSED'};
  }catch(error){
    const timedOut=controller.signal.aborted||error?.message==='DIAGNOSTIC_TIMEOUT';
    return{provider,model,status:timedOut?'TIMEOUT':'NETWORK_ERROR',latencyMs:Date.now()-started,correct:false};
  }finally{clearTimeout(timeout);}
}
