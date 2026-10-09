import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

async function mod(){return import('../dist/src/lib/ai-cfo-deal-desk.js');}
function advisor(overrides={}){return{
  version:2,basis:'deterministic-advisor-data-v2',available:true,asOf:'2026-10-04',responseContract:{sections:['Summary','KPI','Table','Risk','Missing','Recommendation','Evidence','Actions'],currencyPolicy:'keep-currencies-separate-unless-a-deterministic-fx-result-is-provided',arithmeticPolicy:'use-provided-deterministic-values-do-not-recalculate-accounting',missingDataPolicy:'state-missing-data-never-invent',actionPolicy:'preview-only-user-approval-required'},
  sales:{today:[],monthToDate:[{currency:'USD',netSales:'1000.00',grossProfit:'250.00',marginPercent:'25.00',collected:'600.00',outstanding:'400.00',overdue:'100.00',issuedInvoices:4,profitComplete:true,missingCostItems:0},{currency:'SAR',netSales:'2000.00',grossProfit:'',marginPercent:'',collected:'1500.00',outstanding:'500.00',overdue:'0.00',issuedInvoices:2,profitComplete:false,missingCostItems:2}],comparison:[]},
  receivables:{byCurrency:[{currency:'USD',outstanding:'400.00',overdue:'100.00',openInvoices:2,overdueInvoices:1}],highestOverdueByCurrency:[]},
  payables:{byCurrency:[{currency:'USD',purchases:'700.00',paid:'200.00',remaining:'500.00',overdue:'150.00',aging:{current:'350.00',days1to30:'150.00',days31to60:'0.00',days61to90:'0.00',days90plus:'0.00'},openPurchases:2,overduePurchases:1}]},
  treasury:{accounts:[{id:'bank-1',label:'Bank',kind:'bank',currency:'USD',balance:'900.00',active:true}],activityByCurrency:[{currency:'USD',inflow:'600.00',outflow:'200.00',net:'400.00',internalTransfers:'0.00',reconciled:2,unreconciled:1}],unallocatedMovements:0},
  expenses:{byCurrency:[{currency:'USD',expenses:'80.00'}],count:2},inventory:{totalItems:3,positiveItems:2,zeroItems:0,negativeItems:1,rows:[]},
  purchasing:{byCurrency:[{currency:'USD',purchases:'700.00',expenses:'80.00',total:'780.00'}],postedPurchases:2,draftPurchases:1,reversedPurchases:0,costAlerts:[{itemId:'p1',itemName:'Item A',currency:'USD',supplierName:'Supplier A',currentUnitCost:'8.00',previousUnitCost:'10.00',changePercent:'-20.00',direction:'down'}],supplierComparisons:[]},
  fx:{policy:'recorded-rates-only-no-automatic-conversion',latestRates:[],recordedPairs:[]},pipeline:{stages:[],openValues:[{currency:'USD',amount:5000,count:2}],wonCount:1,lostCount:0,nextActions:[{id:'o1',title:'Follow up RFQ',stage:'rfq-received',expectedCloseDate:'2026-10-10',nextAction:'Send quote',currency:'USD',amount:'2500.00'}]},
  health:{status:'Action Needed',score:null,signals:[{code:'negative-inventory',area:'inventory',severity:'action-needed',summary:'Negative recorded stock requires review.',evidenceIds:['inventory-negative']},{code:'overdue-receivables',area:'receivables',severity:'watch',summary:'Overdue customer receivables are present.',evidenceIds:['receivable-USD']}]},
  evidence:[{id:'inventory-negative',area:'inventory',source:'operations.inventoryBalances',fact:'1 inventory item has negative recorded quantity.',severity:'action-needed',currency:'',amount:'1',count:1},{id:'receivable-USD',area:'receivables',source:'receivables.customerReceivables',fact:'Open receivables are 400.00 USD; overdue 100.00 USD.',severity:'watch',currency:'USD',amount:'100.00',count:1}],missingData:[{area:'company-health',code:'missing-cost-data',detail:'Profitability is incomplete for 2 item lines.'}],limitations:['no-cross-currency-total-without-deterministic-fx-result'],...overrides
};}

test('CFO brief is evidence-backed, keeps currencies separate and never invents a score',async()=>{
  const {buildCfoBrief}=await mod();const brief=buildCfoBrief(advisor());
  assert.equal(brief.basis,'deterministic-cfo-brief-v1');assert.equal(brief.status,'Action Needed');assert.equal(brief.priorities[0].code,'negative-inventory');
  assert.equal(brief.priorities[0].evidence[0].source,'operations.inventoryBalances');assert.equal(brief.snapshot.sales.length,2);assert.equal(brief.snapshot.sales[0].currency,'USD');assert.equal(brief.snapshot.sales[1].currency,'SAR');
  assert.ok(brief.opportunities.some(row=>row.code.startsWith('supplier-cost-down-')));assert.ok(brief.opportunities.some(row=>row.code==='pipeline-next-actions'));
  assert.ok(brief.limitations.includes('currencies-remain-separate'));assert.ok(brief.missing.some(row=>row.code==='missing-cost-data'));assert.equal('score' in brief,false);
});

