import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateMovingWeightedAverage} from '../dist/src/lib/inventory-moving-average.js';

const scope={workspaceId:'ws-qa',branchId:'br-qa',warehouseId:'wh-qa',itemId:'carton-qa',functionalCurrency:'USD'};
const entry=(kind,id,sequence,quantity,extra={})=>({
  id,kind,sequence,date:'2026-10-20',quantity,
  workspaceId:scope.workspaceId,branchId:scope.branchId,warehouseId:scope.warehouseId,itemId:scope.itemId,...extra
});
const receipt=(id,sequence,quantity,unitCost,costCurrency='USD',extra={})=>
  entry('receipt',id,sequence,quantity,{unitCost,costCurrency,...extra});
const opening=(quantity,unitCost)=>entry('opening','opening',1,quantity,{unitCost,costCurrency:'USD'});
const issue=(id,sequence,quantity)=>entry('issue',id,sequence,quantity);
const same=a=>JSON.parse(JSON.stringify(a));

test('22-B: mixed landed purchase costs produce perpetual weighted-average COGS, not latest price',()=>{
  const events=[receipt('purchase-1',1,'4','6.00'),receipt('purchase-2',2,'2','10.00'),issue('sale-1',3,'3')];
  const preserved=same(events);
  const result=calculateMovingWeightedAverage(scope,events);
  assert.equal(result.currency,'USD');
  assert.equal(result.balanceQuantity,'3.0000');
  assert.equal(result.balanceValue,'22.000000000000');
  assert.equal(result.averageUnitCost,'7.333333333333');
  assert.equal(result.costOfGoodsSold,'22.000000000000');
  assert.equal(result.steps[2].recognizedUnitCost,'7.333333333333');
  assert.equal(result.steps[2].valueChange,'-22.000000000000');
  assert.equal(JSON.stringify(events),JSON.stringify(preserved),'historical purchase and sale inputs must not mutate');
});

test('22-B: issue before the second receipt retains its chronological valuation',()=>{
  const result=calculateMovingWeightedAverage(scope,[
    receipt('first',1,'4','6'),issue('sold-early',2,'3'),receipt('second',3,'2','10')
  ]);
  assert.equal(result.costOfGoodsSold,'18.000000000000');
  assert.equal(result.balanceQuantity,'3.0000');
  assert.equal(result.balanceValue,'26.000000000000');
  assert.equal(result.averageUnitCost,'8.666666666667');
});

test('22-B: partial returns restore actual original issue cost rather than current average',()=>{
  const result=calculateMovingWeightedAverage(scope,[
    receipt('first',1,'4','6'),receipt('second',2,'2','10'),
    issue('sale',3,'3'),receipt('newer',4,'2','20'),
    entry('return','partial-return',5,'1',{originalIssueId:'sale'})
  ]);
  assert.equal(result.balanceQuantity,'6.0000');
  assert.equal(result.balanceValue,'69.333333333333');
  assert.equal(result.costOfGoodsSold,'14.666666666667');
  assert.equal(result.steps[4].recognizedUnitCost,'7.333333333333');
  assert.equal(result.steps[4].valueChange,'7.333333333333');
});

test('22-B: repeated partial returns exhaust original COGS exactly and cannot over-return',()=>{
  const base=[receipt('r',1,'3','0.333333333333'),issue('sale',2,'3')];
  const all=[...base,entry('return','r1',3,'1',{originalIssueId:'sale'}),
    entry('return','r2',4,'2',{originalIssueId:'sale'})];
  const result=calculateMovingWeightedAverage(scope,all);
  assert.equal(result.balanceQuantity,'3.0000');
  assert.equal(result.balanceValue,'0.999999999999');
  assert.equal(result.costOfGoodsSold,'0.000000000000');
  assert.throws(()=>calculateMovingWeightedAverage(scope,[...all,entry('return','r3',5,'1',{originalIssueId:'sale'})]),/Returned quantity exceeds/);
});

