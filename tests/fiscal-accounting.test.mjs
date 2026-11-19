import test from 'node:test';
import assert from 'node:assert/strict';
import {saleAccountingModel,purchaseAccountingModel} from '../api/_fiscal/fiscal-accounting.js';
import {createFiscalPeriodGuard,assertFiscalWorkspacePublication} from '../api/_fiscal/fiscal-period-guard.js';
const totals={taxExclusiveTotal:'100.00',vatTotal:'15.00',taxInclusiveTotal:'115.00'};
const mapped=(kind,extra={})=>({invoice:{kind,currency:'SAR'},candidate:{totals,...extra}});
const by=(m,account)=>m.lines.find(l=>l.account===account);
test('balanced ordinary invoice and reversed credit note preserve receivable and output VAT',()=>{
 const m=saleAccountingModel(mapped('invoice')),c=saleAccountingModel(mapped('credit-note'));
 assert.deepEqual(by(m,'accounts-receivable'),{account:'accounts-receivable',side:'debit',amount:'115.00'});
 assert.deepEqual(by(m,'output-vat'),{account:'output-vat',side:'credit',amount:'15.00'});
 assert.deepEqual(by(c,'output-vat'),{account:'output-vat',side:'debit',amount:'15.00'});
});
test('advance receipt and settlement do not recognize the same output VAT twice',()=>{
 const a=saleAccountingModel(mapped('prepayment',{prepaymentContext:{kind:'receipt'}}));
 assert.equal(by(a,'customer-advances').amount,'100.00');
 const b=saleAccountingModel(mapped('invoice',{prepaymentContext:{kind:'adjustment',rows:[{net:'60.00',vat:'9.00'}],prepaid:'69.00',payable:'46.00'}}));
 assert.equal(b.recognizedVat,'6.00');assert.equal(b.recognizedNet,'40.00');
 assert.equal(by(b,'accounts-receivable').amount,'46.00');
 assert.equal(by(b,'customer-advances').amount,'60.00');
 assert.throws(()=>saleAccountingModel(mapped('invoice',{prepaymentContext:{kind:'adjustment',rows:[{net:'60.00',vat:'9.00'}],prepaid:'69.00',payable:'47.00'}})));
});
test('purchase cost, deductible and payable remain distinct; credit reverses them',()=>{
 const r={kind:'invoice',net:'100.00',vat:'15.00',deductibleVat:'10.00',gross:'115.00',category:'S',rate:'15'};
 const m=purchaseAccountingModel(r);assert.equal(by(m,'purchase-cost').amount,'105.00');assert.equal(by(m,'input-vat').amount,'10.00');assert.equal(by(m,'accounts-payable').amount,'115.00');
 assert.equal(by(purchaseAccountingModel({...r,kind:'credit-note'}),'input-vat').side,'credit');
 assert.throws(()=>purchaseAccountingModel({...r,deductibleVat:'16.00'}));assert.throws(()=>purchaseAccountingModel({...r,gross:'114.00'}));
});
test('QA period writer rejects edits, deletion, alternate finalization and fiscal close before reconciliation',async()=>{
 const uid='owner',workspaceId='qa',base='fiscalPrivateV1/owner/workspaces/qa',rows=new Map([[base,{accountUid:uid,workspaceId,environment:'simulation',syntheticOnly:true}]]);
 const guard=createFiscalPeriodGuard({doc:path=>({path})}),tx={get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)})};
 const d={id:'doc',workspaceId,kind:'invoice',status:'draft',companySnapshot:{country:'SA'}},before={workspaces:[{id:workspaceId}],documents:[d],purchases:[]};
 await guard(tx,uid,before,before,{operation:'commit'});
 await assert.rejects(guard(tx,uid,before,{...before,documents:[{...d,status:'final'}]},{operation:'commit'}),/FISCAL_DOCUMENT_LOCKED/);
 rows.set(base+'/issueIntents/doc',{});await assert.rejects(guard(tx,uid,before,{...before,documents:[]},{operation:'commit'}),/FISCAL_DOCUMENT_LOCKED/);
 await assert.rejects(guard(tx,uid,before,before,{operation:'close',workspaceId}),/FISCAL_PERIOD_RECONCILIATION_REQUIRED/);
});

