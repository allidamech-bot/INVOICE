import {AiProviderError,statusCodeToError} from '../errors.js';
import {toGeminiSchema} from '../schema.js';

function buildParts(prompt,attachments=[]){const parts=[{text:prompt}];for(const item of attachments){if(item?.kind==='image'||item?.kind==='document')parts.push({inlineData:{mimeType:item.mimeType,data:item.data}});}return parts;}

export async function runGemini({model,prompt,schema,attachments=[],timeoutMs=20000}){
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey)throw new AiProviderError('AI_NOT_CONFIGURED','Gemini not configured',{status:503,retryable:true,provider:'gemini',model});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const generationConfig={temperature:0};if(schema){generationConfig.responseMimeType='application/json';generationConfig.responseSchema=toGeminiSchema(schema);}
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:buildParts(prompt,attachments)}],generationConfig}),signal:controller.signal});
    if(!response.ok)throw statusCodeToError(response.status,'gemini',model);
    const payload=await response.json();const text=payload?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('')||'';if(!text.trim())throw new AiProviderError('AI_INVALID_RESULT','Gemini returned no usable content',{provider:'gemini',model});
    return{text,usage:payload?.usageMetadata||null};
  }catch(error){if(error instanceof AiProviderError)throw error;if(error instanceof Error&&error.name==='AbortError')throw new AiProviderError('AI_TIMEOUT','Gemini timeout',{status:504,provider:'gemini',model,cause:error});throw new AiProviderError('AI_NETWORK_ERROR','Gemini network error',{status:502,provider:'gemini',model,cause:error});}
  finally{clearTimeout(timer);}
}
