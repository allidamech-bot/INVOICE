const MAX_BODY_BYTES=24000;
const MAX_COLUMNS=40;
const MAX_SAMPLES=4;
const MAX_SAMPLE_CHARS=120;
const RATE_WINDOW_MS=5*60*1000;
const RATE_MAX=20;
const GEMINI_MODEL='gemini-2.5-flash-lite';
const rateBuckets=new Map();
const ALLOWED_FIELDS=new Set(['sku','descriptionEn','descriptionAr','hsCode','origin','packing','unit','lastUnitPrice','lastCurrency','lastUnitCost','lastCostCurrency','category','tags','favorite']);

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
function cleanColumns(value){
  if(!Array.isArray(value)||value.length<1||value.length>MAX_COLUMNS)return null;
  const seen=new Set();const result=[];
  for(const entry of value){
    const index=Number(entry?.index);const header=String(entry?.header||'').trim().slice(0,160);
    if(!Number.isInteger(index)||index<0||seen.has(index)||!header)return null;seen.add(index);
    const samples=Array.isArray(entry?.samples)?entry.samples.slice(0,MAX_SAMPLES).map(sample=>String(sample??'').trim().slice(0,MAX_SAMPLE_CHARS)).filter(Boolean):[];
    result.push({index,header,samples});
  }
  return result;
}
function parseGemini(payload,allowedIndexes){
  const text=payload?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('')||'';
  let parsed;try{parsed=JSON.parse(text);}catch{return null;}
  if(!Array.isArray(parsed?.mappings))return null;
  const usedFields=new Set(),usedIndexes=new Set(),mappings=[];
  for(const item of parsed.mappings){
    const index=Number(item?.index),field=item?.field===null?null:String(item?.field||'');
    if(!allowedIndexes.has(index)||usedIndexes.has(index))continue;
    if(field!==null&&!ALLOWED_FIELDS.has(field))continue;
    if(field&&usedFields.has(field))continue;
    const confidence=item?.confidence==='high'||item?.confidence==='medium'||item?.confidence==='low'?item.confidence:'low';
    const reason=String(item?.reason||'AI suggestion').trim().slice(0,180);
    usedIndexes.add(index);if(field)usedFields.add(field);mappings.push({index,field,confidence,reason});
  }
  return mappings;
}
export default async function handler(request,response){
  if(request.method!=='POST'){response.setHeader('Allow','POST');sendJson(response,405,{code:'METHOD_NOT_ALLOWED',message:'Use POST for AI product mapping.'});return;}
  if(!sameOriginRequest(request)){sendJson(response,403,{code:'ORIGIN_REJECTED',message:'AI mapping requests must come from this LOUREX Invoice deployment.'});return;}
  if(!rateAllowed(request)){response.setHeader('Retry-After','300');sendJson(response,429,{code:'AI_RATE_LIMITED',message:'AI mapping is temporarily rate limited.'});return;}
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey){sendJson(response,503,{code:'AI_NOT_CONFIGURED',message:'Gemini mapping is not configured yet.'});return;}
  let body;try{body=await readJson(request);}catch(error){sendJson(response,error?.message==='BODY_TOO_LARGE'?413:400,{code:'INVALID_REQUEST',message:'Invalid AI mapping request.'});return;}
  const columns=cleanColumns(body?.columns);if(!columns){sendJson(response,400,{code:'INVALID_COLUMNS',message:'No valid ambiguous columns were supplied.'});return;}
  const prompt=`You map supplier spreadsheet columns into LOUREX catalog fields. Return only mappings for the supplied columns. Never invent values. A supplier/trade Incoterm price such as EXW, FOB, CIF, CFR, FCA, DAP or DDP is purchase cost unless the heading explicitly says sale/selling/customer/retail. Keep sale price and purchase cost separate. Currency-only columns map to lastCurrency or lastCostCurrency according to context. If uncertain use null. Allowed fields: ${[...ALLOWED_FIELDS].join(', ')}. Columns: ${JSON.stringify(columns)}`;
  const schema={type:'OBJECT',properties:{mappings:{type:'ARRAY',items:{type:'OBJECT',properties:{index:{type:'INTEGER'},field:{type:'STRING',nullable:true,enum:[...ALLOWED_FIELDS]},confidence:{type:'STRING',enum:['high','medium','low']},reason:{type:'STRING'}},required:['index','field','confidence','reason']}}},required:['mappings']};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const upstream=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:schema}}),signal:controller.signal});
    if(!upstream.ok){console.warn('Gemini product mapping failed',{status:upstream.status});sendJson(response,upstream.status===429?429:502,{code:upstream.status===429?'AI_RATE_LIMITED':'AI_UPSTREAM_ERROR',message:'Gemini mapping is temporarily unavailable.'});return;}
    const payload=await upstream.json();const mappings=parseGemini(payload,new Set(columns.map(column=>column.index)));
    if(!mappings){sendJson(response,502,{code:'AI_INVALID_RESULT',message:'Gemini returned an invalid mapping result.'});return;}
    sendJson(response,200,{model:GEMINI_MODEL,mappings});
  }catch(error){sendJson(response,504,{code:error instanceof Error&&error.name==='AbortError'?'AI_TIMEOUT':'AI_NETWORK_ERROR',message:'Gemini mapping could not be reached.'});}
  finally{clearTimeout(timeout);}
}
