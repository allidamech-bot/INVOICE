import {createAcceptedFiscalReader} from './accepted-issue.js';
import {readApprovedIntent} from './issue-intent.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {reviewDigest} from './commercial-source.js';
import {simulationBase} from './simulation-scope.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const cents=v=>{if(typeof v!=='string'||!/^(?:0|[1-9][0-9]{0,17})\.\d{2}$/.test(v))throw Error('FISCAL_CREDIT_AMOUNT_INVALID');return BigInt(v.replace('.',''));};
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const need=(v,c='FISCAL_CREDIT_ORIGINAL_INVALID')=>{if(!v)throw Error(c);};
const data=s=>s.exists?s.data():null;
function binding(r){return {accountUid:r.accountUid,workspaceId:r.workspaceId,egsId:r.egsId,documentId:r.documentId,uuid:r.uuid,version:r.version,snapshotDigest:r.snapshotDigest,resultDigest:r.resultDigest};}
export async function resolveFiscalCreditOriginal(db,tx,scope,doc){
  need(doc.role==='credit-note'&&typeof doc.creditForId==='string'&&ID.test(doc.creditForId)&&doc.creditForId!==doc.id);
  const base=simulationBase(scope),a=await createAcceptedFiscalReader(db)(scope,doc.creditForId,tx);
  const intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+doc.creditForId)),scope,doc.creditForId),p=intent.payload,d=p.document,r=p.review;
  need(a.snapshot.equals(intent.bytes)&&a.record.snapshotDigest===intent.digest&&d.kind==='invoice'&&d.role==='standard'&&d.number===doc.creditForNumber&&d.currency===doc.currency&&d.branchId===doc.branchId&&d.issueDate<=doc.issueDate&&d.workspaceId===scope.workspaceId);
  need((d.customerSnapshot?.sourceCustomerId??'')===(doc.customerSnapshot?.sourceCustomerId??'')&&r.seller?.vatNumber===doc.companySnapshot?.vatNumber&&(r.buyer?.vatNumber??null)===(doc.customerSnapshot?.vatTaxNumber??null));
  const mapped=mapCommercialFiscalInvoice({scope,document:d,issuer:p.issuer,review:r,identity:{documentId:d.id,uuid:a.record.uuid,icv:a.record.icv,previousInvoiceHash:a.record.previousInvoiceHash,generatedAt:a.record.generatedAt}});
  need(mapped.invoice.kind==='invoice'&&mapped.mode===a.record.mode);
  return {originalDocumentId:d.id,original:{number:d.number,uuid:a.record.uuid,issueDate:d.issueDate,mode:r.invoiceType,sellerVat:r.seller.vatNumber,buyerVat:r.buyer?.vatNumber??null},originalTax:{category:r.taxCategory,rate:r.taxRate,...(r.reasonCode?{reasonCode:r.reasonCode}:{})},originalBinding:binding(a.record),originalTotals:{net:mapped.candidate.totals.taxExclusiveTotal,vat:mapped.candidate.totals.vatTotal,gross:mapped.candidate.totals.taxInclusiveTotal}};
}
// Read-only until the caller writes the returned reservation in the SAME
// transaction as the new issue and ICV. Pending or uncertain credits consume
// capacity too. No automatic release on transport errors.
export async function planFiscalCreditReservation(db,tx,scope,payload,issue){
  const d=payload.document,r=payload.review;
  need(d.role==='credit-note');
  const original=await resolveFiscalCreditOriginal(db,tx,scope,d);
  for(const k of Object.keys(original))need(reviewDigest(r[k])===reviewDigest(original[k]),'FISCAL_CREDIT_ORIGINAL_CHANGED');
  const m=mapCommercialFiscalInvoice({scope,document:d,issuer:payload.issuer,review:r,identity:{documentId:issue.documentId,uuid:issue.uuid,icv:issue.icv,previousInvoiceHash:issue.previousInvoiceHash,generatedAt:issue.generatedAt}});
  const t=m.candidate.totals,base=simulationBase(scope),ref=db.doc(base+'/creditBalances/'+d.creditForId),claim=db.doc(ref.path+'/reservations/'+d.id),prior=data(await tx.get(ref)),existing=data(await tx.get(claim));
  need(!existing,'FISCAL_CREDIT_ALREADY_RESERVED');
  const fields=['net','vat','gross'],amount={net:t.taxExclusiveTotal,vat:t.vatTotal,gross:t.taxInclusiveTotal};
  if(prior)need(prior.accountUid===scope.accountUid&&prior.workspaceId===scope.workspaceId&&prior.egsId===scope.egsId&&reviewDigest(prior.originalBinding)===reviewDigest(original.originalBinding)&&reviewDigest(prior.originalTotals)===reviewDigest(original.originalTotals)&&prior.reserved,'FISCAL_CREDIT_BALANCE_INVALID');
  const reserved={};
  for(const k of fields){const n=cents(prior?prior.reserved[k]:'0.00')+cents(amount[k]);need(n<=cents(original.originalTotals[k]),'FISCAL_CREDIT_CAPACITY_EXCEEDED');reserved[k]=money(n);}
  const row={...scope,originalDocumentId:d.creditForId,originalBinding:original.originalBinding,originalTotals:original.originalTotals,reserved};
  return {write(tx){if(prior)tx.update(ref,row);else tx.create(ref,row);tx.create(claim,{...scope,documentId:d.id,uuid:issue.uuid,snapshotDigest:issue.snapshotDigest,amount,state:'reserved'});}};
}
