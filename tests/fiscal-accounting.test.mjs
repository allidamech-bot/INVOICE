import test from 'node:test';
import assert from 'node:assert/strict';
import {saleAccountingModel,purchaseAccountingModel} from '../api/_fiscal/fiscal-accounting.js';
import {createFiscalPeriodGuard} from '../api/_fiscal/fiscal-period-guard.js';
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
 const tx={get:async ref=>ref.query?{docs:[original,credit].map(v=>({id:v.key,data:()=>v}))}:snap(rows.get(ref.path))};
 const guard=createFiscalPeriodGuard(db),payment={id:'pay',workspaceId,branchId:'b',purchaseId:'p',purchaseNumber:'P-1',currency:'SAR',supplierId:'s',date:'2026-11-11',amount:'92.00'};
 const before={workspaces:[{id:workspaceId}],documents:[],purchases:[purchase],supplierPayments:[]};
 await guard(tx,uid,before,{...before,supplierPayments:[payment]},{operation:'commit'});
 await assert.rejects(guard(tx,uid,before,{...before,supplierPayments:[{...payment,amount:'100.00'}]},{operation:'commit'}),/FISCAL_SETTLEMENT_REVIEW_REQUIRED/);
 await assert.rejects(guard(tx,uid,{...before,supplierPayments:[payment]},before,{operation:'commit'}),/FISCAL_SETTLEMENT_REVIEW_REQUIRED/);
});
