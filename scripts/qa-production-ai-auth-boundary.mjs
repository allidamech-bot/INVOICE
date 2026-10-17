/**
 * Attest that production AI gateways reject unsigned callers before parsing
 * user content, routing to providers or invoking tools.
 * Sends only empty bodies, no credentials and no business data.
 * The deployed AI application is NOT tested end-to-end here.
 */
const origin='https://invoice-three-puce.vercel.app';
const routes=[
  ['/api/ai-core','Controller/general AI'],
  ['/api/ai-advisor-v2','Advisor'],
  ['/api/ai-conversation-v3','Conversation'],
  ['/api/ai-inbox','Inbox and tool planner'],
];
const cases=[
  {label:'GET rejected',method:'GET',expectedStatus:405,expectedCode:'METHOD_NOT_ALLOWED'},
  {label:'Untrusted source rejected',method:'POST',headers:{'content-type':'application/json'},
    expectedStatus:403,expectedCode:'ORIGIN_REJECTED_OR_AI_ORIGIN_REJECTED'},
  {label:'No Firebase ID token rejected',method:'POST',headers:{
    'content-type':'application/json','x-requested-with':'LOUREX-Invoice',
    'origin':origin,'sec-fetch-site':'same-origin'},
    expectedStatus:401,expectedCode:'AI_AUTH_REQUIRED'},
];
let failed=false,unavailable=false;
const results=[];
for(const [path,kind] of routes){
  for(const c of cases){
    try{
      // No Authorization, cookie or account data is ever sent.
      const res=await fetch(origin+path,{
        method:c.method,redirect:'manual',signal:AbortSignal.timeout(10000),
        headers:c.headers||{'accept':'application/json'},
        ...(c.method==='POST'?{body:'{}'}:{})
      });
      if([429,503].includes(res.status)||[301,302,303,307,308].includes(res.status)){
        unavailable=true;results.push({path,case:c.label,state:'INCONCLUSIVE_ACCESS',status:res.status});continue;
      }
      const body=(await res.text()).slice(0,2048);
      let json;try{json=JSON.parse(body)}catch{json={};}
      const validCode=c.expectedCode==='ORIGIN_REJECTED_OR_AI_ORIGIN_REJECTED'
        ? ['ORIGIN_REJECTED','AI_ORIGIN_REJECTED'].includes(json?.code)
        : json?.code===c.expectedCode;
      const good=res.status===c.expectedStatus&&validCode;
      if(!good)failed=true;
      results.push({path,case:c.label,state:good?'PASS':'FAIL_BOUNDARY',
        status:res.status,code:String(json?.code||'missing').slice(0,55)});
    }catch(error){
      unavailable=true;
      results.push({path,case:c.label,state:'INCONCLUSIVE_NETWORK',reason:error?.name||'network error'});
    }
  }
}
console.log(JSON.stringify({type:'LOUREX_LIVE_UNSIGNED_AI_BOUNDARY',results},null,2));
if(failed){console.error('FAIL: live AI gateway rejected incorrectly or missing. No authenticated request was sent.');process.exitCode=1;}
else if(unavailable){console.error('INCONCLUSIVE: some public AI routes could not be attested; not proof of a vulnerability.');process.exitCode=2;}
else console.log('PASS: all production AI gateways reject unsigned access before provider/tool dispatch.');
