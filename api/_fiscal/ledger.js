import {createHash} from 'node:crypto';
import {sdkProofArtifact,readStoredSdkProof} from './sdk4-validation-evidence.js';
import {issuanceBoundary,fiscalNamespace,assertProductionSale} from './issuance-boundary.js';
import {readApprovedIntent} from './issue-intent.js';
import {assertCurrentApprovedSource} from './commercial-source.js';
import {writeAuthorityEvidence} from './authority-evidence.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
import {createAttemptResponseStore} from './attempt-response.js';
import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
import {planFiscalCreditReservation} from './commercial-credit.js';
import {planCommercialScenario} from './commercial-scenarios.js';
import {prepareFiscalIssue,transitionFiscalIssue,FIRST_PREVIOUS_INVOICE_HASH} from '../../dist/src/lib/fiscal-issuance.js';

// Internal Admin SDK service only. No browser endpoint or production activation.
// All inputs come from authorized server preparation/verified authority adapters.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_BYTES=512*1024;
function id(value){if(typeof value!=='string'||!ID.test(value))throw new Error('Invalid fiscal scope.');return value;}
function artifact(bytes,digest){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_BYTES||createHash('sha256').update(bytes).digest('hex')!==digest)
    throw new Error('Invalid or oversized fiscal artifact.');
  return {sha256:digest,bytes:bytes.toString('base64')};
}
function readBytes(stored,digest){
  if(!stored.exists)throw Error('Fiscal artifact missing.');
  const value=stored.data();if(typeof value.bytes!=='string'||value.bytes.length>Math.ceil(MAX_BYTES/3)*4||value.sha256!==digest)throw Error('Invalid fiscal artifact.');
  const bytes=Buffer.from(value.bytes,'base64');
  if(bytes.toString('base64')!==value.bytes)throw Error('Invalid fiscal artifact.');
  artifact(bytes,digest);return bytes;
}
function immutableMatch(record,prepared){
  return Object.keys(prepared).filter(k=>!['status','version','updatedAt','reportingDeadline','attemptId','attemptCount','usedAttemptIds','resultDigest','clearedArtifactDigest','warnings'].includes(k)).every(k=>record[k]===prepared[k]);
}
function assertScope(record,s){if(!record||(s.environment==='production'?record.environment!=='production':record.environment!==undefined&&record.environment!=='simulation')||record.accountUid!==s.accountUid||record.workspaceId!==s.workspaceId||record.egsId!==s.egsId)throw new Error('Fiscal scope mismatch.');}
function outbox(record){
  return {documentId:record.documentId,uuid:record.uuid,egsId:record.egsId,version:record.version,
    state:record.status==='queued'||record.status==='retryable'?'ready':record.status==='submitting'||record.status==='uncertain'?'hold':'closed',
    deadline:record.reportingDeadline};
}
export function createFiscalLedger(db,options={}){
  const {sdkInstallationManifestSha256}=options,boundary=issuanceBoundary(db,options),scope=boundary.base;
  if(sdkInstallationManifestSha256!==undefined&&(typeof sdkInstallationManifestSha256!=='string'||! /^[a-f0-9]{64}$/.test(sdkInstallationManifestSha256)))throw Error('FISCAL_OFFICIAL_VALIDATION_REQUIRED');
  if(!db||typeof db.runTransaction!=='function'||typeof db.doc!=='function')throw new Error('Admin transaction store required.');
  const receipts=createAttemptResponseStore(db,options);
  async function applyTransition(tx,authorizedScope,base,issue,documentId,record,expectedVersion,event,evidenceBytes,clearedBytes){
    const next=transitionFiscalIssue(record,expectedVersion,event);
    if(['submitting','uncertain'].includes(record.status)){
      // Negative decisions need an independent authority reconciliation source,
      // not an arbitrary error body or an operator-entered digest.
      if(['confirmed-not-accepted','rejected'].includes(event.kind))throw Error('FISCAL_NEGATIVE_RECONCILIATION_NOT_CONFIGURED');
      if(['cleared','reported','uncertain'].includes(event.kind)){
        const startVersion=record.status==='uncertain'?record.version-1:record.version;
        const saved=await receipts.inspect(tx,authorizedScope,documentId,startVersion,event.attemptId);
        const expectedDigest=event.kind==='uncertain'?event.unverifiedEvidenceDigest:event.resultDigest;
        if(saved.receipt){
          if(expectedDigest!==saved.receipt.digest||!Buffer.isBuffer(evidenceBytes)||!saved.bytes.equals(evidenceBytes)||Date.parse(event.at)<Date.parse(saved.receipt.receivedAt))throw Error('FISCAL_RESPONSE_RECEIPT_MISMATCH');
        }else if(expectedDigest!==undefined||evidenceBytes!==undefined||event.kind!=='uncertain')throw Error('FISCAL_RESPONSE_RECEIPT_REQUIRED');
        if(event.kind!=='uncertain'){
          const result=classifyStoredSubmissionResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
          if(result.status!==(record.mode==='clearance'?'clearance-response':'reporting-response')||result.warnings!==event.warnings||(record.mode==='clearance'&&(!Buffer.isBuffer(clearedBytes)||!result.clearedBytes.equals(clearedBytes))))throw Error('FISCAL_RESPONSE_NOT_ACCEPTED');
          // Re-check immutable artifacts at the final CAS, not only before verification.
          readBytes(await tx.get(db.doc(issue.path+'/artifacts/prepared')),record.artifactDigest);
          readBytes(await tx.get(db.doc(issue.path+'/artifacts/snapshot')),record.snapshotDigest);
          // Retain recovery for already submitted legacy records. A stored
          // SDK proof, when present, must still match the originally queued XML.
          await readStoredSdkProof(db,tx,issue.path,record,boundary.environment==='production'?sdkInstallationManifestSha256:undefined);
        }
      }
    }
    const unverifiedDigest=event.kind==='uncertain'?event.unverifiedEvidenceDigest:undefined;
    if(evidenceBytes!==undefined&&!next.resultDigest&&!unverifiedDigest)throw Error('Unbound authority evidence.');
    const cleared=next.clearedArtifactDigest?artifact(clearedBytes,next.clearedArtifactDigest):null;
    const eventRef=db.doc(issue.path+'/events/'+String(next.version));
    // Evidence is write-once and ref-specific. No raw credentials are stored.
    if(next.resultDigest)writeAuthorityEvidence(tx,db,db.doc(eventRef.path+'/artifacts/result'),evidenceBytes,next.resultDigest);
    if(unverifiedDigest)writeAuthorityEvidence(tx,db,db.doc(eventRef.path+'/artifacts/unverified-response'),evidenceBytes,unverifiedDigest);
    if(cleared)tx.create(db.doc(issue.path+'/artifacts/cleared'),cleared);
    tx.create(eventRef,{version:next.version,status:next.status,kind:event.kind,attemptId:event.attemptId,at:event.at,resultDigest:next.resultDigest,...(unverifiedDigest?{unverifiedEvidenceDigest:unverifiedDigest}:{})});
    tx.update(issue,next);
    tx.update(db.doc(base+'/outbox/'+id(documentId)),outbox(next));
    return next;
  }
  return {
    readAccepted:createAcceptedFiscalReader(db,options),
    recordResponse:receipts.recordResponse,
    readResponse:receipts.readResponse,
    async readHeldForReconciliation(authorizedScope,documentId,expectedVersion){
      if(authorizedScope.environment!==boundary.environment||!Number.isSafeInteger(expectedVersion)||expectedVersion<3)throw Error('FISCAL_RECONCILIATION_NOT_ELIGIBLE');
      const base=scope(authorizedScope),issue=db.doc(base+'/issues/'+id(documentId));
      return db.runTransaction(async tx=>{
        await boundary.read(tx,authorizedScope);
        const row=await tx.get(issue),record=row.exists?row.data():null;
        assertScope(record,authorizedScope);
        if(record.documentId!==documentId||record.egsId!==authorizedScope.egsId||record.status!=='uncertain'||record.version!==expectedVersion)throw Error('FISCAL_RECONCILIATION_NOT_ELIGIBLE');
        const saved=await receipts.inspect(tx,authorizedScope,documentId,expectedVersion-1,record.attemptId);
        const xmlBytes=readBytes(await tx.get(db.doc(issue.path+'/artifacts/prepared')),record.artifactDigest);
        const snapshotBytes=readBytes(await tx.get(db.doc(issue.path+'/artifacts/snapshot')),record.snapshotDigest);
        return {...saved,xmlBytes,snapshotBytes};
      });
    },
    // Explicit operator recovery only. After five minutes, move a crashed
    // submission to uncertainty; never issue a second network request.
    async recoverInterrupted(authorizedScope,documentId,expectedVersion,attemptId,at){
      const base=scope(authorizedScope),issue=db.doc(base+'/issues/'+id(documentId));
      return db.runTransaction(async tx=>{
        const saved=await receipts.inspect(tx,authorizedScope,documentId,expectedVersion,attemptId);
        if(saved.record.status!=='submitting'||saved.record.version!==expectedVersion||typeof at!=='string'||!Number.isFinite(Date.parse(at))||Date.parse(at)-Date.parse(saved.startedAt)<300000)throw Error('FISCAL_RECOVERY_NOT_ELIGIBLE');
        const event={kind:'uncertain',attemptId,at,...(saved.receipt?{unverifiedEvidenceDigest:saved.receipt.digest}:{})};
        return applyTransition(tx,authorizedScope,base,issue,documentId,saved.record,expectedVersion,event,saved.bytes??undefined,undefined);
      });
    },
    async prepare(authorizedScope,input,xmlBytes,snapshotBytes,{approvedIntent=false,sdkProof}={}){
      if(boundary.environment==='production'&&!approvedIntent)throw Error('FISCAL_APPROVED_INTENT_REQUIRED');
      const base=scope(authorizedScope), prepared=prepareFiscalIssue(input),proof=sdkProofArtifact(sdkProof,prepared,sdkInstallationManifestSha256),initial={...prepared,...(boundary.environment==='production'?{environment:'production'}:{}),...(proof?{sdkValidationDigest:proof.sha256}:{})};
      assertScope(initial,authorizedScope);
      const xml=artifact(xmlBytes,initial.artifactDigest), snapshot=artifact(snapshotBytes,initial.snapshotDigest);
      const issue=db.doc(base+'/issues/'+id(initial.documentId));
      const egs=db.doc(base+'/egs/'+id(initial.egsId));
      const uuid=db.doc(fiscalNamespace(authorizedScope)+'/'+id(initial.accountUid)+'/uuidIndex/'+id(initial.uuid));
      const queue=db.doc(base+'/outbox/'+id(initial.documentId));
      return db.runTransaction(async tx=>{
        const {unit:state}=await boundary.read(tx,authorizedScope,{active:true});
        let approved;
        if(approvedIntent){
          const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+id(initial.documentId))),authorizedScope,initial.documentId);
          if(intent.digest!==initial.snapshotDigest||!intent.bytes.equals(snapshotBytes))throw Error('FISCAL_APPROVED_INTENT_CHANGED');
          await assertCurrentApprovedSource(db,tx,authorizedScope,initial.documentId,intent.payload);
          approved=intent.payload;
          assertProductionSale(authorizedScope,approved.document,approved.review,state);
        }
        const existing=await tx.get(issue);
        if(existing.exists){
          const stored=existing.data();assertScope(stored,authorizedScope);
          if(!immutableMatch(stored,initial)||stored.sdkValidationDigest!==initial.sdkValidationDigest)throw new Error('Fiscal document already bound to another immutable issue.');
          await readStoredSdkProof(db,tx,issue.path,stored,sdkInstallationManifestSha256);
          return stored;
        }
        const duplicate=await tx.get(uuid);
        if(duplicate.exists)throw new Error('Fiscal UUID already reserved.');
        assertScope(state,authorizedScope);
        if(state.active!==true||state.egsId!==initial.egsId||state.nextIcv!==initial.icv||state.previousInvoiceHash!==initial.previousInvoiceHash)
          throw new Error('Fiscal EGS chain conflict or inactive unit.');
        if(initial.icv==='1'&&state.previousInvoiceHash!==FIRST_PREVIOUS_INVOICE_HASH)throw new Error('Invalid EGS genesis.');
        const nextIcv=String(BigInt(initial.icv)+1n);
        if(nextIcv.length>18)throw new Error('Fiscal counter exhausted.');
        const reservation=approved?.review.scenario?.kind==='advance-refund'?await planCommercialScenario(db,tx,authorizedScope,approved,initial):approved?.document.role==='credit-note'?await planFiscalCreditReservation(db,tx,authorizedScope,approved,initial):approved?.review.scenario?await planCommercialScenario(db,tx,authorizedScope,approved,initial):null;
        if(reservation)reservation.write(tx);
        tx.create(issue,initial);
        tx.create(uuid,{workspaceId:initial.workspaceId,documentId:initial.documentId,egsId:initial.egsId});
        tx.create(db.doc(issue.path+'/artifacts/prepared'),xml);
        tx.create(db.doc(issue.path+'/artifacts/snapshot'),snapshot);
        if(proof)tx.create(db.doc(issue.path+'/artifacts/sdk-validation'),proof);
        tx.create(db.doc(issue.path+'/events/1'),{version:1,status:'queued',at:initial.generatedAt});
        tx.create(queue,outbox(initial));
        tx.update(egs,{nextIcv,previousInvoiceHash:initial.invoiceHash});
        return initial;
      });
    },
    // Simulation worker: atomically read stored bytes, verify scope and claim one attempt.
    async claim(authorizedScope,documentId,expectedVersion,attemptId,at){
      if(authorizedScope.environment!==boundary.environment)throw Error('Simulation only.');
      const base=scope(authorizedScope), issue=db.doc(base+'/issues/'+id(documentId));
      const queue=db.doc(base+'/outbox/'+id(documentId));
      return db.runTransaction(async tx=>{
        const {unit:state}=await boundary.read(tx,authorizedScope,{active:true});
        const row=await tx.get(issue), job=await tx.get(queue);
        const prepared=await tx.get(db.doc(issue.path+'/artifacts/prepared'));
        const snapshot=await tx.get(db.doc(issue.path+'/artifacts/snapshot'));
        const record=row.exists?row.data():null;
        assertScope(record,authorizedScope);assertScope(state,authorizedScope);
        if(record.documentId!==documentId||record.egsId!==authorizedScope.egsId||state.egsId!==record.egsId||state.active!==true||state.environment!==boundary.environment)throw Error('Invalid simulation EGS.');
        const expected=outbox(record), actual=job.exists?job.data():null;
        if(!actual||expected.state!=='ready'||Object.keys(expected).some(k=>actual[k]!==expected[k]))throw Error('Fiscal queue not ready.');
        const xmlBytes=readBytes(prepared,record.artifactDigest), snapshotBytes=readBytes(snapshot,record.snapshotDigest);
        await readStoredSdkProof(db,tx,issue.path,record,sdkInstallationManifestSha256);
        const next=transitionFiscalIssue(record,expectedVersion,{kind:'start',attemptId,at});
        tx.create(db.doc(issue.path+'/events/'+String(next.version)),{version:next.version,status:next.status,kind:'start',attemptId,at,resultDigest:null});
        tx.update(issue,next);tx.update(queue,outbox(next));
        return {record:next,xmlBytes,snapshotBytes};
      });
    },
    async transition(authorizedScope,documentId,expectedVersion,event,evidenceBytes,clearedBytes){
      const base=scope(authorizedScope), issue=db.doc(base+'/issues/'+id(documentId));
      if(event?.kind==='start')throw Error('Fiscal submission must use atomic claim.');
      return db.runTransaction(async tx=>{
        await boundary.read(tx,authorizedScope);
        const snapshot=await tx.get(issue), record=snapshot.exists?snapshot.data():null;
        assertScope(record,authorizedScope);
        if(record.documentId!==documentId||(authorizedScope.egsId!==undefined&&record.egsId!==authorizedScope.egsId))throw new Error('Fiscal document identity mismatch.');
        return applyTransition(tx,authorizedScope,base,issue,documentId,record,expectedVersion,event,evidenceBytes,clearedBytes);
      });
    }
  };
}
