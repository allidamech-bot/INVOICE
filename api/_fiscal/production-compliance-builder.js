import {createHash,randomUUID} from 'node:crypto';
import {productionBase} from './issuance-boundary.js';
import {requiredComplianceChecks} from './onboarding.js';
import {createProductionSdk4LocalValidator,normalizeSdk4Proof} from './sdk4-local-validator.js';
import {hashCanonicalInvoice,hashArtifact} from './fiscal-artifacts.js';
import {buildManagedSdk4SimplifiedStamp} from './sdk4-xades-candidate.js';
import {complianceSeller,makeComplianceInput} from './production-compliance-input.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const data=s=>s.exists?s.data():null;
const same=(a,b)=>a&&b&&['environment','accountUid','workspaceId','egsId'].every(k=>a[k]===b[k]);
const need=ok=>{if(!ok)throw Error('PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');};
export function createProductionComplianceBuilder({db,authority,loadWorkspace,resolveComplianceSession,sdk,canonicalize,policy,testBuyer,clock=()=>new Date().toISOString()}){
 const validate=createProductionSdk4LocalValidator({...sdk,canonicalize});
 need(typeof resolveComplianceSession==='function'&&typeof loadWorkspace==='function'&&typeof clock==='function'&&policy);
 return async({scope,type,profile,credential})=>{
  const root=productionBase(scope)+'/egs/'+scope.egsId;
  const loaded=await db.runTransaction(async tx=>{
   const u=await authority.readUnit(tx,scope),workspace=await loadWorkspace(tx,scope),p=data(await tx.get(db.doc(productionBase(scope)+'/profiles/current'))),current=data(await tx.get(db.doc(root+'/onboarding/current')));
   need(u.state==='enrolling'&&u.registrationDigest===profile.registrationDigest&&same(current?.binding,scope)&&same(credential,scope)&&credential.kind==='compliance'&&current.binding.requestId===credential.requestId&&current.binding.certificateDigest===sha(credential.binarySecurityToken)&&current.state==='checking');
   const required=requiredComplianceChecks(u.unit.functionalityMap);
   need(required[current.checks.length]===type&&current.checks.every(x=>x.outcome==='verified-pass'));
   const prior=[];
   for(const check of current.checks){
    const a=data(await tx.get(db.doc(root+'/complianceCandidates/'+check.type)));
    need(same(a,scope)&&a.type===check.type&&a.artifactDigest===check.artifactDigest&&a.credentialRequestId===credential.requestId);
    prior.push(a);
   }
   return {seller:complianceSeller(workspace.company,p,u),required,prior,version:current.version};
  });
  const invoice=makeComplianceInput({type,seller:loaded.seller,testBuyer,prior:loaded.prior,required:loaded.required,uuid:randomUUID(),at:clock()});
  const {buildFiscalCandidate}=await import('./ubl-draft.js');
  const mode=invoice.mode==='standard'?'clearance':'reporting';
  let bytes=Buffer.from(buildFiscalCandidate(invoice).bytes);
  const invoiceHash=hashCanonicalInvoice(canonicalize(Buffer.from(bytes),'invoice'));
  if(mode==='reporting'){
   const session=await resolveComplianceSession(scope,profile,credential);
   need(session.credentialKind==='compliance'&&same(session.scope,scope)&&session.issuerVat===invoice.seller.vatNumber);
   const signed=await buildManagedSdk4SimplifiedStamp({unsigned:bytes,session,policy,canonicalize});
   need(signed.invoiceHash===invoiceHash);bytes=Buffer.from(signed.bytes);
  }
  const sdkProof=normalizeSdk4Proof(await validate({scope,mode,invoice,bytes,invoiceHash}),{uuid:invoice.uuid,mode,artifactDigest:hashArtifact(bytes)});
  need(sdkProof.kind===type&&sdkProof.installationManifestSha256===sdk.manifestSha256);
  return {type,mode,uuid:invoice.uuid,icv:invoice.icv,number:invoice.number,issueDate:invoice.issueDate,invoiceHash,invoice:bytes.toString('base64'),sdkProof,onboardingVersion:loaded.version,verifiedByOfficialSdk:true};
 };
}
