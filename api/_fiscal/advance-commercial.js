import {createHash} from 'node:crypto';
import {planCustomerAdvanceRefund} from './advance-refund-plan.mjs';
import {settlementCashClaim} from './supplier-settlement-posting.mjs';
import {reviewDigest,currentPublishedFiscalSource} from './commercial-source.js';
import {validateMeta,decodeWorkspace} from '../_accounting/period-format.js';
import {simulationBase} from './simulation-scope.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
import {readApprovedIntent} from './issue-intent.js';
import {loadCompiledFinance} from '../_accounting/compiled-finance-loader.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const need=(v,c='FISCAL_ADVANCE_COMMERCIAL_REQUIRED')=>{if(!v)throw Error(c);};
const data=s=>s.exists?s.data():null;
const same=(r,s)=>r&&['accountUid','workspaceId','egsId','environment'].every(k=>r[k]===s[k]);
const equal=(a,b)=>reviewDigest(a)===reviewDigest(b);
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
export function advanceCashFacts(e){return Object.fromEntries(['id','workspaceId','branchId','currency','date','amount','type','sourceType','sourceId','fromAccountId','toAccountId','reference','notes','createdAt','voidedAt'].map(k=>[k,e[k]??'']));}
const receiptIndex=(db,s,id)=>db.doc('fiscalPrivateV1/'+s.accountUid+'/advanceTreasuryIndex/'+reviewDigest(id));
const reservationIndex=(db,s,id)=>db.doc('fiscalPrivateV1/'+s.accountUid+'/advanceTreasuryReservations/'+reviewDigest(id));
export async function reserveAdvanceCash(db,tx,s,doc,scenario,issue){
 const source=await currentPublishedFiscalSource(db,tx,s,doc.id),meta=validateMeta(source.meta);need(meta.chunkCount<=24);
 const chunks=[];for(let i=0;i<meta.chunkCount;i++)chunks.push(data(await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')))));
 const payload=decodeWorkspace(meta,chunks),actual=payload.documents.find(x=>x.id===doc.id);
 need(actual&&equal(actual,doc),'FISCAL_ADVANCE_SOURCE_CHANGED');
 const proof=data(await tx.get(db.doc(simulationBase(s)+'/scenarioEvidence/'+scenario.evidenceDigest)));
 const binding={kind:'receipt',gross:scenario.gross,evidenceDigest:scenario.evidenceDigest,treasuryEntryId:scenario.treasuryEntryId};
 const cash=await verifyReceiptCash(db,tx,s,payload,doc,binding,proof,scenario.treasuryEntryDigest);need(cash.account.active===true&&doc.items.every(l=>l.stockTreatment==='non-stock'));
 const ref=reservationIndex(db,s,binding.treasuryEntryId);
 need(!(await tx.get(ref)).exists&&!(await tx.get(receiptIndex(db,s,binding.treasuryEntryId))).exists&&!(await tx.get(settlementCashClaim(db,s,binding.treasuryEntryId))).exists,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
 const record={...s,documentId:doc.id,uuid:issue.uuid,snapshotDigest:issue.snapshotDigest,evidenceDigest:binding.evidenceDigest,treasuryEntryId:binding.treasuryEntryId,cashDigest:cash.cashDigest};
 return {write(tx){tx.create(ref,record);}};
}
async function verifyReceiptCash(db,tx,s,payload,doc,binding,proof,expectedDigest){
  need(binding?.kind==='receipt'&&HEX.test(binding.evidenceDigest)&&ID.test(binding.treasuryEntryId)&&same(proof,s)&&proof.state==='approved'&&proof.kind==='advance-receipt'&&proof.documentId===doc.id&&proof.documentRevision===doc.revision&&proof.evidenceDigest===binding.evidenceDigest&&proof.receivedAt===doc.issueDate&&proof.currency===doc.currency&&proof.customerId===doc.customerSnapshot?.sourceCustomerId&&proof.gross===binding.gross&&proof.treasuryEntryId===binding.treasuryEntryId&&HEX.test(proof.treasuryEntryDigest));
  const entries=payload.treasuryEntries.filter(x=>x.id===binding.treasuryEntryId);need(entries.length===1);const e=entries[0];
  need(e.workspaceId===doc.workspaceId&&e.branchId===doc.branchId&&e.currency==='SAR'&&e.type==='deposit'&&e.sourceType==='manual'&&!e.sourceId&&!e.fromAccountId&&ID.test(e.toAccountId)&&!e.voidedAt&&e.date===doc.issueDate&&e.amount===binding.gross&&reviewDigest(advanceCashFacts(e))===proof.treasuryEntryDigest);
  const accounts=payload.treasuryAccounts.filter(x=>x.id===e.toAccountId);need(accounts.length===1&&accounts[0].workspaceId===doc.workspaceId&&accounts[0].branchId===doc.branchId&&accounts[0].currency==='SAR');
  if(expectedDigest!==undefined)need(expectedDigest===proof.treasuryEntryDigest);
  return {entry:e,account:accounts[0],cashDigest:proof.treasuryEntryDigest};
}
// The receipt has ONE capacity ledger, shared by applications and refunds.
// Prepare all reads before the caller atomically commits the issue and ICV.
export async function planSharedAdvanceCapacity(db,tx,s,{receiptId,binding,cap,documentId,uuid,snapshotDigest,net,vat,refund}){
 const identifier=v=>typeof v==='string'&&ID.test(v);
 need(s?.environment==='simulation'&&identifier(receiptId)&&identifier(documentId)&&receiptId!==documentId&&identifier(uuid)&&typeof snapshotDigest==='string'&&HEX.test(snapshotDigest)&&identifier(binding?.uuid)&&uuid!==binding.uuid&&Number.isSafeInteger(binding.version)&&binding.version>=3&&HEX.test(binding.snapshotDigest)&&HEX.test(binding.resultDigest)&&HEX.test(binding.artifactDigest)&&cap&&Object.keys(cap).length===2&&cents(cap.net)>0n&&cents(cap.vat)>=0n&&cents(net)>0n&&cents(vat)>=0n);
 const ref=db.doc(simulationBase(s)+'/advanceBalances/'+receiptId),claim=db.doc(ref.path+'/reservations/'+documentId),prior=data(await tx.get(ref)),existing=data(await tx.get(claim));
 need(!existing,'FISCAL_ADVANCE_ALREADY_RESERVED');
 if(prior)need(same(prior,s)&&prior.originalDocumentId===receiptId&&equal(prior.binding,binding)&&equal(prior.cap,cap),'FISCAL_ADVANCE_BALANCE_INVALID');
 const reserved={};
 for(const k of ['net','vat']){
   const n=cents(prior?prior.reserved[k]:'0.00')+cents(k==='net'?net:vat);
   need(n<=cents(cap[k]),'FISCAL_ADVANCE_CAPACITY_EXCEEDED');reserved[k]=money(n);
 }
 const row={...s,originalDocumentId:receiptId,binding,cap,reserved};
 let cashRef,cashRecord;
 const entry={...s,documentId,uuid,snapshotDigest,net,vat,state:'reserved'};
 if(refund!==undefined){
   need(refund&&Object.keys(refund).length===3&&identifier(refund.treasuryEntryId)&&HEX.test(refund.cashDigest)&&HEX.test(refund.evidenceDigest));
   cashRef=reservationIndex(db,s,refund.treasuryEntryId);
   need(!(await tx.get(cashRef)).exists&&!(await tx.get(receiptIndex(db,s,refund.treasuryEntryId))).exists&&!(await tx.get(settlementCashClaim(db,s,refund.treasuryEntryId))).exists,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
   Object.assign(entry,{kind:'advance-refund',receiptId,treasuryEntryId:refund.treasuryEntryId,cashDigest:refund.cashDigest});
   cashRecord={...s,kind:'advance-refund',receiptId,documentId,uuid,snapshotDigest,evidenceDigest:refund.evidenceDigest,treasuryEntryId:refund.treasuryEntryId,cashDigest:refund.cashDigest};
 }
 return {write(tx){if(prior)tx.update(ref,row);else tx.create(ref,row);tx.create(claim,entry);if(cashRef)tx.create(cashRef,cashRecord);}};
}
// Reuse an issuance reservation; never add capacity again when posting or
// reporting. The commercial journal and accepted receipt must agree.
export function assertAdvanceAllocationClaim(s,receipt,posting,settlement,claim,balance,allocation){
 need(same(posting,s)&&posting.commercialPosted===true&&posting.source==='sale'&&posting.key==='sale-'+receipt.id&&posting.sourceId===receipt.id&&posting.amount?.kind==='prepayment'&&posting.finalFingerprint===reviewDigest(receipt)&&equal(posting.advanceBinding,receipt.fiscalAdvance));
 need(same(claim,s)&&claim.kind===undefined&&claim.state==='reserved'&&claim.documentId===settlement.documentId&&claim.uuid===settlement.uuid&&claim.snapshotDigest===settlement.snapshotDigest&&claim.net===allocation.net&&claim.vat===allocation.vat&&same(balance,s)&&balance.originalDocumentId===receipt.id&&balance.binding?.uuid===posting.uuid&&balance.binding?.snapshotDigest===posting.snapshotDigest&&balance.binding?.resultDigest===posting.evidenceDigest&&HEX.test(balance.binding.artifactDigest)&&balance.cap?.net===receipt.fiscalAdvance.net&&balance.cap?.vat===receipt.fiscalAdvance.vat&&cents(balance.reserved.net)<=cents(balance.cap.net)&&cents(balance.reserved.vat)<=cents(balance.cap.vat)&&cents(balance.reserved.net)>=cents(allocation.net)&&cents(balance.reserved.vat)>=cents(allocation.vat),'FISCAL_ADVANCE_BALANCE_INVALID');
}
export async function planAdvanceCommercial(db,tx,s,source,p,a,m,model){
 const doc=p.document,v=p.review.scenario,base=simulationBase(s),payload=source.payload;
 need(!doc.fiscalAdvance&&v&&['advance-receipt','advance-settlement'].includes(v.kind)&&doc.currency==='SAR'&&doc.role==='standard');
 if(v.kind==='advance-receipt'){
  need(model.kind==='prepayment'&&v.gross===model.gross&&v.receivedAt===doc.issueDate&&doc.items.every(l=>l.stockTreatment==='non-stock')&&HEX.test(v.evidenceDigest));
  const proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+v.evidenceDigest)));
  const claim=data(await tx.get(db.doc('fiscalPrivateV1/'+s.accountUid+'/scenarioClaims/'+v.evidenceDigest)));
  need(same(claim,s)&&claim.state==='reserved'&&claim.kind==='advance-receipt'&&claim.documentId===doc.id&&claim.uuid===a.record.uuid&&claim.snapshotDigest===a.record.snapshotDigest&&claim.gross===model.gross);
  const binding={kind:'receipt',net:model.net,vat:model.vat,gross:model.gross,evidenceDigest:v.evidenceDigest,treasuryEntryId:proof?.treasuryEntryId};
  const cash=await verifyReceiptCash(db,tx,s,payload,doc,binding,proof,v.treasuryEntryDigest);need(cash.account.active===true&&v.treasuryEntryId===binding.treasuryEntryId);
  const reserved=data(await tx.get(reservationIndex(db,s,binding.treasuryEntryId)));
  need(same(reserved,s)&&reserved.documentId===doc.id&&reserved.uuid===a.record.uuid&&reserved.snapshotDigest===a.record.snapshotDigest&&reserved.evidenceDigest===binding.evidenceDigest&&reserved.treasuryEntryId===binding.treasuryEntryId&&reserved.cashDigest===cash.cashDigest,'FISCAL_ADVANCE_CASH_RESERVATION_REQUIRED');
  const ref=receiptIndex(db,s,binding.treasuryEntryId);need(!(await tx.get(ref)).exists,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
  const index={...s,documentId:doc.id,uuid:a.record.uuid,evidenceDigest:binding.evidenceDigest,treasuryEntryId:binding.treasuryEntryId,cashDigest:cash.cashDigest};
  return {binding,write(tx){tx.create(ref,index);}};
 }
 need(model.kind==='invoice'&&m.candidate.prepaymentContext?.kind==='adjustment'&&Array.isArray(v.allocations)&&v.allocations.length>0&&v.allocations.length<=10);
 const seen=new Set(),allocations=[];let net=0n,vat=0n;
 for(const alloc of v.allocations){
   need(ID.test(alloc.documentId)&&!seen.has(alloc.documentId)&&alloc.documentId!==doc.id);seen.add(alloc.documentId);
   const d=payload.documents.find(x=>x.id===alloc.documentId),posting=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+alloc.documentId)));
   need(d?.fiscalAdvance?.kind==='receipt'&&d.status==='final'&&d.lifecycleStatus==='active'&&d.branchId===doc.branchId&&d.workspaceId===doc.workspaceId&&d.currency===doc.currency&&d.issueDate<=doc.issueDate&&d.customerSnapshot?.sourceCustomerId===doc.customerSnapshot?.sourceCustomerId&&same(posting,s)&&posting.commercialPosted===true&&posting.amount?.kind==='prepayment'&&posting.finalFingerprint===reviewDigest(d)&&posting.sourceId===d.id);
   const original=await createAcceptedFiscalReader(db)(s,d.id,tx);need(original.record.uuid===posting.uuid&&original.record.resultDigest===posting.evidenceDigest&&original.record.snapshotDigest===posting.snapshotDigest);
   const claim=data(await tx.get(db.doc(base+'/advanceBalances/'+d.id+'/reservations/'+doc.id))),balance=data(await tx.get(db.doc(base+'/advanceBalances/'+d.id)));
   assertAdvanceAllocationClaim(s,d,posting,{documentId:doc.id,uuid:a.record.uuid,snapshotDigest:a.record.snapshotDigest},claim,balance,alloc);
   const proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+d.fiscalAdvance.evidenceDigest))),index=data(await tx.get(receiptIndex(db,s,d.fiscalAdvance.treasuryEntryId)));
   need(same(index,s)&&index.documentId===d.id&&index.uuid===posting.uuid&&index.evidenceDigest===d.fiscalAdvance.evidenceDigest&&index.treasuryEntryId===d.fiscalAdvance.treasuryEntryId);
   await verifyReceiptCash(db,tx,s,payload,d,d.fiscalAdvance,proof,index.cashDigest);
   const n=cents(alloc.net),vv=cents(alloc.vat);need(n>0n);net+=n;vat+=vv;allocations.push({receiptId:d.id,net:alloc.net,vat:alloc.vat,gross:money(n+vv)});
 }
 need(net<=cents(model.net)&&vat<=cents(model.vat)&&cents(model.recognizedNet)===cents(model.net)-net&&cents(model.recognizedVat)===cents(model.vat)-vat&&money(net+vat)===m.candidate.prepaymentContext.prepaid&&money(cents(model.gross)-net-vat)===m.candidate.prepaymentContext.payable);
 return {binding:{kind:'settlement',net:money(net),vat:money(vat),gross:money(net+vat),evidenceDigest:a.record.resultDigest,allocations},write(){}};
}
// Resolve only a private, revision-bound refund instruction against the
// current published wallet. Review and issuance both recheck the exact cash.
export async function resolveAdvanceRefundEvidence(db,tx,s,d,instruction){
 const base=simulationBase(s);
 need(instruction?.kind==='advance-refund'&&Object.keys(instruction).length===2&&typeof instruction.evidenceDigest==='string'&&HEX.test(instruction.evidenceDigest)&&d.role==='credit-note'&&d.currency==='SAR'&&d.status==='draft'&&d.lifecycleStatus==='active'&&typeof d.creditForId==='string'&&ID.test(d.creditForId)&&d.creditForId!==d.id&&d.items.length>0&&d.items.every(l=>l.stockTreatment==='non-stock'&&!l.savedItemId));
 const source=await currentPublishedFiscalSource(db,tx,s,d.id),meta=validateMeta(source.meta);need(meta.chunkCount<=24&&(!source.closedThrough||d.issueDate>source.closedThrough));
 const chunks=[];for(let i=0;i<meta.chunkCount;i++)chunks.push(data(await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')))));
 const payload=decodeWorkspace(meta,chunks),drafts=payload.documents.filter(x=>x.id===d.id),receipts=payload.documents.filter(x=>x.id===d.creditForId);
 need(drafts.length===1&&equal(drafts[0],d)&&receipts.length===1,'FISCAL_ADVANCE_SOURCE_CHANGED');
 const receipt=receipts[0],binding=receipt.fiscalAdvance;
 need(binding?.kind==='receipt'&&receipt.status==='final'&&receipt.lifecycleStatus==='active'&&receipt.kind==='invoice'&&receipt.role==='standard'&&receipt.workspaceId===d.workspaceId&&receipt.branchId===d.branchId&&receipt.currency===d.currency&&receipt.number===d.creditForNumber&&receipt.issueDate<=d.issueDate&&receipt.customerSnapshot?.sourceCustomerId===d.customerSnapshot?.sourceCustomerId&&receipt.customerSnapshot?.vatTaxNumber===d.customerSnapshot?.vatTaxNumber&&receipt.companySnapshot?.vatNumber===d.companySnapshot?.vatNumber);
 const posting=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+receipt.id)));
 need(same(posting,s)&&posting.commercialPosted===true&&posting.source==='sale'&&posting.key==='sale-'+receipt.id&&posting.sourceId===receipt.id&&posting.finalFingerprint===reviewDigest(receipt)&&equal(posting.advanceBinding,binding)&&posting.amount?.kind==='prepayment'&&posting.amount.net===binding.net&&posting.amount.vat===binding.vat&&posting.amount.gross===binding.gross);
 const index=data(await tx.get(receiptIndex(db,s,binding.treasuryEntryId))),depositProof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+binding.evidenceDigest)));
 need(same(index,s)&&index.documentId===receipt.id&&index.uuid===posting.uuid&&index.evidenceDigest===binding.evidenceDigest&&index.treasuryEntryId===binding.treasuryEntryId&&HEX.test(index.cashDigest));
 await verifyReceiptCash(db,tx,s,payload,receipt,binding,depositProof,index.cashDigest);
 const proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+instruction.evidenceDigest)));
 need(same(proof,s)&&proof.state==='approved'&&proof.kind==='advance-refund'&&proof.documentId===d.id&&proof.documentRevision===d.revision&&proof.receiptId===receipt.id&&proof.evidenceDigest===instruction.evidenceDigest&&proof.currency==='SAR'&&proof.customerId===d.customerSnapshot?.sourceCustomerId&&proof.creditFingerprint===reviewDigest(d)&&proof.receiptFingerprint===reviewDigest(receipt)&&cents(proof.net)>0n&&cents(proof.net)+cents(proof.vat)===cents(proof.gross)&&cents(proof.net)<=cents(binding.net)&&cents(proof.vat)<=cents(binding.vat)&&typeof proof.treasuryEntryId==='string'&&ID.test(proof.treasuryEntryId)&&HEX.test(proof.cashDigest)&&typeof proof.bytes==='string'&&proof.bytes.length<=700000);
 const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&createHash('sha256').update(bytes).digest('hex')===proof.evidenceDigest);
 const entries=payload.treasuryEntries.filter(x=>x.id===proof.treasuryEntryId);need(entries.length===1);const cash=entries[0];
 need(cash.type==='withdrawal'&&cash.sourceType==='manual'&&!cash.sourceId&&!cash.toAccountId&&!cash.voidedAt&&typeof cash.fromAccountId==='string'&&ID.test(cash.fromAccountId)&&cash.workspaceId===d.workspaceId&&cash.branchId===d.branchId&&cash.currency===d.currency&&cash.date===d.issueDate&&cash.amount===proof.gross&&reviewDigest(advanceCashFacts(cash))===proof.cashDigest);
 const accounts=payload.treasuryAccounts.filter(x=>x.id===cash.fromAccountId);need(accounts.length===1&&accounts[0].workspaceId===d.workspaceId&&accounts[0].branchId===d.branchId&&accounts[0].currency===d.currency&&accounts[0].active===true);
 return {scenario:{...instruction,receiptId:receipt.id,net:proof.net,vat:proof.vat,gross:proof.gross,treasuryEntryId:proof.treasuryEntryId,cashDigest:proof.cashDigest},posting};
}
// Only trusted private evidence and the accepted authority result can
// authorize a refund. Existing cash is claimed, never written a second time.
// The same planner is replayed for reports, with the original approved draft.
export async function planAdvanceRefundCommercial(db,tx,s,source,p,a,m,model,{historical=false}={}){
 const d=p.document,v=p.review.scenario,base=simulationBase(s),payload=source.payload;
 need(v?.kind==='advance-refund'&&d.role==='credit-note'&&d.currency==='SAR'&&p.review.invoiceType==='standard'&&a.record.status==='cleared'&&a.record.mode==='clearance'&&model.kind==='credit-note'&&m.invoice.kind==='credit-note'&&d.items.every(l=>l.stockTreatment==='non-stock'&&!l.savedItemId)&&p.review.originalDocumentId===d.creditForId&&ID.test(d.creditForId)&&HEX.test(v.evidenceDigest));
 const matches=payload.documents.filter(x=>x.id===d.creditForId);need(matches.length===1);const receipt=matches[0];
 need(receipt.fiscalAdvance?.kind==='receipt'&&receipt.id===v.receiptId);
 const posting=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+receipt.id)));
 const original=await createAcceptedFiscalReader(db)(s,receipt.id,tx);
 need(original.record.status==='cleared'&&original.record.uuid===p.review.original?.uuid&&original.record.uuid===posting?.uuid&&original.record.snapshotDigest===posting.snapshotDigest&&original.record.resultDigest===posting.evidenceDigest);
 const originalIndex=data(await tx.get(receiptIndex(db,s,receipt.fiscalAdvance.treasuryEntryId)));
 const depositProof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+receipt.fiscalAdvance.evidenceDigest)));
 await verifyReceiptCash(db,tx,s,payload,receipt,receipt.fiscalAdvance,depositProof,originalIndex?.cashDigest);
 const path=base+'/advanceBalances/'+receipt.id;
 const capacity=data(await tx.get(db.doc(path))),reservation=data(await tx.get(db.doc(path+'/reservations/'+d.id)));
 need(capacity?.binding?.artifactDigest===original.record.clearedArtifactDigest&&capacity.binding.version===original.record.version);
 const proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+v.evidenceDigest)));
 need(same(proof,s)&&proof.state==='approved'&&proof.kind==='advance-refund'&&proof.documentId===d.id&&proof.documentRevision===d.revision&&proof.receiptId===receipt.id&&proof.evidenceDigest===v.evidenceDigest&&proof.currency==='SAR'&&proof.customerId===d.customerSnapshot?.sourceCustomerId&&proof.creditFingerprint===reviewDigest(d)&&proof.receiptFingerprint===reviewDigest(receipt)&&proof.net===model.net&&proof.vat===model.vat&&proof.gross===model.gross&&proof.treasuryEntryId===v.treasuryEntryId&&proof.cashDigest===v.cashDigest&&typeof proof.bytes==='string'&&proof.bytes.length<=700000);
 const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&createHash('sha256').update(bytes).digest('hex')===v.evidenceDigest);
 const reserved=data(await tx.get(reservationIndex(db,s,proof.treasuryEntryId))),scenarioClaim=data(await tx.get(db.doc('fiscalPrivateV1/'+s.accountUid+'/scenarioClaims/'+v.evidenceDigest)));
 need(same(reserved,s)&&reserved.kind==='advance-refund'&&reserved.receiptId===receipt.id&&reserved.documentId===d.id&&reserved.uuid===a.record.uuid&&reserved.snapshotDigest===a.record.snapshotDigest&&reserved.evidenceDigest===v.evidenceDigest&&reserved.treasuryEntryId===proof.treasuryEntryId&&reserved.cashDigest===proof.cashDigest);
 need(same(scenarioClaim,s)&&scenarioClaim.kind==='advance-refund'&&scenarioClaim.state==='reserved'&&scenarioClaim.documentId===d.id&&scenarioClaim.uuid===a.record.uuid&&scenarioClaim.snapshotDigest===a.record.snapshotDigest&&scenarioClaim.gross===model.gross);
 const cashRef=settlementCashClaim(db,s,proof.treasuryEntryId),cash=data(await tx.get(cashRef));
 need(!(await tx.get(receiptIndex(db,s,proof.treasuryEntryId))).exists);
 const cashClaim={...s,key:'sale-'+d.id,kind:'advance-refund',cashDigest:proof.cashDigest};
 need(historical?equal(cash,cashClaim):!cash,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
 const creditAcceptance={...s,kind:'credit-note',status:a.record.status,documentId:d.id,sourceFingerprint:reviewDigest(d),uuid:a.record.uuid,originalUuid:p.review.original.uuid,resultDigest:a.record.resultDigest,snapshotDigest:a.record.snapshotDigest,category:p.review.taxCategory,rate:p.review.taxRate,net:model.net,vat:model.vat,gross:model.gross};
 const review={...s,state:'approved',kind:'advance-refund',receiptId:receipt.id,creditId:d.id,creditResultDigest:a.record.resultDigest,receiptFingerprint:proof.receiptFingerprint,creditFingerprint:proof.creditFingerprint,net:proof.net,vat:proof.vat,gross:proof.gross,evidenceDigest:v.evidenceDigest,treasuryEntryId:proof.treasuryEntryId,cashDigest:proof.cashDigest};
 const result=planCustomerAdvanceRefund({scope:s,receipt,receiptPosting:posting,receiptCashClaim:originalIndex,credit:d,creditAcceptance,review,capacity,reservation,treasuryEntries:payload.treasuryEntries,treasuryAccounts:payload.treasuryAccounts,through:d.issueDate,closedThrough:historical?null:source.closedThrough});
 const withdrawal=payload.treasuryEntries.find(x=>x.id===result.treasuryEntryId);
 if(!historical)need(payload.treasuryAccounts.find(x=>x.id===withdrawal.fromAccountId)?.active===true);
 const binding={kind:'refund',net:result.net,vat:result.vat,gross:result.gross,evidenceDigest:result.evidenceDigest,receiptId:result.receiptId,treasuryEntryId:result.treasuryEntryId,resultDigest:result.resultDigest,cashDigest:result.cashDigest};
 return {binding,lines:result.lines,write(tx){need(!historical);tx.create(cashRef,cashClaim);}};
}
export async function assertAdvanceContinuity(db,tx,{accountUid,workspaceId},before,candidate){
 const priorCash=new Map((before.treasuryEntries??[]).filter(e=>e.workspaceId===workspaceId).map(e=>[e.id,e])),nextCash=new Map((candidate.treasuryEntries??[]).filter(e=>e.workspaceId===workspaceId).map(e=>[e.id,e]));
 const changed=[...priorCash].filter(([id,e])=>!nextCash.has(id)||!equal(advanceCashFacts(e),advanceCashFacts(nextCash.get(id))));
 need(changed.length<=100,'FISCAL_CHANGE_LIMIT');
 for(const [id] of changed){need(ID.test(id));const claim=await tx.get(reservationIndex(db,{accountUid},id));need(!claim.exists,'FISCAL_ADVANCE_CASH_LOCKED');}
 // A reserved deposit also binds its treasury account identity. Otherwise an
 // account can be removed or moved without editing the protected deposit.
 const priorAccounts=(before.treasuryAccounts??[]).filter(x=>x.workspaceId===workspaceId);
 const nextAccounts=(candidate.treasuryAccounts??[]);
 const changedDestinations=new Set(priorAccounts.filter(a=>{
   const matches=nextAccounts.filter(x=>x.id===a.id);
   return matches.length!==1||matches[0].workspaceId!==a.workspaceId||matches[0].branchId!==a.branchId||matches[0].currency!==a.currency||a.active===true&&matches[0].active!==true;
 }).map(a=>a.id));
 const impacted=[...priorCash.values()].filter(e=>e.type==='deposit'&&changedDestinations.has(e.toAccountId)||e.type==='withdrawal'&&changedDestinations.has(e.fromAccountId));
 need(impacted.length<=100,'FISCAL_CHANGE_LIMIT');
 for(const e of impacted){
   need(ID.test(e.id));
   const claim=await tx.get(reservationIndex(db,{accountUid},e.id));
   if(!claim.exists)continue;
   const accountId=e.type==='deposit'?e.toAccountId:e.fromAccountId;
   const old=priorAccounts.find(x=>x.id===accountId),matches=nextAccounts.filter(x=>x.id===accountId);
   need(old&&matches.length===1&&matches[0].workspaceId===old.workspaceId&&matches[0].branchId===old.branchId&&matches[0].currency===old.currency,'FISCAL_ADVANCE_CASH_LOCKED');
   // A posted historical receipt may keep an inactive account, but an
   // unresolved reservation must still be able to finalize its receipt.
   const posted=await tx.get(e.type==='deposit'?receiptIndex(db,{accountUid},e.id):settlementCashClaim(db,{accountUid},e.id));
   need(posted.exists||matches[0].active===true,'FISCAL_ADVANCE_CASH_LOCKED');
 }
 const beforeDocs=(before.documents??[]).filter(d=>d.workspaceId===workspaceId&&d.fiscalAdvance!==undefined),afterDocs=(candidate.documents??[]).filter(d=>d.workspaceId===workspaceId&&d.fiscalAdvance!==undefined);
 need(beforeDocs.length===afterDocs.length&&beforeDocs.every(d=>equal(d,afterDocs.find(x=>x.id===d.id))),'FISCAL_ADVANCE_LOCKED');
 for(const d of beforeDocs){const b=d.fiscalAdvance;if(!['receipt','refund'].includes(b.kind))continue;const a=(before.treasuryEntries??[]).find(e=>e.id===b.treasuryEntryId),z=(candidate.treasuryEntries??[]).find(e=>e.id===b.treasuryEntryId);need(a&&z&&equal(advanceCashFacts(a),advanceCashFacts(z)),'FISCAL_ADVANCE_CASH_LOCKED');}
 if(afterDocs.length){const [{assertFiscalAdvanceIntegrity},{calculateTotals}]=await Promise.all(['advance','money'].map(loadCompiledFinance));assertFiscalAdvanceIntegrity(candidate,d=>calculateTotals(d.items,d.adjustments));}
}
export async function verifyAdvanceReport(db,tx,s,payload,through,{mapCommercialFiscalInvoice}={}){
 const docs=payload.documents.filter(d=>d.workspaceId===s.workspaceId&&d.fiscalAdvance!==undefined),base=simulationBase(s);need(docs.length<=200);
 if(!docs.length)return [];
 const [{assertFiscalAdvanceIntegrity,fiscalAdvanceBalances},{calculateTotals}]=await Promise.all(['advance','money'].map(loadCompiledFinance));assertFiscalAdvanceIntegrity(payload,d=>calculateTotals(d.items,d.adjustments));
 const postings=new Map(),used=new Map();
 for(const d of docs.filter(d=>d.issueDate<=through)){
   const posting=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+d.id))),b=d.fiscalAdvance;
   need(posting&&posting.accountUid===s.accountUid&&posting.workspaceId===s.workspaceId&&posting.environment==='simulation'&&posting.sourceId===d.id&&posting.commercialPosted===true&&posting.finalFingerprint===reviewDigest(d)&&equal(posting.advanceBinding,b));
   postings.set(d.id,posting);
   const issuerScope={...s,egsId:posting.egsId};
   if(b.kind==='receipt'){
     const idx=data(await tx.get(receiptIndex(db,s,b.treasuryEntryId))),proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+b.evidenceDigest)));
     need(same(idx,issuerScope)&&idx.documentId===d.id&&idx.uuid===posting.uuid&&idx.evidenceDigest===b.evidenceDigest&&idx.treasuryEntryId===b.treasuryEntryId);
     await verifyReceiptCash(db,tx,issuerScope,payload,d,b,proof,idx.cashDigest);
   }else if(b.kind==='refund'){
     need(typeof mapCommercialFiscalInvoice==='function');
     const accepted=await createAcceptedFiscalReader(db)(issuerScope,d.id,tx),intent=readApprovedIntent(await tx.get(db.doc(base+'/issueIntents/'+d.id)),issuerScope,d.id),p=intent.payload;
     need(accepted.snapshot.equals(intent.bytes)&&accepted.record.snapshotDigest===posting.snapshotDigest&&accepted.record.resultDigest===posting.evidenceDigest&&accepted.record.uuid===posting.uuid&&reviewDigest(p.document)===posting.sourceFingerprint);
     const m=mapCommercialFiscalInvoice({scope:issuerScope,document:p.document,issuer:p.issuer,review:p.review,identity:{documentId:d.id,uuid:accepted.record.uuid,icv:accepted.record.icv,previousInvoiceHash:accepted.record.previousInvoiceHash,generatedAt:accepted.record.generatedAt}});
     const t=m.candidate.totals,model={kind:m.invoice.kind,net:t.taxExclusiveTotal,vat:t.vatTotal,gross:t.taxInclusiveTotal};
     const plan=await planAdvanceRefundCommercial(db,tx,issuerScope,{payload},p,accepted,m,model,{historical:true});
     need(equal(b,plan.binding)&&equal(posting.amount.lines,plan.lines)&&posting.amount.vatSar===b.vat&&posting.amount.recognizedNet===b.net&&posting.amount.recognizedVat===b.vat);
   }else need(b.evidenceDigest===posting.evidenceDigest);
 }
 for(const d of docs.filter(d=>d.issueDate<=through&&['settlement','refund'].includes(d.fiscalAdvance.kind))){
   const posting=postings.get(d.id),issuerScope={...s,egsId:posting.egsId};
   const refund=d.fiscalAdvance.kind==='refund';
   for(const a of refund?[d.fiscalAdvance]:d.fiscalAdvance.allocations){
     const receipt=docs.find(x=>x.id===a.receiptId),original=postings.get(a.receiptId);
     need(receipt&&original&&receipt.fiscalAdvance.kind==='receipt');
     const path=base+'/advanceBalances/'+a.receiptId;
     const balance=data(await tx.get(db.doc(path))),claim=data(await tx.get(db.doc(path+'/reservations/'+d.id)));
     if(!refund)assertAdvanceAllocationClaim(issuerScope,receipt,original,{documentId:d.id,uuid:posting.uuid,snapshotDigest:posting.snapshotDigest},claim,balance,a);
     else need(same(claim,issuerScope)&&claim.kind==='advance-refund'&&same(balance,issuerScope));
     const prior=used.get(a.receiptId)??{net:0n,vat:0n},next={net:prior.net+cents(a.net),vat:prior.vat+cents(a.vat)};
     need(next.net<=cents(balance.reserved.net)&&next.vat<=cents(balance.reserved.vat),'FISCAL_ADVANCE_BALANCE_INVALID');
     used.set(a.receiptId,next);
   }
 }
 return fiscalAdvanceBalances(docs,through);
}
