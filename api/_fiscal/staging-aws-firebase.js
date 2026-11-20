import {openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {isAbsolute} from 'node:path';
const need=ok=>{if(!ok)throw Error('AWS_STAGING_FIREBASE_UNAVAILABLE');};
const QA=/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/;
const AUD=/^\/\/iam\.googleapis\.com\/projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/;
const METADATA='http://169.254.169.254/latest/';
export function validateAwsStagingAdc({projectId,audience,serviceAccount},config){
 need(typeof projectId==='string'&&QA.test(projectId)&&typeof audience==='string'&&AUD.test(audience)&&typeof serviceAccount==='string'&&/^[a-z][a-z0-9-]{4,29}@/.test(serviceAccount)&&serviceAccount.endsWith('@'+projectId+'.iam.gserviceaccount.com'));
 need(config?.type==='external_account'&&config.audience===audience&&config.subject_token_type==='urn:ietf:params:aws:token-type:aws4_request'&&config.token_url==='https://sts.googleapis.com/v1/token'&&config.service_account_impersonation_url==='https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+serviceAccount+':generateAccessToken');
 need(!Object.hasOwn(config,'private_key')&&!Object.hasOwn(config,'client_secret')&&(!config.universe_domain||config.universe_domain==='googleapis.com'));
 const s=config.credential_source;
 need(s?.environment_id==='aws1'&&s.region_url===METADATA+'meta-data/placement/availability-zone'&&s.url===METADATA+'meta-data/iam/security-credentials'&&s.imdsv2_session_token_url===METADATA+'api/token'&&s.regional_cred_verification_url==='https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15');
 need(Object.keys(s).every(k=>['environment_id','region_url','url','imdsv2_session_token_url','regional_cred_verification_url'].includes(k)));
 const lifetime=config.service_account_impersonation?.token_lifetime_seconds;
 need(lifetime===undefined||Number.isInteger(lifetime)&&lifetime>=600&&lifetime<=3600);
 return true;
}
function readRootConfig(path){
 need(typeof path==='string'&&isAbsolute(path));
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=fstatSync(fd);need(s.isFile()&&s.uid===0&&(s.mode&0o022)===0&&s.size>0&&s.size<=16384);return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
}
// ADC must derive short-lived credentials from the attached EC2 role through
// Google STS. No service account private key or environment AWS access key.
export async function initializeAwsStagingFirebase({projectId,audience,serviceAccount,adcPath,env=process.env}){
 need(env.LOUREX_AWS_STAGING_ENABLED==='true'&&!env.VERCEL_ENV&&!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST&&!env.AWS_ACCESS_KEY_ID&&!env.AWS_SECRET_ACCESS_KEY&&!env.AWS_SESSION_TOKEN&&!env.AWS_PROFILE&&!env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON&&(!env.GOOGLE_APPLICATION_CREDENTIALS||env.GOOGLE_APPLICATION_CREDENTIALS===adcPath));
 need(validateAwsStagingAdc({projectId,audience,serviceAccount},readRootConfig(adcPath)));
 // Firebase Admin's ADC and the Firestore client must use the same immutable file.
 need(env===process.env);
 process.env.GOOGLE_APPLICATION_CREDENTIALS=adcPath;
 const [{initializeApp,getApps,applicationDefault},{getFirestore},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);
 const name='lourex-aws-fiscal-staging';let app=getApps().find(a=>a.name===name);
 if(app)need(app.options.projectId===projectId);
 else app=initializeApp({projectId,credential:applicationDefault()},name);
 const credential=app.options.credential,token=await credential.getAccessToken();
 need(typeof token?.access_token==='string'&&token.access_token.length>0&&Number.isFinite(token.expires_in)&&token.expires_in>0&&token.expires_in<=3600);
 const db=getFirestore(app);
 // A read-only probe, not creation of a document or a live business mutation.
 await db.doc('fiscalPrivateV1/aws_staging_runtime_probe').get();
 return Object.freeze({db,auth:getAuth(app)});
}
