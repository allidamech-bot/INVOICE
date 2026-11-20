import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
const fail=()=>{throw Error('AWS_GOOGLE_IDENTITY_NOT_VERIFIED');};
const PROJECT='lourex-invoice';
const NUMBER='985119320046';
const SA='lourex-aws-staging@'+PROJECT+'.iam.gserviceaccount.com';
const AUDIENCE='//iam.googleapis.com/projects/'+NUMBER+'/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2';
const IMDS='http://169.254.169.254/latest/';
export function validateAwsIdentityAdc(config){
 const c=config,s=c?.credential_source;
 if(c?.type!=='external_account'||c.audience!==AUDIENCE||c.subject_token_type!=='urn:ietf:params:aws:token-type:aws4_request'||c.token_url!=='https://sts.googleapis.com/v1/token'||c.service_account_impersonation_url!=='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SA+':generateAccessToken'||c.private_key||c.client_secret||!s||s.environment_id!=='aws1'||s.region_url!==IMDS+'meta-data/placement/availability-zone'||s.url!==IMDS+'meta-data/iam/security-credentials'||s.imdsv2_session_token_url!==IMDS+'api/token'||s.regional_cred_verification_url!=='https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15')fail();
 if(Object.keys(s).some(k=>!['environment_id','region_url','url','imdsv2_session_token_url','regional_cred_verification_url'].includes(k)))fail();
 return true;
}
export async function probeAwsGoogleIdentity({adcPath='/etc/lourex-staging/aws-identity-adc.json',env=process.env}={}){
 if(env.VERCEL_ENV||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.AWS_ACCESS_KEY_ID||env.AWS_SECRET_ACCESS_KEY||env.AWS_SESSION_TOKEN||env.AWS_PROFILE||env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||env.GOOGLE_APPLICATION_CREDENTIALS&&env.GOOGLE_APPLICATION_CREDENTIALS!==adcPath||typeof adcPath!=='string'||!adcPath.startsWith('/etc/lourex-staging/'))fail();
 const fd=openSync(adcPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);if(!st.isFile()||st.uid!==0||st.size<1||st.size>16384||(st.mode&0o022)!==0)fail();
  const config=JSON.parse(readFileSync(fd,'utf8'));validateAwsIdentityAdc(config);
 }finally{closeSync(fd);}
 if(env!==process.env)fail();
 process.env.GOOGLE_APPLICATION_CREDENTIALS=adcPath;
 const {applicationDefault}=await import('firebase-admin/app');
 const token=await applicationDefault().getAccessToken();
 if(typeof token?.access_token!=='string'||token.access_token.length<30||!Number.isFinite(token.expires_in)||token.expires_in<=0||token.expires_in>3600)fail();
 return true;
}