test('import and reverse charge use a distinct tax-only journal without recording the supplier purchase twice',()=>{
 const r={kind:'invoice',net:'100.00',vat:'15.00',deductibleVat:'10.00',gross:'115.00',category:'S',rate:'15'};
 const i=purchaseAccountingModel({...r,treatment:'import'}),c=purchaseAccountingModel({...r,treatment:'reverse-charge'});
 assert.equal(by(i,'customs-vat-clearing').amount,'15.00');assert.equal(by(i,'purchase-tax-cost').amount,'5.00');assert.equal(by(i,'accounts-payable'),undefined);
 assert.equal(by(c,'output-vat').amount,'15.00');assert.equal(c.selfAssessedVat,'15.00');assert.equal(i.selfAssessedVat,'0.00');
 assert.throws(()=>purchaseAccountingModel({...r,treatment:'reverse-charge',kind:'credit-note'}));assert.throws(()=>purchaseAccountingModel({...r,treatment:'import',vat:'16.00',gross:'116.00'}));
});
test('scope-locked purchases with imported tax evidence cannot be rewritten by ordinary workspace publication',async()=>{
 const uid='owner',workspaceId='qa',base='fiscalPrivateV1/owner/workspaces/qa',rows=new Map([[base,{accountUid:uid,workspaceId,environment:'simulation',syntheticOnly:true}],[base+'/purchaseTreatmentClaims/p',{key:'purchase-adjustment-a'}]]);
 const guard=createFiscalPeriodGuard({doc:path=>({path})}),tx={get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)})};
 const before={workspaces:[{id:workspaceId}],documents:[],purchases:[{id:'p',workspaceId,status:'posted'}]};
 await assert.rejects(guard(tx,uid,before,{...before,purchases:[{...before.purchases[0],status:'reversed'}]},{operation:'commit'}),/FISCAL_PURCHASE_LOCKED/);
});


test('fiscal supplier dispatch and original posted inbound receipt cannot be changed through workspace sync',async()=>{
 const uid='owner',workspaceId='qa',base='fiscalPrivateV1/owner/workspaces/qa',rows=new Map([[base,{accountUid:uid,workspaceId,environment:'simulation',syntheticOnly:true}],[base+'/accountingEntries/purchase-p',{}]]);
 const guard=createFiscalPeriodGuard({doc:path=>({path})}),tx={get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)})};
 const receipt={id:'m',workspaceId,type:'purchase',sourceId:'p',quantity:'2'},dispatch={id:'fiscal-purchase-return:a:l',workspaceId,type:'purchase-reversal',sourceId:'p',quantity:'-1'};
 const before={workspaces:[{id:workspaceId}],documents:[],purchases:[{id:'p',workspaceId,status:'posted'}],inventoryMovements:[receipt,dispatch]};
 await guard(tx,uid,before,before,{operation:'commit'});
 await assert.rejects(guard(tx,uid,before,{...before,inventoryMovements:[receipt]},{operation:'commit'}),/FISCAL_PURCHASE_RETURN_LOCKED/);
 await assert.rejects(guard(tx,uid,before,{...before,inventoryMovements:[{...receipt,quantity:'3'},dispatch]},{operation:'commit'}),/FISCAL_PURCHASE_LOCKED/);
 await assert.rejects(guard(tx,uid,before,{...before,inventoryMovements:[receipt,dispatch,{...dispatch,id:'fiscal-purchase-return:another:l'}]},{operation:'commit'}),/FISCAL_PURCHASE_RETURN_LOCKED/);
});


