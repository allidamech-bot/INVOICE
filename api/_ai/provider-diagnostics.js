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
  if(provider==='gemini')return{contents:[{role:'user',parts:[{text:SYNTHETIC_PROMPT}]}],generationConfig:{temperature:0,maxOutputTokens:256,thinkingConfig:{thinkingBudget:0}}};
  return{model:MODEL[provider],messages:[{role:'user',content:SYNTHETIC_PROMPT}],
    ...(provider!=='kilo'?{temperature:0}:{}),
    ...(provider==='groq'?{max_completion_tokens:160,reasoning_effort:'low',include_reasoning:false}:{}),
    ...(provider==='cloudflare'?{max_completion_tokens:256,options:{rejectIfBusy:true}}:{}),
    ...(provider==='kilo'?{max_tokens:512}:{})};
}
const EXPECTED_TOTAL=1062;

function partsText(content){
  if(typeof content==='string')return content;
  if(Array.isArray(content)){
    return content.map(part=>typeof part==='string'?part:
      typeof part?.text==='string'?part.text:
      typeof part?.text?.value==='string'?part.text.value:'').join('');
  }
  if(content&&typeof content==='object'){
    if(typeof content.text==='string')return content.text;
    if(typeof content.value==='string')return content.value;
  }
  return '';
}

function readAnswer(root,provider){
  if(provider==='gemini'){
    const candidate=root?.candidates?.[0];
    return{
      text:partsText(candidate?.content?.parts?.filter(part=>part?.thought!==true)),
      reason:String(candidate?.finishReason||'').slice(0,32),
      model:root?.modelVersion||''
    };
  }
  const parent=root?.result?.choices?root.result:root;
  const choice=parent?.choices?.[0];
  const message=choice?.message;
  return{
    text:partsText(message?.content)||partsText(message?.parsed)||
      (message?.parsed&&typeof message.parsed==='object'?JSON.stringify(message.parsed):'')||
      (provider==='cloudflare'&&typeof root?.result?.response==='string'?root.result.response:''),
    reason:String(choice?.finish_reason||choice?.finishReason||'').slice(0,32),
    model:parent?.model||root?.model||''
  };
}
function numericAnswer(text){
  let value=String(text||'').trim();
  if(!value||value.length>400)return null;
  value=value.replace(/^\x60{3}(?:text|json)?\s*|\s*\x60{3}$/gi,'').trim();
  // Some providers return a JSON scalar or an object despite the numeric instruction.
  if(/^[{\[]/.test(value)){
    try{
      const obj=JSON.parse(value);
      if(obj&&typeof obj==='object'&&!Array.isArray(obj)){
        const fields=Object.keys(obj);
        if(fields.length===1&&['total','finalTotal','amount','result','answer'].includes(fields[0]))
          value=String(obj[fields[0]]);
      }
    }catch{}
  }
  value=value.replace(/[\u0660-\u0669]/g,c=>String(c.charCodeAt(0)-0x0660))
    .replace(/[\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-0x06f0))
    .replace(/\u066b/g,'.').replace(/\u066c/g,',');
  value=value.replace(/^(?:the\s+)?(?:final\s+total|total|answer|result|المجموع|الإجمالي)\s*(?::|=|is|هو)\s*/i,'').trim();
  value=value.replace(/^[\s$€£]*|[\s$€£]*$/g,'').trim();
  value=value.replace(/^(?:USD|دولار)\s*/i,'').replace(/\s*(?:USD|دولار)\.?$/i,'').trim();
  value=value.replace(/[.!]$/,'').trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))return null;
  const number=Number(value.replace(/,/g,''));
  return Number.isFinite(number)?number:null;
}
function safePreview(text){
  return String(text||'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').slice(0,110);
}
function safeModel(value){
  return typeof value==='string'&&/^[a-zA-Z0-9@/._:+-]{1,110}$/.test(value)?value:undefined;
}
function summarizeCompletion(root,provider){
  if(root?.error||root?.success===false)return{status:'PROVIDER_ERROR'};
  const answer=readAnswer(root,provider);
  const reason=String(answer.reason||'').toLowerCase();
  const actualModel=safeModel(answer.model);
  const meta=actualModel?{actualModel}:{};
  if(!answer.text.trim()){
    if(['max_tokens','length','max_output_tokens'].includes(reason))return{status:'OUTPUT_TRUNCATED',...meta};
    if(['safety','recitation','content_filter','blocked'].includes(reason))return{status:'OUTPUT_BLOCKED',...meta};
    return{status:'EMPTY_OUTPUT',...meta};
  }
  const amount=numericAnswer(answer.text);
  if(amount===null)return{status:'UNPARSEABLE_ANSWER',answerPreview:safePreview(answer.text),...meta};
  return{status:Math.abs(amount-EXPECTED_TOTAL)<0.005?'PASSED':'WRONG_ANSWER',answerPreview:String(amount),...meta};
}
function safeCategory(status){
  if(status===401||status===403)return'KEY_REJECTED';
  if(status===402)return'PAYMENT_REQUIRED';
  if(status===429)return'RATE_LIMITED';
  if(status===400||status===404||status===422)return'MODEL_UNAVAILABLE';
  return status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR';
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
      return summarizeCompletion(parsed,provider);
    })();
    const result=await Promise.race([request,deadline]);
    return{provider,model,status:result.status,latencyMs:Date.now()-started,
      correct:result.status==='PASSED',
      ...(result.answerPreview?{answerPreview:result.answerPreview}:{}),
      ...(result.actualModel?{actualModel:result.actualModel}:{})};
  }catch(error){
    const timedOut=controller.signal.aborted||error?.message==='DIAGNOSTIC_TIMEOUT';
    return{provider,model,status:timedOut?'TIMEOUT':'NETWORK_ERROR',latencyMs:Date.now()-started,correct:false};
  }finally{clearTimeout(timeout);}
}
