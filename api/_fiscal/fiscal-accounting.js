import {projectSupplierAPJournal} from './supplier-ap-reconciliation.mjs';
import {postSupplierSettlement as postSupplierSettlementJournal,readSupplierSettlements,assertSupplierSettlementContinuity,mergeSupplierSettlementReconciliation} from './supplier-settlement-posting.mjs';
import {planAdvanceCommercial,planAdvanceRefundCommercial,verifyAdvanceReport} from './advance-commercial.js';
import {planReviewedLotCostBridge,replayPostedCostAllocation} from './lot-cost-bridge.mjs';
import {assertFiscalCostContinuity} from './cost-continuity.js';
import {supplierSettlementTimeline,commercialFiscalPostingPolicy} from './settlement-integrity.mjs';
import {planPurchaseReturn,isFiscalPurchaseReturn} from './purchase-return.mjs';
import {inspectReturnPostings} from './return-postings.js';
import {planPurchaseCostCorrection} from './purchase-cost-correction.mjs';
import {fiscalSalesCoverage} from './fiscal-coverage.mjs';
import {stockCostCents,supplierAdjustmentProjection} from './fiscal-cost.mjs';
import {reconcileDomesticPurchase,canReplayAdjustedSupplierPayable} from './purchase-reconciliation.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {simulationBase,readSimulationContext} from './simulation-scope.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
import {readApprovedIntent} from './issue-intent.js';
import {mapCommercialFiscalInvoice} from './commercial-invoice.js';
import {currentPublishedFiscalSource,reviewDigest} from './commercial-source.js';
import {validateMeta,decodeWorkspace,encodeWorkspace} from '../_accounting/period-format.js';
import {loadCompiledFinance} from '../_accounting/compiled-finance-loader.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/,VAT=/^3[0-9]{13}3$/;
const data=s=>s.exists?s.data():null;
const need=(ok,c='FISCAL_ACCOUNTING_INVALID')=>{if(!ok)throw Error(c);};
const same=(r,s)=>r&&['accountUid','workspaceId','egsId','environment'].every(k=>r[k]===s[k]);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9][0-9]{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const money=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
const sha=v=>createHash('sha256').update(v).digest('hex');
const equal=(a,b)=>reviewDigest(a)===reviewDigest(b);
function entry(account,side,amount){return {account,side,amount:money(amount)};}
function journal(lines){const rows=lines.filter(l=>l.amount!=='0.00');let debit=0n,credit=0n;for(const l of rows){need(['debit','credit'].includes(l.side)&&cents(l.amount)>0n);if(l.side==='debit')debit+=cents(l.amount);else credit+=cents(l.amount);}need(debit===credit&&debit>0n,'FISCAL_UNBALANCED_JOURNAL');return rows;}
function reverse(lines){return lines.map(l=>({...l,side:l.side==='debit'?'credit':'debit'}));}
export function saleAccountingModel(mapped){
 const t=mapped.candidate.totals,net=cents(t.taxExclusiveTotal),vat=cents(t.vatTotal),gross=cents(t.taxInclusiveTotal),kind=mapped.invoice.kind,a=mapped.candidate.prepaymentContext;
 need(net+vat===gross&&gross>0n);
 let taxable=net,output=vat,lines;
 if(kind==='prepayment'){
   need(a?.kind==='receipt');
   lines=[entry('advance-receipt-clearing','debit',gross),entry('customer-advances','credit',net),entry('output-vat','credit',vat)];
 }else if(a?.kind==='adjustment'){
   need(kind==='invoice'&&mapped.invoice.currency==='SAR');
   let prepaidNet=0n,prepaidVat=0n;
   for(const r of a.rows){prepaidNet+=cents(r.net);prepaidVat+=cents(r.vat);}
   need(prepaidNet<=net&&prepaidVat<=vat&&prepaidNet+prepaidVat===cents(a.prepaid)&&gross-prepaidNet-prepaidVat===cents(a.payable),'FISCAL_ADVANCE_ACCOUNTING_MISMATCH');
   taxable=net-prepaidNet;output=vat-prepaidVat;
   lines=[entry('accounts-receivable','debit',cents(a.payable)),entry('customer-advances','debit',prepaidNet),entry('sales-revenue','credit',net),entry('output-vat','credit',output)];
 }else{
   lines=[entry('accounts-receivable','debit',gross),entry('sales-revenue','credit',net),entry('output-vat','credit',vat)];
   if(kind==='credit-note')lines=reverse(lines);
 }
 const sar=mapped.candidate.fiscalContext?.vatSar??money(output);
 return {kind,net:money(net),vat:money(vat),gross:money(gross),recognizedNet:money(taxable),recognizedVat:money(output),vatSar:sar,lines:journal(lines)};
}
export function purchaseAccountingModel(record){
 const treatment=record.treatment??'domestic';
 if(treatment!=='domestic'){
   const net=cents(record.net),vat=cents(record.vat),deductible=cents(record.deductibleVat);
   need(['import','reverse-charge'].includes(treatment)&&record.kind==='invoice'&&record.category==='S'&&record.rate==='15'&&net>0n&&vat===(net*15n+50n)/100n&&deductible<=vat&&cents(record.gross)===net+vat,'FISCAL_PURCHASE_TAX_INVALID');
   // Supplier base is already recorded commercially. Imported VAT is payable
   // to customs; reverse charge simultaneously recognizes self-assessed VAT.
   const lines=[entry('purchase-tax-cost','debit',vat-deductible),entry('input-vat','debit',deductible),entry(treatment==='import'?'customs-vat-clearing':'output-vat','credit',vat)];
   return {kind:record.kind,treatment,net:record.net,vat:record.vat,gross:record.gross,deductibleVat:record.deductibleVat,selfAssessedVat:treatment==='reverse-charge'?record.vat:'0.00',lines:journal(lines)};
 }
 const net=cents(record.net),vat=cents(record.vat),deductible=cents(record.deductibleVat),gross=cents(record.gross);
 need(net+vat===gross&&gross>0n&&deductible<=vat&&['S','Z','E','O'].includes(record.category)&&((record.category==='S'&&record.rate==='15'&&vat===(net*15n+50n)/100n)||(['Z','E','O'].includes(record.category)&&record.rate==='0'&&vat===0n)),'FISCAL_PURCHASE_TAX_INVALID');
 need(record.kind==='invoice'||record.kind==='credit-note'||record.kind==='debit-note');
 const lines=[entry('purchase-cost','debit',net+vat-deductible),entry('input-vat','debit',deductible),entry('accounts-payable','credit',gross)];
 return {kind:record.kind,treatment:'domestic',net:record.net,vat:record.vat,gross:record.gross,deductibleVat:record.deductibleVat,selfAssessedVat:'0.00',lines:journal(record.kind==='credit-note'?reverse(lines):lines)};
}
async function published(db,tx,s,id){
 const source=await currentPublishedFiscalSource(db,tx,s,id),meta=validateMeta(source.meta);
 need(meta.chunkCount<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
 const chunks=[];for(let i=0;i<meta.chunkCount;i++)chunks.push(data(await tx.get(db.doc(source.root+'/periodGenerations/'+meta.revision+'/chunks/chunk-'+meta.revision+'-'+String(i).padStart(5,'0')))));
 return {...source,payload:decodeWorkspace(meta,chunks)};
}
function validateScope(s){simulationBase(s);}
function availablePeriod(source,date){need(day(date)&&(!source.closedThrough||date>source.closedThrough),'FISCAL_PERIOD_CLOSED');}
function postingRef(db,s,key){return db.doc(simulationBase(s)+'/accountingEntries/'+key);}
function signFor(kind){return kind==='credit-note'?-1n:1n;}
async function planCommercialFinalization(db,tx,s,source,doc,model,policyMode,advance){
 const p=source.payload,final={...doc,status:'final',...(advance?{fiscalAdvance:advance.binding}:{})},before=p;
 const [{postIssuedInvoiceStock},{approvalGate},{assertCustomerCreditLimit},{assertDocumentLifecycleInvariant,createDocumentEvent},{assertInvoicePaymentInvariant},{assertClosedPeriodUnchanged,closedPeriodState},{assertPostedStockRestoreContinuity},{isNonNegativeFinancialDecimalInput}]=await Promise.all(['stock','governance','commercial','lifecycle','payments','period','backup','money'].map(loadCompiledFinance));
 // Special fiscal subtypes must never be disguised as a commercial sale.
 need(policyMode==='ordinary'&&!['prepayment','debit-note'].includes(model.kind)||policyMode==='debit-service'&&model.kind==='debit-note'&&doc.items.every(l=>l.stockTreatment==='non-stock')||policyMode==='advance-receipt'&&advance?.binding.kind==='receipt'&&model.kind==='prepayment'||policyMode==='advance-settlement'&&advance?.binding.kind==='settlement'&&model.kind==='invoice'||policyMode==='advance-refund'&&advance?.binding.kind==='refund'&&model.kind==='credit-note','FISCAL_SPECIAL_COMMERCIAL_POSTING_REQUIRED');
 const policy=approvalGate(p,{action:'issue-document',entityType:'document',entityId:doc.id,entityLabel:doc.number,entityUpdatedAt:doc.updatedAt||''});
 need(policy.allowed,'FISCAL_COMMERCIAL_APPROVAL_REQUIRED');
 assertCustomerCreditLimit(final,p.customers,p.documents,p.payments);
 const documents=p.documents.map(d=>d.id===doc.id?final:d);
 assertInvoicePaymentInvariant(final,p.payments,documents);assertDocumentLifecycleInvariant(final,documents,p.payments);
 const documentEvents=[...p.documentEvents,createDocumentEvent(final,'issued','Fiscal acceptance')];
 // Stock helper uses the active scope. Restore user's preferences afterwards.
 const working={...p,documents,documentEvents,appSettings:{...p.appSettings,activeWorkspaceId:s.workspaceId,activeBranchId:doc.branchId}};
 const result=postIssuedInvoiceStock(working,final),candidate={...result.vault,appSettings:p.appSettings};
 await assertFiscalCostContinuity(db,tx,s,before,candidate);
 need(!result.legacyDelivery,'FISCAL_HISTORICAL_DELIVERY_RECONCILIATION_REQUIRED');
 const ids=new Set(p.inventoryMovements.map(x=>x.id)),newMovements=candidate.inventoryMovements.filter(x=>!ids.has(x.id));
 let cost=0n;
 for(const m of newMovements){
   need(m.sourceId===doc.id&&m.currency===doc.currency&&typeof m.unitCost==='string'&&isNonNegativeFinancialDecimalInput(m.unitCost)&&typeof m.quantity==='string'&&m.quantity.startsWith('-'),'FISCAL_STOCK_COST_REVIEW_REQUIRED');
   cost+=stockCostCents(m.quantity.slice(1),m.unitCost);
 }
 if(advance){const [{assertFiscalAdvanceIntegrity},{calculateTotals}]=await Promise.all(['advance','money'].map(loadCompiledFinance));assertFiscalAdvanceIntegrity(candidate,d=>calculateTotals(d.items,d.adjustments));}
 const modelLines=policyMode==='advance-refund'?advance.lines:policyMode==='advance-receipt'?model.lines.map(l=>l.account==='advance-receipt-clearing'?{...l,account:'cash-bank'}:l):model.lines;
 if(policyMode==='advance-refund')need(newMovements.length===0&&cost===0n,'FISCAL_ADVANCE_REFUND_STOCK_INVALID');
 const accounting={...model,lines:journal([...modelLines,entry('cost-of-sales','debit',cost),entry('inventory','credit',cost)])};
 assertPostedStockRestoreContinuity(before,candidate);assertClosedPeriodUnchanged(before,candidate,source.control.boundaries);
 // Check retained closed report digests as well as the before/after guard.
 for(const b of source.control.boundaries){
   const r=data(await tx.get(db.doc(source.root+'/periodReports/'+b.reportId)));
   need(r?.workspaceId===b.workspaceId&&r.through===b.through&&r.sha256===sha(Buffer.from(JSON.stringify(closedPeriodState(before,b)))),'FISCAL_CLOSED_REPORT_MISMATCH');
 }
 const revision=randomBytes(16).toString('hex'),e=encodeWorkspace(candidate,revision);
 need(e.chunks.length<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
 const meta={...e.meta,parentRevision:source.meta.revision,chunkStorage:'period-generations-v1'};
 return {accounting,finalFingerprint:reviewDigest(final),stockIds:newMovements.map(m=>m.id),write(tx){
   if(advance)advance.write(tx);
   for(const chunk of e.chunks)tx.create(db.doc(source.root+'/periodGenerations/'+revision+'/chunks/chunk-'+revision+'-'+String(chunk.index).padStart(5,'0')),chunk);
   tx.create(db.doc(source.root+'/workspaceHistory/'+source.meta.revision),{...source.meta,archivedAt:e.meta.updatedAt});
   tx.update(db.doc(source.root+'/workspace/meta'),meta);
   tx.update(db.doc(source.root+'/accounting/control'),{generation:source.control.generation+1,updatedAt:e.meta.updatedAt});
 }};
}
// Private append-only VAT subledger. It is not a substitute for the existing
// commercial accounting model; commercial stock/payables publication is a
// separate verified operation, and reconciliation reports explicitly track it.
export function createFiscalAccounting({db,clock=()=>new Date().toISOString()}){
 const accepted=createAcceptedFiscalReader(db);
 async function writePosting(tx,s,key,row,uniqueKey,publish){
   const ref=postingRef(db,s,key),prior=data(await tx.get(ref)),uniqueRef=db.doc('fiscalPrivateV1/'+s.accountUid+'/accountingEvidence/'+uniqueKey),unique=data(await tx.get(uniqueRef));
   if(prior){need(equal(prior,row)&&same(unique,s)&&unique.key===key&&unique.digest===row.evidenceDigest,'FISCAL_POSTING_CONFLICT');return {status:'posted',key};}
   need(!unique,'FISCAL_POSTING_EVIDENCE_DUPLICATE');
   if(publish)publish(tx);
   tx.create(ref,row);tx.create(uniqueRef,{...s,key,digest:row.evidenceDigest});return {status:'posted',key};
 }
 async function postSale(s,id,revision){
   validateScope(s);need(typeof id==='string'&&ID.test(id)&&Number.isSafeInteger(revision)&&revision>0);
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const a=await accepted(s,id,tx),intent=readApprovedIntent(await tx.get(db.doc(simulationBase(s)+'/issueIntents/'+id)),s,id),p=intent.payload;
     need(p.document.revision===revision&&a.snapshot.equals(intent.bytes)&&a.record.snapshotDigest===intent.digest);
     const m=mapCommercialFiscalInvoice({scope:s,document:p.document,issuer:p.issuer,review:p.review,identity:{documentId:id,uuid:a.record.uuid,icv:a.record.icv,previousInvoiceHash:a.record.previousInvoiceHash,generatedAt:a.record.generatedAt}});
     const amount=saleAccountingModel(m),source=await published(db,tx,s,id),d=source.payload.documents.find(x=>x.id===id);
     const key='sale-'+id,prior=data(await tx.get(postingRef(db,s,key)));
     // Tax date is the original issue date; never move a closed transaction
     // into another accounting period merely to obtain a successful posting.
     if(!prior)availablePeriod(source,p.document.issueDate);
     if(prior){
       need(prior.snapshotDigest===a.record.snapshotDigest&&prior.evidenceDigest===a.record.resultDigest&&prior.sourceRevision===revision&&d&&reviewDigest(d)===(prior.finalFingerprint??prior.sourceFingerprint),'FISCAL_POSTING_CONFLICT');
       return writePosting(tx,s,key,prior,sha('sale:'+a.record.uuid));
     }
     need(d&&d.revision===revision&&equal(d,p.document),'FISCAL_COMMERCIAL_SOURCE_DIVERGED');
     if(p.review.originalDocumentId){
       const original=data(await tx.get(postingRef(db,s,'sale-'+p.review.originalDocumentId)));
       need(same(original,s)&&original.source==='sale'&&original.commercialPosted===true&&original.uuid===p.review.original?.uuid,'FISCAL_ORIGINAL_POSTING_REQUIRED');
     }
     if(p.review.scenario?.kind==='advance-settlement'){
       for(const allocation of p.review.scenario.allocations){
         const original=data(await tx.get(postingRef(db,s,'sale-'+allocation.documentId)));
         need(same(original,s)&&original.amount?.kind==='prepayment'&&original.source==='sale','FISCAL_ADVANCE_POSTING_REQUIRED');
       }
     }
     const scenario=p.review.scenario,advance=scenario?.kind==='advance-refund'?await planAdvanceRefundCommercial(db,tx,s,source,p,a,m,amount):['advance-receipt','advance-settlement'].includes(scenario?.kind)?await planAdvanceCommercial(db,tx,s,source,p,a,m,amount):null;
     const policyMode=advance?scenario.kind:commercialFiscalPostingPolicy(d,amount,scenario);
     const compatibleCost=d.currency==='SAR'||d.items.every(line=>line.stockTreatment==='non-stock'||(line.stockTreatment==='tracked'&&source.payload.savedItems.some(item=>item.id===line.savedItemId&&item.lastCostCurrency===d.currency)));
     const plan=policyMode!=='private-only'&&compatibleCost?await planCommercialFinalization(db,tx,s,source,d,amount,policyMode,advance):null;
     const row={...s,key,source:'sale',sourceId:id,sourceRevision:revision,documentNumber:p.document.number,issueDate:p.document.issueDate,taxDate:p.document.issueDate,currency:p.document.currency,category:p.review.taxCategory,rate:p.review.taxRate,counterpartyVat:p.review.buyer?.vatNumber??null,issuerVat:p.issuer.vatNumber,originalId:p.review.originalDocumentId??null,uuid:a.record.uuid,evidenceDigest:a.record.resultDigest,snapshotDigest:a.record.snapshotDigest,amount:plan?.accounting??amount,sourceFingerprint:reviewDigest(p.document),finalFingerprint:plan?.finalFingerprint??null,stockIds:plan?.stockIds??[],commercialPosted:!!plan,...(advance?{advanceBinding:advance.binding}:{})};
     // Preserve the original immutable invoice even if the current draft is
     // missing or edited: posting is blocked, never silently reconstructed.
     need(d&&d.revision===revision&&equal(d,p.document),'FISCAL_COMMERCIAL_SOURCE_DIVERGED');
     return writePosting(tx,s,key,row,sha('sale:'+a.record.uuid),plan?.write);
   });
 }
 async function postPurchase(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   const {purchaseTotals,purchaseFinancialTotals,purchaseAccountingIsValid}=await loadCompiledFinance('operations');
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,id),matches=source.payload.purchases.filter(p=>p.id===id);
     need(matches.length===1);const p=matches[0],approval=data(await tx.get(db.doc(base+'/purchaseVatReviews/'+id)));
     need(p.workspaceId===s.workspaceId&&p.status==='posted'&&p.currency==='SAR'&&purchaseAccountingIsValid(p)&&VAT.test(p.supplierSnapshot?.vatTaxNumber??'')&&same(approval,s)&&approval.state==='approved'&&approval.purchaseId===id&&approval.sourceFingerprint===reviewDigest(p)&&approval.supplierVat===p.supplierSnapshot.vatTaxNumber&&VAT.test(approval.issuerVat)&&HEX.test(approval.evidenceDigest)&&approval.kind==='invoice'&&p.purchaseTax?.mode!=='ordinary'&&approval.documentNumber===(p.purchaseTax?.mode==='tax'?p.purchaseTax.invoiceReference.trim():p.number)&&approval.issueDate===p.date&&day(approval.taxDate)&&p.date<=approval.taxDate,'FISCAL_PURCHASE_REVIEW_REQUIRED');
     const proof=data(await tx.get(db.doc(base+'/purchaseVatEvidence/'+approval.evidenceDigest)));
     need(same(proof,s)&&proof.state==='verified'&&proof.digest===approval.evidenceDigest&&typeof proof.bytes==='string'&&proof.bytes.length<=700000,'FISCAL_PURCHASE_EVIDENCE_REQUIRED');
     const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&sha(bytes)===proof.digest,'FISCAL_PURCHASE_EVIDENCE_INVALID');
     need(equal(proof.invoice,{supplierVat:approval.supplierVat,issuerVat:approval.issuerVat,number:approval.documentNumber,issueDate:approval.issueDate,net:approval.net,vat:approval.vat,gross:approval.gross,category:approval.category,rate:approval.rate}),'FISCAL_PURCHASE_EVIDENCE_MISMATCH');
     const issuer=data(await tx.get(db.doc(base+'/egs/'+s.egsId+'/enrollment/approved')));need(same(issuer,s)&&issuer.state==='approved'&&issuer.issuer?.vatNumber===approval.issuerVat);
     need(approval.treatment===undefined||approval.treatment==='domestic','FISCAL_PURCHASE_TREATMENT_CONFLICT');
     const amount=purchaseAccountingModel({...approval,treatment:'domestic'});
     // Existing purchase totals are landed cost AND payable. Recognize only
     // when actual gross matches them, retaining a visible stock-basis mismatch
     // if deductible VAT is included in that legacy cost.
     const recorded=purchaseFinancialTotals(p);
     need(recorded.payableTotal===amount.gross,'FISCAL_PURCHASE_GROSS_MISMATCH');
     if(p.purchaseTax?.mode==='tax')need(recorded.net===amount.net&&recorded.vat===amount.vat&&recorded.deductibleVat===amount.deductibleVat&&recorded.landedTotal===money(cents(amount.gross)-cents(amount.deductibleVat)),'FISCAL_PURCHASE_RECORDED_TAX_MISMATCH');
     need(!(await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+id))).exists,'FISCAL_PURCHASE_TREATMENT_CONFLICT');
     const key='purchase-'+id,prior=data(await tx.get(postingRef(db,s,key)));if(!prior)availablePeriod(source,approval.taxDate);
     const row={...s,key,source:'purchase',sourceId:id,sourceRevision:p.updatedAt,documentNumber:p.number,issueDate:p.date,taxDate:approval.taxDate,currency:'SAR',category:approval.category,rate:approval.rate,counterpartyVat:approval.supplierVat,issuerVat:approval.issuerVat,originalId:null,uuid:null,evidenceDigest:approval.evidenceDigest,snapshotDigest:approval.sourceFingerprint,sourceFingerprint:approval.sourceFingerprint,amount};
     // Both evidence and supplier invoice identity are unique, irrespective
     // of different uploaded encodings or IDs.
     const numberRef=db.doc('fiscalPrivateV1/'+s.accountUid+'/purchaseInvoiceIndex/'+sha(JSON.stringify([approval.issuerVat,approval.supplierVat,approval.documentNumber])));
     const number=data(await tx.get(numberRef));if(number)need(same(number,s)&&number.key===key&&number.digest===row.evidenceDigest,'FISCAL_PURCHASE_INVOICE_DUPLICATE');
     else need(!prior,'FISCAL_PURCHASE_INDEX_MISSING');
     // All transaction reads before writes.
     const result=await writePosting(tx,s,key,row,sha('purchase:'+approval.evidenceDigest));
     if(!number)tx.create(numberRef,{...s,key,digest:row.evidenceDigest});return result;
   });
 }
 async function postPurchaseCost(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,id),p=source.payload.purchases.find(x=>x.id===id);
     const original=data(await tx.get(postingRef(db,s,'purchase-'+id))),review=data(await tx.get(db.doc(base+'/purchaseCostReviews/'+id)));
     need(p&&p.workspaceId===s.workspaceId&&p.status==='posted'&&same(original,s)&&original.source==='purchase'&&original.sourceId===id&&original.amount.kind==='invoice'&&original.amount.treatment==='domestic'&&original.sourceFingerprint===reviewDigest(p),'FISCAL_PURCHASE_SOURCE_MISMATCH');
     need(same(review,s)&&review.state==='approved'&&review.purchaseId===id&&review.originalEvidenceDigest===original.evidenceDigest&&review.sourceFingerprint===original.sourceFingerprint&&day(review.effectiveDate)&&review.effectiveDate>=original.taxDate&&Array.isArray(review.allocations)&&HEX.test(review.allocationDigest)&&review.allocationDigest===reviewDigest(review.allocations),'FISCAL_COST_REVIEW_REQUIRED');
     need(p.purchaseTax===undefined,'FISCAL_PURCHASE_COST_ALREADY_TYPED');
     const ref=db.doc(base+'/purchaseCostCorrections/'+id),prior=data(await tx.get(ref));
     if(prior){
       need(same(prior,s)&&prior.purchaseId===id&&prior.originalEvidenceDigest===original.evidenceDigest&&prior.sourceFingerprint===original.sourceFingerprint&&prior.reviewDigest===reviewDigest(review),'FISCAL_PURCHASE_COST_CONFLICT');
       return {status:'posted',key:'purchase-cost-'+id};
     }
     const correctionDate=clock().slice(0,10);need(review.effectiveDate===correctionDate,'FISCAL_COST_REVIEW_REQUIRED');availablePeriod(source,correctionDate);
     // Do not rewrite purchase history or post a second VAT journal.
     const args={purchase:p,amount:original.amount,allocations:review.allocations,movements:source.payload.inventoryMovements,savedItems:source.payload.savedItems};
     const tracked=new Set(p.items.filter(l=>l.savedItemId).map(l=>l.savedItemId)),history=args.movements.filter(m=>tracked.has(m.itemId)).sort((a,b)=>a.id.localeCompare(b.id));
     let plan;
     if(review.mode==='reviewed-lots'){
       need(Array.isArray(review.lotAssignments)&&HEX.test(review.lotAssignmentsDigest)&&review.lotAssignmentsDigest===reviewDigest(review.lotAssignments)&&HEX.test(review.movementDigest)&&review.movementDigest===reviewDigest(history),'FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');
       plan=planReviewedLotCostBridge({...args,assignments:review.lotAssignments,through:correctionDate});
       const map=new Map(history.map(m=>[m.id,m]));
       const lotBindings=review.lotAssignments.map(a=>({movementId:a.movementId,digest:reviewDigest(a.lots.slice().sort((x,y)=>x.receiptId.localeCompare(y.receiptId)))}));
       const previous=await tx.get(db.collection(base+'/purchaseCostCorrections').limit(201));need(previous.docs.length<=200,'FISCAL_REPORT_LIMIT');
       for(const item of previous.docs){const r=item.data();need(r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&r.environment==='simulation'&&r.purchaseId===item.id,'FISCAL_PURCHASE_COST_CONFLICT');for(const binding of r.plan?.lotBindings??[]){const next=lotBindings.find(x=>x.movementId===binding.movementId);if(next)need(next.digest===binding.digest,'FISCAL_LOT_ALLOCATION_CONFLICT');}}
       const verified=new Set();
       for(const claim of plan.claims){
         const movement=map.get(claim.movementId);need(movement,'FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');
         if(claim.account==='cost-of-sales'){
           if(!verified.has(movement.sourceId)){
             const posted=data(await tx.get(postingRef(db,s,'sale-'+movement.sourceId))),doc=source.payload.documents.find(d=>d.id===movement.sourceId);
             need(posted&&posted.accountUid===s.accountUid&&posted.workspaceId===s.workspaceId&&posted.environment==='simulation'&&posted.commercialPosted===true&&posted.currency==='SAR'&&posted.finalFingerprint===reviewDigest(doc)&&posted.stockIds.includes(movement.id),'FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');
             const verifiedIssue=await accepted({...s,egsId:posted.egsId},movement.sourceId,tx);need(verifiedIssue.record.resultDigest===posted.evidenceDigest&&verifiedIssue.record.snapshotDigest===posted.snapshotDigest,'FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');
             verified.add(movement.sourceId);
           }else{const posted=data(await tx.get(postingRef(db,s,'sale-'+movement.sourceId)));need(posted.stockIds.includes(movement.id),'FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');}
         }else{
           const {validateManualMovementEvidence}=await loadCompiledFinance('movementEvidence');validateManualMovementEvidence(movement);
         }
       }
       plan={...plan,lotBindings};
     }else{
       need(review.mode===undefined,'FISCAL_COST_REVIEW_REQUIRED');plan=planPurchaseCostCorrection(args);
       const inventory=plan.lines.filter(l=>l.itemId).reduce((sum,l)=>sum+cents(l.deductibleVat),0n);
       plan={...plan,valuationBridge:{inventoryRelief:money(inventory),cogsRelief:'0.00',expenseRelief:money(cents(plan.deductibleVat)-inventory)}};
     }
     plan={...plan,historyBindings:history.map(m=>({movementId:m.id,digest:reviewDigest(m)}))};
     need(Buffer.byteLength(JSON.stringify(plan))<=300000,'FISCAL_REPORT_LIMIT');
     const updates=new Map(plan.updates.map(x=>[x.itemId,x]));
     const candidate={...source.payload,savedItems:source.payload.savedItems.map(x=>updates.has(x.id)?{...x,lastUnitCost:updates.get(x.id).correctedUnitCost,updatedAt:clock()}:x)};
     const [{assertClosedPeriodUnchanged,closedPeriodState},{assertPostedStockRestoreContinuity}]=await Promise.all(['period','backup'].map(loadCompiledFinance));
     assertPostedStockRestoreContinuity(source.payload,candidate);assertClosedPeriodUnchanged(source.payload,candidate,source.control.boundaries);
     for(const b of source.control.boundaries){
       const r=data(await tx.get(db.doc(source.root+'/periodReports/'+b.reportId)));
       need(r?.workspaceId===b.workspaceId&&r.through===b.through&&r.sha256===sha(Buffer.from(JSON.stringify(closedPeriodState(source.payload,b)))),'FISCAL_CLOSED_REPORT_MISMATCH');
     }
     const revision=randomBytes(16).toString('hex'),encoded=encodeWorkspace(candidate,revision);need(encoded.chunks.length<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
     const meta={...encoded.meta,parentRevision:source.meta.revision,chunkStorage:'period-generations-v1'};
     // Write-once allocation and catalog basis publication in the same CAS.
     tx.create(ref,{...s,purchaseId:id,originalEvidenceDigest:original.evidenceDigest,sourceFingerprint:original.sourceFingerprint,reviewDigest:reviewDigest(review),effectiveDate:correctionDate,committedAt:clock(),sourceRevision:source.meta.revision,publishedRevision:revision,plan});
     for(const chunk of encoded.chunks)tx.create(db.doc(source.root+'/periodGenerations/'+revision+'/chunks/chunk-'+revision+'-'+String(chunk.index).padStart(5,'0')),chunk);
     tx.create(db.doc(source.root+'/workspaceHistory/'+source.meta.revision),{...source.meta,archivedAt:encoded.meta.updatedAt});
     tx.update(db.doc(source.root+'/workspace/meta'),meta);
     tx.update(db.doc(source.root+'/accounting/control'),{generation:source.control.generation+1,updatedAt:encoded.meta.updatedAt});
     return {status:'posted',key:'purchase-cost-'+id};
   });
 }
 async function postPurchaseReturn(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,id);
     const credit=data(await tx.get(postingRef(db,s,'purchase-adjustment-'+id))),review=data(await tx.get(db.doc(base+'/purchaseReturnReviews/'+id)));
     need(same(credit,s)&&credit.source==='purchase'&&credit.key==='purchase-adjustment-'+id&&credit.amount.kind==='credit-note'&&credit.amount.treatment==='domestic'&&ID.test(credit.sourceId)&&credit.originalId===credit.sourceId,'FISCAL_PURCHASE_RETURN_REVIEW_REQUIRED');
     const p=source.payload.purchases.find(x=>x.id===credit.sourceId),original=data(await tx.get(postingRef(db,s,'purchase-'+credit.sourceId)));
     need(p&&p.workspaceId===s.workspaceId&&p.status==='posted'&&same(original,s)&&original.source==='purchase'&&original.sourceId===p.id&&original.amount.kind==='invoice'&&original.amount.treatment==='domestic'&&original.sourceFingerprint===reviewDigest(p)&&credit.sourceFingerprint===original.sourceFingerprint&&credit.issuerVat===original.issuerVat&&credit.counterpartyVat===original.counterpartyVat,'FISCAL_PURCHASE_SOURCE_MISMATCH');
     need(same(review,s)&&review.state==='approved'&&review.adjustmentId===id&&review.purchaseId===p.id&&review.originalEvidenceDigest===original.evidenceDigest&&review.creditEvidenceDigest===credit.evidenceDigest&&review.sourceFingerprint===original.sourceFingerprint&&day(review.date)&&review.date>=credit.taxDate&&ID.test(review.warehouseId)&&HEX.test(review.dispatchDigest)&&review.dispatchDigest!==credit.evidenceDigest&&Array.isArray(review.lines),'FISCAL_PURCHASE_RETURN_REVIEW_REQUIRED');
     const proof=data(await tx.get(db.doc(base+'/purchaseReturnEvidence/'+review.dispatchDigest)));
     need(same(proof,s)&&proof.state==='verified'&&proof.digest===review.dispatchDigest&&typeof proof.bytes==='string'&&proof.bytes.length<=700000,'FISCAL_PURCHASE_RETURN_EVIDENCE_REQUIRED');
     const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&sha(bytes)===proof.digest&&equal(proof.dispatch,{purchaseId:p.id,adjustmentId:id,date:review.date,warehouseId:review.warehouseId,lines:review.lines}),'FISCAL_PURCHASE_RETURN_EVIDENCE_INVALID');
     const ref=db.doc(base+'/purchaseReturnEntries/'+id),prior=data(await tx.get(ref)),uniqueRef=db.doc('fiscalPrivateV1/'+s.accountUid+'/purchaseDispatchIndex/'+review.dispatchDigest),unique=data(await tx.get(uniqueRef));
     if(prior){
       need(same(prior,s)&&prior.adjustmentId===id&&prior.reviewDigest===reviewDigest(review)&&same(unique,s)&&unique.adjustmentId===id&&Array.isArray(prior.movements)&&prior.movements.every(m=>source.payload.inventoryMovements.some(x=>x.id===m.id&&reviewDigest(x)===m.digest)),'FISCAL_PURCHASE_RETURN_CONFLICT');
       return {status:'posted',key:'purchase-return-'+id};
     }
     need(!unique&&review.date===clock().slice(0,10)&&source.payload.warehouses.some(w=>w.id===review.warehouseId&&w.workspaceId===s.workspaceId&&w.branchId===p.branchId&&w.active),'FISCAL_PURCHASE_RETURN_REVIEW_REQUIRED');availablePeriod(source,review.date);
     const previous=await tx.get(db.collection(base+'/purchaseReturnEntries').where('purchaseId','==',p.id).limit(201));need(previous.docs.length<=200,'FISCAL_REPORT_LIMIT');
     const priorMovementIds=[];
     for(const item of previous.docs){const r=item.data();need(same(r,s)&&r.purchaseId===p.id&&r.adjustmentId===item.id&&r.originalEvidenceDigest===original.evidenceDigest&&Array.isArray(r.movements),'FISCAL_PURCHASE_RETURN_CONFLICT');for(const m of r.movements){need(source.payload.inventoryMovements.some(x=>x.id===m.id&&reviewDigest(x)===m.digest),'FISCAL_PURCHASE_RETURN_CONFLICT');priorMovementIds.push(m.id);}}
     const plan=planPurchaseReturn({purchase:p,original:original.amount,credit:credit.amount,lines:review.lines,movements:source.payload.inventoryMovements,warehouseId:review.warehouseId,date:review.date,adjustmentId:id,priorMovementIds});
     const movements=plan.movements.map(m=>({...m,createdAt:clock()})),candidate={...source.payload,inventoryMovements:[...source.payload.inventoryMovements,...movements]};
     await assertFiscalCostContinuity(db,tx,s,source.payload,candidate);
     const [{assertClosedPeriodUnchanged,closedPeriodState},{assertPostedStockRestoreContinuity}]=await Promise.all(['period','backup'].map(loadCompiledFinance));
     assertPostedStockRestoreContinuity(source.payload,candidate);assertClosedPeriodUnchanged(source.payload,candidate,source.control.boundaries);
     for(const b of source.control.boundaries){const r=data(await tx.get(db.doc(source.root+'/periodReports/'+b.reportId)));need(r?.workspaceId===b.workspaceId&&r.through===b.through&&r.sha256===sha(Buffer.from(JSON.stringify(closedPeriodState(source.payload,b)))),'FISCAL_CLOSED_REPORT_MISMATCH');}
     const revision=randomBytes(16).toString('hex'),encoded=encodeWorkspace(candidate,revision);need(encoded.chunks.length<=24,'FISCAL_SOURCE_SIZE_UNSUPPORTED');
     // Credit already reversed purchase cost and input VAT; no second journal.
     tx.create(ref,{...s,adjustmentId:id,purchaseId:p.id,sourceFingerprint:original.sourceFingerprint,originalEvidenceDigest:original.evidenceDigest,creditEvidenceDigest:credit.evidenceDigest,reviewDigest:reviewDigest(review),dispatchDigest:review.dispatchDigest,date:review.date,stockCost:plan.stockCost,movements:movements.map(m=>({id:m.id,digest:reviewDigest(m)})),sourceRevision:source.meta.revision,publishedRevision:revision});
     tx.create(uniqueRef,{...s,adjustmentId:id});
     for(const chunk of encoded.chunks)tx.create(db.doc(source.root+'/periodGenerations/'+revision+'/chunks/chunk-'+revision+'-'+String(chunk.index).padStart(5,'0')),chunk);
     tx.create(db.doc(source.root+'/workspaceHistory/'+source.meta.revision),{...source.meta,archivedAt:encoded.meta.updatedAt});
     tx.update(db.doc(source.root+'/workspace/meta'),{...encoded.meta,parentRevision:source.meta.revision,chunkStorage:'period-generations-v1'});
     tx.update(db.doc(source.root+'/accounting/control'),{generation:source.control.generation+1,updatedAt:encoded.meta.updatedAt});
     return {status:'posted',key:'purchase-return-'+id};
   });
 }
 async function postSupplierSettlement(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const source=await published(db,tx,s,id);
     return postSupplierSettlementJournal(db,tx,s,source,id,clock().slice(0,10));
   });
 }
 async function postPurchaseAdjustment(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   const {purchaseTotals,purchaseFinancialTotals,purchaseAccountingIsValid}=await loadCompiledFinance('operations');
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,id);
     const approval=data(await tx.get(db.doc(base+'/purchaseAdjustments/'+id)));
     need(same(approval,s)&&approval.state==='approved'&&approval.adjustmentId===id&&typeof approval.purchaseId==='string'&&ID.test(approval.purchaseId)&&HEX.test(approval.evidenceDigest)&&day(approval.issueDate)&&day(approval.taxDate)&&typeof approval.documentNumber==='string'&&approval.documentNumber.trim()===approval.documentNumber&&approval.documentNumber.length>0&&approval.documentNumber.length<=128,'FISCAL_PURCHASE_REVIEW_REQUIRED');
     const p=source.payload.purchases.find(p=>p.id===approval.purchaseId);
     need(p&&p.workspaceId===s.workspaceId&&p.status==='posted'&&p.currency==='SAR'&&purchaseAccountingIsValid(p)&&approval.sourceFingerprint===reviewDigest(p)&&p.date<=approval.issueDate&&approval.issueDate<=approval.taxDate&&VAT.test(approval.issuerVat),'FISCAL_PURCHASE_SOURCE_MISMATCH');
     const issuer=data(await tx.get(db.doc(base+'/egs/'+s.egsId+'/enrollment/approved')));
     need(same(issuer,s)&&issuer.state==='approved'&&issuer.issuer?.vatNumber===approval.issuerVat);
     const treatment=approval.treatment;
     need(['domestic','import','reverse-charge'].includes(treatment)&&typeof approval.supplierId==='string'&&approval.supplierId===p.supplierSnapshot?.sourceSupplierId,'FISCAL_PURCHASE_TAX_INVALID');
     const proof=data(await tx.get(db.doc(base+'/purchaseVatEvidence/'+approval.evidenceDigest)));
     need(same(proof,s)&&proof.state==='verified'&&proof.digest===approval.evidenceDigest&&typeof proof.bytes==='string'&&proof.bytes.length<=700000,'FISCAL_PURCHASE_EVIDENCE_REQUIRED');
     const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&sha(bytes)===proof.digest,'FISCAL_PURCHASE_EVIDENCE_INVALID');
     const facts={treatment,kind:approval.kind,supplierId:approval.supplierId,issuerVat:approval.issuerVat,number:approval.documentNumber,issueDate:approval.issueDate,net:approval.net,vat:approval.vat,gross:approval.gross,category:approval.category,rate:approval.rate,originalId:approval.originalId??null};
     need(equal(proof.invoice,facts),'FISCAL_PURCHASE_EVIDENCE_MISMATCH');
     const model=purchaseAccountingModel(approval),key='purchase-adjustment-'+id,prior=data(await tx.get(postingRef(db,s,key)));
     if(!prior)availablePeriod(source,approval.taxDate);
     const row={...s,key,source:'purchase',sourceId:p.id,sourceRevision:p.updatedAt,documentNumber:approval.documentNumber,issueDate:approval.issueDate,taxDate:approval.taxDate,currency:'SAR',category:approval.category,rate:approval.rate,counterpartyVat:p.supplierSnapshot?.vatTaxNumber||null,issuerVat:approval.issuerVat,originalId:approval.originalId??null,uuid:null,evidenceDigest:approval.evidenceDigest,snapshotDigest:approval.sourceFingerprint,sourceFingerprint:approval.sourceFingerprint,amount:model,commercialPosted:false};
     const unique=sha('purchase:'+approval.evidenceDigest);
     if(prior)return writePosting(tx,s,key,row,unique);
     const numberRef=db.doc('fiscalPrivateV1/'+s.accountUid+'/purchaseInvoiceIndex/'+sha(JSON.stringify([approval.issuerVat,treatment==='domestic'?p.supplierSnapshot?.vatTaxNumber:approval.supplierId,approval.documentNumber])));
     need(!(await tx.get(numberRef)).exists,'FISCAL_PURCHASE_INVOICE_DUPLICATE');
     let reservation;
     if(treatment==='domestic'){
       need(['credit-note','debit-note'].includes(approval.kind)&&VAT.test(p.supplierSnapshot?.vatTaxNumber??'')&&approval.originalId===p.id,'FISCAL_PURCHASE_ORIGINAL_REQUIRED');
       const original=data(await tx.get(postingRef(db,s,'purchase-'+p.id)));
       need(same(original,s)&&original.source==='purchase'&&original.amount?.kind==='invoice'&&original.sourceFingerprint===approval.sourceFingerprint&&original.category===approval.category&&original.rate===approval.rate&&original.taxDate<=approval.taxDate,'FISCAL_PURCHASE_ORIGINAL_REQUIRED');
       if(approval.kind==='credit-note'){
         const ref=db.doc(base+'/purchaseCreditBalances/'+p.id),old=data(await tx.get(ref));
         if(old)need(same(old,s)&&old.originalKey===original.key&&old.originalEvidence===original.evidenceDigest,'FISCAL_PURCHASE_BALANCE_INVALID');
         const totals={};for(const k of ['net','vat','deductibleVat']){const value=cents(old?.totals[k]??'0.00')+cents(model[k]);need(value<=cents(original.amount[k]),'FISCAL_PURCHASE_CREDIT_EXCEEDED');totals[k]=money(value);}
         need(cents(totals.vat)-cents(totals.deductibleVat)<=cents(original.amount.vat)-cents(original.amount.deductibleVat),'FISCAL_PURCHASE_CREDIT_EXCEEDED');
         reservation={ref,row:{...s,originalKey:original.key,originalEvidence:original.evidenceDigest,totals},old};
       }
     }else{
       // Only one reviewed tax treatment per underlying purchase is permitted
       // by this narrow model; invoices spanning multiple declarations require
       // explicit allocation before they are accepted.
       need(p.purchaseTax===undefined&&approval.originalId===undefined&&approval.kind==='invoice'&&purchaseTotals(p).landedTotal===approval.net,'FISCAL_PURCHASE_TAX_BASE_MISMATCH');
       need(!(await tx.get(postingRef(db,s,'purchase-'+p.id))).exists,'FISCAL_PURCHASE_TREATMENT_CONFLICT');
       const ref=db.doc(base+'/purchaseTreatmentClaims/'+p.id);
       need(!(await tx.get(ref)).exists,'FISCAL_PURCHASE_TREATMENT_CONFLICT');
       reservation={ref,row:{...s,key,digest:approval.evidenceDigest},old:null};
     }
     if(treatment==='domestic')await assertSupplierSettlementContinuity(db,tx,s,source.payload,row);
     const result=await writePosting(tx,s,key,row,unique);
     tx.create(numberRef,{...s,key,digest:row.evidenceDigest});
     if(reservation){if(reservation.old)tx.update(reservation.ref,reservation.row);else tx.create(reservation.ref,reservation.row);}
     return result;
   });
 }
 async function reportInTransaction(tx,s,from,to,{strictClose=false}={}){
     validateScope(s);need(day(from)&&day(to)&&from<=to);
     const {purchaseTotals,purchaseFinancialTotals}=await loadCompiledFinance('operations');
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,'report');
     const collection=db.collection(base+'/accountingEntries');
     const snapshot=await tx.get(collection.where('taxDate','>=',from).where('taxDate','<=',to).limit(1001));
     need(snapshot.docs.length<=1000,'FISCAL_REPORT_LIMIT');
     const rows=[],salePostings=[],postedPurchases=new Set(),purchaseBalances=new Map(),apSources=new Map();let output=0n,input=0n,deductible=0n,reverseCharge=0n,importVat=0n,unmatched=0;
     for(const item of snapshot.docs){
       const r=item.data();need(r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&r.environment===s.environment&&r.key===item.id&&['sale','purchase'].includes(r.source)&&day(r.taxDate)&&r.taxDate>=from&&r.taxDate<=to&&HEX.test(r.evidenceDigest));journal(r.amount.lines);
       const sign=signFor(r.amount.kind);let reconciliation=null;
       if(r.source==='sale'){
         salePostings.push(r);
         output+=sign*cents(r.amount.vatSar);
         const doc=source.payload.documents.find(d=>d.id===r.sourceId);
         if(!r.commercialPosted||!doc||doc.status!=='final'||doc.lifecycleStatus==='voided'||doc.revision!==r.sourceRevision||reviewDigest(doc)!==r.finalFingerprint||!r.stockIds.every(id=>source.payload.inventoryMovements.some(m=>m.id===id&&m.sourceId===r.sourceId)))unmatched++;
       }else{
         if(r.amount.kind==='invoice')postedPurchases.add(r.sourceId);
         input+=sign*cents(r.amount.vat);deductible+=sign*cents(r.amount.deductibleVat);const self=sign*cents(r.amount.selfAssessedVat??'0.00');output+=self;reverseCharge+=self;if(r.amount.treatment==='import')importVat+=sign*cents(r.amount.vat);
         const p=source.payload.purchases.find(x=>x.id===r.sourceId);
         if(p&&p.status==='posted'&&reviewDigest(p)===r.sourceFingerprint&&r.amount.treatment==='domestic'){
           if(!purchaseBalances.has(p.id)){
             const original=r.amount.kind==='invoice'?r:data(await tx.get(postingRef(db,s,'purchase-'+p.id)));
             need(original&&original.source==='purchase'&&original.sourceId===p.id&&original.key==='purchase-'+p.id&&original.amount.kind==='invoice'&&original.amount.treatment==='domestic'&&original.accountUid===s.accountUid&&original.workspaceId===s.workspaceId&&original.environment===s.environment&&original.sourceFingerprint===reviewDigest(p)&&day(original.taxDate)&&original.taxDate<=to,'FISCAL_PURCHASE_ORIGINAL_REQUIRED');
             const linked=await tx.get(collection.where('sourceId','==',p.id).limit(201));
             need(linked.docs.length<=200,'FISCAL_REPORT_LIMIT');
             const corrections=[];
             for(const item of linked.docs){const x=item.data();if(x.source!=='purchase')continue;need(day(x.taxDate)&&x.key===item.id,'FISCAL_PURCHASE_SOURCE_MISMATCH');if(x.taxDate<=to&&x.key!==original.key){journal(x.amount.lines);corrections.push(x);}}
             const baseRecon=reconcileDomesticPurchase({purchase:p,amount:original.amount,landedTotal:purchaseTotals(p).landedTotal,payableTotal:purchaseFinancialTotals(p).payableTotal,movements:source.payload.inventoryMovements,payments:source.payload.supplierPayments,through:to});
             const balance=supplierSettlementTimeline({purchase:p,original,adjustments:corrections,payments:source.payload.supplierPayments,through:to});
             need(balance.paid===baseRecon.paid,'FISCAL_SETTLEMENT_REVIEW_REQUIRED');
             if(canReplayAdjustedSupplierPayable(baseRecon,balance))apSources.set(p.id,{purchase:p,original,adjustments:corrections.filter(x=>x.amount.treatment==='domestic'),payments:source.payload.supplierPayments,through:to,legacyPayable:baseRecon.legacyPayable});
             const cost=data(await tx.get(db.doc(base+'/purchaseCostCorrections/'+p.id)));
             let catalogCostCorrectionDate=null,valuationBridge=null;
             if(cost){
               need(same(cost,original)&&cost.purchaseId===p.id&&cost.originalEvidenceDigest===original.evidenceDigest&&cost.sourceFingerprint===original.sourceFingerprint&&day(cost.effectiveDate)&&cost.plan?.grossPayable===original.amount.gross&&cost.plan?.deductibleVat===original.amount.deductibleVat&&cost.plan?.correctedCost===baseRecon.fiscalCost,'FISCAL_PURCHASE_COST_CONFLICT');
               if(cost.effectiveDate<=to){catalogCostCorrectionDate=cost.effectiveDate;
                 if(cost.plan.valuationBridge){
                   const v=cost.plan.valuationBridge;need(cents(v.inventoryRelief)+cents(v.cogsRelief)+cents(v.expenseRelief)===cents(original.amount.deductibleVat),'FISCAL_PURCHASE_COST_CONFLICT');
                   for(const b of cost.plan.historyBindings??[]){const m=source.payload.inventoryMovements.find(x=>x.id===b.movementId);need(m&&reviewDigest(m)===b.digest,'FISCAL_COST_HISTORY_LOCKED');}
                   const review=data(await tx.get(db.doc(base+'/purchaseCostReviews/'+p.id)));
                   need(same(review,original)&&review.originalEvidenceDigest===original.evidenceDigest&&review.sourceFingerprint===original.sourceFingerprint,'FISCAL_PURCHASE_COST_CONFLICT');
                   const replay=replayPostedCostAllocation({purchase:p,amount:original.amount,record:cost,review,movements:source.payload.inventoryMovements,savedItems:source.payload.savedItems,digest:reviewDigest});
                   valuationBridge=replay.valuationBridge;
                 }
               }
             }
             // The full legacy valuation/COGS bridge is not yet reconciled.
             purchaseBalances.set(p.id,{...baseRecon,...balance,catalogCostCorrectionDate,valuationBridge,paymentViolations:balance.violations,matched:baseRecon.matched&&corrections.length===0&&balance.violations.length===0});
           }
           reconciliation=purchaseBalances.get(p.id);
         }
         if(!reconciliation?.matched)unmatched++;
       }
       rows.push({key:r.key,source:r.source,number:r.documentNumber,date:r.taxDate,category:r.category,rate:r.rate,currency:r.currency,kind:r.amount.kind,treatment:r.amount.treatment??'domestic',net:r.amount.recognizedNet??r.amount.net,vat:r.amount.vatSar??r.amount.vat,deductibleVat:r.amount.deductibleVat??'0.00',reconciliation});
     }
     // The report must expose omitted entries rather than interpreting an
     // empty register as a zero-tax period. Commercial drafts are checked
     // against accepted authority records, and posted purchases without a
     // tax decision remain unresolved. These checks are bounded.
     const documents=source.payload.documents.filter(d=>d.workspaceId===s.workspaceId&&d.kind==='invoice');
     const intentsSnapshot=await tx.get(db.collection(base+'/issueIntents').limit(1001)),issuesSnapshot=await tx.get(db.collection(base+'/issues').limit(1001));
     need(documents.length<=1000&&intentsSnapshot.docs.length<=1000&&issuesSnapshot.docs.length<=1000,'FISCAL_REPORT_LIMIT');
     const intents=intentsSnapshot.docs.map(item=>{
       const v=item.data();need(typeof v.egsId==='string'&&ID.test(v.egsId),'FISCAL_COVERAGE_INVALID');
       const a=readApprovedIntent(item,{...s,egsId:v.egsId},item.id),d=a.payload.document;
       need(d.workspaceId===s.workspaceId&&d.kind==='invoice'&&day(d.issueDate)&&d.issueDate===a.payload.generatedAt.slice(0,10),'FISCAL_COVERAGE_INVALID');
       return {accountUid:v.accountUid,workspaceId:v.workspaceId,egsId:v.egsId,documentId:item.id,date:d.issueDate,revision:d.revision,snapshotDigest:a.digest};
     });
     const issues=issuesSnapshot.docs.map(item=>{
       const v=item.data();need(v.documentId===item.id&&typeof v.egsId==='string'&&ID.test(v.egsId)&&typeof v.generatedAt==='string'&&day(v.generatedAt.slice(0,10)),'FISCAL_COVERAGE_INVALID');
       return {...v,date:v.generatedAt.slice(0,10)};
     });
     const coverage=fiscalSalesCoverage({scope:s,from,to,documents,intents,issues,postings:salePostings});
     if(strictClose){
       need(coverage.blockers.length===0,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
       for(const r of salePostings){
         const a=await accepted({...s,egsId:r.egsId},r.sourceId,tx);
         need(a.record.snapshotDigest===r.snapshotDigest&&a.record.resultDigest===r.evidenceDigest&&a.record.uuid===r.uuid,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
       }
     }
     const purchases=source.payload.purchases.filter(p=>p.workspaceId===s.workspaceId&&p.status==='posted'&&p.date>=from&&p.date<=to);
     need(documents.length+purchases.length<=1000,'FISCAL_REPORT_LIMIT');
     let unreviewedPurchases=0;
     if(strictClose)need(!source.payload.purchases.some(p=>p.workspaceId===s.workspaceId&&p.status==='reversed'&&p.date<=to),'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
     for(const p of purchases){if(postedPurchases.has(p.id))continue;const direct=data(await tx.get(postingRef(db,s,'purchase-'+p.id))),claim=data(await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+p.id)));
       if(direct||claim){const entry=direct??data(await tx.get(postingRef(db,s,claim.key)));need(entry&&entry.sourceId===p.id&&entry.sourceFingerprint===reviewDigest(p),'FISCAL_PURCHASE_SOURCE_MISMATCH');if(strictClose)unreviewedPurchases++;}
       else unreviewedPurchases++;
     }
     const returnPosting=await inspectReturnPostings(db,tx,s,source.payload,{through:to});
     unmatched+=returnPosting.missing.length;
     const returnCosts=returnPosting.confirmed.filter(r=>r.date>=from).map(r=>({movementId:r.movementId,date:r.date,kind:r.kind,amount:r.amount}));
     const dispatches=await tx.get(db.collection(base+'/purchaseReturnEntries').limit(201)),dispatchReviews=await tx.get(db.collection(base+'/purchaseReturnReviews').limit(201));need(dispatches.docs.length<=200&&dispatchReviews.docs.length<=200,'FISCAL_REPORT_LIMIT');
     const purchaseReturns=[],pendingPurchaseReturns=[],returnMovementIds=new Set();
     for(const item of dispatches.docs){const r=item.data();need(r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&r.environment==='simulation'&&r.adjustmentId===item.id&&day(r.date)&&Array.isArray(r.movements),'FISCAL_PURCHASE_RETURN_CONFLICT');
       for(const m of r.movements){need(!returnMovementIds.has(m.id)&&source.payload.inventoryMovements.some(x=>x.id===m.id&&isFiscalPurchaseReturn(x)&&reviewDigest(x)===m.digest),'FISCAL_PURCHASE_RETURN_CONFLICT');returnMovementIds.add(m.id);}
       if(r.date>=from&&r.date<=to)purchaseReturns.push({adjustmentId:item.id,date:r.date,stockCost:r.stockCost});
     }
     for(const m of source.payload.inventoryMovements.filter(x=>x.workspaceId===s.workspaceId&&isFiscalPurchaseReturn(x)))need(returnMovementIds.has(m.id),'FISCAL_PURCHASE_RETURN_CONFLICT');
     for(const item of dispatchReviews.docs){const r=item.data();need(r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&r.environment==='simulation'&&r.adjustmentId===item.id&&day(r.date),'FISCAL_PURCHASE_RETURN_CONFLICT');if(r.state==='approved'&&r.date>=from&&r.date<=to&&!dispatches.docs.some(x=>x.id===item.id))pendingPurchaseReturns.push({adjustmentId:item.id,date:r.date});}
     unmatched+=pendingPurchaseReturns.length;
     const advanceBalances=await verifyAdvanceReport(db,tx,s,source.payload,to,{mapCommercialFiscalInvoice});
     const approvedAdjustments=await tx.get(db.collection(base+'/purchaseAdjustments').limit(201));
     need(approvedAdjustments.docs.length<=200,'FISCAL_REPORT_LIMIT');
     const pendingAdjustments=[];
     for(const item of approvedAdjustments.docs){const a=item.data();need(a.accountUid===s.accountUid&&a.workspaceId===s.workspaceId&&a.environment==='simulation'&&typeof a.egsId==='string'&&ID.test(a.egsId),'FISCAL_PURCHASE_SOURCE_MISMATCH');if(a.state!=='approved')continue;need(a.adjustmentId===item.id&&ID.test(item.id)&&typeof a.documentNumber==='string'&&a.documentNumber.length<=128&&day(a.taxDate)&&['domestic','import','reverse-charge'].includes(a.treatment));if(a.taxDate<from||a.taxDate>to)continue;const existing=data(await tx.get(postingRef(db,s,'purchase-adjustment-'+item.id)));if(!existing)pendingAdjustments.push({id:item.id,number:a.documentNumber,treatment:a.treatment,date:a.taxDate});}
     const supplierSettlementHistory=await readSupplierSettlements(db,tx,s,source.payload,'0001-01-01',to);
     const supplierSettlements={...supplierSettlementHistory,journals:supplierSettlementHistory.journals.filter(j=>j.date>=from)};
     const settledByPurchase=new Map(supplierSettlements.balances.map(b=>[b.purchaseId,b]));
     need(settledByPurchase.size===supplierSettlements.balances.length,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
     const supplierPayableJournals=[...apSources.values()].map(a=>projectSupplierAPJournal({...a,settledBalance:settledByPurchase.get(a.purchase.id),settlementJournals:supplierSettlementHistory.journals}));
     const settlementReconciliations=new Map();
     for(const [purchaseId,reconciliation] of purchaseBalances){
       const b=settledByPurchase.get(purchaseId);
       if(b)settlementReconciliations.set(reconciliation,mergeSupplierSettlementReconciliation(reconciliation,b));
     }
     for(const r of rows){
       const previous=r.reconciliation,next=settlementReconciliations.get(previous);
       if(!next)continue;
       r.reconciliation=next;
       if(previous.matched&&!next.matched)unmatched++;
     }
     return {supplierPayableJournals,supplierSettlements,environment:'simulation',format:'fiscal-accounting-preview-v1',from,to,currency:'SAR',outputVat:money(output),inputVat:money(input),deductibleVat:money(deductible),netVat:money(output-deductible),reverseChargeVat:money(reverseCharge),importVat:money(importVat),unmatched,unpostedSales:coverage.unpostedSales,pendingSales:coverage.pendingSales,salesBlockers:coverage.blockers,unreviewedPurchases,pendingAdjustments,purchaseReturns,pendingPurchaseReturns,advanceBalances,returnCosts,unpostedReturns:returnPosting.missing.length,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),readyForFiling:false};
 }
 async function report(s,from,to){return db.runTransaction(tx=>reportInTransaction(tx,s,from,to));}
 async function closeProof(tx,s,through){
   const snapshot=await reportInTransaction(tx,s,'0001-01-01',through,{strictClose:true});
   need(snapshot.unmatched===0&&snapshot.unpostedSales===0&&snapshot.pendingSales===0&&snapshot.unreviewedPurchases===0&&snapshot.pendingAdjustments.length===0&&snapshot.supplierSettlements.pending.length===0&&snapshot.salesBlockers.length===0,'FISCAL_PERIOD_RECONCILIATION_REQUIRED');
   const bytes=Buffer.from(JSON.stringify(snapshot));need(bytes.length<=350000,'FISCAL_REPORT_LIMIT');
   return {format:'LOUREX_FISCAL_CLOSE_V1',environment:'simulation',workspaceId:s.workspaceId,through,sha256:sha(bytes),snapshotJson:bytes.toString('utf8')};
 }
 return Object.freeze({postSale,postPurchase,postPurchaseCost,postPurchaseAdjustment,postPurchaseReturn,postSupplierSettlement,report,closeProof});
}
