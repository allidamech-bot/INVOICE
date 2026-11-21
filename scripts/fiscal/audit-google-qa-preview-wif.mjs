// Read-only Google IAM/Firestore evidence for the isolated fiscal QA preview.
// No login, create/update policy, billing change, service start or ZATCA call.
// Local inspection is not a successful Vercel -> Google STS acceptance test.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const FISCAL_QA_WIF={
  identity:'lourex-invoice',identityNumber:'985119320046',
  qa:'lourex-fiscal-qa',qaNumber:'448656707310',
  pool:'lourex-vercel',provider:'vercel-qa',
  issuer:'https://oidc.vercel.com/alidaamishs-projects',
  audience:'https://vercel.com/alidaamishs-projects',
  subject:'owner:alidaamishs-projects:project:invoice:environment:preview',
  projectId:'prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ',
  email:'lourex-qa-vercel@lourex-fiscal-qa.iam.gserviceaccount.com'
};
const stop=()=>{throw Error('LOUREX_QA_PREVIEW_ATTESTATION_HOLD');};
const only=(value)=>typeof value==='string'&&value.length>0;
const norm=v=>typeof v==='string'?v.replace(/\s+/g,' ').trim():null;
const member='serviceAccount:'+FISCAL_QA_WIF.email;
const subject='principal://iam.googleapis.com/projects/'+FISCAL_QA_WIF.identityNumber+
  '/locations/global/workloadIdentityPools/'+FISCAL_QA_WIF.pool+
  '/subject/'+FISCAL_QA_WIF.subject;
const condition="assertion.sub == '"+FISCAL_QA_WIF.subject+
  "' && assertion.project_id == '"+FISCAL_QA_WIF.projectId+"'";
const bindings=p=>{
  if(!Array.isArray(p?.bindings)||p.bindings.length>500)stop();
  for(const b of p.bindings){
    if(!only(b?.role)||!Array.isArray(b.members)||b.members.length>1000||
      !b.members.every(only))stop();
  }
  return p.bindings;
};
const rolesFor=(policy,principal)=>bindings(policy)
  .filter(b=>b.members.includes(principal)).map(b=>b.role);
const equalSet=(actual,expected)=>actual.length===expected.length&&
  new Set(actual).size===expected.length&&expected.every(x=>actual.includes(x));

export function evaluateQaPreviewWifEvidence(e){
  if(!e||typeof e!=='object'||Array.isArray(e))stop();
  const p=e.previewProvider,c=e.qaServiceAccount,pb=e.previewServiceAccountIam,
    qa=e.qaProject,identity=e.identityProject,firestore=e.qaFirestore,
    billing=e.qaBilling,qaIam=e.qaProjectIam,identityIam=e.identityProjectIam;
  if(identity?.projectId!==FISCAL_QA_WIF.identity||
    String(identity.projectNumber)!==FISCAL_QA_WIF.identityNumber||
    identity.lifecycleState!=='ACTIVE'||qa?.projectId!==FISCAL_QA_WIF.qa||
    String(qa.projectNumber)!==FISCAL_QA_WIF.qaNumber||
    qa.lifecycleState!=='ACTIVE')stop();
  if(billing?.billingEnabled!==false||
    firestore?.name!=='projects/'+FISCAL_QA_WIF.qa+'/databases/(default)'||
    firestore?.state!=='READY'||firestore?.type!=='FIRESTORE_NATIVE')stop();
  if(p?.state!=='ACTIVE'||p.disabled===true||
    p.oidc?.issuerUri!==FISCAL_QA_WIF.issuer||
    !equalSet(p.oidc?.allowedAudiences??[],[FISCAL_QA_WIF.audience])||
    p.attributeMapping?.['google.subject']!=='assertion.sub'||
    norm(p.attributeCondition)!==norm(condition))stop();
  if(c?.email!==FISCAL_QA_WIF.email||c.disabled===true||
    !String(c.name||'').startsWith('projects/'+FISCAL_QA_WIF.qa+'/serviceAccounts/'))stop();
  // The only principal allowed to impersonate this QA service account in
  // this designated role must be the preview subject, never production.
  const impersonators=bindings(pb).filter(b=>b.role==='roles/iam.workloadIdentityUser');
  if(impersonators.length!==1||
    !equalSet(impersonators[0].members,[subject])||
    bindings(pb).some(b=>b.role==='roles/iam.serviceAccountTokenCreator'))stop();
  // QA principal has exactly its data-plane and Firebase Auth read roles on
  // QA. No direct role grants for it on the production project.
  if(!equalSet(rolesFor(qaIam,member),
    ['roles/datastore.user','roles/firebaseauth.viewer'])||
    rolesFor(identityIam,member).length!==0)stop();
  // These checks cannot prove inherited permissions, a real STS exchange,
  // runtime token verification, source fixtures or official ZATCA acceptance.
  return Object.freeze({
    decision:'CONFIG_VERIFIED_ONLY',
    qaProject:FISCAL_QA_WIF.qa,
    qaBillingDisabled:true,
    previewProviderScoped:true,
    directProductionProjectIamBindingAbsent:true,
    liveStsAcceptance:'UNVERIFIED',
    qaFirebaseAuthTokenAcceptance:'UNVERIFIED',
    officialSimulationAcceptance:'UNVERIFIED',
    fiscalDispatch:'DISABLED',
  });
}

