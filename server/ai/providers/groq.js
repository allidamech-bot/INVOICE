import {AiProviderError,statusCodeToError} from '../errors.js';
import {normalizeSchema,schemaInstruction} from '../schema.js';

function buildContent(prompt,attachments=[]){
  const images=attachments.filter(item=>item?.kind==='image');
  if(!images.length)return prompt;
  return[{type:'text',text:prompt},...images.map(item=>({type:'image_url',image_url:{url:`data:${item.mimeType};base64,${item.data}`}}))];
}

export async function runGroq({model,prompt,schema,attachments=[],timeoutMs=16000,reasoning='none',structuredMode='json_object'}){
  const apiKey=process.env.GROQ_API_KEY?.trim();if(!apiKey)throw new AiProviderError('AI_NOT_CONFIGURED','Groq not configured',{status:503,retryable:true,provider:'groq',model});
  const normalized=normalizeSchema(schema);
  const schemaHint=normalized?`\n\nReturn JSON only. It must match this JSON Schema exactly: ${schemaInstruction(normalized)}`:'';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const responseFormat=normalized?(structuredMode==='json_schema'?{type:'json_schema',json_schema:{name:'lourex_result',strict:false,schema:normalized}}:{type:'json_object'}):undefined;
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'user',content:buildContent(`${prompt}${schemaHint}`,attachments)}],temperature:0,stream:false,response_format:responseFormat,reasoning_effort:reasoning==='high'?'high':reasoning==='medium'?'medium':'none'}),signal:controller.signal});
    if(!response.ok)throw statusCodeToError(response.status,'groq',model);
    const payload=await response.json();const text=payload?.choices?.[0]?.message?.content;if(typeof text!=='string'||!text.trim())throw new AiProviderError('AI_INVALID_RESULT','Groq returned no usable content',{provider:'groq',model});
    return{text,usage:payload?.usage||null};
  }catch(error){if(error instanceof AiProviderError)throw error;if(error instanceof Error&&error.name==='AbortError')throw new AiProviderError('AI_TIMEOUT','Groq timeout',{status:504,provider:'groq',model,cause:error});throw new AiProviderError('AI_NETWORK_ERROR','Groq network error',{status:502,provider:'groq',model,cause:error});}
  finally{clearTimeout(timer);}
}
