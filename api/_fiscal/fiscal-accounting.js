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
async function planCommercialFinalization(db,tx,s,source,doc,model){
 const p=source.payload,final={...doc,status:'final'},before=p;
 const [{postIssuedInvoiceStock},{approvalGate},{assertCustomerCreditLimit},{assertDocumentLifecycleInvariant,createDocumentEvent},{assertInvoicePaymentInvariant},{assertClosedPeriodUnchanged,closedPeriodState},{assertPostedStockRestoreContinuity},{lineTotal,isNonNegativeFinancialDecimalInput}]=await Promise.all(['stock','governance','commercial','lifecycle','payments','period','backup','money'].map(loadCompiledFinance));
 // Special fiscal subtypes must never be disguised as a commercial sale.
 need(!['prepayment','debit-note'].includes(model.kind),'FISCAL_SPECIAL_COMMERCIAL_POSTING_REQUIRED');
 const policy=approvalGate(p,{action:'issue-document',entityType:'document',entityId:doc.id,entityLabel:doc.number,entityUpdatedAt:doc.updatedAt||''});
 need(policy.allowed,'FISCAL_COMMERCIAL_APPROVAL_REQUIRED');
 assertCustomerCreditLimit(final,p.customers,p.documents,p.payments);
 const documents=p.documents.map(d=>d.id===doc.id?final:d);
 assertInvoicePaymentInvariant(final,p.payments,documents);assertDocumentLifecycleInvariant(final,documents,p.payments);
 const documentEvents=[...p.documentEvents,createDocumentEvent(final,'issued','Fiscal acceptance')];
 // Stock helper uses the active scope. Restore user's preferences afterwards.
 const working={...p,documents,documentEvents,appSettings:{...p.appSettings,activeWorkspaceId:s.workspaceId,activeBranchId:doc.branchId}};
 const result=postIssuedInvoiceStock(working,final),candidate={...result.vault,appSettings:p.appSettings};
 need(!result.legacyDelivery,'FISCAL_HISTORICAL_DELIVERY_RECONCILIATION_REQUIRED');
 const ids=new Set(p.inventoryMovements.map(x=>x.id)),newMovements=candidate.inventoryMovements.filter(x=>!ids.has(x.id));
 let cost=0n;
 for(const m of newMovements){
   need(m.sourceId===doc.id&&m.currency===doc.currency&&typeof m.unitCost==='string'&&isNonNegativeFinancialDecimalInput(m.unitCost)&&typeof m.quantity==='string'&&m.quantity.startsWith('-'),'FISCAL_STOCK_COST_REVIEW_REQUIRED');
   cost+=cents(lineTotal(m.quantity.slice(1),m.unitCost));
 }
 const accounting={...model,lines:journal([...model.lines,entry('cost-of-sales','debit',cost),entry('inventory','credit',cost)])};
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
     const plan=!p.review.scenario&&p.document.currency==='SAR'?await planCommercialFinalization(db,tx,s,source,d,amount):null;
     const row={...s,key,source:'sale',sourceId:id,sourceRevision:revision,documentNumber:p.document.number,issueDate:p.document.issueDate,taxDate:p.document.issueDate,currency:p.document.currency,category:p.review.taxCategory,rate:p.review.taxRate,counterpartyVat:p.review.buyer?.vatNumber??null,issuerVat:p.issuer.vatNumber,originalId:p.review.originalDocumentId??null,uuid:a.record.uuid,evidenceDigest:a.record.resultDigest,snapshotDigest:a.record.snapshotDigest,amount:plan?.accounting??amount,sourceFingerprint:reviewDigest(p.document),finalFingerprint:plan?.finalFingerprint??null,stockIds:plan?.stockIds??[],commercialPosted:!!plan};
     // Preserve the original immutable invoice even if the current draft is
     // missing or edited: posting is blocked, never silently reconstructed.
     need(d&&d.revision===revision&&equal(d,p.document),'FISCAL_COMMERCIAL_SOURCE_DIVERGED');
     return writePosting(tx,s,key,row,sha('sale:'+a.record.uuid),plan?.write);
   });
 }
 async function postPurchase(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   const {purchaseTotals,purchaseAccountingIsValid}=await loadCompiledFinance('operations');
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,id),matches=source.payload.purchases.filter(p=>p.id===id);
     need(matches.length===1);const p=matches[0],approval=data(await tx.get(db.doc(base+'/purchaseVatReviews/'+id)));
     need(p.workspaceId===s.workspaceId&&p.status==='posted'&&p.currency==='SAR'&&purchaseAccountingIsValid(p)&&VAT.test(p.supplierSnapshot?.vatTaxNumber??'')&&same(approval,s)&&approval.state==='approved'&&approval.purchaseId===id&&approval.sourceFingerprint===reviewDigest(p)&&approval.supplierVat===p.supplierSnapshot.vatTaxNumber&&VAT.test(approval.issuerVat)&&HEX.test(approval.evidenceDigest)&&approval.kind==='invoice'&&approval.documentNumber===p.number&&approval.issueDate===p.date&&day(approval.taxDate)&&p.date<=approval.taxDate,'FISCAL_PURCHASE_REVIEW_REQUIRED');
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
     need(purchaseTotals(p).landedTotal===amount.gross,'FISCAL_PURCHASE_GROSS_MISMATCH');
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
 async function postPurchaseAdjustment(s,id){
   validateScope(s);need(typeof id==='string'&&ID.test(id));
   const {purchaseTotals,purchaseAccountingIsValid}=await loadCompiledFinance('operations');
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
       need(approval.originalId===undefined&&approval.kind==='invoice'&&purchaseTotals(p).landedTotal===approval.net,'FISCAL_PURCHASE_TAX_BASE_MISMATCH');
       need(!(await tx.get(postingRef(db,s,'purchase-'+p.id))).exists,'FISCAL_PURCHASE_TREATMENT_CONFLICT');
       const ref=db.doc(base+'/purchaseTreatmentClaims/'+p.id);
       need(!(await tx.get(ref)).exists,'FISCAL_PURCHASE_TREATMENT_CONFLICT');
       reservation={ref,row:{...s,key,digest:approval.evidenceDigest},old:null};
     }
     const result=await writePosting(tx,s,key,row,unique);
     tx.create(numberRef,{...s,key,digest:row.evidenceDigest});
     if(reservation){if(reservation.old)tx.update(reservation.ref,reservation.row);else tx.create(reservation.ref,reservation.row);}
     return result;
   });
 }
 async function report(s,from,to){
   validateScope(s);need(day(from)&&day(to)&&from<=to);
   return db.runTransaction(async tx=>{
     const {workspace}=await readSimulationContext(db,tx,s);need(workspace.commandsEnabled===true);
     const base=simulationBase(s),source=await published(db,tx,s,'report');
     const collection=db.collection(base+'/accountingEntries');
     const snapshot=await tx.get(collection.where('taxDate','>=',from).where('taxDate','<=',to).limit(1001));
     need(snapshot.docs.length<=1000,'FISCAL_REPORT_LIMIT');
     const rows=[],postedSales=new Set(),postedPurchases=new Set();let output=0n,input=0n,deductible=0n,reverseCharge=0n,importVat=0n,unmatched=0;
     for(const item of snapshot.docs){
       const r=item.data();need(r.accountUid===s.accountUid&&r.workspaceId===s.workspaceId&&r.environment===s.environment&&r.key===item.id&&['sale','purchase'].includes(r.source)&&day(r.taxDate)&&r.taxDate>=from&&r.taxDate<=to&&HEX.test(r.evidenceDigest));journal(r.amount.lines);
       const sign=signFor(r.amount.kind);
       if(r.source==='sale'){
         postedSales.add(r.sourceId);
         output+=sign*cents(r.amount.vatSar);
         const doc=source.payload.documents.find(d=>d.id===r.sourceId);
         if(!r.commercialPosted||!doc||doc.status!=='final'||doc.lifecycleStatus==='voided'||doc.revision!==r.sourceRevision||reviewDigest(doc)!==r.finalFingerprint||!r.stockIds.every(id=>source.payload.inventoryMovements.some(m=>m.id===id&&m.sourceId===r.sourceId)))unmatched++;
       }else{
         if(r.amount.kind==='invoice')postedPurchases.add(r.sourceId);
         input+=sign*cents(r.amount.vat);deductible+=sign*cents(r.amount.deductibleVat);const self=sign*cents(r.amount.selfAssessedVat??'0.00');output+=self;reverseCharge+=self;if(r.amount.treatment==='import')importVat+=sign*cents(r.amount.vat);
         const p=source.payload.purchases.find(x=>x.id===r.sourceId);if(!p||p.status!=='posted'||reviewDigest(p)!==r.sourceFingerprint||cents(r.amount.deductibleVat)>0n||r.amount.kind!=='invoice'||r.amount.treatment!=='domestic')unmatched++;
       }
       rows.push({key:r.key,source:r.source,number:r.documentNumber,date:r.taxDate,category:r.category,rate:r.rate,currency:r.currency,kind:r.amount.kind,treatment:r.amount.treatment??'domestic',net:r.amount.recognizedNet??r.amount.net,vat:r.amount.vatSar??r.amount.vat,deductibleVat:r.amount.deductibleVat??'0.00'});
     }
     // The report must expose omitted entries rather than interpreting an
     // empty register as a zero-tax period. Commercial drafts are checked
     // against accepted authority records, and posted purchases without a
     // tax decision remain unresolved. These checks are bounded.
     const drafts=source.payload.documents.filter(d=>d.workspaceId===s.workspaceId&&d.kind==='invoice'&&d.issueDate>=from&&d.issueDate<=to);
     const purchases=source.payload.purchases.filter(p=>p.workspaceId===s.workspaceId&&p.status==='posted'&&p.date>=from&&p.date<=to);
     need(drafts.length+purchases.length<=1000,'FISCAL_REPORT_LIMIT');
     let unpostedSales=0,unreviewedPurchases=0;
     for(const d of drafts){if(postedSales.has(d.id))continue;const issue=data(await tx.get(db.doc(base+'/issues/'+d.id)));if(issue&&['cleared','reported'].includes(issue.status))unpostedSales++;else if(d.status==='final'&&d.lifecycleStatus!=='voided')unpostedSales++;}
     for(const p of purchases){if(postedPurchases.has(p.id))continue;const direct=data(await tx.get(postingRef(db,s,'purchase-'+p.id))),claim=data(await tx.get(db.doc(base+'/purchaseTreatmentClaims/'+p.id)));
       if(direct||claim){const entry=direct??data(await tx.get(postingRef(db,s,claim.key)));need(entry&&entry.sourceId===p.id&&entry.sourceFingerprint===reviewDigest(p),'FISCAL_PURCHASE_SOURCE_MISMATCH');}
       else unreviewedPurchases++;
     }
     const approvedAdjustments=await tx.get(db.collection(base+'/purchaseAdjustments').limit(201));
     need(approvedAdjustments.docs.length<=200,'FISCAL_REPORT_LIMIT');
     const pendingAdjustments=[];
     for(const item of approvedAdjustments.docs){const a=item.data();if(!same(a,s)||a.state!=='approved')continue;need(a.adjustmentId===item.id&&ID.test(item.id)&&typeof a.documentNumber==='string'&&a.documentNumber.length<=128&&day(a.taxDate)&&['domestic','import','reverse-charge'].includes(a.treatment));if(a.taxDate<from||a.taxDate>to)continue;const existing=data(await tx.get(postingRef(db,s,'purchase-adjustment-'+item.id)));if(!existing)pendingAdjustments.push({id:item.id,number:a.documentNumber,treatment:a.treatment,date:a.taxDate});}
     return {environment:'simulation',format:'fiscal-accounting-preview-v1',from,to,currency:'SAR',outputVat:money(output),inputVat:money(input),deductibleVat:money(deductible),netVat:money(output-deductible),reverseChargeVat:money(reverseCharge),importVat:money(importVat),unmatched,unpostedSales,unreviewedPurchases,pendingAdjustments,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),readyForFiling:false};
   });
 }
 return Object.freeze({postSale,postPurchase,postPurchaseAdjustment,report});
}
