import { Buffer } from 'node:buffer';

const MAX_IMAGE_BYTES=4*1024*1024;
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const REMOVE_BG_ENDPOINT='https://api.remove.bg/v1.0/removebg';

function sendJson(response,status,payload){
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.end(JSON.stringify(payload));
}

function forwardedHost(request){
  const raw=String(request.headers['x-forwarded-host']||request.headers.host||'');
  return raw.split(',')[0]?.trim().toLowerCase()||'';
}

function sameOriginRequest(request){
  const origin=String(request.headers.origin||'').trim();
  if(!origin)return true;
  const host=forwardedHost(request);
  if(!host)return false;
  try{return new URL(origin).host.toLowerCase()===host;}catch{return false;}
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
  if(image.length<32){
    sendJson(response,400,{code:'EMPTY_IMAGE',message:'The uploaded image is empty or invalid.'});
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
    if(!output.length){
      sendJson(response,502,{code:'AI_EMPTY_RESULT',message:'AI background removal returned an empty result.'});
      return;
    }
    response.statusCode=200;
    response.setHeader('Content-Type','image/png');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.end(output);
  }catch(error){
    const timedOut=error instanceof Error&&error.name==='AbortError';
    sendJson(response,504,{code:timedOut?'AI_TIMEOUT':'AI_NETWORK_ERROR',message:timedOut?'AI background removal took too long. Try again.':'Unable to reach the AI background-removal service.'});
  }finally{
    clearTimeout(timeout);
  }
}
