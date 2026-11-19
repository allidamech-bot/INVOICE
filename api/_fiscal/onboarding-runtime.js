import {fiscalQaProject,fiscalQaIdentity} from './status-runtime.js';
import {createQaManagedKms} from './managed-kms.js';
import {createSimulationCredentialVault} from './credential-vault.js';
import {createSimulationOnboardingStore} from './onboarding-store.js';
import {createSimulationEnrollment} from './enrollment.js';
import {createManagedEnrollmentLifecycle} from './managed-enrollment.js';
import {createQaManagedSigner} from './managed-signing.js';

// No public route. Separate explicit preview flags and write-service identity.
// No automatic provisioning or production submission. Explicit trusted callers only.
export function onboardingQaConfig(env){
  const project=fiscalQaProject(env);
  if(env.LOUREX_FISCAL_ONBOARDING_ENABLED!=='true')throw Error('FISCAL_ONBOARDING_UNAVAILABLE');
  let account,statusAccount;
  try{account=JSON.parse(env.LOUREX_FISCAL_ONBOARDING_SERVICE_ACCOUNT_JSON||'');statusAccount=JSON.parse(env.LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON||'');}catch{throw Error('FISCAL_ONBOARDING_UNAVAILABLE');}
  if(account?.project_id!==project||statusAccount?.project_id!==project||typeof account.client_email!=='string'||!account.client_email.endsWith('@'+project+'.iam.gserviceaccount.com')||typeof statusAccount.client_email!=='string'||account.client_email===statusAccount.client_email||typeof account.private_key!=='string'||!account.private_key||typeof env.LOUREX_FISCAL_QA_KMS_KEY!=='string')throw Error('FISCAL_ONBOARDING_UNAVAILABLE');
  // Validate the pinned KMS resource before loading or initializing Admin SDK.
  const keyName=env.LOUREX_FISCAL_QA_KMS_KEY;
  createQaManagedKms({projectId:project,keyName,getAccessToken:async()=>{throw Error('CONFIG_ONLY');}});
  return {project,account,keyName};
}
export async function getFiscalQaOnboardingRuntime({enrollmentVerifiers}={}){
  const {project,account,keyName}=onboardingQaConfig(process.env);
  const [{initializeApp,getApps,cert},{getFirestore},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);
  const name='lourex-fiscal-qa-onboarding';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!==project)throw Error('FISCAL_ONBOARDING_UNAVAILABLE');
  if(!app)app=initializeApp({projectId:project,credential:cert(account)},name);
  const db=getFirestore(app),auth=getAuth(app),credential=app.options.credential;
  if(typeof credential?.getAccessToken!=='function')throw Error('FISCAL_ONBOARDING_UNAVAILABLE');
  const kms=createQaManagedKms({projectId:project,keyName,getAccessToken:async()=>{const token=await credential.getAccessToken();return token.access_token;}});
  const vault=createSimulationCredentialVault({db,...kms});
  const onboarding=createSimulationOnboardingStore({db,vault});
  // No default verifier and no route. Only a trusted caller with real SDK and
  // independently verified certificate policy can compose the commands.
  const getAccessToken=async()=>{const token=await credential.getAccessToken();return token.access_token;};
  const lifecycle=enrollmentVerifiers?createManagedEnrollmentLifecycle({db,vault,resolveSigner:async(_scope,binding)=>createQaManagedSigner({projectId:project,binding,getAccessToken}),resolveProtectedSession:enrollmentVerifiers.resolveProtectedSession}):null;
  const commands=lifecycle?createSimulationEnrollment({db,vault,onboarding,verifyCsr:lifecycle.verifyCsr,verifyCredential:enrollmentVerifiers.verifyCredential,buildComplianceInvoice:enrollmentVerifiers.buildComplianceInvoice,verifyComplianceResult:enrollmentVerifiers.verifyComplianceResult}):null;
  // CSR generation runs from pre-approved private configuration, never from a
  // browser-supplied identity. Activation remains a separate local transaction.
  const enrollment=commands?Object.freeze({...commands,begin:async(identity,command)=>{
    if(identity?.role!=='owner'||typeof identity.uid!=='string'||typeof command?.otp!=='string'||!/^\d{6}$/.test(command.otp))throw Error('ONBOARDING_COMMAND_FORBIDDEN');
    await lifecycle.prepareCsr({environment:'simulation',accountUid:identity.uid,workspaceId:command.workspaceId,egsId:command.egsId});
    return commands.begin(identity,command);
  }}):null;
  return Object.freeze({verifyIdentity:async token=>fiscalQaIdentity(await auth.verifyIdToken(token,true),project),vault,onboarding,enrollment,lifecycle});
}
