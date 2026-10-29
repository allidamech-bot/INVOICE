import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previewFinanceInventoryTrialBalance,
  previewAppendFinanceInventoryJournal
} from '../dist/src/lib/finance-gl-foundation.js';

const control={workspaceId:'QA-company-A',branchId:'QA-branch-main',
  functionalCurrency:'USD',asOfDate:'2026-10-27',currencyMinorDigits:2,
  inventoryAssetAccountId:'1100-stock',supplierPayableAccountId:'2100-ap',
  salesCogsAccountId:'5100-cogs',inventoryAllowanceAccountId:'1190-nrv-contra',
  impairmentExpenseAccountId:'5200-impairment'};
const accounts={
 'purchase-receipt':[control.inventoryAssetAccountId,control.supplierPayableAccountId],
 'sales-stock-issue':[control.salesCogsAccountId,control.inventoryAssetAccountId],
 'nrv-write-down':[control.impairmentExpenseAccountId,control.inventoryAllowanceAccountId],
 'nrv-reversal':[control.inventoryAllowanceAccountId,control.impairmentExpenseAccountId]
};
function row(kind,id,amount,date='2026-10-25'){
 const [debit,credit]=accounts[kind];
 return{id:'qa-journal-'+id,sourceKind:kind,sourceMovementId:id,
  effectiveDate:date,workspaceId:control.workspaceId,branchId:control.branchId,
  currency:'USD',lines:[
   {accountId:debit,direction:'debit',amount},
   {accountId:credit,direction:'credit',amount}
  ]};
}
function history(){return[
 row('purchase-receipt','purchase-1','24.00','2026-10-19'),
 row('purchase-receipt','purchase-2','20.00','2026-10-20'),
 row('sales-stock-issue','sale-1','22.00','2026-10-21'),
 row('nrv-write-down','nrv-1','7.00','2026-10-25')
];}
const run=(rows=history(),controls=control)=>previewFinanceInventoryTrialBalance(controls,rows);
const rejected=(rows,controls=control)=>assert.throws(()=>run(rows,controls),/ALIF_22_GL_UNTRUSTED/);

test('trial balance reconciles modeled 44 stock, 22 WAC COGS, 7 NRV allowance without fake approval',()=>{
 const rows=history(),before=JSON.stringify(rows),r=run(rows);
 assert.equal(r.grossInventoryAsset,'22.00');
 assert.equal(r.inventoryAllowance,'7.00');
 assert.equal(r.netInventoryAsset,'15.00');
 assert.equal(r.salesCogsExpense,'22.00');
 assert.equal(r.impairmentExpenseNet,'7.00');
 assert.equal(r.totalDebitBalances,'51.00');
 assert.equal(r.totalCreditBalances,'51.00');
 assert.equal(r.sourceJournalCount,4);
 assert.deepEqual(r.trialBalance.find(a=>a.accountId===control.supplierPayableAccountId),
  {accountId:control.supplierPayableAccountId,debitBalance:'0.00',creditBalance:'44.00'});
 for(const key of ['sourceAuthenticated','approvalsAuthenticated','periodAuthorityVerified',
  'trustedPostingCommitted','independentTrialBalanceVerified','productionReady'])
  assert.equal(r[key],false,key);
 assert.equal(JSON.stringify(rows),before,'GL preview must never modify source journals');
});

test('bounded NRV 3 reversal leaves 4 allowance and balances the modeled accounts',()=>{
 const r=run([...history(),row('nrv-reversal','nrv-2','3.00','2026-10-27')]);
 assert.equal(r.inventoryAllowance,'4.00');
 assert.equal(r.netInventoryAsset,'18.00');
 assert.equal(r.impairmentExpenseNet,'4.00');
 assert.equal(r.totalDebitBalances,'48.00');
 assert.equal(r.totalCreditBalances,'48.00');
});

