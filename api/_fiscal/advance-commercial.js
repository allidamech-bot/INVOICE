import {settlementCashClaim} from './supplier-settlement-posting.mjs';
import {reviewDigest,currentPublishedFiscalSource} from './commercial-source.js';
import {validateMeta,decodeWorkspace} from '../_accounting/period-format.js';
import {simulationBase} from './simulation-scope.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
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
   need(same(claim,s)&&claim.state==='reserved'&&claim.documentId===doc.id&&claim.uuid===a.record.uuid&&claim.snapshotDigest===a.record.snapshotDigest&&claim.net===alloc.net&&claim.vat===alloc.vat&&same(balance,s)&&balance.originalDocumentId===d.id&&balance.binding?.uuid===posting.uuid&&balance.binding?.snapshotDigest===posting.snapshotDigest&&balance.binding?.resultDigest===posting.evidenceDigest&&balance.cap?.net===d.fiscalAdvance.net&&balance.cap?.vat===d.fiscalAdvance.vat&&cents(balance.reserved.net)<=cents(balance.cap.net)&&cents(balance.reserved.vat)<=cents(balance.cap.vat)&&cents(balance.reserved.net)>=cents(alloc.net)&&cents(balance.reserved.vat)>=cents(alloc.vat));
   const proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+d.fiscalAdvance.evidenceDigest))),index=data(await tx.get(receiptIndex(db,s,d.fiscalAdvance.treasuryEntryId)));
   need(same(index,s)&&index.documentId===d.id&&index.uuid===posting.uuid&&index.evidenceDigest===d.fiscalAdvance.evidenceDigest&&index.treasuryEntryId===d.fiscalAdvance.treasuryEntryId);
   await verifyReceiptCash(db,tx,s,payload,d,d.fiscalAdvance,proof,index.cashDigest);
   const n=cents(alloc.net),vv=cents(alloc.vat);need(n>0n);net+=n;vat+=vv;allocations.push({receiptId:d.id,net:alloc.net,vat:alloc.vat,gross:money(n+vv)});
 }
 need(net<=cents(model.net)&&vat<=cents(model.vat)&&cents(model.recognizedNet)===cents(model.net)-net&&cents(model.recognizedVat)===cents(model.vat)-vat&&money(net+vat)===m.candidate.prepaymentContext.prepaid&&money(cents(model.gross)-net-vat)===m.candidate.prepaymentContext.payable);
 return {binding:{kind:'settlement',net:money(net),vat:money(vat),gross:money(net+vat),evidenceDigest:a.record.resultDigest,allocations},write(){}};
}
export async function assertAdvanceContinuity(db,tx,{accountUid,workspaceId},before,candidate){
 const priorCash=new Map((before.treasuryEntries??[]).filter(e=>e.workspaceId===workspaceId).map(e=>[e.id,e])),nextCash=new Map((candidate.treasuryEntries??[]).filter(e=>e.workspaceId===workspaceId).map(e=>[e.id,e]));
 const changed=[...priorCash].filter(([id,e])=>!nextCash.has(id)||!equal(advanceCashFacts(e),advanceCashFacts(nextCash.get(id))));
 need(changed.length<=100,'FISCAL_CHANGE_LIMIT');
 for(const [id] of changed){need(ID.test(id));const claim=await tx.get(reservationIndex(db,{accountUid},id));need(!claim.exists,'FISCAL_ADVANCE_CASH_LOCKED');}
 const beforeDocs=(before.documents??[]).filter(d=>d.workspaceId===workspaceId&&d.fiscalAdvance!==undefined),afterDocs=(candidate.documents??[]).filter(d=>d.workspaceId===workspaceId&&d.fiscalAdvance!==undefined);
 need(beforeDocs.length===afterDocs.length&&beforeDocs.every(d=>equal(d,afterDocs.find(x=>x.id===d.id))),'FISCAL_ADVANCE_LOCKED');
 for(const d of beforeDocs){const b=d.fiscalAdvance;if(b.kind!=='receipt')continue;const a=(before.treasuryEntries??[]).find(e=>e.id===b.treasuryEntryId),z=(candidate.treasuryEntries??[]).find(e=>e.id===b.treasuryEntryId);need(a&&z&&equal(advanceCashFacts(a),advanceCashFacts(z)),'FISCAL_ADVANCE_CASH_LOCKED');}
 if(afterDocs.length){const [{assertFiscalAdvanceIntegrity},{calculateTotals}]=await Promise.all(['advance','money'].map(loadCompiledFinance));assertFiscalAdvanceIntegrity(candidate,d=>calculateTotals(d.items,d.adjustments));}
}
export async function verifyAdvanceReport(db,tx,s,payload,through){
 const docs=payload.documents.filter(d=>d.workspaceId===s.workspaceId&&d.fiscalAdvance!==undefined),base=simulationBase(s);need(docs.length<=200);
 if(!docs.length)return [];
 const [{assertFiscalAdvanceIntegrity,fiscalAdvanceBalances},{calculateTotals}]=await Promise.all(['advance','money'].map(loadCompiledFinance));assertFiscalAdvanceIntegrity(payload,d=>calculateTotals(d.items,d.adjustments));
 for(const d of docs.filter(d=>d.issueDate<=through)){
   const posting=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+d.id))),b=d.fiscalAdvance;
   need(posting&&posting.accountUid===s.accountUid&&posting.workspaceId===s.workspaceId&&posting.environment==='simulation'&&posting.sourceId===d.id&&posting.commercialPosted===true&&posting.finalFingerprint===reviewDigest(d)&&equal(posting.advanceBinding,b));
   const issuerScope={...s,egsId:posting.egsId};
   if(b.kind==='receipt'){
     const idx=data(await tx.get(receiptIndex(db,s,b.treasuryEntryId))),proof=data(await tx.get(db.doc(base+'/scenarioEvidence/'+b.evidenceDigest)));
     need(same(idx,issuerScope)&&idx.documentId===d.id&&idx.uuid===posting.uuid&&idx.evidenceDigest===b.evidenceDigest&&idx.treasuryEntryId===b.treasuryEntryId);
     await verifyReceiptCash(db,tx,issuerScope,payload,d,b,proof,idx.cashDigest);
   }else need(b.evidenceDigest===posting.evidenceDigest);
 }
 return fiscalAdvanceBalances(docs,through);
}
