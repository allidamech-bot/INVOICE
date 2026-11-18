import {createHash} from 'node:crypto';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const REV=/^[A-Za-z0-9-]{12,90}$/;
const HEX=/^[a-f0-9]{64}$/;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function need(ok,code='FISCAL_SOURCE_CHANGED'){if(!ok)throw Error(code);}
function data(row){return row.exists?row.data():null;}
export function validateSourceBinding(b){
  need(b&&typeof b.revision==='string'&&REV.test(b.revision)&&typeof b.sha256==='string'&&HEX.test(b.sha256)&&Number.isSafeInteger(b.generation)&&b.generation>=1&&typeof b.reviewDigest==='string'&&HEX.test(b.reviewDigest));
  return b;
}
export function reviewDigest(review){return sha(review);}
export async function currentFiscalSource(db,tx,scope,documentId){
  need(typeof scope?.accountUid==='string'&&ID.test(scope.accountUid)&&typeof scope.workspaceId==='string'&&ID.test(scope.workspaceId)&&typeof scope.egsId==='string'&&ID.test(scope.egsId)&&typeof documentId==='string'&&ID.test(documentId)&&scope.environment==='simulation');
  const root='users/'+scope.accountUid;
  const meta=data(await tx.get(db.doc(root+'/workspace/meta'))),control=data(await tx.get(db.doc(root+'/accounting/control')));
  const review=data(await tx.get(db.doc('fiscalPrivateV1/'+scope.accountUid+'/workspaces/'+scope.workspaceId+'/issueReviews/'+documentId)));
  need(meta?.chunkStorage==='period-generations-v1'&&typeof meta.revision==='string'&&REV.test(meta.revision)&&typeof meta.sha256==='string'&&HEX.test(meta.sha256));
  need(control?.format==='LOUREX_PERIOD_CONTROL_V1'&&control.version===1&&control.ownerUid===scope.accountUid&&Number.isSafeInteger(control.generation)&&control.generation>=1&&Array.isArray(control.boundaries));
  const boundaries=control.boundaries;
  need(boundaries.every(b=>b&&typeof b.workspaceId==='string'&&ID.test(b.workspaceId)&&typeof b.through==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.through)&&Number.isFinite(Date.parse(b.through))&&new Date(b.through).toISOString().slice(0,10)===b.through&&typeof b.reportId==='string'&&/^[a-f0-9]{32}$/.test(b.reportId))&&new Set(boundaries.map(b=>b.workspaceId)).size===boundaries.length);
  need(review?.state==='approved'&&review.environment==='simulation'&&review.accountUid===scope.accountUid&&review.workspaceId===scope.workspaceId&&review.egsId===scope.egsId&&review.documentId===documentId&&review.sourceRevision===meta.revision&&review.sourceSha256===meta.sha256&&review.periodGeneration===control.generation&&review.issuer&&review.review,'FISCAL_REVIEW_REQUIRED');
  const binding={revision:meta.revision,sha256:meta.sha256,generation:control.generation,reviewDigest:reviewDigest(review)};
  return {meta,review,binding,closedThrough:boundaries.find(b=>b.workspaceId===scope.workspaceId)?.through??null,root};
}
export async function assertCurrentApprovedSource(db,tx,scope,documentId,payload){
  const binding=validateSourceBinding(payload.source);
  const actual=await currentFiscalSource(db,tx,scope,documentId);
  need(Object.keys(actual.binding).every(k=>actual.binding[k]===binding[k]));
  need(!actual.closedThrough||payload.document.issueDate>actual.closedThrough,'FISCAL_PERIOD_CLOSED');
  need(reviewDigest(actual.review.issuer)===reviewDigest(payload.issuer)&&reviewDigest(actual.review.review)===reviewDigest(payload.review),'FISCAL_REVIEW_CHANGED');
  return actual;
}
