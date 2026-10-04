import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

async function runtime(scope='business'){
  const [{emptyVault},{createAiToolRuntime}]=await Promise.all([import('../dist/src/lib/defaults.js'),import('../dist/src/lib/ai-tool-orchestrator.js')]);
  const vault=emptyVault();
  const context={screen:'home',assistantRuntime:{scope,workspaceId:'default',branchId:'main',entity:null},advisorV2:{version:2,basis:'deterministic-advisor-data-v2',health:{status:'Healthy',score:null,signals:[]},missingData:[]},finance:{},business:{},pricing:{},drafting:{}};
  return{vault,context,runtime:createAiToolRuntime(vault,context)};
}

test('Batch 4 registry covers read, calculate, prepare, execute and protected high-impact tools',async()=>{
  const {AI_TOOL_REGISTRY,aiToolPlannerCatalog}=await import('../dist/src/lib/ai-tool-orchestrator.js');
  const ids=new Set(AI_TOOL_REGISTRY.map(row=>row.id));
  for(const id of ['customer.getSummary','treasury.getSnapshot','search.records','pricing.margin','pricing.targetPrice','landedCost.calculate','fx.convertUsingRecordedRate','breakEven.calculate','quotation.prepare','message.prepare','document.createDraft','customer.update','supplier.update','product.updateMetadata','navigation.open','task.create','document.finalize','payment.record','inventory.adjust','financial.delete','accounting.post'])assert.ok(ids.has(id),`missing tool ${id}`);
  assert.ok(AI_TOOL_REGISTRY.some(row=>row.class==='read'));
  assert.ok(AI_TOOL_REGISTRY.some(row=>row.class==='calculate'));
  assert.ok(AI_TOOL_REGISTRY.some(row=>row.class==='prepare'));
  assert.ok(AI_TOOL_REGISTRY.some(row=>row.class==='execute'&&row.approval));
  assert.ok(AI_TOOL_REGISTRY.filter(row=>row.class==='high-impact').every(row=>row.approval&&row.mutation));
  const personal=aiToolPlannerCatalog('personal').map(row=>row.id).sort();
  assert.deepEqual(personal,['message.prepare','reminder.prepare','task.create']);
});

test('Deterministic pricing, landed cost, break-even and inventory coverage calculations are exact',async()=>{
  const {executeAiToolCall}=await import('../dist/src/lib/ai-tool-orchestrator.js');const {runtime:rt}=await runtime();
  const run=(tool,args)=>executeAiToolCall(rt,{id:tool,tool,args,reason:'test'});
  const margin=run('pricing.margin',{cost:'80',price:'100'});assert.equal(margin.ok,true);assert.equal(margin.data.percent,'20.00');
  const markup=run('pricing.markup',{cost:'80',price:'100'});assert.equal(markup.data.percent,'25.00');
  const target=run('pricing.targetPrice',{cost:'80',targetMarginPercent:'20'});assert.equal(target.data.targetPrice,'100.00');
  const landed=run('landedCost.calculate',{quantity:'10',unitCost:'8',freight:'10',duty:'5',otherCosts:'5'});assert.equal(landed.data.landedTotal,'100.00');assert.equal(landed.data.landedUnitCost,'10.00');
  const be=run('breakEven.calculate',{fixedCosts:'1000',unitPrice:'25',unitVariableCost:'15'});assert.equal(be.data.breakEvenUnits,'100');assert.equal(be.data.breakEvenRevenue,'2500.00');
  const coverage=run('inventory.coverage',{stock:'300',averageDailyUsage:'10'});assert.equal(coverage.data.coverageDays,'30.00');
});

test('Recorded FX tool uses LOUREX rate evidence and never invents a conversion rate',async()=>{
  const {executeAiToolCall}=await import('../dist/src/lib/ai-tool-orchestrator.js');const {runtime:rt,vault}=await runtime();
  vault.fxRates=[{id:'fx-1',workspaceId:'default',date:'2026-10-01',fromCurrency:'USD',toCurrency:'EUR',rate:'0.90',sourceLabel:'Manual treasury rate',notes:'',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}];
  const ok=executeAiToolCall(rt,{id:'fx',tool:'fx.convertUsingRecordedRate',args:{amount:'100',fromCurrency:'USD',toCurrency:'EUR',date:'2026-10-04'},reason:'test'});assert.equal(ok.ok,true);assert.equal(ok.data.converted,'90.00');assert.equal(ok.data.rate,'0.90');assert.equal(ok.data.source,'Manual treasury rate');
  const missing=executeAiToolCall(rt,{id:'missing',tool:'fx.convertUsingRecordedRate',args:{amount:'100',fromCurrency:'USD',toCurrency:'SAR',date:'2026-10-04'},reason:'test'});assert.equal(missing.ok,false);assert.match(missing.summary,/No recorded LOUREX FX rate/);
});

