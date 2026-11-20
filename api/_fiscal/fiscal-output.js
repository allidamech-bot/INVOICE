import {hashArtifact} from './fiscal-artifacts.js';
import {readApprovedIntent} from './issue-intent.js';
import {issuanceBoundary} from './issuance-boundary.js';
import {hashAuthorityEvidence,readAuthorityEvidence,writeAuthorityEvidence} from './authority-evidence.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX=2*1024*1024; // bounded JSON response within hosted function limits
function need(ok,code='FISCAL_OUTPUT_UNAVAILABLE'){if(!ok)throw Error(code);}
const data=s=>s.exists?s.data():null;
const same=(row,s)=>row&&['accountUid','workspaceId','egsId','environment'].every(k=>row[k]===s[k]);
export function createFiscalOutputService({db,verifyPdf,...boundaryOptions}){
  const boundary=issuanceBoundary(db,boundaryOptions),accepted=createAcceptedFiscalReader(db,boundaryOptions);
  async function bind(tx,scope,documentId,revision){
    need(typeof documentId==='string'&&ID.test(documentId)&&Number.isSafeInteger(revision)&&revision>0);
    const base=boundary.base(scope);
    const {workspace}=await boundary.read(tx,scope);
    need(workspace.commandsEnabled===true);
    const issuePath=base+'/issues/'+documentId;
    const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+documentId)),scope,documentId);
    const r=data(await tx.get(db.doc(issuePath)));
    need(r&&r.accountUid===scope.accountUid&&r.workspaceId===scope.workspaceId&&r.egsId===scope.egsId&&r.documentId===documentId&&intent.payload.document.revision===revision&&r.snapshotDigest===intent.digest&&((r.mode==='clearance'&&r.status==='cleared')||(r.mode==='reporting'&&r.status==='reported')));
    const xmlDigest=r.mode==='clearance'?r.clearedArtifactDigest:r.artifactDigest;
    need(HEX.test(xmlDigest)&&HEX.test(r.resultDigest)&&Number.isSafeInteger(r.version)&&r.version>=3);
    const ref=db.doc(issuePath+'/artifacts/verifiedPdf'),pdf=data(await tx.get(ref));
    if(pdf)need(same(pdf,scope)&&pdf.documentId===documentId&&pdf.documentRevision===revision&&pdf.uuid===r.uuid&&pdf.issueVersion===r.version&&pdf.xmlDigest===xmlDigest&&pdf.resultDigest===r.resultDigest&&HEX.test(pdf.pdfDigest)&&HEX.test(pdf.validationDigest)&&pdf.state==='verified');
    return {r,ref,pdf,xmlDigest,intent};
  }
  async function read(scope,documentId,revision,format){
    need(['xml','pdf'].includes(format));
    // The reader checks the terminal event, exact accepted XML, evidence and UUID
    // index. Rebind it to the original commercial revision inside the second tx.
    const a=await accepted(scope,documentId);
    const v=await db.runTransaction(async tx=>{
      const b=await bind(tx,scope,documentId,revision);
      need(a.record.version===b.r.version&&a.record.uuid===b.r.uuid&&a.record.resultDigest===b.r.resultDigest&&a.snapshot.equals(b.intent.bytes)&&hashArtifact(a.xml)===b.xmlDigest);
      if(format==='xml')return {bytes:a.xml,digest:b.xmlDigest,uuid:b.r.uuid};
      need(b.pdf);
      const bytes=await readAuthorityEvidence(tx,db,db.doc(b.ref.path+'/data/pdf'),b.pdf.pdfDigest);
      need(bytes.length<=MAX&&bytes.subarray(0,5).toString()==='%PDF-');
      return {bytes,digest:b.pdf.pdfDigest,uuid:b.r.uuid};
    });
    return {environment:boundary.environment,documentId,documentRevision:revision,format,sha256:v.digest,filename:'LOUREX-'+v.uuid+'.'+format,bytes:v.bytes.toString('base64')};
  }
  async function availability(tx,scope,record,revision){
    if(!record||!['cleared','reported'].includes(record.status))return {xml:false,pdf:false};
    const b=await bind(tx,scope,record.documentId,revision);
    return {xml:true,pdf:!!b.pdf};
  }
  // Internal-only archive writer. A separately configured independent verifier
  // MUST verify actual PDF/A-3, embedded exact XML, printed QR, and any required
  // PDF signatures. No browser command can publish or select the verifier.
  async function archivePdf(scope,documentId,revision,bytes){
    need(typeof verifyPdf==='function'&&Buffer.isBuffer(bytes)&&bytes.length<=MAX&&bytes.subarray(0,5).toString()==='%PDF-');
    const a=await accepted(scope,documentId),copy=Buffer.from(bytes);
    const digest=hashAuthorityEvidence(copy),xmlDigest=hashArtifact(a.xml);
    const proof=await verifyPdf({scope:Object.freeze({...scope}),record:{...a.record},xml:Buffer.from(a.xml),pdf:Buffer.from(copy)});
    need(proof?.valid===true&&proof.pdfDigest===digest&&proof.xmlDigest===xmlDigest&&HEX.test(proof.validationDigest),'FISCAL_PDF_NOT_VERIFIED');
    return db.runTransaction(async tx=>{
      const b=await bind(tx,scope,documentId,revision);
      need(b.r.version===a.record.version&&b.r.resultDigest===a.record.resultDigest&&b.xmlDigest===xmlDigest&&a.snapshot.equals(b.intent.bytes));
      if(b.pdf){need(b.pdf.pdfDigest===digest,'FISCAL_PDF_IMMUTABLE');const old=await readAuthorityEvidence(tx,db,db.doc(b.ref.path+'/data/pdf'),digest);need(old.equals(copy));return {status:'verified',sha256:digest};}
      tx.create(b.ref,{...scope,documentId,documentRevision:revision,uuid:b.r.uuid,issueVersion:b.r.version,xmlDigest,resultDigest:b.r.resultDigest,pdfDigest:digest,validationDigest:proof.validationDigest,state:'verified'});
      writeAuthorityEvidence(tx,db,db.doc(b.ref.path+'/data/pdf'),copy,digest);
      return {status:'verified',sha256:digest};
    });
  }
  return Object.freeze({read,availability,archivePdf});
}
