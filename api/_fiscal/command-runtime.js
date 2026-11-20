import {fiscalQaProject,fiscalQaIdentity} from './status-runtime.js';
import {createFiscalCommandService} from './command-service.js';
import {createFiscalResponseStatus} from './response-status.js';
import {createFiscalLedger} from './ledger.js';
import {createFiscalSimulationWorker} from './simulation-worker.js';
import {createFiscalReconciler} from './reconciliation.js';
import {createFiscalOutputService} from './fiscal-output.js';
import {createFiscalAccounting} from './fiscal-accounting.js';
import {createFiscalPeriodGuard} from './fiscal-period-guard.js';
import {createIndependentFiscalPdfVerifier} from './pdf-archive-verifier.js';
import {createSdk4LocalValidator} from './sdk4-local-validator.js';
import {createStagingDispatchRequest} from './staging-dispatch.js';
export function fiscalCommandConfig(env){
  const project=fiscalQaProject(env);
  if(env.LOUREX_FISCAL_COMMANDS_ENABLED!=='true')throw Error('FISCAL_COMMAND_UNAVAILABLE');
  let account,reader;try{account=JSON.parse(env.LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON||'');reader=JSON.parse(env.LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON||'');}catch{throw Error('FISCAL_COMMAND_UNAVAILABLE');}
  if(account?.project_id!==project||reader?.project_id!==project||typeof account.client_email!=='string'||!account.client_email.endsWith('@'+project+'.iam.gserviceaccount.com')||typeof reader.client_email!=='string'||account.client_email===reader.client_email||typeof account.private_key!=='string'||!account.private_key)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  return {project,account};
}
// Trusted server composition only, never request options. A complete set
// of separately verified adapters is required before remote commands exist.
export function fiscalSimulationAdaptersConfigured(options){
  if(options===undefined)return false;
  if(!options||typeof options!=='object'||!options.preparation||!options.submission||!options.enrollment)throw Error('FISCAL_VERIFICATION_UNAVAILABLE');
  const {preparation:p,submission:s,enrollment:e}=options;
  if([p.canonicalize,p.resolveProtectedSession,s.resolveCredential,s.verifyPrepared,s.verifyAuthorityResult,e.resolveProtectedSession,e.verifyCredential,e.buildComplianceInvoice,e.verifyComplianceResult].some(fn=>typeof fn!=='function')||!p.policy||!p.sdk||Object.hasOwn(p,'validateOfficial'))throw Error('FISCAL_VERIFICATION_UNAVAILABLE');
  try{createSdk4LocalValidator({...p.sdk,canonicalize:p.canonicalize});}catch{throw Error('FISCAL_VERIFICATION_UNAVAILABLE');}
  return true;
}
// Private operations are never reachable through parseFiscalCommand.
export function privateAcceptanceAdaptersConfigured(options){
  if(options===undefined)return null;
  if(!options||typeof options!=='object'||Array.isArray(options)||!Object.keys(options).length||Object.keys(options).some(k=>!['pdf','verifySupplierSettlementEvidence','verifyStockGlEvidence'].includes(k))||Object.hasOwn(options,'verifySupplierSettlementEvidence')&&typeof options.verifySupplierSettlementEvidence!=='function'||Object.hasOwn(options,'verifyStockGlEvidence')&&typeof options.verifyStockGlEvidence!=='function'||Object.hasOwn(options,'pdf')&&!options.pdf)throw Error('FISCAL_VERIFICATION_UNAVAILABLE');
  return Object.freeze({...(options.pdf===undefined?{}:{pdf:createIndependentFiscalPdfVerifier(options.pdf)}),verifySupplierSettlementEvidence:options.verifySupplierSettlementEvidence,verifyStockGlEvidence:options.verifyStockGlEvidence});
}
export async function getFiscalQaCommandRuntime({simulationAdapters,privateAcceptanceAdapters}={}){
  const configured=fiscalSimulationAdaptersConfigured(simulationAdapters);
  const awsDispatch=process.env.LOUREX_FISCAL_AWS_QUEUE_ENABLED==='true';
  if(configured&&awsDispatch)throw Error('FISCAL_VERIFICATION_UNAVAILABLE');
  const privateAdapters=privateAcceptanceAdaptersConfigured(privateAcceptanceAdapters);
  const {project,account}=fiscalCommandConfig(process.env);
  const [{initializeApp,getApps,cert},{getFirestore},{getAuth},{createCommercialIssueApproval},{createCommercialReview}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth'),import('./commercial-approval.js'),import('./commercial-review.js')]);
  const name='lourex-fiscal-qa-command';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!==project)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  if(!app)app=initializeApp({projectId:project,credential:cert(account)},name);
  const db=getFirestore(app),auth=getAuth(app);
  const ledger=createFiscalLedger(db,configured?{sdkInstallationManifestSha256:simulationAdapters.preparation.sdk.manifestSha256}:awsDispatch?{requireStagingDispatch:true}:{}),accounting=createFiscalAccounting({db,verifySupplierSettlementEvidence:privateAdapters?.verifySupplierSettlementEvidence,verifyStockGlEvidence:privateAdapters?.verifyStockGlEvidence});
  const output=createFiscalOutputService({db,verifyPdf:privateAdapters?.pdf});
  const periodService=process.env.LOUREX_FISCAL_QA_PERIOD_ENABLED==='true'&&process.env.LOUREX_PERIOD_RULES_VERSION==='1'? (await import('../_accounting/period-store.js')).createPeriodService(db,{fiscalGuard:createFiscalPeriodGuard(db,{closeProof:accounting.closeProof})}):null;
  // Recovery never sends anything. A held attempt is transitioned only via the
  // ledger's versioned, five-minute recovery transaction.
  const recover=async(scope,documentId,version)=>{
    const base='fiscalPrivateV1/'+scope.accountUid+'/workspaces/'+scope.workspaceId;
    const snap=await db.doc(base+'/issues/'+documentId).get(),record=snap.exists?snap.data():null;
    if(!record||record.accountUid!==scope.accountUid||record.workspaceId!==scope.workspaceId||record.egsId!==scope.egsId||record.version!==version||record.status!=='submitting'||typeof record.attemptId!=='string')throw Error('FISCAL_STALE_ISSUE');
    return ledger.recoverInterrupted(scope,documentId,version,record.attemptId,new Date().toISOString());
  };
  // A genuine trusted SDK/authority adapter is a mandatory prerequisite.
  // The standard hosted route does not supply it; no mock verifier or network
  // submission is enabled by default.
  let submit,reconcile,prepare,enrollment;
  // Explicit preview-only outbound AWS submission. Existing owner authentication
  // and selected EGS checks remain in the command service. Never enable live.
  if(awsDispatch)submit=createStagingDispatchRequest({db});
  if(configured){
    const {preparation:p,submission:s,enrollment:e}=simulationAdapters;
    const [{createCommercialFiscalPreparation},{getFiscalQaOnboardingRuntime}]=await Promise.all([import('./commercial-preparation.js'),import('./onboarding-runtime.js')]);
    // Explicit fields only: adapters cannot replace the command ledger/db.
    prepare=createCommercialFiscalPreparation({db,ledger,canonicalize:p.canonicalize,validateOfficial:createSdk4LocalValidator({...p.sdk,canonicalize:p.canonicalize}),resolveProtectedSession:p.resolveProtectedSession,policy:p.policy});
    const verifiers={resolveCredential:s.resolveCredential,verifyPrepared:s.verifyPrepared,verifyAuthorityResult:s.verifyAuthorityResult};
    submit=createFiscalSimulationWorker({ledger,...verifiers});
    reconcile=createFiscalReconciler({ledger,...verifiers});
    const onboarding=await getFiscalQaOnboardingRuntime({enrollmentVerifiers:{resolveProtectedSession:e.resolveProtectedSession,verifyCredential:e.verifyCredential,buildComplianceInvoice:e.buildComplianceInvoice,verifyComplianceResult:e.verifyComplianceResult}});
    if(!onboarding.enrollment)throw Error('FISCAL_VERIFICATION_UNAVAILABLE');
    enrollment=onboarding.enrollment;
  }
  return {periodService,verifyIdentity:async token=>fiscalQaIdentity(await auth.verifyIdToken(token,true),project),execute:createFiscalCommandService({db,approve:createCommercialIssueApproval({db}),reviewDocument:createCommercialReview({db}),responseStatus:createFiscalResponseStatus(db),output,accounting,recover,reconcile,submit,prepare,enrollment}),...(privateAdapters?.pdf?{archiveVerifiedPdf:output.archivePdf}:{}),...(accounting.provisionSupplierSettlement?{provisionSupplierSettlement:accounting.provisionSupplierSettlement}:{}),...(accounting.provisionStockGlReview?{provisionStockGlReview:accounting.provisionStockGlReview}:{})};
}
