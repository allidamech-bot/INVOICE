import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectIllustrativeNrvJournal} from '../dist/src/lib/inventory-nrv-journal-integrity-preview.js';

const scope={workspaceId:'qa-company',branchId:'qa-branch',
 warehouseId:'qa-warehouse',itemId:'carton',functionalCurrency:'USD'};
const controls={inventoryAssetAccountId:'asset:inventory',
 inventoryAllowanceAccountId:'contra-asset:stock-nrv',
 impairmentExpenseAccountId:'expense:stock-impairment',currencyMinorDigits:2};
const movement=(id,sequence,date,kind,quantity,unitCost)=>({
 id,sequence,date,kind,quantity,
 workspaceId:scope.workspaceId,branchId:scope.branchId,
 warehouseId:scope.warehouseId,itemId:scope.itemId,
 ...(unitCost===undefined?{}:{unitCost,costCurrency:'USD'})
});
function history(){
 return [
  movement('buy-1',0,'2026-10-19','receipt','4','6'),
  movement('buy-2',1,'2026-10-20','receipt','2','10'),
  movement('sale-1',2,'2026-10-21','issue','3')
 ];
}
function input(){
 return{scope,history:history(),estimate:{
  id:'nrv-qa-20261027',asOfDate:'2026-10-27',currency:'USD',
  inventoryClass:'ordinary-saleable-goods',
  expectedSalePricePerUnit:'6',salePriceEvidenceId:'test-market-quote',
  costToCompletePerUnit:'0.50',completionCostEvidenceId:'test-finish-cost',
  necessarySellingCostPerUnit:'0.50',sellingCostEvidenceId:'test-distribution-cost'
 },zeroPriorAllowanceEvidenceId:'unverified-zero-allowance-proof'};
}
function prior(allowance='10'){
 return{id:'prior-nrv-qa',asOfDate:'2026-10-25',currency:'USD',
  workspaceId:scope.workspaceId,branchId:scope.branchId,
  warehouseId:scope.warehouseId,itemId:scope.itemId,
  quantity:'3.0000',grossCostValue:'22.000000000000',
  allowanceValue:allowance,journalEvidenceId:'unverified-prior-impairment-journal'};
}
function withPrior(allowance='10'){
 const src=input();
 src.priorAllowance=prior(allowance);delete src.zeroPriorAllowanceEvidenceId;
 return src;
}
function journal(amount='7.00',mode='write-down'){
 const debitAccount=mode==='write-down'?controls.impairmentExpenseAccountId:
   controls.inventoryAllowanceAccountId;
 const creditAccount=mode==='write-down'?controls.inventoryAllowanceAccountId:
   controls.impairmentExpenseAccountId;
 return{id:'qa-nrv-proposed-journal',sourceEstimateId:'nrv-qa-20261027',
  date:'2026-10-27',workspaceId:scope.workspaceId,branchId:scope.branchId,
  warehouseId:scope.warehouseId,itemId:scope.itemId,currency:'USD',
  lines:[
   {accountId:debitAccount,direction:'debit',amount},
   {accountId:creditAccount,direction:'credit',amount}
  ]};
}
const inspect=(src,rows,custom=controls)=>inspectIllustrativeNrvJournal(src,rows,custom);

test('22 NRV GL: a 7.00 write-down must debit expense and credit contra inventory, not alter gross asset',()=>{
 const src=input(),row=journal(),before=JSON.stringify({src,row});
 const r=inspect(src,[row]);
 assert.equal(r.treatment,'write-down');
 assert.equal(r.grossInventoryCost,'22.00');
 assert.equal(r.priorAllowance,'0.00');
 assert.equal(r.closingAllowance,'7.00');
 assert.equal(r.illustrativeNetInventory,'15.00');
 assert.equal(r.illustrativeAllowanceChange,'7.00');
 assert.equal(r.matchedDebitAmount,'7.00');
 assert.equal(r.matchedCreditAmount,'7.00');
 assert.equal(r.matchedJournalCount,1);
 assert.equal(r.journalPosted,false);
 assert.equal(r.approvalAuthenticated,false);
 assert.equal(r.generalLedgerReconciled,false);
 assert.equal(r.productionReady,false);
 assert.equal(JSON.stringify({src,row}),before,'journals and WAC source immutable');
});

test('22 NRV GL: previous 10.00 allowance reverses only 3.00 with opposite account directions',()=>{
 const r=inspect(withPrior(),[journal('3.00','reversal')]);
 assert.equal(r.treatment,'reversal');
 assert.equal(r.priorAllowance,'10.00');
 assert.equal(r.closingAllowance,'7.00');
 assert.equal(r.illustrativeAllowanceChange,'-3.00');
 assert.equal(r.illustrativeNetInventory,'15.00');
 assert.equal(r.matchedDebitAmount,'3.00');
 assert.equal(r.productionReady,false);
});

test('22 NRV GL: recovery above original cost cannot reverse more than the prior allowance',()=>{
 const src=withPrior();src.estimate.expectedSalePricePerUnit='20';
 const r=inspect(src,[journal('10.00','reversal')]);
 assert.equal(r.closingAllowance,'0.00');
 assert.equal(r.illustrativeNetInventory,'22.00');
 assert.equal(r.illustrativeAllowanceChange,'-10.00');
});

test('22 NRV GL: extra 5 allowance matches worsening NRV, not original prior charge',()=>{
 const r=inspect(withPrior('2'),[journal('5.00')]);
 assert.equal(r.priorAllowance,'2.00');
 assert.equal(r.closingAllowance,'7.00');
 assert.equal(r.illustrativeAllowanceChange,'5.00');
});

