import {diagnosticsOwnerUidAllowed} from './admin-diagnostics-auth.js';

// Metadata-only diagnostics for verified owner; never expose prompts, source
// contents, headers, secrets or provider response bodies. Browser flags cannot
// enable it; the server verifies the authenticated UID against its own setting.
const PROVIDERS=new Set(['groq','cloudflare','gemini','openrouter','ollama']);
const CATEGORIES=new Set(['ok','low-confidence','schema','unsupported','unavailable','rate_limit','timeout','network','upstream','invalid']);
const STAGES=new Set(['source-classification','source-summary','quote-extraction']);

export function intakeDiagnostics(verifiedUid,stage,configuredUid=process.env.LOUREX_AI_DIAGNOSTICS_ADMIN_UID){
  const owner=diagnosticsOwnerUidAllowed(verifiedUid,configuredUid)&&STAGES.has(stage);
  const attempts=[];
  const onDiagnostic=owner?event=>{
    if(attempts.length>=8||!PROVIDERS.has(event?.provider)||!CATEGORIES.has(event?.category)||
       !Number.isFinite(event?.latencyMs)||event.latencyMs<0||event.latencyMs>60000)return;
    const model=typeof event.model==='string'&&/^[-@a-zA-Z0-9._/:]{1,160}$/.test(event.model)?event.model:undefined;
    attempts.push({provider:event.provider,category:event.category,latencyMs:Math.round(event.latencyMs),
      ...(model?{model}:{}),
      ...(['model','provider'].includes(event.quotaScope)?{quotaScope:event.quotaScope}:{}),
      ...(Number.isFinite(event.retryAfterMs)&&event.retryAfterMs>=0&&event.retryAfterMs<=86400000?{retryAfterMs:Math.round(event.retryAfterMs)}:{}),
      ...(Number.isInteger(event.fallbackIndex)&&event.fallbackIndex>=0&&event.fallbackIndex<32?{fallbackIndex:event.fallbackIndex}:{})});
  }:undefined;
  function failure(result){
    const requestId=typeof result?.requestId==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(result.requestId)?result.requestId:undefined;
    if(!owner)return requestId?{requestId}:{};
    const number=value=>Number.isInteger(value)&&value>=0&&value<=500?value:undefined;
    const duration=Number.isFinite(result?.totalLatencyMs)&&result.totalLatencyMs>=0&&result.totalLatencyMs<=60000?
      Math.round(result.totalLatencyMs):undefined;
    return{...(requestId?{requestId}:{}),diagnostic:{stage,
      ...(requestId?{requestId}:{}),
      ...(duration!==undefined?{totalLatencyMs:duration}:{}),
      eligibleModelCount:number(result?.eligibleModelCount),
      availableModelCount:number(result?.availableModelCount),
      attempts}};
  }
  return{onDiagnostic,failure};
}
