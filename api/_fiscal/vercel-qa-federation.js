import {mkdtempSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// QA PREVIEW ONLY. Separate identity and IAM principal from production and AWS.
// Google STS verifies the JWT signature and provider condition, not this parser.
const PROJECT='lourex-fiscal-qa',TEAM='alidaamishs-projects',VERCEL_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ',PROJECT_NAME='invoice';
const SUBJECT='owner:'+TEAM+':project:invoice:environment:preview';
const AUDIENCE='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-vercel/providers/vercel-qa';
const SERVICE='lourex-qa-vercel@'+PROJECT+'.iam.gserviceaccount.com';
const deny=()=>{throw Error('FISCAL_QA_FEDERATION_UNAVAILABLE');};
let paths;
export function requireFiscalQaPreviewFederation(env){
 if(env?.LOUREX_FISCAL_QA_AUTH_MODE!=='vercel-oidc'||env?.LOUREX_FISCAL_QA_PROJECT_ID!==PROJECT||
 env?.VERCEL_ENV!=='preview'||env?.VERCEL_PROJECT_ID!==VERCEL_ID||
 env?.FIRESTORE_EMULATOR_HOST||env?.FIREBASE_AUTH_EMULATOR_HOST||
 env?.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||env?.LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON||
 env?.LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON||
 env?.AWS_ACCESS_KEY_ID||env?.AWS_SECRET_ACCESS_KEY||env?.AWS_SESSION_TOKEN)deny();
 return PROJECT;
}
export function validateFiscalQaPreviewToken(request,env,now=Math.floor(Date.now()/1000)){
 requireFiscalQaPreviewFederation(env);
 const token=request?.headers?.['x-vercel-oidc-token'];
 if(typeof token!=='string'||token.length>16384||token.length<100||
 !/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token))deny();
 let header,claims;
 try{
  const parts=token.split('.');
  header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 }catch{deny();}
 if(header?.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||!header.kid||
 claims?.iss!=='https://oidc.vercel.com/'+TEAM||
 claims.aud!=='https://vercel.com/'+TEAM||claims.sub!==SUBJECT||
 claims.project_id!==VERCEL_ID||claims.project!==PROJECT_NAME||
 claims.owner!==TEAM||claims.environment!=='preview'||
 !Number.isSafeInteger(claims.iat)||claims.iat>now+60||claims.iat<now-10800||
 !Number.isSafeInteger(claims.nbf)||claims.nbf>now+60||
 !Number.isSafeInteger(claims.exp)||claims.exp<=now+60||claims.exp>now+10800)deny();
 // This prefilter never authorizes a LOUREX user; Firebase Auth still checks
 // the separately issued QA token and its issuer, account and revocation.
 return token;
}
export function fiscalQaPreviewExternalAccount(source){
 if(typeof source!=='string'||!source.startsWith('/tmp/lourex-qa-federation-'))deny();
 return {type:'external_account',audience:AUDIENCE,
  subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
  token_url:'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+SERVICE+':generateAccessToken',
  credential_source:{file:source,format:{type:'text'}}};
}
export function prepareFiscalQaPreviewCredential(request,env=process.env){
 const token=validateFiscalQaPreviewToken(request,env);
 if(env!==process.env)deny(); // Prevent passing a synthetic environment into live process mutations.
 if(env.GOOGLE_APPLICATION_CREDENTIALS&&env.GOOGLE_APPLICATION_CREDENTIALS!==paths?.config)deny();
 if(!paths){
  const dir=mkdtempSync(join(tmpdir(),'lourex-qa-federation-'));chmodSync(dir,0o700);
  const source=join(dir,'token'),config=join(dir,'adc.json');
  writeFileSync(config,JSON.stringify(fiscalQaPreviewExternalAccount(source)),{mode:0o600,flag:'wx'});
  paths={source,config,dir};
 }
 const next=join(paths.dir,'token-'+randomUUID());
 writeFileSync(next,token,{mode:0o600,flag:'wx'});
 renameSync(next,paths.source);
 env.GOOGLE_APPLICATION_CREDENTIALS=paths.config;
 return paths.config;
}
