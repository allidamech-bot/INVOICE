import {createHash} from 'node:crypto';
import {prepareFiscalIssue,transitionFiscalIssue,FIRST_PREVIOUS_INVOICE_HASH} from '../../dist/src/lib/fiscal-issuance.js';

// Internal Admin SDK service only. No browser endpoint or production activation.
// All inputs come from authorized server preparation/verified authority adapters.
const NS='fiscalPrivateV1';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_BYTES=512*1024;
function id(value){if(typeof value!=='string'||!ID.test(value))throw new Error('Invalid fiscal scope.');return value;}
function scope(s){return NS+'/'+id(s.accountUid)+'/workspaces/'+id(s.workspaceId);}
function artifact(bytes,digest){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES||createHash('sha256').update(bytes).digest('hex')!==digest)
    throw new Error('Invalid or oversized fiscal artifact.');
  return {sha256:digest,bytes:bytes.toString('base64')};
}
function immutableMatch(record,prepared){
  return Object.keys(prepared).filter(k=>!['status','version','updatedAt','reportingDeadline','attemptId','attemptCount','usedAttemptIds','resultDigest','clearedArtifactDigest','warnings'].includes(k)).every(k=>record[k]===prepared[k]);
}
function assertScope(record,s){if(!record||record.accountUid!==s.accountUid||record.workspaceId!==s.workspaceId)throw new Error('Fiscal scope mismatch.');}
function outbox(record){
  return {documentId:record.documentId,uuid:record.uuid,egsId:record.egsId,version:record.version,
    state:record.status==='queued'||record.status==='retryable'?'ready':record.status==='submitting'||record.status==='uncertain'?'hold':'closed',
    deadline:record.reportingDeadline};
}
export function createFiscalLedger(db){
  if(!db||typeof db.runTransaction!=='function'||typeof db.doc!=='function')throw new Error('Admin transaction store required.');
  return {
    async prepare(authorizedScope,input,xmlBytes,snapshotBytes){
      const base=scope(authorizedScope), initial=prepareFiscalIssue(input);
      assertScope(initial,authorizedScope);
      const xml=artifact(xmlBytes,initial.artifactDigest), snapshot=artifact(snapshotBytes,initial.snapshotDigest);
      const issue=db.doc(base+'/issues/'+id(initial.documentId));
      const egs=db.doc(base+'/egs/'+id(initial.egsId));
      const uuid=db.doc(NS+'/'+id(initial.accountUid)+'/uuidIndex/'+id(initial.uuid));
      const queue=db.doc(base+'/outbox/'+id(initial.documentId));
      return db.runTransaction(async tx=>{
        const existing=await tx.get(issue);
        if(existing.exists){
          const stored=existing.data();assertScope(stored,authorizedScope);
          if(!immutableMatch(stored,initial))throw new Error('Fiscal document already bound to another immutable issue.');
          return stored;
        }
        const chain=await tx.get(egs), duplicate=await tx.get(uuid);
        if(duplicate.exists)throw new Error('Fiscal UUID already reserved.');
        const state=chain.exists?chain.data():null;
        assertScope(state,authorizedScope);
        if(state.active!==true||state.egsId!==initial.egsId||state.nextIcv!==initial.icv||state.previousInvoiceHash!==initial.previousInvoiceHash)
          throw new Error('Fiscal EGS chain conflict or inactive unit.');
        if(initial.icv==='1'&&state.previousInvoiceHash!==FIRST_PREVIOUS_INVOICE_HASH)throw new Error('Invalid EGS genesis.');
        const nextIcv=String(BigInt(initial.icv)+1n);
        if(nextIcv.length>18)throw new Error('Fiscal counter exhausted.');
        tx.create(issue,initial);
        tx.create(uuid,{workspaceId:initial.workspaceId,documentId:initial.documentId,egsId:initial.egsId});
        tx.create(db.doc(issue.path+'/artifacts/prepared'),xml);
        tx.create(db.doc(issue.path+'/artifacts/snapshot'),snapshot);
        tx.create(db.doc(issue.path+'/events/1'),{version:1,status:'queued',at:initial.generatedAt});
        tx.create(queue,outbox(initial));
        tx.update(egs,{nextIcv,previousInvoiceHash:initial.invoiceHash});
        return initial;
      });
    },
    async transition(authorizedScope,documentId,expectedVersion,event,evidenceBytes,clearedBytes){
      const base=scope(authorizedScope), issue=db.doc(base+'/issues/'+id(documentId));
      return db.runTransaction(async tx=>{
        const snapshot=await tx.get(issue), record=snapshot.exists?snapshot.data():null;
        assertScope(record,authorizedScope);
        if(record.documentId!==documentId)throw new Error('Fiscal document identity mismatch.');
        const next=transitionFiscalIssue(record,expectedVersion,event);
        const evidence=next.resultDigest?artifact(evidenceBytes,next.resultDigest):null;
        const cleared=next.clearedArtifactDigest?artifact(clearedBytes,next.clearedArtifactDigest):null;
        const eventRef=db.doc(issue.path+'/events/'+String(next.version));
        // Evidence is write-once and ref-specific. No raw credentials are stored.
        if(evidence)tx.create(db.doc(eventRef.path+'/artifacts/result'),evidence);
        if(cleared)tx.create(db.doc(issue.path+'/artifacts/cleared'),cleared);
        tx.create(eventRef,{version:next.version,status:next.status,kind:event.kind,attemptId:event.attemptId,at:event.at,resultDigest:next.resultDigest});
        tx.update(issue,next);
        tx.update(db.doc(base+'/outbox/'+id(documentId)),outbox(next));
        return next;
      });
    }
  };
}
