import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {outputVatReport} from '../dist/src/lib/tax-vat.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {createAdvanceRefundDraft,advanceRefundCapacity,assertDocumentLifecycleInvariant} from '../dist/src/lib/document-lifecycle.js';
import {accountedInvoiceCreditNotes,assertInvoicePaymentInvariant} from '../dist/src/lib/payments.js';
import {assertFiscalAdvanceIntegrity,fiscalAdvanceBalances,fiscalReceivableCents,fiscalRecognizedTax,isFiscalAdvanceReceipt,readFiscalAdvance} from '../dist/src/lib/fiscal-advance-commercial.js';
const digest='a'.repeat(64),scope={workspaceId:'w',branchId:'b',currency:'SAR'},party={customerSnapshot:{sourceCustomerId:'c',vatTaxNumber:'300000000000003'},companySnapshot:{vatNumber:'300000000000013'}},common={...scope,...party,kind:'invoice',role:'standard',status:'final',lifecycleStatus:'active',items:[{stockTreatment:'non-stock'}]};
const receipt={...common,id:'advance',number:'A1',issueDate:'2026-11-01',fiscalAdvance:{kind:'receipt',net:'100.00',vat:'15.00',gross:'115.00',evidenceDigest:digest,treasuryEntryId:'cash1'}};
const settlement={...common,id:'invoice',number:'I1',issueDate:'2026-11-05',fiscalAdvance:{kind:'settlement',net:'60.00',vat:'9.00',gross:'69.00',evidenceDigest:digest,allocations:[{receiptId:'advance',net:'60.00',vat:'9.00',gross:'69.00'}]}};
const cash={...scope,id:'cash1',date:receipt.issueDate,type:'deposit',sourceType:'manual',sourceId:'',fromAccountId:'',toAccountId:'bank',amount:'115.00',voidedAt:''};
const account={...scope,id:'bank'};
const vault={documents:[receipt,settlement],payments:[],treasuryEntries:[cash],treasuryAccounts:[account],inventoryMovements:[]};
const totals=d=>d.id==='advance'?{grandTotal:'115.00',tax:'15.00'}:{grandTotal:'230.00',tax:'30.00'};
const check=v=>assertFiscalAdvanceIntegrity(v,totals);
test('advance receipt is a distinct settled liability, final supply owes only unapplied amount',()=>{check(vault);assert.equal(isFiscalAdvanceReceipt(receipt),true);assert.equal(fiscalReceivableCents(receipt,11500n),0n);assert.equal(fiscalReceivableCents(settlement,23000n),16100n);assert.deepEqual(fiscalRecognizedTax(settlement,20000n,3000n),{net:14000n,vat:2100n});});
test('as-of projection keeps advance outstanding until the dated application',()=>{assert.equal(fiscalAdvanceBalances(vault.documents,'2026-11-04')[0].remaining,'115.00');assert.equal(fiscalAdvanceBalances(vault.documents,'2026-11-05')[0].remaining,'46.00');});
test('rejects duplicated treasury deposit, voided deposit, missing cash, and wrong scope',()=>{for(const patch of [{treasuryEntries:[]},{treasuryEntries:[{...cash,voidedAt:'2026-11-02T00:00Z'}]},{treasuryEntries:[{...cash,branchId:'other'}]},{documents:[...vault.documents,{...receipt,id:'duplicate'}]}])assert.throws(()=>check({...vault,...patch}));});
test('rejects unsupported physical stock or a separate cash payment on the receipt',()=>{assert.throws(()=>check({...vault,inventoryMovements:[{sourceId:'advance'}]}));assert.throws(()=>check({...vault,payments:[{invoiceId:'advance'}]}));assert.throws(()=>readFiscalAdvance({...receipt,items:[{stockTreatment:'tracked'}]}));});
test('partial applications cannot exceed the original component amounts or cross customers',()=>{const extra={...settlement,id:'i2',number:'I2',issueDate:'2026-11-06'};assert.throws(()=>check({...vault,documents:[...vault.documents,extra]}));assert.throws(()=>check({...vault,documents:[receipt,{...settlement,customerSnapshot:{...party.customerSnapshot,sourceCustomerId:'other'}}]}));});
test('real final invoice payment can only settle remaining AR, not already received advance',()=>{const p={...scope,id:'p',invoiceId:'invoice',invoiceNumber:'I1',customerId:'c',date:'2026-11-06',amount:'161.00'};check({...vault,payments:[p]});assert.throws(()=>check({...vault,payments:[{...p,amount:'161.01'}]}));});
test('ordinary invoice keeps the original AR and VAT treatment',()=>{const d={...common,id:'ordinary'};assert.equal(readFiscalAdvance(d),undefined);assert.equal(fiscalReceivableCents(d,23000n),23000n);assert.deepEqual(fiscalRecognizedTax(d,20000n,3000n),{net:20000n,vat:3000n});});
test('malformed scope, noncanonical amounts and future application fail closed',()=>{assert.throws(()=>readFiscalAdvance({...settlement,fiscalAdvance:{...settlement.fiscalAdvance,gross:'69'}}));assert.throws(()=>check({...vault,documents:[receipt,{...settlement,issueDate:'2026-10-31'}]}));});

