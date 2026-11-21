import {validateStagingServiceScopes} from './staging-service-supervisor.js';

// Identity-only WIF resides in the existing Google project; data access is QA only.
export const AWS_FISCAL_QA_PROJECT='lourex-fiscal-qa';
export const AWS_FISCAL_QA_SERVICE_ACCOUNT='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com';
export const AWS_FISCAL_WIF_AUDIENCE='//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging';
export const AWS_FISCAL_ADC_PATH='/etc/lourex-staging/aws-adc.json';

const FIELDS=['projectId','serviceAccount','audience','adcPath','scopes','profileSha256'];
const HEX=/^[a-f0-9]{64}$/;
const deny=()=>{throw Error('LOUREX_AWS_WORKER_CONFIGURATION_DENIED');};
export function validateAwsFiscalWorkerConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join(',')!==FIELDS.slice().sort().join(',')||
    input.projectId!==AWS_FISCAL_QA_PROJECT||
    input.serviceAccount!==AWS_FISCAL_QA_SERVICE_ACCOUNT||
    input.audience!==AWS_FISCAL_WIF_AUDIENCE||
    input.adcPath!==AWS_FISCAL_ADC_PATH||
    !HEX.test(input.profileSha256??''))deny();
 let scopes;
 try{scopes=validateStagingServiceScopes(input.scopes);}catch{deny();}
 return Object.freeze({
  projectId:AWS_FISCAL_QA_PROJECT,
  serviceAccount:AWS_FISCAL_QA_SERVICE_ACCOUNT,
  audience:AWS_FISCAL_WIF_AUDIENCE,
  adcPath:AWS_FISCAL_ADC_PATH,
  scopes,
  profileSha256:input.profileSha256,
 });
}
export function requireAwsFiscalDispatchApproval(env){
 if(env?.LOUREX_AWS_STAGING_ENABLED!=='true'||
    env?.LOUREX_AWS_WORKER_ENABLED!=='true'||
    env?.LOUREX_AWS_DISPATCH_APPROVED!=='true'||
    env?.VERCEL_ENV||env?.FIRESTORE_EMULATOR_HOST||
    env?.FIREBASE_AUTH_EMULATOR_HOST||env?.AWS_ACCESS_KEY_ID||
    env?.AWS_SECRET_ACCESS_KEY||env?.AWS_SESSION_TOKEN||env?.AWS_PROFILE||
    env?.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON)deny();
 return true;
}