test('22 NRV GL: unchanged allowance must not invent a duplicate zero-value GL transaction',()=>{
 const src=input();src.estimate.expectedSalePricePerUnit='20';
 const r=inspect(src,[]);
 assert.equal(r.treatment,'unchanged');
 assert.equal(r.matchedJournalCount,0);
 assert.equal(r.matchedDebitAmount,'0.00');
 assert.equal(r.illustrativeNetInventory,'22.00');
 assert.throws(()=>inspect(src,[journal()]),/Unchanged allowance cannot create/);
 const unchanged=withPrior('7');
 assert.equal(inspect(unchanged,[]).closingAllowance,'7.00');
 assert.throws(()=>inspect(unchanged,[journal()]),/Unchanged allowance cannot create/);
});

test('22 NRV GL: balanced but economically wrong gross inventory or expense accounts fail closed',()=>{
 for(const changed of [
  {accountId:controls.inventoryAssetAccountId,direction:'credit'},
  {accountId:controls.impairmentExpenseAccountId,direction:'credit'},
  {accountId:'other-liability',direction:'credit'},
  {accountId:controls.inventoryAllowanceAccountId,direction:'debit'}
 ]){
  const row=journal();row.lines[1]={...row.lines[1],...changed};
  assert.throws(()=>inspect(input(),[row]),/ALIF_22_NRV_JOURNAL_NOT_READY/);
 }
 const reverse=journal('3.00','reversal');
 assert.throws(()=>inspect(withPrior(),[journal('3.00')]),/Incorrect NRV expense/);
 assert.equal(inspect(withPrior(),[reverse]).matchedJournalCount,1);
});

test('22 NRV GL: balanced amount 8 cannot supplant independently computed 7',()=>{
 for(const changed of ['8.00','3.00']){
  const row=journal(changed);
  assert.throws(()=>inspect(input(),[row]),/still differs from the independently recomputed/);
 }
 const row=journal();row.lines[1].amount='6.00';
 assert.throws(()=>inspect(input(),[row]),/still differs from the independently recomputed/);
});

test('22 NRV GL: duplicate, absent, split, zero and unrelated journals are not acceptable',()=>{
 const j=journal();
 assert.throws(()=>inspect(input(),[]),/Exactly one illustrative journal/);
 assert.throws(()=>inspect(input(),[j,j]),/Exactly one illustrative journal/);
 assert.throws(()=>inspect(input(),[{...j,lines:[...j.lines,{...j.lines[0]}]}]),
  /exact two approved/);
 assert.throws(()=>inspect(input(),[{...j,lines:[j.lines[0]]}]),/exact two approved/);
 assert.throws(()=>inspect(input(),[journal('0.00')]),/Zero or negative/);
 assert.throws(()=>inspect(input(),[journal('-7.00')]),/exact non-negative/);
 assert.throws(()=>inspect(input(),[journal('7.0001')]),/minor units/);
});

test('22 NRV GL: date, estimate, currency, branch, warehouse, item, source identity tampering reject',()=>{
 const mods=[
  {id:''},{sourceEstimateId:'not-source'},{date:'2026-10-26'},
  {workspaceId:'different'},{branchId:'different'},{warehouseId:'different'},
  {itemId:'different'},{currency:'EUR'}
 ];
 for(const mod of mods)
  assert.throws(()=>inspect(input(),[{...journal(),...mod}]),
   /Journal provenance, date, currency and inventory scope/);
});

test('22 NRV GL: account identifiers must be distinct and use explicit approved currency precision',()=>{
 for(const accounts of [
  {...controls,inventoryAssetAccountId:''},
  {...controls,inventoryAllowanceAccountId:controls.inventoryAssetAccountId},
  {...controls,impairmentExpenseAccountId:controls.inventoryAllowanceAccountId},
  {...controls,currencyMinorDigits:4}
 ]){
  assert.throws(()=>inspect(input(),[journal()],accounts),/Three distinct explicit/);
 }
});

test('22 NRV GL: 12dp allowances that are not exact cents are not silently rounded',()=>{
 const src=input();
 src.estimate.expectedSalePricePerUnit='6.001';
 assert.throws(()=>inspect(src,[journal()]),/Fractional minor-unit NRV/);
 const micros=input();micros.history=[movement('tiny',0,'2026-10-20',
   'receipt','0.0003','0.01')];
 micros.estimate.expectedSalePricePerUnit='0.005';
 micros.estimate.costToCompletePerUnit='0';
 micros.estimate.necessarySellingCostPerUnit='0';
 assert.throws(()=>inspect(micros,[journal()]),/Fractional minor-unit NRV/);
});

test('22 NRV GL: fabricated FX, missing market evidence and unsupported classes cannot approve journal',()=>{
 const a=input();a.estimate.salePriceEvidenceId='';
 assert.throws(()=>inspect(a,[journal()]),/source evidence/);
 const b=input();b.estimate.currency='EUR';
 assert.throws(()=>inspect(b,[journal()]),/ALIF_22_NRV_NOT_APPROVED/);
 const c=input();c.estimate.inventoryClass='raw-material';
 assert.throws(()=>inspect(c,[journal()]),/separate IAS 2 policy/);
 const d=input();delete d.zeroPriorAllowanceEvidenceId;
 assert.throws(()=>inspect(d,[journal()]),/Missing evidence of zero prior allowance/);
});

test('22 NRV GL: cents with whole and 3dp currencies need supported exact minor units',()=>{
 const d=input();d.estimate.expectedSalePricePerUnit='6';
 assert.equal(inspect(d,[journal()],controls).currency,'USD');
 const three={...controls,currencyMinorDigits:3};
 const j=journal('7.000');
 assert.equal(inspect(d,[j],three).matchedDebitAmount,'7.000');
 const whole={...controls,currencyMinorDigits:0};
 const row=journal('7');assert.equal(inspect(d,[row],whole).illustrativeNetInventory,'15');
});
