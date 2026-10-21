// Owner-only model metadata check. This calls GET models.get with the
// server-side Gemini credential. It never invokes text generation and cannot
// establish that a billing tier or generateContent quota is available.
const MODEL_NAME='models/gemini-2.5-flash-lite';
const URL='https://generativelanguage.googleapis.com/v1beta/'+MODEL_NAME;
const MAX_BYTES=12000;
const TIMEOUT_MS=6500;

function classifyStatus(code){
  if(code===401)return'KEY_REJECTED';
  if(code===403)return'ACCESS_DENIED';
  if(code===402)return'PAYMENT_REQUIRED';
  if(code===404)return'MODEL_UNAVAILABLE';
  if(code===429)return'RATE_LIMITED';
  return code>=500?'PROVIDER_UNAVAILABLE':'REQUEST_REJECTED';
}
export async function checkGeminiKeyMetadata({fetchImpl=fetch}={}){
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)return{status:'NOT_CONFIGURED',model:MODEL_NAME,latencyMs:0};
  const started=Date.now(),controller=new AbortController();
  let timeout;
  const deadline=new Promise((_,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new Error('DIAGNOSTIC_TIMEOUT'));},TIMEOUT_MS);
  });
  try{
    const request=(async()=>{
      const response=await fetchImpl(URL,{
        method:'GET',headers:{'x-goog-api-key':key,'Accept':'application/json'},
        cache:'no-store',signal:controller.signal
      });
      // Even when the upstream returns an error, never expose its body.
      if(!response.ok)return{status:classifyStatus(response.status)};
      if(Number(response.headers?.get?.('content-length')||0)>MAX_BYTES)return{status:'INVALID_RESPONSE'};
      const raw=await response.text();
      if(raw.length>MAX_BYTES)return{status:'INVALID_RESPONSE'};
      let body;
      try{body=JSON.parse(raw);}catch{return{status:'INVALID_RESPONSE'};}
      if(body?.name!==MODEL_NAME)return{status:'INVALID_RESPONSE'};
      const methods=body?.supportedGenerationMethods;
      return{status:'METADATA_ACCESS_OK',generativeMethodListed:Array.isArray(methods)&&methods.includes('generateContent')};
    })();
    const result=await Promise.race([request,deadline]);
    return{model:MODEL_NAME,...result,latencyMs:Date.now()-started};
  }catch(error){
    return{model:MODEL_NAME,status:controller.signal.aborted||error?.message==='DIAGNOSTIC_TIMEOUT'?'TIMEOUT':'NETWORK_ERROR',latencyMs:Date.now()-started};
  }finally{clearTimeout(timeout);}
}
