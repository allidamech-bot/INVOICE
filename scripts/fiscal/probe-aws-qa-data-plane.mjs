// Zero-write staging QA data-plane acceptance. Never accesses customer records.
import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const QA='lourex-fiscal-qa',PRODUCTION='lourex-invoice';
const ADC_PATH='/etc/lourex-staging/aws-adc.json';
const AUDIENCE='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging';
const SA='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com';
const IMDS='http://169.254.169.254/latest/';
const deny=()=>{throw Error('LOUREX_QA_ADC_UNTRUSTED');};
export function validateAwsQaAdc(config){
 const s=config?.credential_source;
 if(config?.type!=='external_account'||config.audience!==AUDIENCE||
 config.subject_token_type!=='urn:ietf:params:aws:token-type:aws4_request'||
 config.token_url!=='https://sts.googleapis.com/v1/token'||
 config.service_account_impersonation_url!=='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SA+':generateAccessToken'||
 Object.hasOwn(config,'private_key')||Object.hasOwn(config,'client_secret')||
 (config.universe_domain!==undefined&&config.universe_domain!=='googleapis.com')||
 s?.environment_id!=='aws1'||s.region_url!==IMDS+'meta-data/placement/availability-zone'||
 s.url!==IMDS+'meta-data/iam/security-credentials'||
 s.imdsv2_session_token_url!==IMDS+'api/token'||
 s.regional_cred_verification_url!=='https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'||
 Object.keys(s).some(k=>!['environment_id','region_url','url','imdsv2_session_token_url','regional_cred_verification_url'].includes(k))||
 config.service_account_impersonation?.token_lifetime_seconds!==undefined&&(
 !Number.isInteger(config.service_account_impersonation.token_lifetime_seconds)||
 config.service_account_impersonation.token_lifetime_seconds<600||
 config.service_account_impersonation.token_lifetime_seconds>3600))deny();
 return true;
}
export function isExplicitPermissionDenial(error){
 return [7,'7','permission-denied','PERMISSION_DENIED'].includes(error?.code)||
 error?.status==='PERMISSION_DENIED';
}
function readRootOwnedAdc(){
 const fd=openSync(ADC_PATH,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const s=fstatSync(fd);
  if(!s.isFile()||s.uid!==0||s.nlink!==1||(s.mode&0o022)!==0||s.size<1||s.size>16384)deny();
  const c=JSON.parse(readFileSync(fd,'utf8'));
  validateAwsQaAdc(c);return true;
 }finally{closeSync(fd);}
}
function environmentIsSafe(){
 const e=process.env;
 if(e.VERCEL_ENV||e.AWS_ACCESS_KEY_ID||e.AWS_SECRET_ACCESS_KEY||e.AWS_SESSION_TOKEN||e.AWS_PROFILE||
 e.FIRESTORE_EMULATOR_HOST||e.FIREBASE_AUTH_EMULATOR_HOST||e.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||
 e.LOUREX_AWS_STAGING_ENABLED!=='true'||e.GOOGLE_APPLICATION_CREDENTIALS&&e.GOOGLE_APPLICATION_CREDENTIALS!==ADC_PATH)deny();
}
async function main(){
 environmentIsSafe();
 readRootOwnedAdc();
 process.env.GOOGLE_APPLICATION_CREDENTIALS=ADC_PATH;
 // Resolve dependencies from the EXISTING EC2 LOUREX checkout; no reinstall.
 const require=createRequire('/home/ubuntu/lourex/package.json');
 const {applicationDefault,initializeApp,deleteApp}=require('firebase-admin/app');
 const {getFirestore}=require('firebase-admin/firestore');
 const qa=initializeApp({projectId:QA,credential:applicationDefault()},'lourex-qa-data-plane-probe');
 let prod,dbQa,dbProd;
 try{
  dbQa=getFirestore(qa);
  // The path is a deliberately absent probe document, not customer information.
  await dbQa.doc('fiscalRuntimeProbesV1/non_customer_probe').get();
  console.log('LOUREX AWS QA FIRESTORE READ PASSED');
  prod=initializeApp({projectId:PRODUCTION,credential:applicationDefault()},'lourex-production-denial-probe');
  dbProd=getFirestore(prod);
  let denied=false;
  try{
   // A successful read of a missing document STILL means the principal is overprivileged.
   await dbProd.doc('fiscalRuntimeProbesV1/non_customer_probe').get();
  }catch(error){denied=isExplicitPermissionDenial(error);}
  if(!denied)throw Error('LOUREX_PRODUCTION_ISOLATION_FAILED');
  console.log('LOUREX PRODUCTION FIRESTORE ACCESS DENIED AS REQUIRED');
  console.log('LOUREX AWS QA DATA PLANE READY');
 }finally{
  if(dbProd)await dbProd.terminate().catch(()=>{});
  if(dbQa)await dbQa.terminate().catch(()=>{});
  if(prod)await deleteApp(prod).catch(()=>{});
  await deleteApp(qa).catch(()=>{});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main();}catch{
  // Fixed vocabulary only: provider errors may include signed AWS tokens.
  console.error('LOUREX AWS QA DATA PLANE NOT VERIFIED');
  process.exitCode=1;
 }
}
