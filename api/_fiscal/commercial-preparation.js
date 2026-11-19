import {randomUUID} from 'node:crypto';
import {simulationBase,readSimulationContext} from './simulation-scope.js';
import {hashArtifact,hashCanonicalInvoice} from './fiscal-artifacts.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {buildManagedSdk4SimplifiedStamp} from './sdk4-xades-candidate.js';

// Server-only preparation command. Source is an immutable, separately approved
// private intent, never a request's monetary fields or a client-selected route.
// The SDK adapter is mandatory; without it no issue is queued.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
import {readApprovedIntent} from './issue-intent.js';
import {assertCurrentApprovedSource} from './commercial-source.js';
function need(ok,code='FISCAL_PREPARATION_NOT_ELIGIBLE'){if(!ok)throw Error(code);}
export function createCommercialFiscalPreparation({db,ledger,canonicalize,validateOfficial,resolveProtectedSession,policy,clock=()=>new Date().toISOString(),uuid=randomUUID}){
  need(db?.runTransaction&&db?.doc&&typeof ledger?.prepare==='function'&&typeof canonicalize==='function'&&typeof validateOfficial==='function'&&typeof clock==='function'&&typeof uuid==='function','FISCAL_PREPARATION_NOT_CONFIGURED');
  return async function prepare(scope,documentId){
    need(typeof documentId==='string'&&ID.test(documentId));
    scope=Object.freeze({...scope});
    const base=simulationBase(scope);
    const loaded=await db.runTransaction(async tx=>{
      const {unit}=await readSimulationContext(db,tx,scope,{active:true});
      const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+documentId)),scope,documentId);
      const issue=await tx.get(db.doc(base+'/issues/'+documentId));
      if(issue.exists){
        const v=issue.data();
        need(v.accountUid===scope.accountUid&&v.workspaceId===scope.workspaceId&&v.egsId===scope.egsId&&v.documentId===documentId&&v.snapshotDigest===intent.digest,'FISCAL_EXISTING_ISSUE_CONFLICT');
        return {existing:v};
      }
      await assertCurrentApprovedSource(db,tx,scope,documentId,intent.payload);
      return {unit,intent};
    });
    const project=v=>({documentId:v.documentId,status:v.status,version:v.version});
    if(loaded.existing)return project(loaded.existing);
    const {unit,intent}=loaded, p=intent.payload;
    const generatedAt=p.generatedAt;
    need(Number.isFinite(Date.parse(generatedAt))&&new Date(generatedAt).toISOString()===generatedAt&&Date.parse(generatedAt)<=Date.parse(clock()),'FISCAL_ISSUE_TIME_INVALID');
    const identity={documentId,uuid:uuid(),icv:unit.nextIcv,previousInvoiceHash:unit.previousInvoiceHash,generatedAt};
    const mapped=mapCommercialFiscalInvoice({scope,document:p.document,issuer:p.issuer,review:p.review,identity});
    const canonical=canonicalize(Buffer.from(mapped.candidate.bytes),'invoice');
    const invoiceHash=hashCanonicalInvoice(canonical);
    let bytes=Buffer.from(mapped.candidate.bytes);
    if(mapped.mode==='reporting'){
      need(typeof resolveProtectedSession==='function'&&policy,'FISCAL_SIGNING_NOT_CONFIGURED');
      const session=await resolveProtectedSession(scope,structuredClone(p.issuer));
      need(session?.scope&&['accountUid','workspaceId','egsId','environment'].every(k=>session.scope[k]===scope[k])&&session.issuerVat===p.issuer.vatNumber,'FISCAL_SIGNING_SCOPE_MISMATCH');
      const signed=await buildManagedSdk4SimplifiedStamp({unsigned:bytes,session,policy,canonicalize});
      need(signed.invoiceHash===invoiceHash,'FISCAL_SIGNED_HASH_MISMATCH');
      bytes=Buffer.from(signed.bytes);
    }
    need(await validateOfficial({scope,mode:mapped.mode,invoice:structuredClone(mapped.invoice),context:structuredClone(mapped.context),bytes:Buffer.from(bytes),invoiceHash})===true,'FISCAL_OFFICIAL_VALIDATION_REQUIRED');
    const result=await ledger.prepare(scope,{...scope,...identity,mode:mapped.mode,invoiceHash,artifactDigest:hashArtifact(bytes),snapshotDigest:intent.digest},bytes,intent.bytes,{approvedIntent:true});
    return project(result);
  };
}
