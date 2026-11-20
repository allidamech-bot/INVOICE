import {createProductionFiscalProfileService} from './production-profile.js';
import {createProductionEnrollmentCommand} from './production-enrollment-command.js';
import {createProductionIssuanceCommand} from './production-issuance-command.js';
const unavailable=()=>{throw Error('FISCAL_PROFILE_UNAVAILABLE');};
const data=s=>s.exists?s.data():null;
export function productionProfileConfig(env){
  // No preview/emulator access to the production company directory.
  if(env.VERCEL_ENV!=='production'||env.LOUREX_FISCAL_PROFILE_ENABLED!=='true'||env.LOUREX_PERIOD_SERVER_ENABLED!=='true'||env.LOUREX_PERIOD_RULES_VERSION!=='1'||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)unavailable();
  let account;try{account=JSON.parse(env.LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON||'');}catch{unavailable();}
  if(account?.project_id!=='lourex-invoice'||typeof account.client_email!=='string'||!account.client_email.endsWith('@lourex-invoice.iam.gserviceaccount.com')||typeof account.private_key!=='string'||!account.private_key)unavailable();
  return account;
}
export function productionProfileIdentity(decoded){
  if(!decoded||decoded.aud!=='lourex-invoice'||decoded.iss!=='https://securetoken.google.com/lourex-invoice'||typeof decoded.uid!=='string'||decoded.sub!==decoded.uid||!decoded.firebase?.sign_in_provider||decoded.firebase.sign_in_provider==='anonymous'||(decoded.lourexAiRole!==undefined&&decoded.lourexAiRole!=='owner')||(decoded.lourexWorkspaceUid!==undefined&&decoded.lourexWorkspaceUid!==decoded.uid))throw Error('FISCAL_PROFILE_FORBIDDEN');
  return {uid:decoded.uid,role:'owner'};
}
export function publishedWorkspaceLoader(db,{validateMeta,decodeWorkspace},{includeDocuments=false}={}){
  return async(tx,{accountUid,workspaceId})=>{
    const root='users/'+accountUid;
    const meta=data(await tx.get(db.doc(root+'/workspace/meta'))),control=data(await tx.get(db.doc(root+'/accounting/control')));
    // Never accept client-supplied legal identity in place of a published company.
    if(meta?.chunkStorage!=='period-generations-v1'||control?.format!=='LOUREX_PERIOD_CONTROL_V1'||control.version!==1||control.ownerUid!==accountUid||!Number.isSafeInteger(control.generation)||control.generation<1)throw Error('FISCAL_COMPANY_SYNC_REQUIRED');
    validateMeta(meta);
    if(meta.chunkCount>24)throw Error('FISCAL_COMPANY_SYNC_REQUIRED');
    const chunks=[];
    for(let i=0;i<meta.chunkCount;i++)chunks.push(data(await tx.get(db.doc(root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')))));
    const payload=decodeWorkspace(meta,chunks),workspaces=payload.workspaces.filter(w=>w.id===workspaceId);
    if(workspaces.length!==1)throw Error('FISCAL_PROFILE_FORBIDDEN');
    return {company:workspaces[0].company,branches:payload.branches.filter(b=>b.workspaceId===workspaceId&&b.active===true),...(includeDocuments?{documents:payload.documents.filter(d=>d.workspaceId===workspaceId),sourceRevision:meta.revision,sourceSha256:meta.sha256,periodGeneration:control.generation}:{})};
  };
}
export function publishedCompanyLoader(db,format){const load=publishedWorkspaceLoader(db,format);return async(tx,scope)=>(await load(tx,scope)).company;}
export async function getProductionFiscalProfileRuntime({trustedEnrollmentAdapters,trustedIssuanceAdapters}={}){
  const account=productionProfileConfig(process.env);
  const [{initializeApp,getApps,cert},{getFirestore},{getAuth},format]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore'),import('firebase-admin/auth'),import('../_accounting/period-format.js')]);
  const name='lourex-production-fiscal-profile';let app=getApps().find(a=>a.name===name);
  if(app&&app.options.projectId!=='lourex-invoice')unavailable();
  if(!app)app=initializeApp({projectId:'lourex-invoice',credential:cert(account)},name);
  const db=getFirestore(app),auth=getAuth(app);
  const loadWorkspace=publishedWorkspaceLoader(db,format);
  // No default synthetic verifier, and no environment flag alone authorizes
  // taxpayer onboarding. Hosting must explicitly supply reviewed adapters.
  let enrollment,issuance,authority;
  if(trustedEnrollmentAdapters&&process.env.LOUREX_FISCAL_LIVE_ENABLED==='true'){
    const {createProductionEnrollmentRuntime,createProductionFiscalRuntime}=await import('./production-enrollment-runtime.js');
    if(trustedIssuanceAdapters){({enrollment,issuance,authority}=await createProductionFiscalRuntime({db,loadWorkspace,enrollmentAdapters:trustedEnrollmentAdapters,issuanceAdapters:trustedIssuanceAdapters}));}
    else enrollment=createProductionEnrollmentRuntime({...trustedEnrollmentAdapters,db,loadWorkspace}).enrollment;
  }
  return {verifyIdentity:async token=>productionProfileIdentity(await auth.verifyIdToken(token,true)),execute:createProductionFiscalProfileService({db,loadCompany:publishedCompanyLoader(db,format)}),executeEnrollment:createProductionEnrollmentCommand({db,loadWorkspace,enrollment}),executeIssuance:createProductionIssuanceCommand({db,loadWorkspace:publishedWorkspaceLoader(db,format,{includeDocuments:true}),issuance,authority})};
}
