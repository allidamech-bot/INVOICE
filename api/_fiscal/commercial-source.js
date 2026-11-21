import {createHash} from 'node:crypto';
import {fiscalBase} from './issuance-boundary.js';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const REV=/^[A-Za-z0-9-]{12,90}$/;
const HEX=/^[a-f0-9]{64}$/;
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const sha=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
function need(ok,code='FISCAL_SOURCE_CHANGED'){if(!ok)throw Error(code);}
function data(row){return row.exists?row.data():null;}
export function validateSourceBinding(b){
  need(b&&typeof b.revision==='string'&&REV.test(b.revision)&&typeof b.sha256==='string'&&HEX.test(b.sha256)&&Number.isSafeInteger(b.generation)&&b.generation>=1&&typeof b.reviewDigest==='string'&&HEX.test(b.reviewDigest));
  return b;
}
export function reviewDigest(review){return sha(review);}
export async function currentPublishedFiscalSource(db,tx,scope,documentId){
  need(typeof scope?.accountUid==='string'&&ID.test(scope.accountUid)&&typeof scope.workspaceId==='string'&&ID.test(scope.workspaceId)&&typeof scope.egsId==='string'&&ID.test(scope.egsId)&&typeof documentId==='string'&&ID.test(documentId)&&['simulation','production'].includes(scope.environment));
  const root='users/'+scope.accountUid;
  const meta=data(await tx.get(db.doc(root+'/workspace/meta'))),control=data(await tx.get(db.doc(root+'/accounting/control')));
  need(meta?.chunkStorage==='period-generations-v1'&&typeof meta.revision==='string'&&REV.test(meta.revision)&&typeof meta.sha256==='string'&&HEX.test(meta.sha256));
  need(control?.format==='LOUREX_PERIOD_CONTROL_V1'&&control.version===1&&control.ownerUid===scope.accountUid&&Number.isSafeInteger(control.generation)&&control.generation>=1&&Array.isArray(control.boundaries));
  const boundaries=control.boundaries;
  need(boundaries.every(b=>b&&typeof b.workspaceId==='string'&&ID.test(b.workspaceId)&&typeof b.through==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.through)&&Number.isFinite(Date.parse(b.through))&&new Date(b.through).toISOString().slice(0,10)===b.through&&typeof b.reportId==='string'&&/^[a-f0-9]{32}$/.test(b.reportId))&&new Set(boundaries.map(b=>b.workspaceId)).size===boundaries.length);
  return {meta,control,closedThrough:boundaries.find(b=>b.workspaceId===scope.workspaceId)?.through??null,root};
}
export async function currentFiscalSource(db,tx,scope,documentId){
  const source=await currentPublishedFiscalSource(db,tx,scope,documentId);
  const {meta,control}=source,review=data(await tx.get(db.doc(fiscalBase(scope)+'/issueReviews/'+documentId)));
  need(review?.state==='approved'&&review.environment===scope.environment&&review.accountUid===scope.accountUid&&review.workspaceId===scope.workspaceId&&review.egsId===scope.egsId&&review.documentId===documentId&&review.sourceRevision===meta.revision&&review.sourceSha256===meta.sha256&&review.periodGeneration===control.generation&&review.issuer&&review.review,'FISCAL_REVIEW_REQUIRED');
  const binding={revision:meta.revision,sha256:meta.sha256,generation:control.generation,reviewDigest:reviewDigest(review)};
  return {...source,review,binding};
}
export async function assertCurrentApprovedSource(db,tx,scope,documentId,payload){
  const binding=validateSourceBinding(payload.source);
  let actual;
  if(scope.environment==='production'){
    // The frozen production intent already owns an exact immutable invoice.
    // Another invoice/customer edit may advance the account generation; it
    // must not strand this intent. Re-read the current protected payload and
    // prove the specific draft and original review are byte-equivalent facts.
    const source=await currentPublishedFiscalSource(db,tx,scope,documentId);
    const review=data(await tx.get(db.doc(fiscalBase(scope)+'/issueReviews/'+documentId)));
    need(review?.state==='approved'&&review.environment===scope.environment&&review.accountUid===scope.accountUid&&review.workspaceId===scope.workspaceId&&review.egsId===scope.egsId&&review.documentId===documentId&&review.documentRevision===payload.document?.revision&&review.sourceRevision===binding.revision&&review.sourceSha256===binding.sha256&&review.periodGeneration===binding.generation&&reviewDigest(review)===binding.reviewDigest,'FISCAL_REVIEW_CHANGED');
    const {validateMeta,decodeWorkspace}=await import('../_accounting/period-format.js');
    const meta=validateMeta(source.meta);need(meta.chunkCount<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
    const chunks=[];for(let i=0;i<meta.chunkCount;i++)chunks.push(data(await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')))));
    const workspace=decodeWorkspace(meta,chunks),docs=workspace.documents.filter(d=>d.id===documentId);
    need(docs.length===1&&docs[0].workspaceId===scope.workspaceId&&workspace.branches.some(b=>b.id===docs[0].branchId&&b.workspaceId===scope.workspaceId&&b.active===true)&&reviewDigest(docs[0])===reviewDigest(payload.document),'FISCAL_SOURCE_CHANGED');
    actual={...source,review,binding};
  }else{
    actual=await currentFiscalSource(db,tx,scope,documentId);
    need(Object.keys(actual.binding).every(k=>actual.binding[k]===binding[k]));
  }
  need(!actual.closedThrough||payload.document.issueDate>actual.closedThrough,'FISCAL_PERIOD_CLOSED');
  need(reviewDigest(actual.review.issuer)===reviewDigest(payload.issuer)&&reviewDigest(actual.review.review)===reviewDigest(payload.review),'FISCAL_REVIEW_CHANGED');
  return actual;
}
