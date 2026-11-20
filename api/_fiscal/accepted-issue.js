import {createHash} from 'node:crypto';
import {readStoredSdkProof} from './sdk4-validation-evidence.js';
import {readAuthorityEvidence} from './authority-evidence.js';
import {issuanceBoundary,fiscalNamespace} from './issuance-boundary.js';

// Server-only reader. The caller must authenticate and authorize the scope.
// No re-enrollment, state transition, or new authority request occurs here.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX=512*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
function need(ok){if(!ok)throw Error('ACCEPTED_FISCAL_ARTIFACT_NOT_VERIFIED');}
function data(row){need(row?.exists);return row.data();}
function artifact(row,digest){
  const a=data(row);need(typeof digest==='string'&&HEX.test(digest)&&a.sha256===digest&&typeof a.bytes==='string'&&a.bytes.length<=Math.ceil(MAX/3)*4);
  const b=Buffer.from(a.bytes,'base64');need(b.length>0&&b.length<=MAX&&b.toString('base64')===a.bytes&&sha(b)===digest);return b;
}
export function createAcceptedFiscalReader(db,options={}){
  const boundary=issuanceBoundary(db,options);
  need(db&&typeof db.doc==='function'&&typeof db.runTransaction==='function');
  return async function readAccepted(scope,documentId,transaction){
    need(scope?.environment===boundary.environment&&['accountUid','workspaceId','egsId'].every(k=>typeof scope[k]==='string'&&ID.test(scope[k]))&&typeof documentId==='string'&&ID.test(documentId));
    const {accountUid,workspaceId,egsId}=scope;
    const base=boundary.base(scope), path=base+'/issues/'+documentId;
    const get=(tx,p)=>tx.get(db.doc(p));
    const read=async tx=>{
      await boundary.read(tx,scope);
      const r=data(await get(tx,path));
      need((r.environment===scope.environment||(scope.environment==='simulation'&&r.environment===undefined))&&r.accountUid===accountUid&&r.workspaceId===workspaceId&&r.egsId===egsId&&r.documentId===documentId&&typeof r.uuid==='string'&&UUID.test(r.uuid)&&Number.isSafeInteger(r.version)&&r.version>=3&&typeof r.resultDigest==='string'&&HEX.test(r.resultDigest)&&typeof r.warnings==='boolean');
      const clearance=r.mode==='clearance'&&r.status==='cleared', reporting=r.mode==='reporting'&&r.status==='reported';need(clearance||reporting);
      const index=data(await get(tx,fiscalNamespace(scope)+'/'+accountUid+'/uuidIndex/'+r.uuid));need(index.workspaceId===workspaceId&&index.documentId===documentId&&index.egsId===egsId);
      const queue=data(await get(tx,base+'/outbox/'+documentId));need(queue.documentId===documentId&&queue.uuid===r.uuid&&queue.egsId===egsId&&queue.version===r.version&&queue.state==='closed');
      const eventPath=path+'/events/'+String(r.version),event=data(await get(tx,eventPath));
      need(event.version===r.version&&event.status===r.status&&event.kind===r.status&&event.resultDigest===r.resultDigest&&event.at===r.updatedAt&&typeof r.attemptId==='string'&&event.attemptId===r.attemptId&&event.unverifiedEvidenceDigest===undefined);
      const submitted=artifact(await get(tx,path+'/artifacts/prepared'),r.artifactDigest),snapshot=artifact(await get(tx,path+'/artifacts/snapshot'),r.snapshotDigest);
      await readStoredSdkProof(db,tx,path,r,boundary.environment==='production'?options.sdkInstallationManifestSha256:undefined);
      const result=await readAuthorityEvidence(tx,db,db.doc(eventPath+'/artifacts/result'),r.resultDigest);
      let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result));}catch{need(false);}
      const validation=body?.validationResults;need(validation&&['PASS','WARNING'].includes(validation.status)&&Array.isArray(validation.errorMessages)&&validation.errorMessages.length===0&&Array.isArray(validation.warningMessages)&&(validation.status==='WARNING'||validation.warningMessages.length>0)===r.warnings);
      let xml=submitted;
      if(clearance){xml=artifact(await get(tx,path+'/artifacts/cleared'),r.clearedArtifactDigest);need(body.clearanceStatus==='CLEARED'&&body.clearedInvoice===xml.toString('base64'));}
      else need(body.reportingStatus==='REPORTED'&&r.clearedArtifactDigest===null);
      return {record:{...r,environment:scope.environment},xml:Buffer.from(xml),submitted:Buffer.from(submitted),snapshot:Buffer.from(snapshot),evidence:Buffer.from(result)};
    };
    return transaction?read(transaction):db.runTransaction(read);
  };
}
