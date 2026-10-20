// Owner-only manual connectivity probe. Never pass any user, financial or
// customer data to a provider; prompts and free-tier models are fixed here.
const PROMPT='Synthetic arithmetic check with no private data: 8 units at 125 USD each, 10% discount on subtotal, then 18% tax on discounted subtotal. Reply ONLY with the final numeric total using ASCII digits and a decimal point, no currency or explanation.';
const TEST_MODEL=Object.freeze({
  groq:'qwen/qwen3.8-27b',
  cloudflare:'@cf/google/gemma-4-26b-a4b-it',
  gemini:'gemini-2.5-flash-lite',
  kilo:'kilo-auto/free'
});
function configFor(provider){
  if(provider==='groq'){
    const key=process.env.GROQ_API_KEY?.trim();
    return key?{url:'https://api.groq.com/openai/v1/chat/completions',headers:{Authorization:'Bearer '+key},body:{model:TEST_MODEL.groq,messages:[{role:'user',content:PROMPT}],max_completion_tokens:64,temperature:0}}:null;
  }
  if(provider==='cloudflare'){
    const key=process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),id=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    return key&&id?{url:'https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(id)+'/ai/v1/chat/completions',headers:{Authorization:'Bearer '+key},body:{model:TEST_MODEL.cloudflare,messages:[{role:'user',content:PROMPT}],max_completion_tokens:64,temperature:0}}:null;
  }
  if(provider==='gemini'){
    const key=process.env.GEMINI_API_KEY?.trim();
    return key?{url:'https://generativelanguage.googleapis.com/v1beta/models/'+TEST_MODEL.gemini+':generateContent',headers:{'x-goog-api-key':key},body:{contents:[{role:'user',parts:[{text:PROMPT}]}],generationConfig:{temperature:0,maxOutputTokens:64}}}:null;
  }
  if(provider==='kilo'){
    const key=process.env.KILO_API_KEY?.trim();
    return key?{url:'https://api.kilo.ai/api/gateway/chat/completions',headers:{Authorization:'Bearer '+key},body:{model:TEST_MODEL.kilo,messages:[{role:'user',content:PROMPT}],max_tokens:64,temperature:0,stream:false}}:null;
  }
  return null;
}
function cleanResult(provider,payload){
  if(provider==='gemini')return payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  const result=payload?.result||payload;
  const content=result?.choices?.[0]?.message?.content||result?.response||'';
  return typeof content==='string'?content:'';
}
function verdict(raw){
  const number=String(raw||'').trim().replace(/\s+/g,'').replace(/,/g,'');
  return /^1062(?:\.0{1,2})?$/.test(number);
}
export async function probeConfiguredProvider(provider){
  if(typeof provider!=='string'||!Object.hasOwn(TEST_MODEL,provider))
    return {provider:'unknown',model:'',status:'invalid_provider',latencyMs:0};
  const model=TEST_MODEL[provider],config=configFor(provider);
  if(!config)return {provider,model,status:'not_configured',latencyMs:0};
  const started=Date.now();
  try{
    const response=await fetch(config.url,{
      method:'POST',headers:{'Content-Type':'application/json',...config.headers},
      body:JSON.stringify(config.body),signal:AbortSignal.timeout(8000)
    });
    const latencyMs=Date.now()-started;
    if(!response.ok){
      const status=response.status===429?'rate_limited':response.status===402?'payment_required':
        [401,403].includes(response.status)?'unauthorized':response.status===404?'model_unavailable':'request_failed';
      return {provider,model,status,latencyMs};
    }
    const payload=await response.json();
    const valid=verdict(cleanResult(provider,payload));
    return {provider,model,status:valid?'passed':'incorrect_answer',latencyMs};
  }catch(error){
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    return {provider,model,status:timeout?'timeout':'connection_failed',latencyMs:Date.now()-started};
  }
}
