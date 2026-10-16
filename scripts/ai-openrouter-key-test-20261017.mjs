import {mkdirSync,writeFileSync} from 'node:fs';
const report={version:1,provider:'openrouter',endpoint:'/api/v1/key',configured:false,httpStatus:null,authentication:'NOT_TESTED',checkedAt:new Date().toISOString()};
const key=process.env.OPENROUTER_API_KEY?.trim();
if(key){
 report.configured=true;
 try{
  const response=await fetch('https://openrouter.ai/api/v1/key',{
    method:'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  report.httpStatus=response.status;
  report.authentication=response.status===200?'ACCEPTED':response.status===401?'REJECTED_401':response.status===403?'FORBIDDEN_403':response.status===429?'RATE_LIMITED_429':'UNVERIFIED';
 }catch(err){report.authentication=err?.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR';}
}
mkdirSync('dist',{recursive:true});
writeFileSync('dist/ai-openrouter-key-test-20261017.json',JSON.stringify(report)+'\n',{mode:0o644});
console.log('OPENROUTER_KEY_AUTH_CHECK_COMPLETED: redacted status only; no key or provider response saved.');
