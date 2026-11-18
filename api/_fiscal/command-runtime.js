import {fiscalQaProject,fiscalQaIdentity} from './status-runtime.js';
import {createFiscalCommandService} from './command-service.js';
import {createFiscalResponseStatus} from './response-status.js';
import {createFiscalLedger} from './ledger.js';
import {createFiscalSimulationWorker} from './simulation-worker.js';
import {createFiscalReconciler} from './reconciliation.js';
import {createFiscalOutputService} from './fiscal-output.js';
export function fiscalCommandConfig(env){
  const project=fiscalQaProject(env);
  if(env.LOUREX_FISCAL_COMMANDS_ENABLED!=='true')throw Error('FISCAL_COMMAND_UNAVAILABLE');
  let account,reader;try{account=JSON.parse(env.LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON||'');reader=JSON.parse(env.LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON||'');}catch{throw Error('FISCAL_COMMAND_UNAVAILABLE');}
  if(account?.project_id!==project||reader?.project_id!==project||typeof account.client_email!=='string'||!account.client_email.endsWith('@'+project+'.iam.gserviceaccount.com')||typeof reader.client_email!=='string'||account.client_email===reader.client_email||typeof account.private_key!=='string'||!account.private_key)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  return {project,account};
}
export async function getFiscalQaCommandRuntime({submissionVerifiers}={}){
  const {project,account}=fiscalCommandConfig(process.env);
  const [{initializeApp,getApps,cert},{getFirestore},{getAuth},{createCommercialIssueApproval},{createCommercialReview}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth'),import('./commercial-approval.js'),import('./commercial-review.js')]);
  const name='lourex-fiscal-qa-command';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!==project)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  if(!app)app=initializeApp({projectId:project,credential:cert(account)},name);
  const db=getFirestore(app),auth=getAuth(app);
  const ledger=createFiscalLedger(db);
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
  const submit=submissionVerifiers?createFiscalSimulationWorker({ledger,...submissionVerifiers}):undefined;
  const reconcile=submissionVerifiers?createFiscalReconciler({ledger,resolveCredential:submissionVerifiers.resolveCredential,verifyPrepared:submissionVerifiers.verifyPrepared,verifyAuthorityResult:submissionVerifiers.verifyAuthorityResult}):undefined;
  return {verifyIdentity:async token=>fiscalQaIdentity(await auth.verifyIdToken(token,true),project),execute:createFiscalCommandService({db,approve:createCommercialIssueApproval({db}),reviewDocument:createCommercialReview({db}),responseStatus:createFiscalResponseStatus(db),output:createFiscalOutputService({db}),recover,reconcile,submit})};
}