test('22-C: foreign receipt needs dated direct verified FX and never uses newest catalog FX',()=>{
  const fx={id:'fx-verified',date:'2026-10-20',fromCurrency:'EUR',toCurrency:'USD',rate:'1.25',sourceLabel:'documented transaction spot'};
  const results=calculateMovingWeightedAverage(scope,[
    receipt('usd',1,'2','6'),receipt('eur',2,'2','10','EUR',{fx}),issue('sale',3,'2')
  ]);
  assert.equal(results.steps[1].recognizedUnitCost,'12.500000000000');
  assert.equal(results.balanceValue,'18.500000000000');
  assert.equal(results.costOfGoodsSold,'18.500000000000');
  for(const tamper of [
    e=>{delete e.fx;},
    e=>{e.fx.date='2026-10-19';},
    e=>{e.fx.toCurrency='SAR';},
    e=>{e.fx.fromCurrency='USD';},
    e=>{e.fx.sourceLabel='';},
    e=>{e.fx.id='';},
    e=>{e.fx.rate='0';},
    e=>{e.fx.rate='1.123456789';}
  ]){
    const next=receipt('fx-missing',1,'1','12','EUR',{fx:{...fx}});
    tamper(next);
    assert.throws(()=>calculateMovingWeightedAverage(scope,[next]),/ALIF_22_COST_EVIDENCE_REQUIRED/);
  }
});

test('22-B: opening carrying balance is mandatory, never inferred or invented',()=>{
  const result=calculateMovingWeightedAverage(scope,[opening('5','4'),issue('sale',2,'2')]);
  assert.equal(result.balanceValue,'12.000000000000');
  assert.equal(result.balanceQuantity,'3.0000');
  assert.throws(()=>calculateMovingWeightedAverage(scope,[entry('opening','open',1,'5')]),/Valid three-letter currency/);
  assert.throws(()=>calculateMovingWeightedAverage(scope,[receipt('r',1,'1','3'),opening('1','4')]),/Opening cost must be the first/);
});

test('22-B: negative stock, same-date duplicate ids and unsorted event sequence reject without side effects',()=>{
  const pair=[receipt('r',1,'2','6'),issue('s',2,'3')];
  const original=same(pair);
  assert.throws(()=>calculateMovingWeightedAverage(scope,pair),/Insufficient valued inventory/);
  assert.deepEqual(pair,original);
  for(const invalid of [
    [receipt('r',1,'1','6'),receipt('r',2,'1','8')],
    [receipt('r',1,'1','6'),receipt('x',1,'1','8')],
    [receipt('r',2,'1','6'),receipt('x',1,'1','8')],
    [receipt('r',1,'1','6','USD',{date:'2026-10-21'}),receipt('x',2,'1','8','USD',{date:'2026-10-20'})],
    [receipt('r',1,'1.00001','6')],
    [receipt('r',1,'0','6')],
    [receipt('r',1,'1','-4')],
    [entry('issue','s',1,'1',{unitCost:'100'})],
    [entry('return','s',1,'1',{originalIssueId:'nonexistent'})],
    [entry('transfer','s',1,'1')]
  ])assert.throws(()=>calculateMovingWeightedAverage(scope,invalid),/ALIF_22_COST_EVIDENCE_REQUIRED/);
});

test('22-C: company, branch, warehouse and product separation is mandatory',()=>{
  const base=receipt('r',1,'1','4');
  for(const key of ['workspaceId','branchId','warehouseId','itemId']){
    assert.throws(()=>calculateMovingWeightedAverage(scope,[{...base,[key]:'another'}]),/Mixed or missing/);
  }
  assert.throws(()=>calculateMovingWeightedAverage({...scope,functionalCurrency:''},[base]),/currency is required/);
});

test('22-B: complete depletion leaves exactly zero carrying amount despite fractional unit average',()=>{
  const result=calculateMovingWeightedAverage(scope,[
    receipt('a',1,'2','0.01'),receipt('b',2,'1','0.02'),
    issue('sale-1',3,'1'),issue('sale-2',4,'2')
  ]);
  assert.equal(result.balanceValue,'0.000000000000');
  assert.equal(result.balanceQuantity,'0.0000');
  assert.equal(result.costOfGoodsSold,'0.040000000000');
});
