import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {todayIso} from '../dist/src/lib/id.js';
import {buildAiFinanceContext} from '../dist/src/lib/ai-finance.js';
import {buildAiBusinessContext} from '../dist/src/lib/ai-business.js';
import {buildAdvisorDataV2} from '../dist/src/lib/ai-advisor-v2.js';
import {buildCfoBrief} from '../dist/src/lib/ai-cfo-deal-desk.js';
import {contextualReportQuestion} from '../dist/src/lib/contextual-report-question.js';

function invalidCostFixture(){
  const vault=emptyVault(),today=todayIso();
  const doc=createBlankDocument('invoice','INV-B08-CFO',vault.company);
  doc.status='final';doc.lifecycleStatus='active';doc.role='standard';
  doc.issueDate=today;doc.dueDate=today;doc.currency='USD';
  doc.workspaceId='default';doc.branchId='main';
  doc.items=[{...doc.items[0],id:'valid-unit-cost',descriptionEn:'Widget',quantity:'1',unitPrice:'100.00',unitCost:'40.00'}];
  doc.adjustments={...doc.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  // An invalid shipping charge has no missing *item* costs, yet total gross
  // profit is not reliable and must not lead to a Healthy CFO assessment.
  doc.internalCosts={shippingCost:'-5.00',otherCost:'0.00'};
  vault.documents=[doc];
  const finance=buildAiFinanceContext({documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:null},'financial health');
  const business=buildAiBusinessContext(vault,today);
  return{vault,finance,business};
}

test('B08.3: CFO raises sourced missing-profit warning even when all unit costs exist',()=>{
  const {vault,finance,business}=invalidCostFixture();
  const row=finance.monthToDate.find(row=>row.currency==='USD');
  assert.ok(row);
  assert.equal(row.profitComplete,false);
  assert.equal(row.missingCostItems,0);
  assert.equal(row.grossProfit,'');
  assert.equal(business.daily.missingCostItems,0);
  const advisor=buildAdvisorDataV2(vault,finance,business);
  const signal=advisor.health.signals.find(row=>row.code==='missing-profit-costs');
  assert.ok(signal);
  assert.equal(signal.severity,'watch');
  assert.notEqual(advisor.health.status,'Healthy');
  const source=advisor.evidence.find(row=>row.id==='missing-costs');
  assert.ok(source);
  assert.equal(source.source,'ai-finance.monthToDate');
  assert.match(source.fact,/USD/);
  assert.ok(advisor.missingData.some(row=>row.code==='missing-cost-data'));
  const cfo=buildCfoBrief(advisor);
  assert.equal(cfo.available,true);
  assert.ok(cfo.priorities.some(row=>row.code==='missing-profit-costs'&&row.evidence.some(e=>e.source==='ai-finance.monthToDate')));
  assert.ok(cfo.limitations.includes('currencies-remain-separate'));
});

test('B08.3: personal assistant scope remains redacted even with invalid cost evidence',()=>{
  const {vault,finance,business}=invalidCostFixture();
  const advisor=buildAdvisorDataV2(vault,finance,business,'personal');
  assert.equal(advisor.available,false);
  assert.deepEqual(advisor.evidence,[]);
  assert.deepEqual(advisor.sales.monthToDate,[]);
  assert.equal(buildCfoBrief(advisor).available,false);
});

test('B08.3: report question cannot restore an untrusted profit value for an incomplete currency',()=>{
  const rows=[
    {currency:'USD',netSales:'150.00',collected:'10.00',outstanding:'140.00',overdue:'0.00',grossProfit:'999.99',marginPercent:'99.00',profitComplete:false,missingCostItems:0},
    {currency:'EUR',netSales:'80.00',collected:'40.00',outstanding:'40.00',overdue:'0.00',grossProfit:'30.00',marginPercent:'37.50',profitComplete:true,missingCostItems:0}
  ];
  const q=contextualReportQuestion('2026-10-01','2026-10-09',rows);
  assert.ok(q.length<=1000);
  assert.doesNotMatch(q,/999\.99|99\.00/);
  const json=q.split('DATA ONLY: ')[1].split(']. ')[0]+']';
  const facts=JSON.parse(json);
  assert.equal(facts[0].grossProfit,'');
  assert.equal(facts[0].costEvidence,'incomplete-internal-cost');
  assert.equal(facts[1].grossProfit,'30.00');
  assert.equal(facts[1].costEvidence,'complete');
  assert.match(q,/Keep currencies separate/);
  assert.match(q,/do not infer withheld margins/);
});

test('B08.3: bounded report prompt never truncates JSON or hides currency omissions',()=>{
  const rows=Array.from({length:20},(_,i)=>({
    currency:'C'+String(i).padStart(2,'0'),netSales:'200.00',collected:'10.00',outstanding:'190.00',
    overdue:'0.00',grossProfit:'',profitComplete:false,missingCostItems:2
  }));
  const q=contextualReportQuestion('2026-10-01','2026-10-09',rows);
  assert.ok(q.length<=1000);
  assert.match(q,/Other currencies omitted/);
  const facts=JSON.parse(q.split('DATA ONLY: ')[1].split(']. ')[0]+']');
  assert.ok(facts.length>0&&facts.length<rows.length);
  assert.deepEqual(facts.map(x=>x.currency),rows.slice(0,facts.length).map(x=>x.currency));
  assert.ok(facts.every(x=>x.costEvidence==='missing-item-cost'&&x.grossProfit===''));
});

test('B08.3: prioritized CFO health evidence remains ahead of bulk account and currency rows',async()=>{
  const code=await readFile('src/lib/ai-advisor-v2.ts','utf8');
  assert.match(code,/const requiredEvidence=new Set\(signals\.flatMap\(signal=>signal\.evidenceIds\)\)/);
  assert.match(code,/health:\{status,score:null,signals\},evidence:prioritizedEvidence,missingData/);
  assert.doesNotMatch(code,/health:\{status,score:null,signals\},evidence:evidenceRows\.slice\(0,32\)/);
});
