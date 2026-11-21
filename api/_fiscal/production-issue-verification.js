import {createHash,X509Certificate} from 'node:crypto';
import {productionBase,assertProductionSale} from './issuance-boundary.js';
import {readApprovedIntent} from './issue-intent.js';
import {readStoredSdkProof} from './sdk4-validation-evidence.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {hashArtifact,hashCanonicalInvoice} from './fiscal-artifacts.js';
import {verifySdk4SimplifiedStamp,sdk4StampSigningTime} from './sdk4-xades-candidate.js';
import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
import {createOfflineProductionClearanceVerifier} from './standard-clearance-crypto.js';

const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const keys=['environment','accountUid','workspaceId','egsId'];
const immutable=[...keys,'documentId','uuid','icv','previousInvoiceHash','invoiceHash','artifactDigest','snapshotDigest','generatedAt','mode','sdkValidationDigest','version','attemptId','status'];
const equal=(a,b,fields)=>a&&b&&fields.every(k=>a[k]===b[k]);
const data=s=>s.exists?s.data():null;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=ok=>{if(!ok)throw Error('PRODUCTION_ARTIFACT_NOT_VERIFIED');};
function checkScope(scope,record){need(scope.environment==='production'&&equal(scope,record,keys)&&ID.test(record.documentId)&&UUID.test(record.uuid)&&['submitting','uncertain'].includes(record.status)&&ID.test(record.attemptId)&&Number.isSafeInteger(record.version)&&record.version>=2);}
export function createProductionPreparedVerifier({db,authority,manifestSha256,canonicalize,policy}){
 need(typeof db?.runTransaction==='function'&&typeof authority?.readUnit==='function'&&HEX.test(manifestSha256??'')&&typeof canonicalize==='function'&&policy);
 return async({scope,record,xml,snapshot,credential})=>{
  try{
   checkScope(scope,record);
   need(hashArtifact(xml)===record.artifactDigest&&hashArtifact(snapshot)===record.snapshotDigest&&equal(scope,credential,keys)&&credential.kind==='production');
   const base=productionBase(scope),path=base+'/issues/'+record.documentId;
   const {unit,intent}=await db.runTransaction(async tx=>{
    const unit=await authority.readUnit(tx,scope),saved=data(await tx.get(db.doc(path)));
    need(unit.state==='active'&&equal(saved,record,immutable));
    const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+record.documentId)),scope,record.documentId);
    need(intent.digest===record.snapshotDigest&&intent.bytes.equals(snapshot)&&intent.payload.generatedAt===record.generatedAt);
    assertProductionSale(scope,intent.payload.document,intent.payload.review,unit);
    const proof=await readStoredSdkProof(db,tx,path,saved,manifestSha256);
    need(proof?.kind===(record.mode==='clearance'?'standard-invoice':'simplified-invoice'));
    return {unit,intent};
   });
   const leaf=new X509Certificate(Buffer.from(credential.binarySecurityToken,'base64'));
   need(sha(leaf.raw)===unit.certificateDigest&&sha(leaf.publicKey.export({type:'spki',format:'der'}))===unit.binding.publicKeyDigest);
   const p=intent.payload,identity={documentId:record.documentId,uuid:record.uuid,icv:record.icv,previousInvoiceHash:record.previousInvoiceHash,generatedAt:record.generatedAt};
   const mapped=mapCommercialFiscalInvoice({scope,document:p.document,issuer:p.issuer,review:p.review,identity});
   const unsigned=Buffer.from(mapped.candidate.bytes);
   need(mapped.mode===record.mode&&hashCanonicalInvoice(canonicalize(Buffer.from(unsigned),'invoice'))===record.invoiceHash&&hashCanonicalInvoice(canonicalize(Buffer.from(xml),'invoice'))===record.invoiceHash);
   if(record.mode==='clearance')return xml.equals(unsigned);
   const at=sdk4StampSigningTime(xml),ms=Date.parse(at);
   need(ms>=Date.parse(leaf.validFrom)&&ms<=Date.parse(leaf.validTo));
   return verifySdk4SimplifiedStamp({unsigned,bytes:xml,leafDer:leaf.raw,at,policy,canonicalize});
  }catch{return false;}
 };
}
// Reporting returns an unsigned authority response. Authenticate its provenance
// via the private one-time dispatch claim and exact durable transport receipt.
// Do not invent a receipt signature. Clearance additionally verifies the stamp.
export function createProductionAuthorityResultVerifier({db,authority,ledger,clearance}){
 need(typeof db?.runTransaction==='function'&&typeof authority?.readUnit==='function'&&typeof ledger?.readResponse==='function');
 const verifyClearance=createOfflineProductionClearanceVerifier(clearance);
 return async({scope,record,result,xml})=>{
  try{
   checkScope(scope,record);
   need(hashArtifact(xml)===record.artifactDigest);
   const version=record.status==='uncertain'?record.version-1:record.version;
   const saved=await ledger.readResponse(scope,record.documentId,version,record.attemptId);
   need(equal(saved.record,record,immutable)&&saved.receipt&&Buffer.isBuffer(saved.bytes)&&Buffer.isBuffer(result.evidenceBytes)&&saved.bytes.equals(result.evidenceBytes)&&saved.receipt.digest===result.evidenceDigest&&saved.receipt.httpStatus===result.httpStatus);
   const base=productionBase(scope),slot='submit-'+record.uuid;
   await db.runTransaction(async tx=>{
    const unit=await authority.readUnit(tx,scope),a=data(await tx.get(db.doc(base+'/egs/'+scope.egsId+'/authorityAttempts/'+slot))),global=data(await tx.get(db.doc(base+'/submissionClaims/'+record.uuid)));
    need(unit.state==='active'&&equal(a,scope,keys)&&equal(global,scope,keys)&&a.slot===slot&&global.slot===slot&&HEX.test(a.claimDigest??'')&&global.claimDigest===a.claimDigest&&['dispatched','completed'].includes(a.state)&&equal(a.claim?.scope,scope,keys)&&a.claim.operation==='submit'&&equal(a.claim,record,['mode','uuid','invoiceHash','artifactDigest'])&&Number.isSafeInteger(a.claim.credentialRequestId)&&a.claim.credentialRequestId>0&&Date.parse(a.dispatchedAt)<=Date.parse(saved.receipt.receivedAt));
    if(a.state==='completed')need(a.evidence?.digest===saved.receipt.digest&&a.evidence?.outcome==='verified-pass');
   });
   const actual=classifyStoredSubmissionResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
   need(actual.status===(record.mode==='clearance'?'clearance-response':'reporting-response')&&actual.status===result.status&&actual.evidenceDigest===result.evidenceDigest&&actual.warnings===result.warnings);
   if(record.mode==='reporting')return true;
   need(Buffer.isBuffer(result.clearedBytes)&&Buffer.isBuffer(actual.clearedBytes)&&actual.clearedBytes.equals(result.clearedBytes));
   return await verifyClearance({scope,record,result:actual,xml})===true;
  }catch{return false;}
 };
}
