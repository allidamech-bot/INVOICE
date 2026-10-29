// Metadata only. Never send prompts, credentials, history or business data here.
const URL='https://openrouter.ai/api/v1/models';
let cached=[],expires=0,pending;
export function freeOpenRouterModels(payload){
  if(!Array.isArray(payload?.data))return[];
  const seen=new Set();
  return payload.data.slice(0,2000).flatMap(row=>{
    const id=row?.id,p=row?.pricing,a=row?.architecture;
    if(typeof id!=='string'||id.length>160||!/^[-a-zA-Z0-9._/]+:free$/.test(id)||seen.has(id)||
      !p||p.prompt===undefined||p.completion===undefined||
      Object.values(p).some(value=>!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)!==0)||
      !a?.input_modalities?.includes('text')||!a?.output_modalities?.includes('text'))return[];
    seen.add(id);
    const capabilities=['TEXT','STRUCTURED_OUTPUT']; // Local schema validation is always mandatory.
    if(a.input_modalities.includes('image'))capabilities.push('VISION');
    if(row.supported_parameters?.includes('tools'))capabilities.push('TOOL_CALLING');
    if(row.supported_parameters?.includes('reasoning'))capabilities.push('DEEP_REASONING');
    if(Number(row.context_length)>=64000)capabilities.push('LARGE_CONTEXT');
    return[{provider:'openrouter',model:id,enabled:true,freeTierEligible:true,maxImages:capabilities.includes('VISION')?3:0,capabilities}];
  });
}
export async function openRouterFreeCatalog(){
  if(Date.now()<expires)return cached;
  if(pending)return pending;
  pending=(async()=>{
    const abort=new AbortController();let timer;
    try{
      const stopped=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('catalog timeout'));},1500);});
      const work=(async()=>{const response=await fetch(URL,{signal:abort.signal,redirect:'error'});if(!response.ok)throw Error('catalog unavailable');const text=await response.text();if(text.length>4000000)throw Error('catalog too large');return freeOpenRouterModels(JSON.parse(text));})();
      const models=await Promise.race([work,stopped]);
      // Retain successful metadata briefly; no inference depends on discovery succeeding.
      cached=models;expires=Date.now()+300000;return cached;
    }catch{cached=[];expires=Date.now()+30000;return[];}
    finally{clearTimeout(timer);pending=undefined;}
  })();return pending;
}
