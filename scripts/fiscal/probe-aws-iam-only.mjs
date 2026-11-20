// Exact Google IAMCredentials permission test after *previously proven* AWS→Google STS.
// No Firestore call; no service-account key or permanent credential storage.
// Do not log tokens, IAM response payloads, full errors or raw URLs.
import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {validateAwsIdentityAdc} from '../../api/_fiscal/aws-google-identity.js';
import {classifyIamCredentialsReply} from '../../api/_fiscal/aws-google-iam-result.js';

const local='/etc/lourex-staging/aws-identity-adc.json';
const fail=code=>{console.error('LOUREX IAMCREDENTIALS NOT VERIFIED: '+code);process.exitCode=1;};
let config=null;
try{
 const fd=openSync(local,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const stat=fstatSync(fd);
  if(!stat.isFile()||stat.uid!==0||stat.size<1||stat.size>16384||(stat.mode&0o022)!==0)throw Error('config denied');
  config=JSON.parse(readFileSync(fd,'utf8'));
  validateAwsIdentityAdc(config);
 }finally{closeSync(fd);}
}catch{fail('LOCAL_ADC');}
if(config){
 if(process.env.AWS_ACCESS_KEY_ID||process.env.AWS_SECRET_ACCESS_KEY||process.env.AWS_SESSION_TOKEN||process.env.AWS_PROFILE||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.VERCEL_ENV){
  fail('LOCAL_ENV');
 }else{
  let sts;
  try{
   const m=await import('google-auth-library');
   const Client=m.AwsClient??m.default?.AwsClient;
   if(typeof Client!=='function')throw Error('invalid client');
   const {service_account_impersonation_url:unused,...stsConfig}=config;
   sts=await new Client(stsConfig).getAccessToken();
   if(typeof sts?.token!=='string'||sts.token.length<30)throw Error('invalid token');
  }catch{fail('STS_REGRESSION');}
  if(sts?.token){
   try{
    // The endpoint is already pinned by validateAwsIdentityAdc.
    const res=await fetch(config.service_account_impersonation_url,{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
     headers:{'Authorization':'Bearer '+sts.token,'Content-Type':'application/json'},
     body:JSON.stringify({scope:['https://www.googleapis.com/auth/cloud-platform'],lifetime:'600s'})
    });
    if(res.ok){
     // No response body read, persisted or shown.
     console.log('LOUREX IAMCREDENTIALS IMPERSONATION PASSED');
     console.log('FIRESTORE ACCESS: NOT REQUESTED');
    }else{
     // Restrict error parsing and expose only a fixed diagnostic code.
     const txt=(await res.text()).slice(0,12288);
     let body=null;try{body=JSON.parse(txt);}catch{}
     fail(classifyIamCredentialsReply(res.status,body));
    }
   }catch{fail('IAM_REQUEST_FAILED');}
  }
 }
}
