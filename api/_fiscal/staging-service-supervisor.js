// Restricted outbound-only EC2 worker supervisor. No global scans, HTTP listener,
// credential logging, concurrent cycles or automatic replay of held submissions.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const FIELDS=['environment','accountUid','workspaceId','egsId'];
const COUNTERS=['submitted','recovered','reconciled','held','failed'];
const deny=()=>{throw Error('FISCAL_STAGING_SERVICE_DENIED');};

export function validateStagingServiceScopes(scopes){
 if(!Array.isArray(scopes)||scopes.length<1||scopes.length>64)deny();
 const seen=new Set();
 return Object.freeze(scopes.map(s=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join(',')!==FIELDS.slice().sort().join(',')||s.environment!=='simulation'||!FIELDS.slice(1).every(k=>typeof s[k]==='string'&&ID.test(s[k])))deny();
  const key=JSON.stringify(FIELDS.map(k=>s[k]));
  if(seen.has(key))deny();seen.add(key);
  return Object.freeze(Object.fromEntries(FIELDS.map(k=>[k,s[k]])));
 }));
}
function readCounters(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==COUNTERS.slice().sort().join(','))deny();
 for(const k of COUNTERS)if(!Number.isSafeInteger(value[k])||value[k]<0)deny();
 // The dispatch worker isolates row errors; never silently accept any failure.
 if(value.failed!==0)deny();
 return value;
}
function abortableDelay(ms,signal){
 return new Promise(resolve=>{
  if(signal.aborted){resolve();return;}
  const onAbort=()=>{clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
export function createStagingServiceSupervisor({cycle,scopes,intervalMs=5000,delay=abortableDelay}){
 if(typeof cycle!=='function'||typeof delay!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>60000)deny();
 const selected=validateStagingServiceScopes(scopes);
 let busy=false;
 async function runOnce(){
  if(busy)deny();
  busy=true;
  try{
   const summary={submitted:0,recovered:0,reconciled:0,held:0};
   for(const scope of selected){
    const counters=readCounters(await cycle(scope));
    for(const key of Object.keys(summary))summary[key]+=counters[key];
   }
   return Object.freeze(summary);
  }finally{busy=false;}
 }
 async function serve(signal){
  if(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function')deny();
  while(!signal.aborted){
   await runOnce();
   if(!signal.aborted)await delay(intervalMs,signal);
  }
 }
 return Object.freeze({runOnce,serve});
}
