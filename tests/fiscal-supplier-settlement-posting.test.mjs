import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reviewDigest} from '../api/_fiscal/commercial-source.js';
import {supplierRefundCashFacts} from '../api/_fiscal/supplier-commercial-settlements.mjs';
import {postSupplierSettlement,readSupplierSettlements,assertSupplierSettlementContinuity,assertSettlementCashContinuity,settlementCashClaim,assertPostedSupplierPaymentTransition,mergeSupplierSettlementReconciliation,provisionVerifiedSupplierSettlement} from '../api/_fiscal/supplier-settlement-posting.mjs';
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
 return {rows,payload,db,run,post,b,pay,cash,approve};
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

test('historical report contains no future settlement or pending action beyond range',async()=>{
 const f=fixture();await f.post('offset');await f.post('refund');const r=await f.run(tx=>readSupplierSettlements(f.db,tx,s,f.payload,'2026-11-01','2026-11-11'));assert.equal(r.journals.length,0);assert.equal(r.balances.find(x=>x.purchaseId==='a').supplierCredit,'46.00');assert.equal(r.balances.find(x=>x.purchaseId==='b').outstanding,'115.00');
});

test('backdated new cash cannot create an excess after an already posted offset and later tax credit',async()=>{
 const f=fixture();await f.post('offset');
 const original=f.rows.get(base+'/accountingEntries/purchase-b');
 f.rows.set(base+'/accountingEntries/credit-b',{...original,key:'credit-b',originalId:'b',taxDate:'2026-11-15',amount:{kind:'credit-note',treatment:'domestic',net:'20.00',vat:'3.00',deductibleVat:'0.00',gross:'23.00'}});
 const candidate=amount=>({...f.payload,supplierPayments:[...f.payload.supplierPayments,f.pay(f.b,'backdated','2026-11-11',amount)]});
 // Historical replay alone allows the payment, which was within the
 // liability on the date given; a new publication must not create a credit.
 await f.run(tx=>assertSupplierSettlementContinuity(f.db,tx,s,candidate('70.00')));
 await assert.rejects(f.run(tx=>assertPostedSupplierPaymentTransition(f.db,tx,s,f.payload,candidate('70.00'),'2026-11-19')),/FISCAL_SETTLEMENT_REVIEW_REQUIRED/);
 await f.run(tx=>assertPostedSupplierPaymentTransition(f.db,tx,s,f.payload,candidate('62.00'),'2026-11-19'));
 await f.run(tx=>assertPostedSupplierPaymentTransition(f.db,tx,s,candidate('70.00'),candidate('70.00'),'2026-11-19'));
});
test('existing purchase reconciliation shows real net outstanding and credit after offset without false accounting match',()=>{
 const r={adjustedPayable:'115.00',adjustedOutstanding:'115.00',paid:'0.00',matched:true};
 const b={adjustedPayable:'115.00',paid:'0.00',settlementDelta:'-30.00',outstanding:'85.00',supplierCredit:'0.00'};
 assert.deepEqual(mergeSupplierSettlementReconciliation(r,b),{...r,settlementDelta:'-30.00',settledOutstanding:'85.00',settledSupplierCredit:'0.00',matched:false});
 assert.throws(()=>mergeSupplierSettlementReconciliation(r,{...b,outstanding:'84.00'}));
 assert.throws(()=>mergeSupplierSettlementReconciliation(r,{...b,paid:'1.00'}));
 assert.throws(()=>mergeSupplierSettlementReconciliation(r,{...b,supplierCredit:'1.00'}));
 const credit={adjustedPayable:'69.00',paid:'115.00',adjustedOutstanding:'-46.00',matched:false};
 assert.equal(mergeSupplierSettlementReconciliation(credit,{adjustedPayable:'69.00',paid:'115.00',settlementDelta:'30.00',outstanding:'0.00',supplierCredit:'16.00'}).settledSupplierCredit,'16.00');
});

