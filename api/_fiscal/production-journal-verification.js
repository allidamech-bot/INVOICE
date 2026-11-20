import {createHash,X509Certificate} from 'node:crypto';
import {verifyManagedProductionCsr} from './managed-csr.js';
import {normalizeSdk4Proof} from './sdk4-local-validator.js';
import {hashCanonicalInvoice,hashArtifact} from './fiscal-artifacts.js';
import {verifiedComplianceReceipt} from './production-compliance-input.js';
import {createAttemptResponseStore} from './attempt-response.js';
import {createProductionPreparedVerifier,createProductionAuthorityResultVerifier} from './production-issue-verification.js';
import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const keys=['environment','accountUid','workspaceId','egsId'];
const scope=v=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const equal=(a,b,fields=keys)=>a&&b&&fields.every(k=>a[k]===b[k]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=ok=>{if(!ok)throw Error('PRODUCTION_JOURNAL_NOT_VERIFIED');};
function artifact(row,digest){need(row?.sha256===digest&&typeof row.bytes==='string'&&row.bytes.length<=Math.ceil(512*1024/3)*4);const b=Buffer.from(row.bytes,'base64');need(b.toString('base64')===row.bytes&&hashArtifact(b)===digest);return b;}
export function createProductionJournalVerification({db,getAuthority,getVault,verifyCertificate,manifestSha256,canonicalize,policy,clearance}){
 need(typeof db?.runTransaction==='function'&&typeof getAuthority==='function'&&typeof getVault==='function'&&typeof verifyCertificate==='function'&&HEX.test(manifestSha256??'')&&typeof canonicalize==='function'&&policy);
 const base=s=>'fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId;
 const root=s=>base(s)+'/egs/'+s.egsId;
 async function get(tx,path){const snap=await tx.get(db.doc(path));return snap.exists?snap.data():null;}
 async function credential(s,u,current,kind){const ref=kind==='compliance'?current?.credentialRef:current?.operationalCredentialRef??u.operationalCredentialRef;need(typeof ref==='string'&&ID.test(ref));const c=await getVault().load(s,ref,kind);need(equal(c,s)&&c.kind===kind&&Number.isSafeInteger(c.requestId)&&c.requestId>0);const verified=await verifyCertificate(s,u,c);need(HEX.test(verified?.digest??''));return {c,digest:verified.digest};}
 async function issue(s,claim){
  return db.runTransaction(async tx=>{
   const u=await getAuthority().readUnit(tx,s),index=await get(tx,'fiscalProductionV1/'+s.accountUid+'/uuidIndex/'+claim.uuid);
   need(u.state==='active'&&index?.workspaceId===s.workspaceId&&index.egsId===s.egsId&&typeof index.documentId==='string'&&ID.test(index.documentId));
   const path=base(s)+'/issues/'+index.documentId,record=await get(tx,path);
   need(equal(record,s)&&record.documentId===index.documentId&&equal(record,claim,['uuid','mode','invoiceHash','artifactDigest'])&&['submitting','uncertain'].includes(record.status));
   return {u,record,xml:artifact(await get(tx,path+'/artifacts/prepared'),record.artifactDigest),snapshot:artifact(await get(tx,path+'/artifacts/snapshot'),record.snapshotDigest)};
  });
 }
 async function commercialProof(s,claim){
  const v=await issue(s,claim),{c,digest}=await credential(s,v.u,null,'production');
  need(c.requestId===claim.credentialRequestId&&digest===v.u.certificateDigest);
  const verify=createProductionPreparedVerifier({db,authority:getAuthority(),manifestSha256,canonicalize,policy});
  need(await verify({scope:s,record:v.record,xml:v.xml,snapshot:v.snapshot,credential:c})===true);
  return v;
 }
 async function enrollment(s){
  return db.runTransaction(async tx=>({u:await getAuthority().readUnit(tx,s),current:await get(tx,root(s)+'/onboarding/current')}));
 }
 function csr(s,u,claim){need(typeof u.csr==='string'&&u.csr.length<=45000&&sha(Buffer.from(u.csr,'base64'))===claim.csrDigest&&u.csrDigest===claim.csrDigest&&verifyManagedProductionCsr({scope:s,issuer:u.issuer,unit:u.unit,binding:u.binding,csr:Buffer.from(u.csr,'base64'),publicKey:u.publicKey}));}
 async function candidate(s,claim,slot,version){
  const type=slot.slice(6),a=await db.runTransaction(tx=>get(tx,root(s)+'/complianceCandidates/'+type));
  need(equal(a,s)&&a.type===type&&a.onboardingVersion===version&&equal(a,claim,['mode','uuid','invoiceHash','artifactDigest','credentialRequestId'])&&typeof a.invoice==='string'&&a.invoice.length<=Math.ceil(512*1024/3)*4);
  const xml=Buffer.from(a.invoice,'base64');need(xml.toString('base64')===a.invoice&&hashArtifact(xml)===claim.artifactDigest&&hashCanonicalInvoice(canonicalize(Buffer.from(xml),'invoice'))===claim.invoiceHash);
  const proof=normalizeSdk4Proof(a.sdkProof,claim);need(proof.kind===type&&proof.installationManifestSha256===manifestSha256);
  return {a,xml,type};
 }
 return Object.freeze({
  async verifyOperation({unit,slot,claim}){
   try{
    const s=scope(claim.scope);need(s.environment==='production'&&equal(unit,s));
    if(claim.operation==='submit'){need(slot==='submit-'+claim.uuid&&clearance);await commercialProof(s,claim);return true;}
    const {u,current}=await enrollment(s);need(u.state==='enrolling'&&u.registrationDigest===unit.registrationDigest);
    if(claim.operation==='compliance-csid'){need(slot===claim.operation&&!current);csr(s,u,claim);return true;}
    need(equal(current?.binding,s));
    const {c}=await credential(s,u,current,'compliance');
    need(c.requestId===claim.credentialRequestId&&sha(c.binarySecurityToken)===current.binding.certificateDigest);
    if(claim.operation==='compliance-check'){need(current.state==='checking'&&slot.startsWith('check-'));await candidate(s,claim,slot,current.version);return true;}
    return claim.operation==='operational-csid'&&slot===claim.operation&&current.state==='checks-complete'&&current.version===claim.onboardingVersion;
   }catch{return false;}
  },
  async verifyResult({attempt,evidence}){
   try{
    const s=scope(attempt),claim=attempt.claim,slot=attempt.slot;
    need(s.environment==='production'&&equal(claim?.scope,s)&&attempt.state==='dispatched'&&evidence.outcome==='verified-pass'&&HEX.test(evidence.digest??''));
    if(claim.operation==='submit'){
     need(slot==='submit-'+claim.uuid&&clearance);
     const {record,xml}=await commercialProof(s,claim);
     const ledger=createAttemptResponseStore(db,{productionAuthority:getAuthority(),sdkInstallationManifestSha256:manifestSha256});
     const saved=await ledger.readResponse(s,record.documentId,record.status==='uncertain'?record.version-1:record.version,record.attemptId);
     need(saved.receipt?.digest===evidence.digest&&Buffer.isBuffer(saved.bytes));
     const result=classifyStoredSubmissionResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
     return await createProductionAuthorityResultVerifier({db,authority:getAuthority(),ledger,clearance})({scope:s,record,result,xml})===true;
    }
    const {u,current}=await enrollment(s);need(u.state==='enrolling'&&equal(current?.binding,s));
    if(claim.operation==='compliance-csid'){
     csr(s,u,claim);need(slot===claim.operation&&current.csrDigest===claim.csrDigest&&current.version===1&&current.state==='checking');
     const {c,digest}=await credential(s,u,current,'compliance');
     return digest===evidence.digest&&c.requestId===current.binding.requestId&&sha(c.binarySecurityToken)===current.binding.certificateDigest;
    }
    if(claim.operation==='operational-csid'){
     need(slot===claim.operation&&current.state==='operational-recorded'&&current.version===claim.onboardingVersion+2&&current.binding.requestId===claim.credentialRequestId);
     const {c,digest}=await credential(s,u,current,'production');
     return digest===evidence.digest&&c.requestId===current.operationalRequestId&&sha(c.binarySecurityToken)===current.operationalCertificateDigest;
    }
    need(claim.operation==='compliance-check'&&slot.startsWith('check-'));
    const type=slot.slice(6),index=current.checks.findIndex(x=>x.type===type),check=current.checks[index];
    need(index>=0&&check.outcome==='verified-pass'&&check.artifactDigest===claim.artifactDigest&&check.responseDigest===evidence.digest);
    const {xml}=await candidate(s,claim,slot,index+1);
    const event=root(s)+'/onboarding/current/events/'+String(index+2);
    const saved=await db.runTransaction(async tx=>({event:await get(tx,event),xml:artifact(await get(tx,event+'/artifacts/invoice'),claim.artifactDigest),response:artifact(await get(tx,event+'/artifacts/response'),evidence.digest)}));
    need(saved.event?.type===type&&saved.event.version===index+2&&saved.event.outcome==='verified-pass'&&saved.event.artifactDigest===claim.artifactDigest&&saved.event.responseDigest===evidence.digest&&saved.xml.equals(xml));
    return verifiedComplianceReceipt({mode:claim.mode,httpStatus:saved.event.httpStatus,bytes:saved.response,evidenceDigest:evidence.digest})==='verified-pass';
   }catch{return false;}
  }
 });
}
