import {fiscalQaProject,fiscalQaIdentity} from './status-runtime.js';
import {createFiscalCommandService} from './command-service.js';
export function fiscalCommandConfig(env){
  const project=fiscalQaProject(env);
  if(env.LOUREX_FISCAL_COMMANDS_ENABLED!=='true')throw Error('FISCAL_COMMAND_UNAVAILABLE');
  let account,reader;try{account=JSON.parse(env.LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON||'');reader=JSON.parse(env.LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON||'');}catch{throw Error('FISCAL_COMMAND_UNAVAILABLE');}
  if(account?.project_id!==project||reader?.project_id!==project||typeof account.client_email!=='string'||!account.client_email.endsWith('@'+project+'.iam.gserviceaccount.com')||typeof reader.client_email!=='string'||account.client_email===reader.client_email||typeof account.private_key!=='string'||!account.private_key)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  return {project,account};
}
export async function getFiscalQaCommandRuntime(){
  const {project,account}=fiscalCommandConfig(process.env);
  const [{initializeApp,getApps,cert},{getFirestore},{getAuth},{createCommercialIssueApproval},{createCommercialReview}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth'),import('./commercial-approval.js'),import('./commercial-review.js')]);
  const name='lourex-fiscal-qa-command';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!==project)throw Error('FISCAL_COMMAND_UNAVAILABLE');
  if(!app)app=initializeApp({projectId:project,credential:cert(account)},name);
  const db=getFirestore(app),auth=getAuth(app);
  // Actual preview configuration supports inspect and approval. Other operations
  // remain blocked until real independently verified adapters are composed.
  return {verifyIdentity:async token=>fiscalQaIdentity(await auth.verifyIdToken(token,true),project),execute:createFiscalCommandService({db,approve:createCommercialIssueApproval({db}),reviewDocument:createCommercialReview({db})})};
}
