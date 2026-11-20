import {mkdtempSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Pinned to the production deployment, never a caller-selected pool or account.
const PROJECT='lourex-invoice',NUMBER='985119320046';
const PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const TEAM='alidaamishs-projects';
const SUBJECT='owner:'+TEAM+':project:invoice:environment:production';
const SERVICE='lourex-fiscal-runtime@'+PROJECT+'.iam.gserviceaccount.com';
const AUDIENCE='//iam.googleapis.com/projects/'+NUMBER+'/locations/global/workloadIdentityPools/lourex-vercel/providers/vercel';
const unavailable=()=>{throw Error('FEDERATED_FIREBASE_UNAVAILABLE');};
let paths;
export function requireProductionFederation(env){
  if(env.LOUREX_FIREBASE_AUTH_MODE!=='vercel-oidc'||env.VERCEL_ENV!=='production'||env.VERCEL_PROJECT_ID!==PROJECT_ID||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON)unavailable();
}
export function validateVercelWorkloadToken(request,env,now=Math.floor(Date.now()/1000)){
  requireProductionFederation(env);
  const token=request?.headers?.['x-vercel-oidc-token'];
  if(typeof token!=='string'||token.length>16384||!/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token))unavailable();
  let header,claims;try{const [h,p]=token.split('.');header=JSON.parse(Buffer.from(h,'base64url').toString('utf8'));claims=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));}catch{unavailable();}
  if(header?.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||claims?.iss!=='https://oidc.vercel.com/'+TEAM||claims.aud!=='https://vercel.com/'+TEAM||claims.sub!==SUBJECT||!Number.isSafeInteger(claims.exp)||claims.exp<=now+60||!Number.isSafeInteger(claims.iat)||claims.iat>now+60||!Number.isSafeInteger(claims.nbf)||claims.nbf>now+60)unavailable();
  // This is only a local scope/expiry precheck. Google STS independently
  // verifies the signature, issuer, audience and pool condition before IAM
  // impersonation. These claims never authorize a LOUREX user.
  return token;
}
export function externalAccountConfiguration(tokenPath){
  return {type:'external_account',audience:AUDIENCE,subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SERVICE+':generateAccessToken',credential_source:{file:tokenPath,format:{type:'text'}}};
}
// The Admin and Firestore SDKs both consume the same standard ADC external
// account configuration. Only a short-lived platform token lives in the
// isolated server instance's private temporary directory; no key is exported.
// Refresh the source on every authorized runtime request, atomically, before
// the SDK can refresh its cached access token. Never serialize it in a response.
export function prepareVercelFederatedCredential(request,env=process.env){
  const token=validateVercelWorkloadToken(request,env);
  if(env.GOOGLE_APPLICATION_CREDENTIALS&&env.GOOGLE_APPLICATION_CREDENTIALS!==paths?.config)unavailable();
  if(!paths){
    const dir=mkdtempSync(join(tmpdir(),'lourex-federation-'));chmodSync(dir,0o700);
    const config=join(dir,'adc.json'),source=join(dir,'oidc-token');
    writeFileSync(config,JSON.stringify(externalAccountConfiguration(source)),{mode:0o600,flag:'wx'});
    paths={dir,config,source};
  }
  const staging=join(paths.dir,'token-'+randomUUID());
  writeFileSync(staging,token,{mode:0o600,flag:'wx'});
  renameSync(staging,paths.source);
  env.GOOGLE_APPLICATION_CREDENTIALS=paths.config;
  return paths.config;
}
