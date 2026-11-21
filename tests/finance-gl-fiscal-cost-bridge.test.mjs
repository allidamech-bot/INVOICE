import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFiscalCostReclassification} from '../api/_accounting/finance-gl-atomic-contract.js';
const scope={accountUid:'owner',workspaceId:'w',egsId:'e',environment:'simulation'};
const purchase={workspaceId:'w',branchId:'b',id:'p',currency:'SAR',status:'posted',date:'2026-11-01',items:[{id:'stock',savedItemId:'sku'},{id:'service'}]};
const original={...scope,key:'purchase-p',source:'purchase',sourceId:'p',currency:'SAR',taxDate:purchase.date,amount:{kind:'invoice',treatment:'domestic',net:'100.00',vat:'15.00',gross:'115.00',deductibleVat:'15.00',lines:[{account:'purchase-cost',side:'debit',amount:'100.00'},{account:'input-vat',side:'debit',amount:'15.00'},{account:'accounts-payable',side:'credit',amount:'115.00'}]}};
const stock={lineId:'stock',itemId:'sku',movementId:'receipt',originalAmount:'92.00',deductibleVat:'12.00',correctedAmount:'80.00',inventoryRelief:'7.00',cogsRelief:'5.00',expenseRelief:'0.00'};
const service={lineId:'service',itemId:null,movementId:null,originalAmount:'23.00',deductibleVat:'3.00',correctedAmount:'20.00',inventoryRelief:'0.00',cogsRelief:'0.00',expenseRelief:'3.00'};
const plan={grossPayable:'115.00',deductibleVat:'15.00',correctedCost:'100.00',lines:[stock,service],valuationBridge:{inventoryRelief:'7.00',cogsRelief:'5.00',expenseRelief:'3.00'}};
const args={scope,purchase,original,plan,effectiveDate:'2026-11-19'};
test('reviewed mixed relief reconciles exact original fiscal VAT without posting it twice',()=>{
 const b=previewFiscalCostReclassification(args);assert.deepEqual(b.lines,[{account:'input-vat',side:'debit',amount:'15.00'},{account:'inventory',side:'credit',amount:'7.00'},{account:'cost-of-sales',side:'credit',amount:'5.00'},{account:'other-expense',side:'credit',amount:'3.00'}]);assert.equal(b.totalCredit,b.totalDebit);assert.equal(b.glPosted,false);assert.equal(b.productionReady,false);assert.equal(b.alreadyRecognizedInFiscalPurchase,true);
});
test('untouched receipts use inventory vs non-stock expense allocation',()=>{
 const strip=({inventoryRelief,cogsRelief,expenseRelief,...x})=>x;
 const b=previewFiscalCostReclassification({...args,plan:{...plan,lines:[strip(stock),strip(service)],valuationBridge:{inventoryRelief:'12.00',cogsRelief:'0.00',expenseRelief:'3.00'}}});assert.equal(b.lines.length,3);assert.equal(b.lines[1].amount,'12.00');
});
test('reject forged cross-scope, typed purchase, invalid dates and incorrect fiscal journal',()=>{
 for(const x of [{...args,scope:{...scope,egsId:'other'}},{...args,purchase:{...purchase,currency:'USD'}},{...args,purchase:{...purchase,purchaseTax:{mode:'tax'}}},{...args,effectiveDate:'2026-10-31'},{...args,original:{...original,amount:{...original.amount,lines:original.amount.lines.map(l=>l.account==='input-vat'?{...l,account:'cash-bank'}:l)}}}])assert.throws(()=>previewFiscalCostReclassification(x));
});
test('reject missing or repeated lines, wrong cost and reallocation despite balanced aggregate',()=>{
 for(const p of [{...plan,lines:[stock,stock]},{...plan,lines:[stock]},{...plan,lines:[{...stock,correctedAmount:'81.00'},service]},{...plan,valuationBridge:{...plan.valuationBridge,inventoryRelief:'8.00',cogsRelief:'4.00'}},{...plan,lines:[stock,{...service,inventoryRelief:'3.00',expenseRelief:'0.00'}],valuationBridge:{inventoryRelief:'10.00',cogsRelief:'5.00',expenseRelief:'0.00'}}])assert.throws(()=>previewFiscalCostReclassification({...args,plan:p}));
});
