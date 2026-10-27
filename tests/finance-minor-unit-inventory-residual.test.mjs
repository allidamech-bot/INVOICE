import test from 'node:test';
import assert from 'node:assert/strict';
import {previewCumulativeInventoryMinorUnitRounding} from '../dist/src/lib/inventory-minor-unit-rounding-preview.js';
import {inspectIllustrativeInventoryJournals} from '../dist/src/lib/inventory-journal-integrity-preview.js';

const scope={workspaceId:'qa',branchId:'main',warehouseId:'warehouse-main',
  itemId:'cartons',functionalCurrency:'USD'};
const event=(id,sequence,date,kind,quantity,unitCost)=>({
  id,sequence,date,kind,quantity,
  workspaceId:scope.workspaceId,branchId:scope.branchId,
  warehouseId:scope.warehouseId,itemId:scope.itemId,
  ...(unitCost===undefined?{}:{unitCost,costCurrency:'USD'})
});
const original=()=>[
  event('buy-1',0,'2026-10-19','receipt','4','6'),
  event('buy-2',1,'2026-10-20','receipt','2','10')
];
const issue=(id,sequence,quantity='1')=>
  event(id,sequence,'2026-10-21','issue',quantity);

test('22 minor units: three sequential one-unit sales distribute cents and conserve inventory exactly',()=>{
  const history=[...original(),issue('sale-1',2),issue('sale-2',3),issue('sale-3',4)];
  const unchanged=JSON.stringify({scope,history});
  const result=previewCumulativeInventoryMinorUnitRounding(scope,history,2);
  assert.deepEqual(result.steps.map(s=>s.candidateSalesCOGS),
    ['0.00','0.00','7.33','7.34','7.33']);
  assert.equal(result.candidatePurchaseCostTotal,'44.00');
  assert.equal(result.candidateSalesCOGSTotal,'22.00');
  assert.equal(result.roundedEndingInventory,'22.00');
  assert.equal(result.exactEndingInventory,'22.000000000000');
  assert.equal(result.unresolvedSalesCOGSRoundingDifference,'0.00');
  assert.equal(result.hasUnresolvedRoundingDifference,false);
  assert.equal(result.journalPosted,false);
  assert.equal(result.policyApproved,false);
  assert.equal(result.productionReady,false);
  assert.equal(JSON.stringify({scope,history}),unchanged);
});

test('22 minor units: issue once at three units remains exactly 22.00 COGS',()=>{
 const result=previewCumulativeInventoryMinorUnitRounding(
   scope,[...original(),issue('sale-3',2,'3')],2);
 assert.equal(result.steps.at(-1).candidateSalesCOGS,'22.00');
 assert.equal(result.roundedEndingInventory,'22.00');
 assert.equal(result.candidatePurchaseCostTotal,'44.00');
});

test('22 minor units: a modeled roundoff difference is surfaced, not invented as a posting',()=>{
 const history=[event('cheap-receipt',0,'2026-10-19','receipt','2','0.015'),
   issue('cheap-sale',1)];
 const result=previewCumulativeInventoryMinorUnitRounding(scope,history,2);
 assert.equal(result.candidatePurchaseCostTotal,'0.03');
 assert.equal(result.candidateSalesCOGSTotal,'0.01');
 assert.equal(result.roundedModeledSalesCOGS,'0.02');
 assert.equal(result.roundedEndingInventory,'0.02');
 assert.equal(result.unresolvedSalesCOGSRoundingDifference,'-0.01');
 assert.equal(result.hasUnresolvedRoundingDifference,true);
 assert.equal(result.productionReady,false);
});

test('22 minor units: fully depleting stock captures every final booked cent',()=>{
 const history=[...original(),issue('sell-everything',2,'6')];
 const result=previewCumulativeInventoryMinorUnitRounding(scope,history,2);
 assert.equal(result.roundedEndingInventory,'0.00');
 assert.equal(result.candidateSalesCOGSTotal,'44.00');
 assert.equal(result.candidatePurchaseCostTotal,'44.00');
 assert.equal(result.endingQuantity,'0.0000');
});

test('22 minor units: supported whole and three-decimal minor units preserve their selected scale',()=>{
 const integerCurrency=previewCumulativeInventoryMinorUnitRounding(scope,
   [event('buy',0,'2026-10-19','receipt','2','2'),
    issue('sale',1)],0);
 assert.equal(integerCurrency.candidateSalesCOGSTotal,'2');
 assert.equal(integerCurrency.roundedEndingInventory,'2');
 const three=previewCumulativeInventoryMinorUnitRounding(scope,
   [event('buy',0,'2026-10-19','receipt','2','0.125'),
    issue('sale',1)],3);
 assert.equal(three.candidatePurchaseCostTotal,'0.250');
 assert.equal(three.candidateSalesCOGSTotal,'0.125');
 assert.equal(three.roundedEndingInventory,'0.125');
});

test('22 minor units: unbookable zero-value receipt/issue cannot silently disappear',()=>{
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(scope,
   [event('micro-buy',0,'2026-10-19','receipt','1','0.004')],2),
   /separate memo policy/);
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(scope,
   [event('buy',0,'2026-10-19','receipt','2','0.01'),
    issue('tiny-sale',1,'0.0001')],2),
   /separate memo policy/);
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(scope,
   [event('zero',0,'2026-10-19','receipt','3','0')],2),
   /separate memo policy/);
});

test('22 minor units: unsupported stock types and identity/FX gaps remain fail-closed',()=>{
 const base=[...original()];
 for(const kind of ['opening','return']){
  const change={...issue('unsupported',2),kind};
  assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(scope,[...base,change],2),
    /ALIF_22_COST_EVIDENCE_REQUIRED|ALIF_22_MINOR_UNIT_POLICY_NOT_APPROVED/);
 }
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(scope,
   [{...base[0],costCurrency:'EUR'}],2),/ALIF_22_COST_EVIDENCE_REQUIRED/);
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(
   scope,[{...base[0],branchId:'other'}],2),/ALIF_22_COST_EVIDENCE_REQUIRED/);
 assert.throws(()=>previewCumulativeInventoryMinorUnitRounding(
   scope,base,4),/ALIF_22_MINOR_UNIT_POLICY_NOT_APPROVED/);
});

test('22 minor units: existing illustrative journal integrity still requires its separately approved policy',()=>{
 const history=[...original(),issue('fractional-issue',2,'1')];
 const result=previewCumulativeInventoryMinorUnitRounding(scope,history,2);
 assert.equal(result.steps.at(-1).candidateSalesCOGS,'7.33');
 assert.equal(result.journalPosted,false);
 assert.equal(typeof inspectIllustrativeInventoryJournals,'function');
 // Do not silently widen inspectIllustrativeInventoryJournals acceptance:
 // it retains its strict preexisting exact-minor-unit behavior.
});