test('fiscal payment publication validates adjusted liability with the same transaction as workspace commit',async()=>{
 const uid='owner',workspaceId='qa',base='fiscalPrivateV1/owner/workspaces/qa',scope={accountUid:uid,workspaceId,egsId:'e',environment:'simulation',currency:'SAR',source:'purchase',sourceId:'p',issuerVat:'issuer',counterpartyVat:'supplier',category:'S',rate:'15'};
 const {reviewDigest}=await import('../api/_fiscal/commercial-source.js');
 const purchase={id:'p',workspaceId,branchId:'b',currency:'SAR',number:'P-1',status:'posted',date:'2026-11-01',supplierSnapshot:{sourceSupplierId:'s'}};
 const original={...scope,key:'purchase-p',sourceFingerprint:reviewDigest(purchase),taxDate:'2026-11-01',amount:{kind:'invoice',treatment:'domestic',net:'100.00',vat:'15.00',gross:'115.00',deductibleVat:'0.00'}};
 const credit={...original,key:'purchase-adjustment-a',originalId:'p',taxDate:'2026-11-10',amount:{kind:'credit-note',treatment:'domestic',net:'20.00',vat:'3.00',gross:'23.00',deductibleVat:'0.00'}};
 const rows=new Map([[base,{...scope,syntheticOnly:true}],[base+'/accountingEntries/purchase-p',original]]),snap=v=>({exists:!!v,data:()=>v});
 const db={doc:path=>({path}),collection:path=>({where(){return this;},limit(){return {path,query:true};}})};
 const tx={get:async ref=>ref.query?{docs:(ref.path.endsWith('/supplierSettlementPostings')?[]:[original,credit]).map(v=>({id:v.key,data:()=>v}))}:snap(rows.get(ref.path))};
 const guard=createFiscalPeriodGuard(db),payment={id:'pay',workspaceId,branchId:'b',purchaseId:'p',purchaseNumber:'P-1',currency:'SAR',supplierId:'s',date:'2026-11-11',amount:'92.00'};
 const before={workspaces:[{id:workspaceId}],documents:[],purchases:[purchase],supplierPayments:[]};
 await guard(tx,uid,before,{...before,supplierPayments:[payment]},{operation:'commit'});
 await assert.rejects(guard(tx,uid,before,{...before,supplierPayments:[{...payment,amount:'100.00'}]},{operation:'commit'}),/FISCAL_SETTLEMENT_REVIEW_REQUIRED/);
 await assert.rejects(guard(tx,uid,{...before,supplierPayments:[payment]},before,{operation:'commit'}),/FISCAL_SETTLEMENT_REVIEW_REQUIRED/);
});

test('advance deposit reservation protects its treasury account identity even when cash is unchanged',async()=>{
 const {assertAdvanceContinuity}=await import('../api/_fiscal/advance-commercial.js');
 const {reviewDigest}=await import('../api/_fiscal/commercial-source.js');
 const accountUid='owner',workspaceId='qa',scope={accountUid,workspaceId};
 const bank={id:'bank',workspaceId,branchId:'b',currency:'SAR',active:true,name:'bank'};
 const deposit={id:'deposit',workspaceId,branchId:'b',currency:'SAR',type:'deposit',toAccountId:'bank',amount:'115.00'};
 const before={treasuryAccounts:[bank],treasuryEntries:[deposit],documents:[]};
 const db={doc:path=>({path})},root='fiscalPrivateV1/owner/',digest=reviewDigest(deposit.id);
 const reservation=root+'advanceTreasuryReservations/'+digest,index=root+'advanceTreasuryIndex/'+digest;
 const rows=new Set([reservation]),tx={get:async ref=>({exists:rows.has(ref.path)})};
 const candidate=accounts=>({...before,treasuryAccounts:accounts});
 await assertAdvanceContinuity(db,tx,scope,before,candidate([{...bank,name:'renamed'}]));
 for(const accounts of [[],[{...bank,branchId:'other'}],[{...bank,currency:'USD'}],[{...bank,workspaceId:'other'}],[bank,bank],[{...bank,active:false}]]){
   await assert.rejects(assertAdvanceContinuity(db,tx,scope,before,candidate(accounts)),/FISCAL_ADVANCE_CASH_LOCKED/);
 }
 rows.add(index);
 await assertAdvanceContinuity(db,tx,scope,before,candidate([{...bank,active:false}]));
 await assert.rejects(assertAdvanceContinuity(db,tx,scope,before,candidate([])),/FISCAL_ADVANCE_CASH_LOCKED/);
 rows.clear();
 await assertAdvanceContinuity(db,tx,scope,before,candidate([{...bank,active:false}]));
});