test('High-impact financial tools are present but blocked, while execute tools only produce approval proposals',async()=>{
  const {executeAiToolCall}=await import('../dist/src/lib/ai-tool-orchestrator.js');const {runtime:rt}=await runtime();
  for(const tool of ['document.finalize','payment.record','inventory.adjust','financial.delete','accounting.post']){const result=executeAiToolCall(rt,{id:tool,tool,args:{},reason:'test'});assert.equal(result.ok,false);assert.equal(result.class,'high-impact');assert.match(result.summary,/never executed by LOUREX AI/i);}
  const task=executeAiToolCall(rt,{id:'task',tool:'task.create',args:{title:'Follow up customer'},reason:'User asked for a task'});assert.equal(task.ok,true);assert.equal(task.class,'execute');assert.equal(task.data.capability,'tool.execute');assert.equal(task.data.tool,'task.create');
});

test('Personal scope cannot access business tools',async()=>{
  const {executeAiToolCall}=await import('../dist/src/lib/ai-tool-orchestrator.js');const {runtime:rt}=await runtime('personal');
  const blocked=executeAiToolCall(rt,{id:'finance',tool:'finance.getSummary',args:{},reason:'test'});assert.equal(blocked.ok,false);assert.match(blocked.summary,/Business tools are unavailable in Personal scope/);
  const task=executeAiToolCall(rt,{id:'task',tool:'task.create',args:{scope:'personal',title:'Study'},reason:'test'});assert.equal(task.ok,true);
});

test('Common navigation and current-entity requests are planned locally with zero provider planning',async()=>{
  const {deterministicAiToolPlan,createAiToolRuntime}=await import('../dist/src/lib/ai-tool-orchestrator.js');const {emptyVault}=await import('../dist/src/lib/defaults.js');const vault=emptyVault();
  let context={screen:'home',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}};let rt=createAiToolRuntime(vault,context);assert.equal(deterministicAiToolPlan('افتح التقارير',rt)?.calls[0]?.tool,'navigation.open');
  context={screen:'customers',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:{type:'customer',id:'customer-1',label:'Acme'}}};rt=createAiToolRuntime(vault,context);const plan=deterministicAiToolPlan('شو المستحق والمتأخر على هذا العميل؟',rt);assert.equal(plan?.calls[0]?.tool,'customer.getReceivables');assert.equal(plan?.calls[0]?.args.customerId,'customer-1');
});

test('Tool planner endpoint receives metadata and catalog only, not Vault records',async()=>{
  const api=await read('api/ai-inbox.js');
  assert.match(api,/mode==='tool-plan'/);
  assert.match(api,/You receive NO Vault records, balances, customer data, supplier data/i);
  assert.match(api,/argsJson must be a valid compact JSON object string/i);
  assert.match(api,/HIGH IMPACT tools/);
  assert.match(api,/sameOriginRequest/);
  assert.doesNotMatch(api,/body\?\.vault|body\.vault|body\?\.documents|body\?\.customers/);
});

test('Approved customer/supplier actions use Safe Mutation and tasks use encrypted AES-GCM storage',async()=>{
  const [actions,tasks]=await Promise.all([read('src/lib/ai-tool-actions.ts'),read('src/storage/assistant-task-store.ts')]);
  assert.match(actions,/mutateVaultSafely/);assert.match(actions,/proposal\.tool==='customer\.update'/);assert.match(actions,/proposal\.tool==='supplier\.update'/);assert.match(actions,/createAssistantTask/);
  assert.match(tasks,/AES-GCM/);assert.match(tasks,/crypto\.subtle\.encrypt/);assert.match(tasks,/crypto\.subtle\.decrypt/);assert.doesNotMatch(tasks,/localStorage|sessionStorage/);
});

test('Batch 4 post-build runtime preserves Batches 1-3 and intercepts only before provider request',async()=>{
  const [pkg,script,client]=await Promise.all([read('package.json'),read('scripts/ai-batch4-tool-orchestrator.mjs'),read('src/lib/ai-tool-client.ts')]);
  assert.match(pkg,/ai-batch3-mobile-panel-fit\.mjs && node scripts\/ai-batch4-tool-orchestrator\.mjs/);
  assert.match(script,/__lourexPremiumConversationBatch3/);assert.match(script,/orchestrateAiToolRequest\(\{ message, vault: resumed\.vault/);assert.match(script,/tool\.execute/);assert.match(script,/applyApprovedToolExecution/);assert.match(script,/node.*--check|execFileSync/);
  assert.match(client,/scopeVault\(input\.vault\)/);assert.match(client,/likelyToolIntent/);assert.match(client,/mode:'tool-plan'/);
});

test('Batch 4 does not exceed the Vercel Hobby 12-function deployment budget',async()=>{
  const entries=await readdir(new URL('../api/',import.meta.url),{withFileTypes:true});const functions=entries.filter(row=>row.isFile()&&row.name.endsWith('.js')).map(row=>row.name).sort();assert.ok(functions.length<=12,`found ${functions.length} functions: ${functions.join(', ')}`);assert.ok(functions.includes('ai-inbox.js'));assert.ok(!functions.includes('ai-tool-planner.js'));
});