const refund={...common,id:'refund',number:'CN1',role:'credit-note',creditForId:'advance',creditForNumber:'A1',issueDate:'2026-11-09',fiscalAdvance:{kind:'refund',net:'40.00',vat:'6.00',gross:'46.00',evidenceDigest:digest,receiptId:'advance',treasuryEntryId:'cash2',resultDigest:'b'.repeat(64),cashDigest:'c'.repeat(64)}};
const withdrawal={...cash,id:'cash2',date:refund.issueDate,type:'withdrawal',fromAccountId:'bank',toAccountId:'',amount:'46.00'};
const refundVault={...vault,documents:[...vault.documents,refund],treasuryEntries:[cash,withdrawal]};
const refundTotals=d=>d.id==='refund'?{grandTotal:'46.00',tax:'6.00'}:totals(d);
test('posted advance refund consumes remaining liability, not receivables or inventory, and preserves dated balances',()=>{
 assertFiscalAdvanceIntegrity(refundVault,refundTotals);
 assert.equal(fiscalReceivableCents(refund,4600n),0n);
 assert.deepEqual(fiscalRecognizedTax(refund,4000n,600n),{net:4000n,vat:600n});
 assert.deepEqual(fiscalAdvanceBalances(refundVault.documents,'2026-11-08')[0],{receiptId:'advance',number:'A1',date:'2026-11-01',gross:'115.00',applied:'69.00',refunded:'0.00',remaining:'46.00'});
 assert.deepEqual(fiscalAdvanceBalances(refundVault.documents,'2026-11-09')[0],{receiptId:'advance',number:'A1',date:'2026-11-01',gross:'115.00',applied:'69.00',refunded:'46.00',remaining:'0.00'});
});
test('refund fails closed with ordinary credit, duplicate cash, unrelated party, stock, separate payment or excess capacity',()=>{
 const check=v=>assertFiscalAdvanceIntegrity(v,refundTotals);
 for(const bad of [
  {...refundVault,documents:[receipt,settlement,{...refund,fiscalAdvance:undefined}]},
  {...refundVault,treasuryEntries:[cash]},
  {...refundVault,treasuryEntries:[cash,withdrawal,withdrawal]},
  {...refundVault,treasuryEntries:[cash,{...withdrawal,type:'deposit'}]},
  {...refundVault,documents:[receipt,settlement,{...refund,creditForNumber:'wrong'}]},
  {...refundVault,documents:[receipt,settlement,{...refund,customerSnapshot:{...refund.customerSnapshot,sourceCustomerId:'other'}}]},
  {...refundVault,payments:[{invoiceId:'refund'}]},
  {...refundVault,inventoryMovements:[{sourceId:'refund'}]},
  {...refundVault,documents:[receipt,settlement,{...refund,items:[{stockTreatment:'tracked'}]}]},
  {...refundVault,documents:[receipt,settlement,refund,{...settlement,id:'extra'}]}
 ])assert.throws(()=>check(bad));
});

test('refund is a VAT reversal and negative cash collection, never a sales credit or AR settlement',()=>{
 const v=emptyVault(),make=(source,amount)=>{const d=createBlankDocument('invoice',source.number,v.company);return {...d,...source,adjustments:{...d.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:true,taxPercent:'15'},items:[{...d.items[0],descriptionEn:'Advance',stockTreatment:'non-stock',savedItemId:'',quantity:'1',unitPrice:amount}]};};
 const a=make(receipt,'100'),b=make(refund,'40'),docs=[a,b];
 const before=outputVatReport(docs,'2026-11-01','2026-11-08'),after=outputVatReport(docs,'2026-11-01','2026-11-09');
 assert.equal(before.currencies[0].outputVat,'15.00');
 assert.equal(after.currencies[0].outputVat,'9.00');
 assert.equal(after.currencies[0].creditVat,'-6.00');
 assert.equal(after.rows.find(x=>x.documentId===b.id).creditNote,true);
 assert.deepEqual(accountedInvoiceCreditNotes(a,docs),[]);
 assert.doesNotThrow(()=>assertInvoicePaymentInvariant(a,[],docs));
 const result=financialReportByCurrency(docs,[],'2026-11-01','2026-11-09')[0];
 assert.equal(result.collected,'69.00');assert.equal(result.invoiced,'0.00');assert.equal(result.creditNotes,0);
});

test('dedicated advance refund drafts are inert and cannot become ordinary final credits',()=>{
 const v=emptyVault(),d=createBlankDocument('invoice','ADV-2',v.company),a={...d,...receipt,items:[{...d.items[0],descriptionEn:'Advance',stockTreatment:'non-stock',savedItemId:'',quantity:'1',unitPrice:'100'}],adjustments:{...d.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:true,taxPercent:'15'}};
 const credit=createAdvanceRefundDraft(a,'CN-TEST','46.00',{mode:'invoice-tax',reason:'Unused advance'},[a]);
 assert.equal(credit.status,'draft');assert.equal(credit.fiscalAdvance,undefined);assert.equal(credit.role,'credit-note');assert.equal(credit.items[0].stockTreatment,'non-stock');
 assert.equal(advanceRefundCapacity(a,[a,credit]),'115.00');
 assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(credit,[a,credit],[]));
 assert.throws(()=>assertDocumentLifecycleInvariant({...credit,status:'final'},[a,credit],[]));
 assert.throws(()=>createAdvanceRefundDraft(a,'CN-TEST','116.00',{mode:'invoice-tax',reason:'Unused advance'},[a]));
 assert.throws(()=>createAdvanceRefundDraft(a,'CN-TEST','46.00',{mode:'keep-vat',reason:'Unused advance'},[a]));
});
