import {createFiscalStatusService} from './status-service.js';
import {prepareFiscalQaPreviewCredential,requireFiscalQaPreviewFederation} from './vercel-qa-federation.js';

// QA must have its own Firebase project, token audience and service account.
// Production cannot activate this endpoint, even if a flag is set by mistake.
export function fiscalQaProject(env){
  const project=env.LOUREX_FISCAL_QA_PROJECT_ID;
  if(env.VERCEL_ENV!=='preview'||env.LOUREX_FISCAL_STATUS_ENABLED!=='true'||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||typeof project!=='string'||project==='lourex-invoice'||!(/^[a-z][a-z0-9-]{0,18}-fiscal-qa$/.test(project)))throw Error('FISCAL_STATUS_UNAVAILABLE');
  return project;
}
export function fiscalQaIdentity(decoded,project){
  if(!decoded||decoded.aud!==project||decoded.iss!==('https://securetoken.google.com/'+project)||typeof decoded.uid!=='string'||decoded.sub!==decoded.uid||!decoded.firebase?.sign_in_provider||decoded.firebase.sign_in_provider==='anonymous'||(decoded.lourexAiRole!==undefined&&decoded.lourexAiRole!=='owner')||(decoded.lourexWorkspaceUid!==undefined&&decoded.lourexWorkspaceUid!==decoded.uid))throw Error('FISCAL_AUTH_INVALID');
  return {uid:decoded.uid,role:'owner'};
}
export async function getFiscalQaRuntime(request){
  const project=fiscalQaProject(process.env);
  requireFiscalQaPreviewFederation(process.env);
  prepareFiscalQaPreviewCredential(request);
  const [{initializeApp,getApps,applicationDefault},{getFirestore},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth')]);
  const name='lourex-fiscal-qa-status';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!==project)throw Error('FISCAL_STATUS_UNAVAILABLE');
  if(!app)app=initializeApp({projectId:project,credential:applicationDefault()},name);
  const auth=getAuth(app);
  return {verifyIdentity:async token=>fiscalQaIdentity(await auth.verifyIdToken(token,true),project),status:createFiscalStatusService(getFirestore(app))};
}
