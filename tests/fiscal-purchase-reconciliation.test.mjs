import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDomesticPurchase,canReplayAdjustedSupplierPayable} from '../api/_fiscal/purchase-reconciliation.mjs';
import {supplierSettlementTimeline} from '../api/_fiscal/settlement-integrity.mjs';
import {projectSupplierAPJournal} from '../api/_fiscal/supplier-ap-reconciliation.mjs';
const scope={workspaceId:'w',branchId:'b',currency:'SAR'};
const purchase={...scope,id:'p',number:'P-1',date:'2026-11-01',status:'posted',supplierSnapshot:{sourceSupplierId:'s'},items:[{savedItemId:'i',quantity:'2',unitCost:'57.50',landedUnitCost:'57.50'}]};
const amount={kind:'invoice',treatment:'domestic',net:'100.00',vat:'15.00',gross:'115.00',deductibleVat:'0.00'};
const movement={...scope,id:'m',sourceId:'p',type:'purchase',date:purchase.date,itemId:'i',quantity:'2',unitCost:'57.50'};
const payment={...scope,id:'pay',purchaseId:'p',purchaseNumber:'P-1',supplierId:'s',date:'2026-11-02',amount:'30.00'};
const base={purchase,amount,landedTotal:'115.00',movements:[movement],payments:[payment],through:'2026-11-30'};
test('reconciles domestic payable, original tracked stock and supplier payment',()=>{const r=reconcileDomesticPurchase(base);assert.equal(r.matched,true);assert.equal(r.fiscalOutstanding,'85.00');assert.equal(r.recordedInboundStock,'115.00');});
test('recoverable VAT exposes cost overstatement without pretending inventory was corrected',()=>{const r=reconcileDomesticPurchase({...base,amount:{...amount,deductibleVat:'15.00'}});assert.equal(r.matched,false);assert.equal(r.costDifference,'15.00');assert.equal(r.fiscalCost,'100.00');assert.equal(r.fiscalPayable,'115.00');});
test('wrong stock quantity, duplicate movement, or cross-branch movement cannot reconcile',()=>{for(const movements of [[{...movement,quantity:'1'}],[movement,movement],[{...movement,branchId:'other'}]])assert.equal(reconcileDomesticPurchase({...base,movements}).stockMatches,false);});
test('payments are historical as of report date and voided payments are excluded only after void',()=>{const p={...payment,voidedAt:'2026-12-01T00:00:00Z'};assert.equal(reconcileDomesticPurchase({...base,payments:[p]}).paid,'30.00');assert.equal(reconcileDomesticPurchase({...base,payments:[p],through:'2026-12-01'}).paid,'0.00');});
test('duplicate, wrong supplier or excess payments do not reconcile',()=>{for(const payments of [[payment,payment],[{...payment,supplierId:'other'}],[{...payment,amount:'116.00'}]])assert.equal(reconcileDomesticPurchase({...base,payments}).paymentsMatch,false);});
test('untracked purchases do not fabricate stock, and mismatched gross is surfaced',()=>{const r=reconcileDomesticPurchase({...base,purchase:{...purchase,items:[{savedItemId:''}]},movements:[],landedTotal:'114.00'});assert.equal(r.stockMatches,true);assert.equal(r.recordedInboundStock,'0.00');assert.equal(r.matched,false);});

test('typed purchase payable and inventory cost reconcile separately without a second deduction',()=>{const r=reconcileDomesticPurchase({...base,amount:{...amount,deductibleVat:'15.00'},purchase:{...purchase,items:[{...purchase.items[0],unitCost:'50.00',landedUnitCost:'50.00'}]},landedTotal:'100.00',payableTotal:'115.00',movements:[{...movement,unitCost:'50.00'}]});assert.equal(r.matched,true);assert.equal(r.fiscalPayable,'115.00');assert.equal(r.legacyCost,'100.00');assert.equal(r.recordedInboundStock,'100.00');assert.equal(r.costDifference,'0.00');assert.equal(r.legacyOutstanding,'85.00');});

test('verified debit extends AP replay but does not authorize payment or clear the legacy close blocker',()=>{
 const original={...scope,key:'purchase-p',source:'purchase',sourceId:purchase.id,originalId:null,taxDate:purchase.date,amount:{...amount,lines:[{account:'purchase-cost',side:'debit',amount:'115.00'},{account:'accounts-payable',side:'credit',amount:'115.00'}]}};
 const debit={...original,key:'debit-1',originalId:purchase.id,taxDate:'2026-11-02',amount:{kind:'debit-note',treatment:'domestic',net:'20.00',vat:'3.00',gross:'23.00',deductibleVat:'0.00',lines:[{account:'purchase-cost',side:'debit',amount:'23.00'},{account:'accounts-payable',side:'credit',amount:'23.00'}]}};
 const paid={...payment,date:'2026-11-03',amount:'130.00'};
 const reconciliation=reconcileDomesticPurchase({...base,payments:[paid]});
 const input={purchase,original,adjustments:[debit],payments:[paid],through:base.through};
 const timeline=supplierSettlementTimeline(input);
 assert.equal(reconciliation.paymentEvidenceMatches,true);
 assert.equal(reconciliation.paymentsMatch,false);
 assert.equal(reconciliation.matched,false);
 assert.equal(canReplayAdjustedSupplierPayable(reconciliation,timeline),true);
 const journal=projectSupplierAPJournal({...input,settlementJournals:[],legacyPayable:'115.00'});
 assert.equal(journal.adjustedPayable,'138.00');assert.equal(journal.outstanding,'8.00');
 assert.equal(canReplayAdjustedSupplierPayable(reconciliation,supplierSettlementTimeline({...input,adjustments:[]})),false);
 assert.equal(canReplayAdjustedSupplierPayable(reconciliation,supplierSettlementTimeline({...input,payments:[{...paid,date:purchase.date}]})),false);
 for(const payments of [[paid,paid],[{...paid,branchId:'wrong'}],[{...paid,supplierId:'wrong'}],[{...paid,purchaseNumber:'wrong'}]]){
   const bad=reconcileDomesticPurchase({...base,payments});
   assert.equal(bad.paymentEvidenceMatches,false);
   assert.equal(canReplayAdjustedSupplierPayable(bad,timeline),false);
 }
 assert.equal(canReplayAdjustedSupplierPayable({...reconciliation,legacyPayable:'114.00'},timeline),false);
 assert.equal(canReplayAdjustedSupplierPayable(reconciliation,{...timeline,paid:'129.00'}),false);
});
