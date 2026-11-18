import {hashAuthorityEvidence,writeAuthorityEvidence,readAuthorityEvidence} from './authority-evidence.js';

// Private simulation-only receipt journal. Persist complete response bytes
// before running any verifier; a receipt is never acceptance evidence by itself.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
function need(ok){if(!ok)throw Error('FISCAL_ATTEMPT_RESPONSE_INVALID');}
function timestamp(s){need(typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s);return Date.parse(s);}
function path(scope,documentId,attemptId){
  need(scope?.environment==='simulation'&&[scope.accountUid,scope.workspaceId,scope.egsId,documentId,attemptId].every(x=>typeof x==='string'&&ID.test(x)));
  const base='fiscalPrivateV1/'+scope.accountUid+'/workspaces/'+scope.workspaceId;
  const issue=base+'/issues/'+documentId;
  return {issue,queue:base+'/outbox/'+documentId,receipt:issue+'/attemptResponses/'+attemptId};
}
function data(s){need(s?.exists);return s.data();}
export function createAttemptResponseStore(db){
  need(db&&typeof db.doc==='function'&&typeof db.runTransaction==='function');
  const get=(tx,p)=>tx.get(db.doc(p));
  async function binding(tx,scope,documentId,version,attemptId){
    const p=path(scope,documentId,attemptId);need(Number.isSafeInteger(version)&&version>=2);
    const r=data(await get(tx,p.issue)),q=data(await get(tx,p.queue)),start=data(await get(tx,p.issue+'/events/'+String(version)));
    need(r.accountUid===scope.accountUid&&r.workspaceId===scope.workspaceId&&r.egsId===scope.egsId&&r.documentId===documentId&&r.attemptId===attemptId&&r.version>=version&&['submitting','uncertain'].includes(r.status)&&q.state==='hold'&&q.documentId===documentId&&q.uuid===r.uuid&&q.egsId===r.egsId&&q.version===r.version&&start.version===version&&start.kind==='start'&&start.status==='submitting'&&start.attemptId===attemptId);
    timestamp(start.at);return {p,r,start};
  }
  async function inspect(tx,scope,documentId,version,attemptId){
    const {p,r,start}=await binding(tx,scope,documentId,version,attemptId);
    const row=await get(tx,p.receipt);if(!row.exists)return {record:r,startedAt:start.at,receipt:null,bytes:null};
    const receipt=row.data();need(receipt.version===version&&receipt.attemptId===attemptId&&receipt.documentId===documentId&&receipt.egsId===scope.egsId&&receipt.uuid===r.uuid&&Number.isInteger(receipt.httpStatus)&&receipt.httpStatus>=100&&receipt.httpStatus<=599&&typeof receipt.digest==='string'&&HEX.test(receipt.digest)&&timestamp(receipt.receivedAt)>=timestamp(start.at));
    const bytes=await readAuthorityEvidence(tx,db,db.doc(p.receipt+'/artifacts/response'),receipt.digest);
    return {record:r,startedAt:start.at,receipt,bytes};
  }
  return Object.freeze({
    inspect,
    async recordResponse(scope,documentId,version,attemptId,{httpStatus,bytes,digest,receivedAt}){
      need(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599&&typeof digest==='string'&&HEX.test(digest)&&hashAuthorityEvidence(bytes)===digest);
      const copy=Buffer.from(bytes),at=timestamp(receivedAt);
      return db.runTransaction(async tx=>{
        const {p,r,start}=await binding(tx,scope,documentId,version,attemptId);
        need(((r.status==='submitting'&&r.version===version)||(r.status==='uncertain'&&r.version===version+1))&&at>=timestamp(start.at));
        const ref=db.doc(p.receipt),prior=await tx.get(ref);
        const receipt={version,attemptId,documentId,egsId:scope.egsId,uuid:r.uuid,httpStatus,digest,receivedAt};
        if(prior.exists){const v=prior.data();need(Object.keys(receipt).filter(k=>k!=='receivedAt').every(k=>v[k]===receipt[k])&&timestamp(v.receivedAt)>=timestamp(start.at));need((await readAuthorityEvidence(tx,db,db.doc(p.receipt+'/artifacts/response'),digest)).equals(copy));return v;}
        tx.create(ref,receipt);writeAuthorityEvidence(tx,db,db.doc(p.receipt+'/artifacts/response'),copy,digest);return receipt;
      });
    },
    async readResponse(scope,documentId,version,attemptId){
      return db.runTransaction(tx=>inspect(tx,scope,documentId,version,attemptId));
    }
  });
}
