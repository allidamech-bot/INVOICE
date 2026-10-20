// Owner-only diagnostics quota. Provider-specific, never shared with live AI.
export const DIAGNOSTIC_RATE_WINDOW_MS=600000;
export const DIAGNOSTIC_RATE_MAX_PER_PROVIDER=12;
export function createDiagnosticRateLimiter({windowMs=DIAGNOSTIC_RATE_WINDOW_MS,maxPerProvider=DIAGNOSTIC_RATE_MAX_PER_PROVIDER}={}){
 const buckets=new Map();
 return function check(uid,provider,now=Date.now()){
  if(typeof uid!=='string'||!uid||typeof provider!=='string'||!provider)
    return{allowed:false,retryAfterSeconds:Math.ceil(windowMs/1000)};
  const key=uid+'|'+provider;
  let entry=buckets.get(key);
  if(!entry||now-entry.startedAt>=windowMs||now<entry.startedAt){
   entry={startedAt:now,count:0};buckets.set(key,entry);
  }
  if(buckets.size>128)for(const [name,bucket] of buckets)
    if(now-bucket.startedAt>=windowMs)buckets.delete(name);
  if(entry.count>=maxPerProvider)
   return{allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((entry.startedAt+windowMs-now)/1000))};
  entry.count++;
  return{allowed:true,remaining:maxPerProvider-entry.count,retryAfterSeconds:0};
 };
}
export const diagnosticRateAllowed=createDiagnosticRateLimiter();