test('applications and refunds reserve the same receipt capacity and refund withdrawals are globally unique',async()=>{
 const {planSharedAdvanceCapacity,assertAdvanceContinuity}=await import('../api/_fiscal/advance-commercial.js');
 const {reviewDigest}=await import('../api/_fiscal/commercial-source.js');
 const s={accountUid:'owner',workspaceId:'qa',egsId:'e',environment:'simulation'},base='fiscalPrivateV1/owner/workspaces/qa/advanceBalances/r';
 const binding={uuid:'original',version:3,snapshotDigest:'a'.repeat(64),resultDigest:'b'.repeat(64),artifactDigest:'c'.repeat(64)},cap={net:'100.00',vat:'15.00'};
 const common={receiptId:'r',binding,cap,snapshotDigest:'d'.repeat(64)};
 const rows=new Map(),db={doc:path=>({path})};
 async function run(args){let writes=[];const tx={get:async ref=>{assert.equal(writes.length,0);return {exists:rows.has(ref.path),data:()=>rows.get(ref.path)}},create:(ref,row)=>{assert.ok(!rows.has(ref.path));writes.push([ref.path,row])},update:(ref,row)=>{assert.ok(rows.has(ref.path));writes.push([ref.path,row])}};const p=await planSharedAdvanceCapacity(db,tx,s,args);p.write(tx);for(const [k,v] of writes)rows.set(k,v);}
 await assert.rejects(run({...common,documentId:undefined,uuid:'application-uuid',net:'60.00',vat:'9.00'}));
 await assert.rejects(run({...common,documentId:'application',uuid:binding.uuid,net:'60.00',vat:'9.00'}));
 await run({...common,documentId:'application',uuid:'application-uuid',net:'60.00',vat:'9.00'});
 const refund={treasuryEntryId:'withdrawal',cashDigest:'e'.repeat(64),evidenceDigest:'f'.repeat(64)};
 await assert.rejects(run({...common,documentId:'refund',uuid:'refund-uuid',net:'41.00',vat:'6.00',refund}),/FISCAL_ADVANCE_CAPACITY_EXCEEDED/);
 const ref='fiscalPrivateV1/owner/advanceTreasuryReservations/'+reviewDigest(refund.treasuryEntryId);
 assert.equal(rows.has(ref),false);
 await run({...common,documentId:'refund',uuid:'refund-uuid',net:'30.00',vat:'4.50',refund});
 assert.deepEqual(rows.get(base).reserved,{net:'90.00',vat:'13.50'});
 assert.equal(rows.get(base+'/reservations/refund').kind,'advance-refund');
 assert.equal(rows.get(ref).documentId,'refund');
 await assert.rejects(run({...common,documentId:'other',uuid:'other-uuid',net:'10.00',vat:'1.50',refund}),/FISCAL_ADVANCE_CASH_ALREADY_CLAIMED/);
 await assert.rejects(run({...common,documentId:'refund',uuid:'refund-uuid',net:'10.00',vat:'1.50'}),/FISCAL_ADVANCE_ALREADY_RESERVED/);
 const bank={id:'bank',workspaceId:'qa',branchId:'b',currency:'SAR',active:true},withdrawal={id:'withdrawal',workspaceId:'qa',branchId:'b',currency:'SAR',type:'withdrawal',fromAccountId:'bank',amount:'34.50'};
 const before={documents:[],treasuryAccounts:[bank],treasuryEntries:[withdrawal]},tx={get:async ref=>({exists:rows.has(ref.path)})};
 await assert.rejects(assertAdvanceContinuity(db,tx,s,before,{...before,treasuryAccounts:[]}),/FISCAL_ADVANCE_CASH_LOCKED/);
 await assert.rejects(assertAdvanceContinuity(db,tx,s,before,{...before,treasuryEntries:[{...withdrawal,amount:'1.00'}]}),/FISCAL_ADVANCE_CASH_LOCKED/);
});
test('advance posting and report reject corrupted shared application reservation and original posting',async()=>{
 const {assertAdvanceAllocationClaim}=await import('../api/_fiscal/advance-commercial.js');
 const {reviewDigest}=await import('../api/_fiscal/commercial-source.js');
 const s={accountUid:'owner',workspaceId:'qa',egsId:'e',environment:'simulation'},receipt={id:'r',fiscalAdvance:{kind:'receipt',net:'100.00',vat:'15.00'}};
 const posting={...s,source:'sale',key:'sale-r',sourceId:'r',commercialPosted:true,amount:{kind:'prepayment'},finalFingerprint:reviewDigest(receipt),advanceBinding:receipt.fiscalAdvance,uuid:'receipt',snapshotDigest:'a'.repeat(64),evidenceDigest:'b'.repeat(64)};
 const settlement={documentId:'a',uuid:'application',snapshotDigest:'c'.repeat(64)},allocation={net:'60.00',vat:'9.00'};
 const claim={...s,...settlement,...allocation,state:'reserved'},balance={...s,originalDocumentId:'r',binding:{uuid:posting.uuid,snapshotDigest:posting.snapshotDigest,resultDigest:posting.evidenceDigest,artifactDigest:'d'.repeat(64)},cap:{net:'100.00',vat:'15.00'},reserved:{net:'70.00',vat:'10.50'}};
 assertAdvanceAllocationClaim(s,receipt,posting,settlement,claim,balance,allocation);
 for(const bad of [{...claim,kind:'advance-refund'},{...claim,net:'59.00'},{...claim,egsId:'other'},{...claim,snapshotDigest:'e'.repeat(64)},null])assert.throws(()=>assertAdvanceAllocationClaim(s,receipt,posting,settlement,bad,balance,allocation));
 for(const bad of [{...balance,reserved:{net:'59.00',vat:'9.00'}},{...balance,reserved:{net:'101.00',vat:'15.00'}},{...balance,binding:{...balance.binding,artifactDigest:'bad'}}])assert.throws(()=>assertAdvanceAllocationClaim(s,receipt,posting,settlement,claim,bad,allocation));
 assert.throws(()=>assertAdvanceAllocationClaim(s,receipt,{...posting,commercialPosted:false},settlement,claim,balance,allocation));
});