function query(args){
  const r=spawnSync('gcloud',[...args,'--format=json'],{
    encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024,
    stdio:['ignore','pipe','pipe']
  });
  if(r.error||r.status!==0||typeof r.stdout!=='string'||
    r.stdout.length>2*1024*1024)stop();
  try{const obj=JSON.parse(r.stdout);if(!obj||Array.isArray(obj))stop();return obj;}
  catch{stop();}
}
export function collectQaPreviewWifEvidence(){
  const q=FISCAL_QA_WIF;
  return {
    identityProject:query(['projects','describe',q.identity]),
    qaProject:query(['projects','describe',q.qa]),
    qaBilling:query(['billing','projects','describe',q.qa]),
    qaFirestore:query(['firestore','databases','describe',
      '--project='+q.qa,'--database=(default)']),
    previewProvider:query(['iam','workload-identity-pools','providers','describe',
      q.provider,'--project='+q.identity,'--location=global',
      '--workload-identity-pool='+q.pool]),
    qaServiceAccount:query(['iam','service-accounts','describe',q.email,
      '--project='+q.qa]),
    previewServiceAccountIam:query(['iam','service-accounts','get-iam-policy',
      q.email,'--project='+q.qa]),
    qaProjectIam:query(['projects','get-iam-policy',q.qa]),
    identityProjectIam:query(['projects','get-iam-policy',q.identity]),
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    // Read-only operator observation; no secrets or service credentials in
    // the output. Any missing permission results in HOLD, not a bypass.
    if(process.argv.length!==2||process.env.VERCEL_ENV||
      process.env.LOUREX_FISCAL_LIVE_ENABLED==='true'||
      process.env.FIRESTORE_EMULATOR_HOST||
      process.env.FIREBASE_AUTH_EMULATOR_HOST)stop();
    const verdict=evaluateQaPreviewWifEvidence(collectQaPreviewWifEvidence());
    console.log('LOUREX QA PREVIEW WIF '+verdict.decision);
    console.log('LIVE STS/FIREBASE AUTH/SIMULATION: UNVERIFIED');
    console.log('NO IAM WRITES, NO BILLING CHANGES, NO FISCAL DISPATCH');
  }catch{
    console.error('LOUREX QA PREVIEW WIF: HOLD (READ-ONLY EVIDENCE INCOMPLETE)');
    process.exitCode=2;
  }
}
