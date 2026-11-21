// Isolated proof of Google STS token exchange WITHOUT service-account
// impersonation. Never logs an AWS subject token or a Google access token.
import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {validateAwsIdentityAdc} from '../../api/_fiscal/aws-google-identity.js';
const path='/etc/lourex-staging/aws-identity-adc.json';
function fail(code){console.error('LOUREX GOOGLE STS NOT VERIFIED: '+code);process.exitCode=1;}
let config;
try{
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const stat=fstatSync(fd);
  if(!stat.isFile()||stat.uid!==0||stat.size<1||stat.size>16384||(stat.mode&0o022)!==0)throw Error('bad local file');
  config=JSON.parse(readFileSync(fd,'utf8'));
  validateAwsIdentityAdc(config);
 }finally{closeSync(fd);}
}catch{fail('LOCAL_CONFIG');}
if(config){
 if(process.env.AWS_ACCESS_KEY_ID||process.env.AWS_SECRET_ACCESS_KEY||process.env.AWS_SESSION_TOKEN||process.env.AWS_PROFILE||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.VERCEL_ENV){
  fail('LOCAL_ENVIRONMENT');
 }else{
  try{
   const module=await import('google-auth-library');
   const AwsClient=module.AwsClient??module.default?.AwsClient;
   if(typeof AwsClient!=='function')throw Error('module unavailable');
   const {service_account_impersonation_url:discard,...federated}=config;
   // This call ONLY reaches the Google STS token exchange, not
   // iamcredentials.googleapis.com and not Firestore.
   const client=new AwsClient(federated);
   const result=await client.getAccessToken();
   if(typeof result?.token!=='string'||result.token.length<30)throw Error('invalid token');
   // No token persistence or stdout. Do not return it to the shell.
   console.log('LOUREX GOOGLE STS EXCHANGE PASSED');
  }catch(e){
   // Normalize diagnostic. Never log the raw exception or response body.
   const http=Number(e?.response?.status??e?.status);
   const body=e?.response?.data;
   const oauth=typeof body?.error==='string'?body.error:'';
   if(http===403)fail('GOOGLE_STS_403');
   else if(http===400&&['invalid_grant','invalid_subject_token','invalid_request','invalid_target','access_denied'].includes(oauth))fail('GOOGLE_STS_400_'+oauth.toUpperCase());
   else if(http===400)fail('GOOGLE_STS_400');
   else if([401,404,429].includes(http))fail('GOOGLE_STS_HTTP_'+http);
   else if(http>=500&&http<=599)fail('GOOGLE_STS_HTTP_5XX');
   else if(e?.code==='ERR_MODULE_NOT_FOUND')fail('LOCAL_DEPENDENCY');
   else fail('GOOGLE_STS_UNCLASSIFIED');
  }
 }
}
