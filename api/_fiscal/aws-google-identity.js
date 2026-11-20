import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
export const AWS_GOOGLE_IDENTITY_CODES=Object.freeze([
 'LOCAL_CONFIG','LOCAL_FILE','LOCAL_IMPORT','LOCAL_POLICY',
 'REMOTE_ATTRIBUTE_CONDITION','REMOTE_IMPERSONATION_DENIED',
 'REMOTE_STS_REJECTED','REMOTE_INVALID_TARGET','REMOTE_NETWORK',
 'REMOTE_STS_403','REMOTE_IAMCREDENTIALS_403','REMOTE_GOOGLE_403','REMOTE_GOOGLE_400','REMOTE_GOOGLE_404',
 'REMOTE_GOOGLE_5XX','REMOTE_TOKEN_INVALID','REMOTE_UNKNOWN'
]);
const fail=code=>{throw Error('AWS_GOOGLE_IDENTITY_'+code);};
function classifyRemote(error){
 // Strictly mapped diagnostic labels: never log raw provider responses,
 // request headers, stack traces, session tokens or Google access tokens.
 const status=Number(error?.response?.status??error?.status??error?.code);
 const code=String(error?.response?.data?.error??'').slice(0,80);
 const m=String(error?.message??'').slice(0,4000);
 // The URL is used only to select a fixed diagnostic code; never print it,
 // since SDK request URLs may contain sensitive query parameters.
 let host='';
 for(const candidate of [error?.response?.config?.url,error?.config?.url,error?.response?.request?.res?.responseUrl]){
  if(typeof candidate!=='string')continue;
  try{
   const url=new URL(candidate);
   if(url.protocol==='https:'){host=url.hostname;break;}
  }catch{}
 }
 if(status===403){
  if(host==='sts.googleapis.com')return 'REMOTE_STS_403';
  if(host==='iamcredentials.googleapis.com'||/iam\\.serviceAccounts\\.getAccessToken|generateAccessToken|impersonat/i.test(m))return 'REMOTE_IAMCREDENTIALS_403';
 }
 if(/attribute.condition|attributeCondition|attribute_condition|attribute mapping/i.test(m))return 'REMOTE_ATTRIBUTE_CONDITION';
 if(/iam\.serviceAccounts\.getAccessToken|impersonat|workloadIdentityUser/i.test(m)&&status===403)return 'REMOTE_IMPERSONATION_DENIED';
 if(/invalid_target/i.test(code+' '+m))return 'REMOTE_INVALID_TARGET';
 if(/invalid_grant|invalid_subject_token/i.test(code+' '+m))return 'REMOTE_STS_REJECTED';
 if(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|socket hang up/i.test(m))return 'REMOTE_NETWORK';
 if(status===403)return 'REMOTE_GOOGLE_403';
 if(status===400)return 'REMOTE_GOOGLE_400';
 if(status===404)return 'REMOTE_GOOGLE_404';
 if(status>=500&&status<=599)return 'REMOTE_GOOGLE_5XX';
 return 'REMOTE_UNKNOWN';
}
const PROJECT='lourex-invoice';
const NUMBER='985119320046';
const SA='lourex-aws-staging@'+PROJECT+'.iam.gserviceaccount.com';
const AUDIENCE='//iam.googleapis.com/projects/'+NUMBER+'/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging';
const IMDS='http://169.254.169.254/latest/';
export function validateAwsIdentityAdc(config){
 const c=config,s=c?.credential_source;
 if(c?.type!=='external_account'||c.audience!==AUDIENCE||c.subject_token_type!=='urn:ietf:params:aws:token-type:aws4_request'||c.token_url!=='https://sts.googleapis.com/v1/token'||c.service_account_impersonation_url!=='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SA+':generateAccessToken'||c.private_key||c.client_secret||!s||s.environment_id!=='aws1'||s.region_url!==IMDS+'meta-data/placement/availability-zone'||s.url!==IMDS+'meta-data/iam/security-credentials'||s.imdsv2_session_token_url!==IMDS+'api/token'||s.regional_cred_verification_url!=='https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15')fail('LOCAL_CONFIG');
 if(Object.keys(s).some(k=>!['environment_id','region_url','url','imdsv2_session_token_url','regional_cred_verification_url'].includes(k)))fail('LOCAL_CONFIG');
 return true;
}
export async function probeAwsGoogleIdentity({adcPath='/etc/lourex-staging/aws-identity-adc.json',env=process.env}={}){
 if(env.VERCEL_ENV||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.AWS_ACCESS_KEY_ID||env.AWS_SECRET_ACCESS_KEY||env.AWS_SESSION_TOKEN||env.AWS_PROFILE||env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||env.GOOGLE_APPLICATION_CREDENTIALS&&env.GOOGLE_APPLICATION_CREDENTIALS!==adcPath||typeof adcPath!=='string'||!adcPath.startsWith('/etc/lourex-staging/'))fail('LOCAL_POLICY');
 let fd;
 try{fd=openSync(adcPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 catch{fail('LOCAL_FILE');}
 try{
  let config;
  try{
   const st=fstatSync(fd);
   if(!st.isFile()||st.uid!==0||st.size<1||st.size>16384||(st.mode&0o022)!==0)fail('LOCAL_FILE');
   config=JSON.parse(readFileSync(fd,'utf8'));
  }catch(e){if(e?.message?.startsWith('AWS_GOOGLE_IDENTITY_'))throw e;fail('LOCAL_FILE');}
  validateAwsIdentityAdc(config);
 }finally{closeSync(fd);}
 if(env!==process.env)fail('LOCAL_POLICY');
 process.env.GOOGLE_APPLICATION_CREDENTIALS=adcPath;
 let applicationDefault;
 try{({applicationDefault}=await import('firebase-admin/app'));}
 catch{fail('LOCAL_IMPORT');}
 let token;
 try{token=await applicationDefault().getAccessToken();}
 catch(e){fail(classifyRemote(e));}
 if(typeof token?.access_token!=='string'||token.access_token.length<30||!Number.isFinite(token.expires_in)||token.expires_in<=0||token.expires_in>3600)fail('REMOTE_TOKEN_INVALID');
 return true;
}