test('Personal/redacted advisor cannot leak business CFO data',async()=>{
  const {buildCfoBrief,formatCfoBrief}=await mod();const redacted=advisor({available:false,sales:{today:[],monthToDate:[],comparison:[]},receivables:{byCurrency:[],highestOverdueByCurrency:[]},payables:{byCurrency:[]},treasury:{accounts:[],activityByCurrency:[],unallocatedMovements:0},expenses:{byCurrency:[],count:0},inventory:{totalItems:0,positiveItems:0,zeroItems:0,negativeItems:0,rows:[]},purchasing:{byCurrency:[],postedPurchases:0,draftPurchases:0,reversedPurchases:0,costAlerts:[],supplierComparisons:[]},pipeline:{stages:[],openValues:[],wonCount:0,lostCount:0,nextActions:[]},health:{status:'Healthy',score:null,signals:[]},evidence:[],missingData:[{area:'company-health',code:'business-context-unavailable',detail:'Business data is intentionally unavailable in Personal assistant scope.'}]});const brief=buildCfoBrief(redacted);
  assert.equal(brief.available,false);assert.equal(brief.priorities.length,0);assert.equal(brief.snapshot.sales.length,0);assert.match(formatCfoBrief(brief,'en'),/unavailable in this scope/i);
});

test('Deal Desk requires deterministic landed cost and pricing evidence before ready-for-review',async()=>{
  const {buildDealDeskDecision}=await mod();const plan={version:1,goal:'Evaluate this deal',calls:[{id:'1',tool:'landedCost.calculate',args:{quantity:'100',unitCost:'10',freight:'200',currency:'USD'},reason:'landed'},{id:'2',tool:'pricing.margin',args:{cost:'12',price:'15',currency:'USD'},reason:'margin'}]};const results=[{id:'1',tool:'landedCost.calculate',ok:true,class:'calculate',data:{quantity:'100',unitCost:'10',landedTotal:'1200.00',landedUnitCost:'12.00'},summary:'landedCost.calculate completed deterministically.',source:'lourex-local-engine'},{id:'2',tool:'pricing.margin',ok:true,class:'calculate',data:{cost:'12',price:'15',percent:'20.00',basis:'gross-margin-on-sales'},summary:'pricing.margin completed deterministically.',source:'lourex-local-engine'}];const decision=buildDealDeskDecision(plan,results);
  assert.equal(decision.status,'ready-for-review');assert.equal(decision.known.find(row=>row.tool==='landedCost.calculate').data.landedUnitCost,'12.00');assert.equal(decision.known.find(row=>row.tool==='pricing.margin').data.percent,'20.00');assert.match(decision.recommendation,/deterministic deal economics/i);
  const missing=buildDealDeskDecision({version:1,goal:'deal',calls:[{id:'1',tool:'pricing.margin',args:{cost:'12',price:'15'},reason:'margin'}]},[results[1]]);assert.equal(missing.status,'needs-input');assert.ok(missing.missing.some(row=>/landed-cost/i.test(row)));
});

test('Deal Desk refuses implicit multi-currency combination without recorded FX evidence',async()=>{
  const {buildDealDeskDecision}=await mod();const plan={version:1,goal:'deal',calls:[{id:'1',tool:'landedCost.calculate',args:{quantity:'1',unitCost:'10',currency:'USD'},reason:'cost'},{id:'2',tool:'pricing.margin',args:{cost:'10',price:'50',currency:'SAR'},reason:'price'}]};const results=[{id:'1',tool:'landedCost.calculate',ok:true,class:'calculate',data:{landedTotal:'10.00',landedUnitCost:'10.00'},summary:'ok',source:'lourex-local-engine'},{id:'2',tool:'pricing.margin',ok:true,class:'calculate',data:{percent:'80.00'},summary:'ok',source:'lourex-local-engine'}];const decision=buildDealDeskDecision(plan,results);assert.equal(decision.status,'needs-input');assert.ok(decision.risks.some(row=>/Multiple currencies/i.test(row)));
});

test('CFO and Deal Desk intents are bilingual and conversation integration stays local-first',async()=>{
  const {isCfoIntent,isDealDeskIntent}=await mod();assert.equal(isCfoIntent('راجع الوضع المالي للشركة'),true);assert.equal(isCfoIntent('Give me a CFO review'),true);assert.equal(isDealDeskIntent('قيّم الصفقة وربحيتها'),true);assert.equal(isDealDeskIntent('Deal Desk: landed cost and margin'),true);
  const client=await read('src/lib/ai-tool-client.ts');assert.match(client,/buildCfoBrief/);assert.match(client,/formatCfoBrief/);assert.match(client,/buildDealDeskDecision/);assert.match(client,/if\(!hasSources&&isCfoIntent\(input\.message\)\)/);assert.match(client,/const dealDesk=!hasSources&&isDealDeskIntent\(input\.message\)/);const cfoIndex=client.indexOf('if(!hasSources&&isCfoIntent(input.message))'),providerIndex=client.indexOf("requestAiJson('/api/ai-inbox'");assert.ok(cfoIndex>=0&&providerIndex>cfoIndex,'CFO fast path must run before provider planning');
});

test('Batch 5 adds no Serverless Function and preserves Vercel Hobby budget',async()=>{
  const entries=await readdir(new URL('../api/',import.meta.url),{withFileTypes:true});const functions=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.js')).map(entry=>entry.name).sort();assert.ok(functions.length<=12,`Vercel Hobby limit exceeded: ${functions.length} top-level API functions`);assert.equal(functions.includes('ai-cfo-deal-desk.js'),false);
});
