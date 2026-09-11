import { Buffer } from 'node:buffer';

const MAX_IMAGE_BYTES=4*1024*1024;
const MAX_OUTPUT_BYTES=12*1024*1024;
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const REMOVE_BG_ENDPOINT='https://api.remove.bg/v1.0/removebg';
const RATE_WINDOW_MS=5*60*1000;
const RATE_MAX=12;
const rateBuckets=new Map();

function sendJson(response,status,payload){
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  response.end(JSON.stringify(payload));
}

function forwardedHost(request){
  const raw=String(request.headers['x-forwarded-host']||request.headers.host||'');
  return raw.split(',')[0]?.trim().toLowerCase()||'';
}

function sameOriginRequest(request){
  const origin=String(request.headers.origin||'').trim();
  const requestedWith=String(request.headers['x-requested-with']||'').trim();
  if(!origin||requestedWith!=='LOUREX-Invoice')return false;
  const host=forwardedHost(request);
  if(!host)return false;
  try{
    const parsed=new URL(origin);
    return parsed.protocol==='https:'&&parsed.host.toLowerCase()===host;
  }catch{return false;}
}

function requestIp(request){
  const forwarded=String(request.headers['x-forwarded-for']||'').split(',')[0]?.trim();
  return forwarded||String(request.socket?.remoteAddress||'unknown');
}

function rateAllowed(request){
  const now=Date.now(),key=requestIp(request);
  const existing=rateBuckets.get(key);
  const bucket=!existing||now-existing.startedAt>=RATE_WINDOW_MS?{startedAt:now,count:0}:existing;
  bucket.count+=1;rateBuckets.set(key,bucket);
  // Keep this best-effort in-memory limiter bounded. Vercel may create multiple
  // instances, so platform-level rate limiting remains recommended as a second layer.
  if(rateBuckets.size>500){for(const [entryKey,value] of rateBuckets){if(now-value.startedAt>=RATE_WINDOW_MS)rateBuckets.delete(entryKey);}}
  return bucket.count<=RATE_MAX;
}

async function readImageBody(request){
  const declared=Number(request.headers['content-length']||0);
  if(Number.isFinite(declared)&&declared>MAX_IMAGE_BYTES){const error=new Error('IMAGE_TOO_LARGE');error.code='IMAGE_TOO_LARGE';throw error;}
  const chunks=[];
  let bytes=0;
  for await(const chunk of request){
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    bytes+=buffer.length;
    if(bytes>MAX_IMAGE_BYTES){const error=new Error('IMAGE_TOO_LARGE');error.code='IMAGE_TOO_LARGE';throw error;}
    chunks.push(buffer);
  }
  return Buffer.concat(chunks,bytes);
}

function extensionFor(type){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg';}
function validImageSignature(image,type){
  if(type==='image/png')return image.length>=8&&image.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(type==='image/jpeg')return image.length>=3&&image[0]===0xff&&image[1]===0xd8&&image[2]===0xff;
  if(type==='image/webp')return image.length>=12&&image.toString('ascii',0,4)==='RIFF'&&image.toString('ascii',8,12)==='WEBP';
  return false;
}

export default async function handler(request,response){
  if(request.method!=='POST'){
    response.setHeader('Allow','POST');
    sendJson(response,405,{code:'METHOD_NOT_ALLOWED',message:'Use POST for background removal.'});
    return;
  }
  if(!sameOriginRequest(request)){
    sendJson(response,403,{code:'ORIGIN_REJECTED',message:'Background removal requests must come from this LOUREX Invoice deployment.'});
    return;
  }
  if(!rateAllowed(request)){
    response.setHeader('Retry-After','300');
    sendJson(response,429,{code:'AI_RATE_LIMITED',message:'Too many background-removal requests. Try again shortly.'});
    return;
  }

  const apiKey=process.env.REMOVE_BG_API_KEY?.trim();
  if(!apiKey){
    sendJson(response,503,{code:'AI_NOT_CONFIGURED',message:'AI background removal is not configured on this deployment.'});
    return;
  }

  const contentType=String(request.headers['content-type']||'').split(';')[0]?.trim().toLowerCase()||'';
  if(!ALLOWED_TYPES.has(contentType)){
    sendJson(response,415,{code:'UNSUPPORTED_IMAGE',message:'Use a PNG, WebP, or JPEG image.'});
    return;
  }

  let image;
  try{image=await readImageBody(request);}catch(error){
    if(error?.code==='IMAGE_TOO_LARGE')sendJson(response,413,{code:'IMAGE_TOO_LARGE',message:'The image is too large for AI background removal. Use a file smaller than 4 MB.'});
    else sendJson(response,400,{code:'INVALID_IMAGE_BODY',message:'Unable to read the uploaded image.'});
    return;
  }
  if(image.length<32||!validImageSignature(image,contentType)){
    sendJson(response,400,{code:'INVALID_IMAGE_BODY',message:'The uploaded image content does not match its declared image type.'});
    return;
  }

  const form=new FormData();
  form.append('size','auto');
  form.append('format','png');
  form.append('image_file',new Blob([image],{type:contentType}),`lourex-logo.${extensionFor(contentType)}`);

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const upstream=await fetch(REMOVE_BG_ENDPOINT,{method:'POST',headers:{'X-Api-Key':apiKey},body:form,signal:controller.signal});
    if(!upstream.ok){
      let code='AI_UPSTREAM_ERROR';
      let status=502;
      if(upstream.status===402){code='AI_QUOTA_EXHAUSTED';status=503;}
      else if(upstream.status===429){code='AI_RATE_LIMITED';status=429;}
      else if(upstream.status===400||upstream.status===422){code='AI_IMAGE_REJECTED';status=422;}
      let detail='';
      try{detail=(await upstream.text()).slice(0,400);}catch{}
      console.warn('LOUREX AI background removal failed',{status:upstream.status,detail});
      sendJson(response,status,{code,message:code==='AI_QUOTA_EXHAUSTED'?'AI background-removal quota is unavailable.':code==='AI_RATE_LIMITED'?'AI background removal is temporarily busy. Try again shortly.':code==='AI_IMAGE_REJECTED'?'The AI service could not process this image. Try another PNG, WebP, or JPEG.':'AI background removal is temporarily unavailable.'});
      return;
    }

    const output=Buffer.from(await upstream.arrayBuffer());
    if(!output.length||output.length>MAX_OUTPUT_BYTES||!validImageSignature(output,'image/png')){
      sendJson(response,502,{code:'AI_INVALID_RESULT',message:'AI background removal returned an invalid result.'});
      return;
    }
    response.statusCode=200;
    response.setHeader('Content-Type','image/png');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.end(output);
  }catch(error){
    const timedOut=error instanceof Error&&error.name==='AbortError';
    sendJson(response,504,{code:timedOut?'AI_TIMEOUT':'AI_NETWORK_ERROR',message:timedOut?'AI background removal took too long. Try again.':'Unable to reach the AI background-removal service.'});
  }finally{
    clearTimeout(timeout);
  }
}
