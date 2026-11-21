import {classifyStoredSubmissionResponse} from './zatca-simulation.js';
import {readAuthorityEvidence} from './authority-evidence.js';
import {createAttemptResponseStore} from './attempt-response.js';
import {issuanceBoundary} from './issuance-boundary.js';
const CODE=/^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const sha=/^[a-f0-9]{64}$/;
function need(ok){if(!ok)throw Error('FISCAL_RESPONSE_STATUS_INVALID');}
function data(r){return r.exists?r.data():null;}
function date(v){need(typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);return Date.parse(v);}
const codes=a=>Array.isArray(a)?[...new Set(a.map(x=>x?.code).filter(v=>typeof v==='string'&&CODE.test(v)))].slice(0,20):[];
// Diagnostic projection only: never exposes raw messages, certificates, invoice
// content, party details or the response bytes. Receipt is not final approval.
export function projectAuthorityResponse({httpStatus,bytes,mode}){
  const outcome=classifyStoredSubmissionResponse({httpStatus,bytes,mode});
  let v=null;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{}
  const results=v?.validationResults;
  const errorCount=Array.isArray(results?.errorMessages)?results.errorMessages.length:0;
  const warningCount=Array.isArray(results?.warningMessages)?results.warningMessages.length:0;
  const rejected=httpStatus===400&&results?.status==='ERROR'&&errorCount>0&&(mode==='clearance'?v?.clearanceStatus==='NOT_CLEARED'&&v.clearedInvoice==null:v?.reportingStatus==='NOT_REPORTED');
  const positive=outcome.status===(mode==='clearance'?'clearance-response':'reporting-response');
  return {httpStatus,kind:positive?'positive-response':rejected?'validation-errors':'unresolved-response',warningCount,errorCount,warningCodes:codes(results?.warningMessages),errorCodes:codes(results?.errorMessages)};
}
export function createFiscalResponseStatus(db,options={}){
  const boundary=issuanceBoundary(db,options),receipts=createAttemptResponseStore(db,options);
  return async function inspect(tx,scope,record,now){
    if(!record)return null;
    const at=date(now),base=boundary.base(scope);
    need(record.accountUid===scope.accountUid&&record.workspaceId===scope.workspaceId&&record.egsId===scope.egsId&&typeof record.documentId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(record.documentId)&&['clearance','reporting'].includes(record.mode)&&Number.isSafeInteger(record.version)&&record.version>=1);
    const path=base+'/issues/'+record.documentId;
    const q=data(await tx.get(db.doc(base+'/outbox/'+record.documentId)));
    const state=['queued','retryable'].includes(record.status)?'ready':['submitting','uncertain'].includes(record.status)?'hold':'closed';
    need(q&&q.documentId===record.documentId&&q.uuid===record.uuid&&q.egsId===record.egsId&&q.version===record.version&&q.state===state);
    const event=data(await tx.get(db.doc(path+'/events/'+String(record.version))));
    need(event&&event.version===record.version&&event.status===record.status&&event.at===record.updatedAt);
    const updatedAt=record.updatedAt;date(updatedAt);
    const deadline=record.reportingDeadline;
    need(record.mode==='clearance'?deadline===null:typeof deadline==='string');
    if(deadline!==null)date(deadline);
    const held=['submitting','uncertain'].includes(record.status);
    let response=null,recoveryAvailable=false,hasReceipt=false;
    if(held){
      const startVersion=record.status==='uncertain'?record.version-1:record.version;
      const saved=await receipts.inspect(tx,scope,record.documentId,startVersion,record.attemptId);
      hasReceipt=Boolean(saved.receipt);
      recoveryAvailable=record.status==='submitting'&&at-date(saved.startedAt)>=300000;
      if(saved.receipt)response=projectAuthorityResponse({httpStatus:saved.receipt.httpStatus,bytes:saved.bytes,mode:record.mode});
    }else if(['cleared','reported'].includes(record.status)){
      need(typeof record.resultDigest==='string'&&sha.test(record.resultDigest)&&event.kind===record.status&&event.resultDigest===record.resultDigest&&event.attemptId===record.attemptId&&typeof record.warnings==='boolean');
      const raw=await readAuthorityEvidence(tx,db,db.doc(path+'/events/'+String(record.version)+'/artifacts/result'),record.resultDigest);
      // Recover HTTP metadata from the durable receipt, not an invented 200.
      const startVersion=record.version-1-(record.version>3&&data(await tx.get(db.doc(path+'/events/'+String(record.version-1))))?.status==='uncertain'?1:0);
      const receipt=data(await tx.get(db.doc(path+'/attemptResponses/'+record.attemptId)));
      need(receipt&&receipt.version===startVersion&&receipt.attemptId===record.attemptId&&receipt.documentId===record.documentId&&receipt.egsId===record.egsId&&receipt.uuid===record.uuid&&receipt.digest===record.resultDigest);
      const saved=await readAuthorityEvidence(tx,db,db.doc(path+'/attemptResponses/'+record.attemptId+'/artifacts/response'),receipt.digest);need(saved.equals(raw));
      response=projectAuthorityResponse({httpStatus:receipt.httpStatus,bytes:raw,mode:record.mode});
      const outcome=classifyStoredSubmissionResponse({httpStatus:receipt.httpStatus,bytes:raw,mode:record.mode});
      need(response.kind==='positive-response'&&outcome.warnings===record.warnings&&(record.mode==='clearance'?record.status==='cleared':record.status==='reported'));
      hasReceipt=true;
    }
    return {mode:record.mode,updatedAt,reportingDeadline:deadline,overdue:record.mode==='reporting'&&record.status!=='reported'&&at>=date(deadline),hasReceipt,recoveryAvailable,response,acceptedWithWarnings:['cleared','reported'].includes(record.status)&&record.warnings===true};
  };
}
