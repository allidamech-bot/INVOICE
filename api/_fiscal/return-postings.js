import {returnCostJournal} from './return-cost.mjs';
import {stockCostCents} from './fiscal-cost.mjs';
import {reviewDigest} from './commercial-source.js';
import {createAcceptedFiscalReader} from './accepted-issue.js';
import {loadCompiledFinance} from '../_accounting/compiled-finance-loader.js';
const need=ok=>{if(!ok)throw Error('FISCAL_RETURN_POSTING_REQUIRED');};
const data=s=>s.exists?s.data():null;
export const isReturnMovement=m=>Boolean(m.salesReturn||m.salesReturnCorrection||m.id?.startsWith('sales-credit-stock:')||m.id?.startsWith('sales-credit-stock-correction:'));
export async function inspectReturnPostings(db,tx,{accountUid,workspaceId},payload,{through='9999-12-31',newMovementIds=new Set()}={}){
 const base='fiscalPrivateV1/'+accountUid+'/workspaces/'+workspaceId,documents=payload.documents.filter(d=>d.workspaceId===workspaceId),movements=payload.inventoryMovements.filter(m=>m.workspaceId===workspaceId);
 const stored=await tx.get(db.collection(base+'/returnCostEntries').limit(1001));need(stored.docs.length<=1000);
 const relevant=movements.filter(isReturnMovement);need(relevant.length<=1000);
 if(relevant.length){const {assertSalesReturnIntegrity}=await loadCompiledFinance('returns');assertSalesReturnIntegrity({...payload,documents,inventoryMovements:movements});}
 const rows=returnCostJournal({documents,movements,through}),byMovement=new Map(movements.map(m=>[m.id,m])),lookup=new Map(stored.docs.map(x=>[x.id,x.data()])),verified=new Map(),writes=[],missing=[],confirmed=[];
 const accepted=createAcceptedFiscalReader(db);
 async function sale(id,kind){
   if(verified.has(id)){const cached=verified.get(id);need(cached.amount.kind===kind);return cached;}
   const doc=documents.find(d=>d.id===id),p=data(await tx.get(db.doc(base+'/accountingEntries/sale-'+id)));
   need(doc&&p&&p.key==='sale-'+id&&p.source==='sale'&&p.sourceId===id&&p.accountUid===accountUid&&p.workspaceId===workspaceId&&p.environment==='simulation'&&p.currency==='SAR'&&p.commercialPosted===true&&p.finalFingerprint===reviewDigest(doc)&&p.amount?.kind===kind&&p.sourceRevision===doc.revision&&Array.isArray(p.stockIds));
   const result=await accepted({accountUid,workspaceId,egsId:p.egsId,environment:'simulation'},id,tx);
   need(result.record.snapshotDigest===p.snapshotDigest&&result.record.resultDigest===p.evidenceDigest&&result.record.uuid===p.uuid);
   if(kind==='invoice'){
      const total=p.stockIds.reduce((sum,id)=>{const m=byMovement.get(id);need(m&&m.sourceId===doc.id&&m.type==='issue'&&m.currency==='SAR'&&m.quantity.startsWith('-'));return sum+stockCostCents(m.quantity.slice(1),m.unitCost);},0n);
      const entries=p.amount.lines.filter(l=>l.account==='cost-of-sales');need(entries.length<2&&entries.every(l=>l.side==='debit'&&/^\d+\.\d{2}$/.test(l.amount))&&BigInt((entries[0]?.amount??'0.00').replace('.',''))===total);
   }
   verified.set(id,p);return p;
 }
 for(const row of rows){
   const original=await sale(row.invoiceId,'invoice'),credit=await sale(row.creditNoteId,'credit-note'),movement=byMovement.get(row.movementId);
   need(credit.originalId===original.sourceId&&credit.issuerVat===original.issuerVat&&credit.counterpartyVat===original.counterpartyVat&&movement.currency==='SAR');
   const receipt=movement.salesReturn?movement:byMovement.get(movement.salesReturnCorrection.receiptMovementId),proof=receipt.salesReturn;
   need(original.stockIds.includes('sales-invoice-stock:'+proof.invoiceId+':'+proof.invoiceLineId));
   const key=reviewDigest(row.movementId),record={accountUid,workspaceId,environment:'simulation',currency:'SAR',movementDigest:reviewDigest(movement),originalEvidence:original.evidenceDigest,creditEvidence:credit.evidenceDigest,...row};
   const existing=lookup.get(key);lookup.delete(key);
   if(existing){need(reviewDigest(existing)===reviewDigest(record));confirmed.push(row);}
   else if(newMovementIds.has(row.movementId)){writes.push({ref:db.doc(base+'/returnCostEntries/'+key),record});confirmed.push(row);}
   else missing.push(row.movementId);
 }
 for(const r of lookup.values()){need(typeof r.date==='string'&&r.date>through);}
 return {writes,missing,confirmed};
}
