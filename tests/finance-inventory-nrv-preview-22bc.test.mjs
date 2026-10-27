import test from 'node:test';
import assert from 'node:assert/strict';
import {previewInventoryNrvAllowance} from '../dist/src/lib/inventory-nrv-preview.js';
const scope={workspaceId:'qa',branchId:'main',warehouseId:'warehouse-main',
 itemId:'sellable-carton',functionalCurrency:'USD'};
const event=(id,seq,date,kind,quantity,unitCost)=>({
 id,sequence:seq,date,kind,quantity,workspaceId:scope.workspaceId,
 branchId:scope.branchId,warehouseId:scope.warehouseId,itemId:scope.itemId,
 ...(unitCost===undefined?{}:{unitCost,costCurrency:'USD'})
});
const history=()=>[
 event('buy-1',0,'2026-10-19','receipt','4','6'),
 event('buy-2',1,'2026-10-20','receipt','2','10'),
 event('sale-1',2,'2026-10-21','issue','3')
];
const estimate=()=>({
 id:'qa-nrv-estimate',asOfDate:'2026-10-27',currency:'USD',
 inventoryClass:'ordinary-saleable-goods',
 expectedSalePricePerUnit:'6',salePriceEvidenceId:'market-price-file',
 costToCompletePerUnit:'0.50',completionCostEvidenceId:'completion-quote',
 necessarySellingCostPerUnit:'0.50',sellingCostEvidenceId:'sale-cost-analysis'
});
const input=()=>({
 scope,history:history(),estimate:estimate(),
 zeroPriorAllowanceEvidenceId:'externally-unverified-zero-attestation'
});
const prior=(value='10.000000000000')=>({
 id:'qa-prior-allowance',asOfDate:'2026-10-25',currency:'USD',
 workspaceId:scope.workspaceId,branchId:scope.branchId,
 warehouseId:scope.warehouseId,itemId:scope.itemId,
 quantity:'3.0000',grossCostValue:'22.000000000000',allowanceValue:value,
 journalEvidenceId:'unverified-prior-ledger-reference'
});
test('22 NRV: documented sale-price less all completion/sale costs lowers remaining inventory only',()=>{
 const data=input(),before=JSON.stringify(data),out=previewInventoryNrvAllowance(data);
 assert.equal(out.quantity,'3.0000');
 assert.equal(out.grossCostValue,'22.000000000000');
 assert.equal(out.nrvPerUnit,'5.000000000000');
 assert.equal(out.totalNrv,'15.000000000000');
 assert.equal(out.lowerOfCostAndNrv,'15.000000000000');
 assert.equal(out.proposedClosingAllowance,'7.000000000000');
 assert.equal(out.proposedWriteDownExpense,'7.000000000000');
 assert.equal(out.proposedReversalExpenseReduction,'0.000000000000');
 assert.equal(out.treatment,'write-down');
 assert.equal(out.priorSalesCostOfGoodsSold,'22.000000000000');
 assert.equal(out.posted,false);
 assert.equal(out.approved,false);
 assert.equal(out.productionReady,false);
 assert.equal(out.sourceEvidenceAuthenticated,false);
 assert.equal(out.priorJournalAuthenticated,false);
 assert.equal(JSON.stringify(data),before);
});
test('22 NRV: no impairment when realizable amount exceeds historical inventory cost',()=>{
 const data=input();data.estimate.expectedSalePricePerUnit='15';
 const out=previewInventoryNrvAllowance(data);
 assert.equal(out.totalNrv,'42.000000000000');
 assert.equal(out.lowerOfCostAndNrv,'22.000000000000');
 assert.equal(out.proposedClosingAllowance,'0.000000000000');
 assert.equal(out.treatment,'unchanged');
});
test('22 NRV: previously assessed 10 allowance can reverse only 3 when new NRV is 15',()=>{
 const data=input();data.priorAllowance=prior();delete data.zeroPriorAllowanceEvidenceId;
 const out=previewInventoryNrvAllowance(data);
 assert.equal(out.priorAllowance,'10.000000000000');
 assert.equal(out.proposedClosingAllowance,'7.000000000000');
 assert.equal(out.allowanceChange,'-3.000000000000');
 assert.equal(out.proposedReversalExpenseReduction,'3.000000000000');
 assert.equal(out.proposedWriteDownExpense,'0.000000000000');
 assert.equal(out.treatment,'reversal');
});
test('22 NRV: recovered selling price never restores beyond original inventory cost',()=>{
 const data=input();data.priorAllowance=prior('10');delete data.zeroPriorAllowanceEvidenceId;
 data.estimate.expectedSalePricePerUnit='20';
 const result=previewInventoryNrvAllowance(data);
 assert.equal(result.proposedClosingAllowance,'0.000000000000');
 assert.equal(result.proposedReversalExpenseReduction,'10.000000000000');
 assert.equal(result.lowerOfCostAndNrv,'22.000000000000');
});
test('22 NRV: allowance must increase if original impairment proves insufficient',()=>{
 const data=input();data.priorAllowance=prior('2');delete data.zeroPriorAllowanceEvidenceId;
 const out=previewInventoryNrvAllowance(data);
 assert.equal(out.allowanceChange,'5.000000000000');
 assert.equal(out.treatment,'write-down');
});
test('22 NRV: missing previous allowance history cannot be silently treated as zero',()=>{
 const data=input();delete data.zeroPriorAllowanceEvidenceId;
 assert.throws(()=>previewInventoryNrvAllowance(data),/Missing evidence of zero prior allowance/);
});
test('22 NRV: prior allowance changing product, valuation, date, currency or sign fails closed',()=>{
 for(const [key,value] of [
  ['id',''],['journalEvidenceId',''],['warehouseId','wrong'],
  ['itemId','wrong'],['branchId','wrong'],['workspaceId','wrong'],
  ['quantity','6.0000'],['grossCostValue','23'],['allowanceValue','23'],
  ['allowanceValue','-1'],['currency','EUR'],['asOfDate','2026-10-27']
 ]){
   const data=input();data.priorAllowance={...prior(),[key]:value};
   delete data.zeroPriorAllowanceEvidenceId;
   assert.throws(()=>previewInventoryNrvAllowance(data),/ALIF_22_NRV_NOT_APPROVED/,key);
 }
 const simultaneous=input();simultaneous.priorAllowance=prior();
 assert.throws(()=>previewInventoryNrvAllowance(simultaneous),/Conflicting prior allowance/);
});
test('22 NRV: unproved price or necessary-to-sell cost evidence rejects',()=>{
 for(const key of ['salePriceEvidenceId','completionCostEvidenceId','sellingCostEvidenceId']){
  const data=input();data.estimate[key]='';
  assert.throws(()=>previewInventoryNrvAllowance(data),/each require source evidence/);
 }
});
test('22 NRV: wrong foreign currency, future assessment and invalid dates reject',()=>{
 for(const change of [{currency:'EUR'},{currency:''},
  {asOfDate:'2026-10-19'},{asOfDate:'2026-14-01'}]){
  const data=input();Object.assign(data.estimate,change);
  assert.throws(()=>previewInventoryNrvAllowance(data),/ALIF_22_NRV_NOT_APPROVED/);
 }
 const data=input();data.scope={...scope,functionalCurrency:'EUR'};
 assert.throws(()=>previewInventoryNrvAllowance(data),/ALIF_22_NRV_NOT_APPROVED|ALIF_22_COST_EVIDENCE_REQUIRED/);
});
test('22 NRV: non-saleable input and assets needing a different IAS 2 test do not reuse general goods estimate',()=>{
 for(const inventoryClass of ['work-in-progress','raw-material','contract-specific']){
  const data=input();data.estimate.inventoryClass=inventoryClass;
  assert.throws(()=>previewInventoryNrvAllowance(data),/separate IAS 2 policy/);
 }
});
test('22 NRV: negative NRV and invalid cost fields cannot produce negative inventory assets',()=>{
 for(const bad of ['-1','abc','0.1234567890123']){
  const data=input();data.estimate.expectedSalePricePerUnit=bad;
  assert.throws(()=>previewInventoryNrvAllowance(data),/ALIF_22_NRV_NOT_APPROVED/);
 }
 const data=input();data.estimate.costToCompletePerUnit='9';
 assert.throws(()=>previewInventoryNrvAllowance(data),/negative NRV/);
});
test('22 NRV: false stock history, unpriced receipts and empty warehouse do not receive fictitious NRV',()=>{
 const data=input();data.history=[...data.history,event('extra-future',3,'2026-10-28','receipt','1','5')];
 assert.throws(()=>previewInventoryNrvAllowance(data),/cannot predate inventory movements/);
 const missing=input();missing.history[0].costCurrency='';
 assert.throws(()=>previewInventoryNrvAllowance(missing),/ALIF_22_COST_EVIDENCE_REQUIRED/);
 const empty=input();empty.history.push(event('sell-rest',3,'2026-10-22','issue','3'));
 assert.throws(()=>previewInventoryNrvAllowance(empty),/empty or unverified stock/);
});
test('22 NRV: unsupported returns and stock event identity duplication cannot bypass valuation guardrails',()=>{
 const data=input();data.history.push({...event('return',3,'2026-10-22','return','1'),originalIssueId:'sale-1'});
 assert.throws(()=>previewInventoryNrvAllowance(data),/need approved book-value rules/);
 const duplicate=input();duplicate.history[1].id='buy-1';
 assert.throws(()=>previewInventoryNrvAllowance(duplicate),/ALIF_22_COST_EVIDENCE_REQUIRED/);
});
test('22 NRV: fractional exact inventory NRV calculations do not use floating point',()=>{
 const data=input();
 data.history=[event('fraction',0,'2026-10-19','receipt','0.0003','0.01')];
 data.estimate.expectedSalePricePerUnit='0.005';
 data.estimate.costToCompletePerUnit='0';
 data.estimate.necessarySellingCostPerUnit='0';
 const r=previewInventoryNrvAllowance(data);
 assert.equal(r.grossCostValue,'0.000003000000');
 assert.equal(r.totalNrv,'0.000001500000');
 assert.equal(r.proposedClosingAllowance,'0.000001500000');
});
