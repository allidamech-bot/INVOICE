const MAX_BODY_BYTES=6000;
const MAX_MESSAGE_CHARS=1000;
const RATE_WINDOW_MS=5*60*1000;
const RATE_MAX=20;
const GEMINI_MODEL='gemini-2.5-flash-lite';
const SCREENS=new Set(['home','documents','customers','receivables','reports','items','operations','editor']);
const NAV_TARGETS=['home','documents','customers','receivables','reports','items','operations'];
const rateBuckets=new Map();

function sendJson(response,status,payload){
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  response.end(JSON.stringify(payload));
}
function forwardedHost(request){return String(request.headers['x-forwarded-host']||request.headers.host||'').split(',')[0]?.trim().toLowerCase()||'';}
function sameOriginRequest(request){
  const origin=String(request.headers.origin||'').trim();
  if(!origin||String(request.headers['x-requested-with']||'').trim()!=='LOUREX-Invoice')return false;
  const host=forwardedHost(request);if(!host)return false;
  try{const parsed=new URL(origin);return parsed.protocol==='https:'&&parsed.host.toLowerCase()===host;}catch{return false;}
}
function requestIp(request){return String(request.headers['x-forwarded-for']||'').split(',')[0]?.trim()||String(request.socket?.remoteAddress||'unknown');}
function rateAllowed(request){
  const now=Date.now(),key=requestIp(request),existing=rateBuckets.get(key);
  const bucket=!existing||now-existing.startedAt>=RATE_WINDOW_MS?{startedAt:now,count:0}:existing;
  bucket.count+=1;rateBuckets.set(key,bucket);
  if(rateBuckets.size>500){for(const [entryKey,value] of rateBuckets){if(now-value.startedAt>=RATE_WINDOW_MS)rateBuckets.delete(entryKey);}}
  return bucket.count<=RATE_MAX;
}
async function readJson(request){
  const declared=Number(request.headers['content-length']||0);if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error('BODY_TOO_LARGE');
  let text='';for await(const chunk of request){text+=chunk.toString();if(Buffer.byteLength(text,'utf8')>MAX_BODY_BYTES)throw new Error('BODY_TOO_LARGE');}
  return JSON.parse(text||'{}');
}
function cleanRequest(body){
  const message=String(body?.message||'').trim().slice(0,MAX_MESSAGE_CHARS);
  const screen=String(body?.context?.screen||'');
  const language=body?.context?.language==='ar'?'ar':'en';
  if(!message||!SCREENS.has(screen))return null;
  return {message,context:{version:1,screen,language,allowedCapabilities:['workspace.help','workspace.navigate']}};
}
function parseGemini(payload){
  const text=payload?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('')||'';
  let parsed;try{parsed=JSON.parse(text);}catch{return null;}
  const answer=String(parsed?.answer||'').trim().slice(0,4000);if(!answer)return null;
  let proposal=null;
  const raw=parsed?.proposal;
  if(raw&&raw.capability==='workspace.navigate'&&NAV_TARGETS.includes(raw.target))proposal={capability:'workspace.navigate',target:raw.target,label:String(raw.label||'Open section').trim().slice(0,80),rationale:String(raw.rationale||'').trim().slice(0,180)};
  return {answer,proposal};
}

export default async function handler(request,response){
  if(request.method!=='POST'){response.setHeader('Allow','POST');sendJson(response,405,{code:'METHOD_NOT_ALLOWED',message:'Use POST for LOUREX AI.'});return;}
  if(!sameOriginRequest(request)){sendJson(response,403,{code:'ORIGIN_REJECTED',message:'LOUREX AI requests must come from this LOUREX Invoice deployment.'});return;}
  if(!rateAllowed(request)){response.setHeader('Retry-After','300');sendJson(response,429,{code:'AI_RATE_LIMITED',message:'LOUREX AI is temporarily rate limited.'});return;}
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey){sendJson(response,503,{code:'AI_NOT_CONFIGURED',message:'LOUREX AI is not configured yet.'});return;}
  let body;try{body=await readJson(request);}catch(error){sendJson(response,error?.message==='BODY_TOO_LARGE'?413:400,{code:'INVALID_REQUEST',message:'Invalid LOUREX AI request.'});return;}
  const cleaned=cleanRequest(body);if(!cleaned){sendJson(response,400,{code:'INVALID_CONTEXT',message:'LOUREX AI received an invalid workspace context.'});return;}

  const sections='home, documents, customers, receivables, reports, items, operations, editor';
  const languageInstruction=cleaned.context.language==='ar'?'Reply in clear professional Arabic unless the user explicitly asks for another language.':'Reply in clear professional English unless the user explicitly asks for another language.';
  const prompt=`You are LOUREX AI Core, the embedded copilot for LOUREX Invoice. This is Foundation Batch 1, so your authority is intentionally narrow.\n\nSecurity and authority rules:\n- You may explain the current LOUREX workspace and help the user find existing sections.\n- You may propose navigation to one of these sections only: ${NAV_TARGETS.join(', ')}.\n- You cannot create, edit, delete, archive, merge, post, void, reverse, approve, finalize, price, pay, or otherwise mutate business or financial records in this release.\n- Never claim that you changed data. Never invent business figures, balances, profits, invoices, customers, suppliers, products, or accounting facts.\n- The client has deliberately provided only minimal workspace context. Do not ask for or imply access to the encrypted vault.\n- If the user asks for a financial analysis capability planned for a later batch, explain briefly that this foundation release does not have that capability yet and point them to the relevant existing section when useful.\n- A navigation action is never executed automatically: return it only as a proposal requiring user approval.\n- Do not return a navigation proposal unless it materially helps the user's request.\n- ${languageInstruction}\n\nKnown LOUREX sections: ${sections}.\nCurrent safe context: ${JSON.stringify(cleaned.context)}\nUser request: ${JSON.stringify(cleaned.message)}\n\nReturn only the required JSON object.`;
  const schema={type:'OBJECT',properties:{answer:{type:'STRING'},proposal:{type:'OBJECT',nullable:true,properties:{capability:{type:'STRING',enum:['workspace.navigate']},target:{type:'STRING',enum:NAV_TARGETS},label:{type:'STRING'},rationale:{type:'STRING'}},required:['capability','target','label','rationale']}},required:['answer','proposal']};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const upstream=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:schema}}),signal:controller.signal});
    if(!upstream.ok){console.warn('LOUREX AI Core request failed',{status:upstream.status});sendJson(response,upstream.status===429?429:502,{code:upstream.status===429?'AI_RATE_LIMITED':'AI_UPSTREAM_ERROR',message:'LOUREX AI is temporarily unavailable.'});return;}
    const payload=await upstream.json();const result=parseGemini(payload);
    if(!result){sendJson(response,502,{code:'AI_INVALID_RESULT',message:'LOUREX AI returned an invalid result.'});return;}
    sendJson(response,200,{model:GEMINI_MODEL,...result});
  }catch(error){sendJson(response,504,{code:error instanceof Error&&error.name==='AbortError'?'AI_TIMEOUT':'AI_NETWORK_ERROR',message:'LOUREX AI could not be reached.'});}
  finally{clearTimeout(timeout);}
}
