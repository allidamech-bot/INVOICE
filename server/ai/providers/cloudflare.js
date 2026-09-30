import {AiProviderError,statusCodeToError} from '../errors.js';
import {normalizeSchema,schemaInstruction} from '../schema.js';

function contentFor(prompt,attachments=[]){
  const images=attachments.filter(item=>item?.kind==='image');
  if(!images.length)return prompt;
  return[{type:'text',text:prompt},...images.map(item=>({type:'image_url',image_url:{url:`data:${item.mimeType};base64,${item.data}`}}))];
}

export async function runCloudflare({model,prompt,schema,attachments=[],timeoutMs=18000,reasoning='none'}){
  const token=process.env.CLOUDFLARE_AI_API_TOKEN?.trim();const accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if(!token||!accountId)throw new AiProviderError('AI_NOT_CONFIGURED','Cloudflare Workers AI not configured',{status:503,retryable:true,provider:'cloudflare',model});
  const normalized=normalizeSchema(schema);const schemaHint=normalized?`\n\nReturn JSON only and match this JSON Schema exactly: ${schemaInstruction(normalized)}`:'';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const body={model,messages:[{role:'user',content:contentFor(`${prompt}${schemaHint}`,attachments)}],temperature:0,stream:false,options:{rejectIfBusy:true}};
    if(normalized)body.response_format={type:'json_schema',json_schema:{name:'lourex_result',strict:false,schema:normalized}};
    if(reasoning!=='none')body.reasoning_effort=reasoning==='high'?'high':'medium';
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body),signal:controller.signal});
    if(!response.ok)throw statusCodeToError(response.status,'cloudflare',model);
    const payload=await response.json();const text=payload?.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw new AiProviderError('AI_INVALID_RESULT','Cloudflare returned no usable content',{provider:'cloudflare',model});
    return{text,usage:payload?.usage||null};
  }catch(error){if(error instanceof AiProviderError)throw error;if(error instanceof Error&&error.name==='AbortError')throw new AiProviderError('AI_TIMEOUT','Cloudflare timeout',{status:504,provider:'cloudflare',model,cause:error});throw new AiProviderError('AI_NETWORK_ERROR','Cloudflare network error',{status:502,provider:'cloudflare',model,cause:error});}
  finally{clearTimeout(timer);}
}
