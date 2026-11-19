import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reviewDigest} from '../api/_fiscal/commercial-source.js';
import {supplierRefundCashFacts} from '../api/_fiscal/supplier-commercial-settlements.mjs';
import {postSupplierSettlement,readSupplierSettlements,assertSupplierSettlementContinuity,assertSettlementCashContinuity,settlementCashClaim} from '../api/_fiscal/supplier-settlement-posting.mjs';
const s={accountUid:'u',workspaceId:'w',egsId:'e',environment:'simulation'},base='fiscalPrivateV1/u/workspaces/w',party={workspaceId:'w',branchId:'b',currency:'SAR'};
function fixture(){
 const a={...party,id:'a',number:'A',date:'2026-11-01',status:'posted',supplierSnapshot:{sourceSupplierId:'supplier'}},b={...a,id:'b',number:'B'};
 const initial=p=>({...s,key:'purchase-'+p.id,source:'purchase',sourceId:p.id,sourceFingerprint:reviewDigest(p),currency:'SAR',category:'S',rate:'15',issuerVat:'issuer',counterpartyVat:'supplier',taxDate:p.date,amount:{kind:'invoice',treatment:'domestic',net:'100.00',vat:'15.00',deductibleVat:'0.00',gross:'115.00'}});
 const original=initial(a),credit={...original,key:'credit-a',originalId:'a',taxDate:'2026-11-10',amount:{kind:'credit-note',treatment:'domestic',net:'40.00',vat:'6.00',deductibleVat:'0.00',gross:'46.00'}};
 const pay=(p,id,date,amount)=>({...party,id,purchaseId:p.id,purchaseNumber:p.number,supplierId:'supplier',date,amount});
 const cash={...party,id:'cash',date:'2026-11-13',amount:'16.00',type:'deposit',sourceType:'manual',sourceId:'',fromAccountId:'',toAccountId:'bank',voidedAt:''};
 const payload={purchases:[a,b],supplierPayments:[pay(a,'p','2026-11-05','115.00')],treasuryEntries:[cash],treasuryAccounts:[{...party,id:'bank'}]};
 const rows=new Map([[base+'/accountingEntries/purchase-a',original],[base+'/accountingEntries/purchase-b',initial(b)],[base+'/accountingEntries/credit-a',credit]]);
 const common={...s,state:'approved',branchId:'b',currency:'SAR',supplierId:'supplier',sourcePurchaseId:'a',sourceFingerprint:original.sourceFingerprint};
 function approve(facts){
  const bytes=Buffer.from('independent proof '+facts.id),digest=createHash('sha256').update(bytes).digest('hex');
  rows.set(base+'/supplierSettlementReviews/'+facts.id,{...facts,evidenceDigest:digest});rows.set(base+'/supplierSettlementEvidence/'+digest,{...s,state:'verified',digest,bytes:bytes.toString('base64'),settlement:facts});
 }
 approve({...common,id:'offset',kind:'offset',date:'2026-11-12',amount:'30.00',targetPurchaseId:'b',targetFingerprint:reviewDigest(b)});
 approve({...common,id:'refund',kind:'refund',date:cash.date,amount:cash.amount,treasuryEntryId:cash.id,cashDigest:reviewDigest(supplierRefundCashFacts(cash))});
 const db={doc:path=>({path}),collection:path=>({where(k,o,v){return {limit:n=>({path,field:k,value:v,n})};},limit:n=>({path,n})})};
 function run(fn){const writes=[];let written=false;return Promise.resolve(fn({get:async ref=>{assert.equal(written,false,'all reads precede writes');if(ref.n){const prefix=ref.path+'/';return {docs:[...rows].filter(([key,x])=>key.startsWith(prefix)&&!key.slice(prefix.length).includes('/')&&(!ref.field||x[ref.field]===ref.value)).slice(0,ref.n).map(([key,x])=>({id:key.slice(prefix.length),data:()=>structuredClone(x)}))};}return {exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))};},create:(ref,row)=>{written=true;assert.ok(!rows.has(ref.path)&&!writes.some(x=>x[0]===ref.path));writes.push([ref.path,structuredClone(row)]);}})).then(r=>{for(const [k,v] of writes)rows.set(k,v);return r;});}
 const post=(id,closedThrough=null)=>run(tx=>postSupplierSettlement(db,tx,s,{payload,closedThrough},id,'2026-11-19'));
 return {rows,payload,db,run,post,b,pay,cash};
}
test('posts offset and refund atomically, idempotently and reconstructs adjusted supplier balances',async()=>{
 const f=fixture();await f.post('offset');await f.post('refund');const count=f.rows.size;await f.post('refund');assert.equal(f.rows.size,count);
 const r=await f.run(tx=>readSupplierSettlements(f.db,tx,s,f.payload,'2026-11-01','2026-11-30'));assert.deepEqual(r.balances.map(x=>[x.purchaseId,x.outstanding,x.supplierCredit]),[['a','0.00','0.00'],['b','85.00','0.00']]);assert.equal(r.journals.length,2);assert.deepEqual(r.pending,[]);
});
test('blocks closed periods, forged evidence, reused cash and subsequent supplier overpayment without partial writes',async()=>{
 const f=fixture();await assert.rejects(f.post('offset','2026-11-12'));const review=f.rows.get(base+'/supplierSettlementReviews/refund');const path=base+'/supplierSettlementEvidence/'+review.evidenceDigest,proof=f.rows.get(path);
 f.rows.set(path,{...proof,bytes:Buffer.from('forged').toString('base64')});await assert.rejects(f.post('refund'));f.rows.set(path,proof);
 const claim=settlementCashClaim(f.db,s,'cash').path;f.rows.set(claim,{key:'other'});await assert.rejects(f.post('refund'));f.rows.delete(claim);
 await f.post('offset');await f.post('refund');const bad={...f.payload,supplierPayments:[...f.payload.supplierPayments,f.pay(f.b,'late','2026-11-14','100.00')]};await assert.rejects(f.run(tx=>assertSupplierSettlementContinuity(f.db,tx,s,bad)));
 const edited={...f.payload,treasuryEntries:[{...f.cash,amount:'15.00'}]};await assert.rejects(f.run(tx=>assertSettlementCashContinuity(f.db,tx,s,f.payload,edited)));
});
