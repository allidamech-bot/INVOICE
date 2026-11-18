import {reserveAdvanceCash} from './advance-commercial.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
import {readApprovedIntent} from './issue-intent.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {resolveFiscalCreditOriginal} from './commercial-credit.js';
import {reviewDigest} from './commercial-source.js';
import {simulationBase} from './simulation-scope.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const data=s=>s.exists?s.data():null;
const same=(r,s)=>r&&['accountUid','workspaceId','egsId','environment'].every(k=>r[k]===s[k]);
const need=(ok,c='FISCAL_SCENARIO_EVIDENCE_REQUIRED')=>{if(!ok)throw Error(c);};
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9][0-9]{0,17})\.\d{2}$/.test(v),'FISCAL_ADVANCE_AMOUNT_INVALID');return BigInt(v.replace('.',''));};
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const equal=(a,b)=>reviewDigest(a)===reviewDigest(b);
async function evidence(db,tx,s,d,kind,digest){
  need(typeof digest==='string'&&HEX.test(digest));
  const row=data(await tx.get(db.doc(simulationBase(s)+'/scenarioEvidence/'+digest)));
  need(same(row,s)&&row.state==='approved'&&row.kind===kind&&row.documentId===d.id&&row.documentRevision===d.revision&&row.evidenceDigest===digest&&row.currency===d.currency&&row.customerId===d.customerSnapshot?.sourceCustomerId&&cents(row.gross)>0n);
  return row;
}
async function advance(db,tx,s,d,r,allocation){
  need(fields(allocation,['documentId','net','vat'])&&typeof allocation.documentId==='string'&&ID.test(allocation.documentId)&&allocation.documentId!==d.id&&cents(allocation.net)>0n&&cents(allocation.vat)>=0n);
  const base=simulationBase(s),id=allocation.documentId,a=await createAcceptedFiscalReader(db)(s,id,tx),intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+id)),s,id),p=intent.payload;
  need(a.snapshot.equals(intent.bytes)&&p.document.role==='standard'&&p.review.scenario?.kind==='advance-receipt'&&p.document.currency==='SAR'&&p.document.branchId===d.branchId&&p.document.customerSnapshot?.sourceCustomerId===d.customerSnapshot?.sourceCustomerId&&r.buyer?.vatNumber&&p.review.buyer?.vatNumber===r.buyer.vatNumber&&p.review.seller?.vatNumber===r.seller.vatNumber&&p.review.invoiceType===r.invoiceType&&p.review.taxCategory===r.taxCategory&&p.review.taxRate===r.taxRate&&(p.review.reasonCode??'')===(r.reasonCode??''));
  const mapped=mapCommercialFiscalInvoice({scope:s,document:p.document,issuer:p.issuer,review:p.review,identity:{documentId:id,uuid:a.record.uuid,icv:a.record.icv,previousInvoiceHash:a.record.previousInvoiceHash,generatedAt:a.record.generatedAt}});
  need(mapped.invoice.kind==='prepayment'&&mapped.mode===a.record.mode);
  // An accepted advance must have a committed unique payment evidence claim.
  const receiptClaim=data(await tx.get(db.doc('fiscalPrivateV1/'+s.accountUid+'/scenarioClaims/'+p.review.scenario.evidenceDigest)));
  need(same(receiptClaim,s)&&receiptClaim.kind==='advance-receipt'&&receiptClaim.documentId===id&&receiptClaim.uuid===a.record.uuid&&receiptClaim.snapshotDigest===a.record.snapshotDigest,'FISCAL_ADVANCE_EVIDENCE_UNBOUND');
  const t=mapped.candidate.totals,cap={net:t.taxExclusiveTotal,vat:t.vatTotal};
  const reference={uuid:a.record.uuid,number:p.document.number,issueDate:p.document.issueDate,issueTime:mapped.invoice.issueTime,typeCode:'386',currency:'SAR',mode:p.review.invoiceType,status:a.record.status,sellerVat:p.review.seller.vatNumber,buyerVat:p.review.buyer.vatNumber,artifactDigest:a.record.clearedArtifactDigest??a.record.artifactDigest,category:p.review.taxCategory,rate:p.review.taxRate,net:allocation.net,vat:allocation.vat,remainingNet:cap.net,remainingVat:cap.vat};
  const binding={uuid:a.record.uuid,version:a.record.version,snapshotDigest:a.record.snapshotDigest,resultDigest:a.record.resultDigest,artifactDigest:reference.artifactDigest};
  return {reference,binding,cap};
}
// Only private, source-revision-bound scenario instructions are resolved. A
// browser cannot choose a statutory subtype, amount of receipt or allocation.
export async function resolveCommercialScenario(db,tx,s,d,r,instruction){
  need(d.role==='standard'&&d.kind==='invoice'&&d.currency==='SAR'&&r.invoiceType==='standard'&&r.buyer?.vatNumber&&d.customerSnapshot?.sourceCustomerId&&instruction&&typeof instruction==='object');
  if(instruction.kind==='debit-note'){
    need(fields(instruction,['kind','originalDocumentId','originalNumber','evidenceDigest'])&&typeof instruction.originalDocumentId==='string'&&ID.test(instruction.originalDocumentId)&&instruction.originalDocumentId!==d.id);
    const row=await evidence(db,tx,s,d,'debit-note',instruction.evidenceDigest);
    need(row.originalDocumentId===instruction.originalDocumentId&&typeof row.reason==='string'&&row.reason.trim()&&row.reason.length<=1000);
    const original=await resolveFiscalCreditOriginal(db,tx,s,{...d,role:'credit-note',creditForId:instruction.originalDocumentId,creditForNumber:instruction.originalNumber});
    return {...original,correctionReason:row.reason.trim(),scenario:{...instruction,gross:row.gross}};
  }
  if(instruction.kind==='advance-receipt'){
    need(fields(instruction,['kind','evidenceDigest']));
    const row=await evidence(db,tx,s,d,'advance-receipt',instruction.evidenceDigest);
    need(row.receivedAt===d.issueDate&&typeof row.treasuryEntryId==='string'&&ID.test(row.treasuryEntryId)&&typeof row.treasuryEntryDigest==='string'&&HEX.test(row.treasuryEntryDigest)&&d.items.every(l=>l.stockTreatment==='non-stock'));
    return {scenario:{...instruction,receivedAt:row.receivedAt,gross:row.gross,treasuryEntryId:row.treasuryEntryId,treasuryEntryDigest:row.treasuryEntryDigest}};
  }
  need(fields(instruction,['kind','allocations'])&&instruction.kind==='advance-settlement'&&Array.isArray(instruction.allocations)&&instruction.allocations.length>0&&instruction.allocations.length<=10);
  need(new Set(instruction.allocations.map(x=>x.documentId)).size===instruction.allocations.length,'FISCAL_DUPLICATE_ADVANCE');
  const references=[];
  for(const a of instruction.allocations)references.push((await advance(db,tx,s,d,r,a)).reference);
  return {scenario:{...structuredClone(instruction),references}};
}
export async function planCommercialScenario(db,tx,s,payload,issue){
  const d=payload.document,r=payload.review,v=r.scenario;
  need(v&&['debit-note','advance-receipt','advance-settlement'].includes(v.kind));
  const instruction=v.kind==='debit-note'?{kind:v.kind,originalDocumentId:v.originalDocumentId,originalNumber:v.originalNumber,evidenceDigest:v.evidenceDigest}:v.kind==='advance-receipt'?{kind:v.kind,evidenceDigest:v.evidenceDigest}:{kind:v.kind,allocations:v.allocations};
  const actual=await resolveCommercialScenario(db,tx,s,d,r,instruction);
  for(const k of Object.keys(actual))need(equal(r[k],actual[k]),'FISCAL_SCENARIO_CHANGED');
  // Recompute original model at the final atomic issuance boundary to enforce
  // exact evidence totals, XML references and settlement limits.
  mapCommercialFiscalInvoice({scope:s,document:d,issuer:payload.issuer,review:r,identity:{documentId:issue.documentId,uuid:issue.uuid,icv:issue.icv,previousInvoiceHash:issue.previousInvoiceHash,generatedAt:issue.generatedAt}});
  if(v.kind!=='advance-settlement'){
    const ref=db.doc('fiscalPrivateV1/'+s.accountUid+'/scenarioClaims/'+v.evidenceDigest);
    need(!(await tx.get(ref)).exists,'FISCAL_SCENARIO_EVIDENCE_ALREADY_RESERVED');
    const cashReservation=v.kind==='advance-receipt'?await reserveAdvanceCash(db,tx,s,d,v,issue):null;
    return {write(tx){if(cashReservation)cashReservation.write(tx);tx.create(ref,{...s,kind:v.kind,documentId:d.id,uuid:issue.uuid,snapshotDigest:issue.snapshotDigest,gross:v.gross,state:'reserved'});}};
  }
  const plans=[];
  for(const a of v.allocations){
    const {binding,cap}=await advance(db,tx,s,d,r,a);
    const ref=db.doc(simulationBase(s)+'/advanceBalances/'+a.documentId),claim=db.doc(ref.path+'/reservations/'+d.id),prior=data(await tx.get(ref)),existing=data(await tx.get(claim));
    need(!existing,'FISCAL_ADVANCE_ALREADY_RESERVED');
    if(prior)need(same(prior,s)&&equal(prior.binding,binding)&&equal(prior.cap,cap)&&prior.originalDocumentId===a.documentId,'FISCAL_ADVANCE_BALANCE_INVALID');
    const reserved={};
    for(const k of ['net','vat']){const n=cents(prior?prior.reserved[k]:'0.00')+cents(a[k]);need(n<=cents(cap[k]),'FISCAL_ADVANCE_CAPACITY_EXCEEDED');reserved[k]=money(n);}
    plans.push({ref,claim,prior,row:{...s,originalDocumentId:a.documentId,binding,cap,reserved},entry:{...s,documentId:d.id,uuid:issue.uuid,snapshotDigest:issue.snapshotDigest,net:a.net,vat:a.vat,state:'reserved'}});
  }
  return {write(tx){for(const p of plans){if(p.prior)tx.update(p.ref,p.row);else tx.create(p.ref,p.row);tx.create(p.claim,p.entry);}}};
}