test('adjusted payment voucher follows posted cash evidence and exact historical reversal',async()=>{
 const f=fixture(),original=f.rows.get(base+'/accountingEntries/purchase-b');
 f.rows.set(base+'/accountingEntries/debit-b',{...original,key:'debit-b',originalId:'b',taxDate:'2026-11-10',amount:{kind:'debit-note',treatment:'domestic',net:'20.00',vat:'3.00',deductibleVat:'0.00',gross:'23.00'}});
 f.payload.treasuryAccounts[0].kind='bank';
 const withdrawal={...f.cash,id:'withdrawal',type:'withdrawal',fromAccountId:'bank',toAccountId:'',amount:'23.00'};
 const deposit={...f.cash,id:'return',date:'2026-11-15',amount:'23.00'};
 f.payload.treasuryEntries.push(withdrawal,deposit);
 const facts={...s,state:'approved',branchId:'b',currency:'SAR',supplierId:'supplier',sourcePurchaseId:'b',sourceFingerprint:original.sourceFingerprint};
 f.approve({...facts,id:'pay-adjusted',kind:'adjusted-payment',date:withdrawal.date,amount:withdrawal.amount,treasuryEntryId:withdrawal.id,cashDigest:reviewDigest(supplierRefundCashFacts(withdrawal))});
 f.approve({...facts,id:'reverse-adjusted',kind:'adjusted-payment-reversal',date:deposit.date,amount:deposit.amount,treasuryEntryId:deposit.id,cashDigest:reviewDigest(supplierRefundCashFacts(deposit)),reversesSettlementId:'pay-adjusted'});
 const read=(from,to)=>f.run(tx=>readSupplierSettlements(f.db,tx,s,f.payload,from,to));
 assert.deepEqual((await read('2026-11-01','2026-11-19')).vouchers,[]);
 await f.post('pay-adjusted');const before=f.rows.size;
 const active=(await read('2026-11-01','2026-11-19')).vouchers;
 assert.deepEqual(active,[{id:'pay-adjusted',purchaseId:'b',workspaceId:'w',branchId:'b',supplierId:'supplier',currency:'SAR',date:withdrawal.date,amount:'23.00',treasuryEntryId:'withdrawal',accountKind:'bank',reversalId:null,reversalDate:null}]);
 assert.equal(f.rows.size,before);assert.equal((await read('2026-11-14','2026-11-19')).vouchers.length,0);
 await f.post('reverse-adjusted');
 assert.equal((await read('2026-11-01','2026-11-14')).vouchers[0].reversalId,null);
 const reversed=(await read('2026-11-01','2026-11-19')).vouchers[0];assert.equal(reversed.reversalId,'reverse-adjusted');assert.equal(reversed.reversalDate,deposit.date);
 const altered={...f.payload,treasuryEntries:f.payload.treasuryEntries.map(e=>e.id==='withdrawal'?{...e,amount:'24.00'}:e)};
 await assert.rejects(f.run(tx=>readSupplierSettlements(f.db,tx,s,altered,'2026-11-01','2026-11-19')));
});

test('private approval provisions verified review and evidence atomically, never posts a second cash entry',async()=>{
 const f=fixture(),path=base+'/supplierSettlementReviews/offset',old=f.rows.get(path);
 f.rows.delete(path);f.rows.delete(base+'/supplierSettlementEvidence/'+old.evidenceDigest);
 const {evidenceDigest,...approval}=old,bytes=Buffer.from('independent proof offset');
 const source={payload:f.payload,meta:{revision:'revision-current',sha256:'a'.repeat(64)},control:{generation:3},closedThrough:null};
 const verified={valid:true,evidenceDigest,verificationDigest:'b'.repeat(64),sourceRevision:source.meta.revision,sourceSha256:source.meta.sha256,periodGeneration:3,approval};
 const provision=(proof=verified,src=source)=>f.run(tx=>provisionVerifiedSupplierSettlement(f.db,tx,s,src,'offset','2026-11-19',bytes,proof));
 const before=f.rows.size;
 for(const patch of [{valid:false},{sourceRevision:'stale'},{periodGeneration:2},{evidenceDigest:'c'.repeat(64)},{approval:{...approval,branchId:'other'}},{approval:{...approval,amount:'47.00'}},{approval:{...approval,privateKey:'never'}}])await assert.rejects(provision({...verified,...patch}));
 await assert.rejects(provision(verified,{...source,closedThrough:approval.date}));
 assert.equal(f.rows.size,before);
 assert.deepEqual(await provision(),{status:'approved',settlementId:'offset'});assert.equal(f.rows.size,before+2);
 assert.deepEqual(await provision(),{status:'approved',settlementId:'offset'});assert.equal(f.rows.size,before+2);
 assert.equal(f.rows.has(base+'/supplierSettlementPostings/offset'),false);
 await f.post('offset');assert.ok(f.rows.has(base+'/supplierSettlementPostings/offset'));
});