test('no duplicate journal or repeated financial source can enter the rehearsal',()=>{
 rejected([...history(),history()[3]]);
 rejected([...history(),{...row('nrv-write-down','nrv-1','7.00'),id:'new-id'}]);
 rejected([...history(),{...row('nrv-reversal','new','3.00'),id:history()[0].id}]);
});

test('empty illustrative history cannot masquerade as an audited zero opening trial balance',()=>{
 const empty=[];
 rejected(empty);
 assert.equal(empty.length,0,'empty source remains unchanged');
});

test('source movement identity is unique across supported journal kinds',()=>{
 // The synthetic purchase creates 10 inventory, so both of these following
 // balanced entries would otherwise pass the amount and account rules.
 const receipt=row('purchase-receipt','same-source','10.00','2026-10-19');
 const counterfeitSale=row('sales-stock-issue','same-source','5.00','2026-10-20');
 const counterfeitNrv=row('nrv-write-down','same-source','3.00','2026-10-20');
 for(const extra of [counterfeitSale,counterfeitNrv]){
  const candidate=[receipt,extra],before=JSON.stringify(candidate);
  rejected(candidate);
  assert.equal(JSON.stringify(candidate),before,'source rows must remain immutable');
 }
 // A real separate source identifier is still valid for each journal kind.
 const allowed=run([receipt,row('sales-stock-issue','real-sale','5.00','2026-10-20')]);
 assert.equal(allowed.grossInventoryAsset,'5.00');
 assert.equal(allowed.totalDebitBalances,'10.00');
 assert.equal(allowed.totalCreditBalances,'10.00');
 assert.equal(allowed.productionReady,false);
});

test('wrong account, direction, unmatched debit/credit, extra balanced lines fail closed',()=>{
 for(const modify of [
  a=>a.lines[1].accountId=control.inventoryAssetAccountId,
  a=>a.lines[0].direction='credit',
  a=>a.lines[1].amount='6.00',
  a=>a.lines.push({...a.lines[0]})
 ]){
  const rows=history(),copy=structuredClone(rows[3]);modify(copy);rows[3]=copy;rejected(rows);
 }
});

test('company, branch, FX, date chronology, unsupported journal kind and precision all reject',()=>{
 for(const change of [
  {workspaceId:'other'},{branchId:'other'},{currency:'EUR'},
  {effectiveDate:'2026-10-18'},{effectiveDate:'2026-10-32'},
  {effectiveDate:'2026-10-28'},{sourceKind:'warehouse-transfer'}
 ]){
  const rows=history();rows[3]={...rows[3],...change};rejected(rows);
 }
 for(const amount of ['7.001','-7.00','0.00','1e3','7,00']){
  const rows=history();rows[3]={...rows[3],lines:[
   {...rows[3].lines[0],amount},rows[3].lines[1]
  ]};rejected(rows);
 }
});

test('partial source chains, unsupported reserve excess and unproven cross currency are not silently accepted',()=>{
 rejected([row('sales-stock-issue','sale-first','22.00')]);
 rejected([row('nrv-reversal','reversal-without-prior','3.00')]);
 rejected([row('purchase-receipt','p','10.00'),row('nrv-write-down','bad','11.00')]);
 rejected(history(),{...control,functionalCurrency:'EUR'});
 rejected(history(),{...control,inventoryAllowanceAccountId:control.inventoryAssetAccountId});
});

test('locked-period append check is read-only and refuses a backdated synthetic proposal',()=>{
 const old=history();const original=JSON.stringify(old),candidate=row('nrv-reversal','nrv-2','3.00','2026-10-27');
 assert.throws(()=>previewAppendFinanceInventoryJournal(control,old,candidate,'2026-10-27'),
  /closed period/);
 const r=previewAppendFinanceInventoryJournal(control,old,candidate,'2026-10-26');
 assert.equal(r.inventoryAllowance,'4.00');
 assert.equal(r.periodAuthorityVerified,false);
 assert.equal(JSON.stringify(old),original);
 assert.throws(()=>previewAppendFinanceInventoryJournal(control,old,candidate,'invalid'),
  /structurally valid close date/);
});