test('server-enrolled fiscal scope cannot be bypassed by seller country, currency, ordinary mode or missing tax number',()=>{
 const scope={environment:'simulation',syntheticOnly:true};
 const draft={kind:'invoice',status:'draft',invoiceMode:'ordinary',companySnapshot:{country:'Türkiye',vatNumber:''},currency:'USD'};
 for(const next of [{...draft,status:'final'},{...draft,status:'final',currency:'SAR'},{...draft,status:'final',invoiceMode:'tax'},{...draft,status:'final',invoiceMode:undefined,companySnapshot:{}},{...draft,status:'final',role:'credit-note'}]) {
  assert.throws(()=>assertFiscalWorkspacePublication(scope,draft,next),/FISCAL_DOCUMENT_LOCKED/);
  assert.throws(()=>assertFiscalWorkspacePublication(scope,next,undefined),/FISCAL_DOCUMENT_LOCKED/);
  assert.throws(()=>assertFiscalWorkspacePublication(scope,next,draft),/FISCAL_DOCUMENT_LOCKED/);
 }
 assert.doesNotThrow(()=>assertFiscalWorkspacePublication(scope,undefined,draft));
 assert.doesNotThrow(()=>assertFiscalWorkspacePublication(scope,draft,undefined));
 assert.doesNotThrow(()=>assertFiscalWorkspacePublication(scope,undefined,{kind:'proforma',status:'final'}));
 assert.throws(()=>assertFiscalWorkspacePublication({environment:'production',syntheticOnly:false},draft,draft),/FISCAL_SCOPE_INVALID/);
});
