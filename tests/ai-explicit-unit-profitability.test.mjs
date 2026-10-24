import test from 'node:test';
import assert from 'node:assert/strict';
import {advisorCalculation} from '../dist/src/lib/advisor-calculator.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
const live='اختبار اصطناعي مستقل: لا تستخدم سجلات الشركة. التكلفة 50 USD وسعر البيع 100 USD. احسب هامش الربح على المبيعات بالحساب الحتمي، وليس نسبة الزيادة على التكلفة. لا تحفظ أو تنفذ شيئًا.';
test('explicit unit pricing distinguishes margin percentage from profit amount and markup',()=>{
 for(const [message,percent] of [[live,'50.00%'],['Cost 50 USD, selling price 100 USD. Calculate markup, not margin.','100.00%'],['Cost 1, price 3. Calculate gross margin.','66.67%'],['Cost 0.001, price 0.002. Calculate margin.','50.00%'],['التكلفة ١٠٠ وسعر البيع ٥٠. احسب هامش الربح.','-100.00%']]){
  const result=advisorCalculation(message,'en');
  assert.ok(result,message);assert.ok(result.summary.includes(percent),result?.summary);
 }
 for(const message of ['Cost 50 EUR, price 100 USD. Calculate margin.','Cost 50 or cost 80, price 100. Calculate margin.','Cost 50 USD, price 100. Calculate margin.','Translate: calculate margin, cost 50, price 100.','Do not calculate margin; cost 50, price 100.','Cost 50, price 100. Calculate margin and recommend a supplier.'])
  assert.equal(advisorCalculation(message),null,'ambiguous price/currency pair must not become a certain margin');
});
test('zero denominators remain undefined rather than a fabricated zero percentage',()=>{
 for(const message of ['Cost 50, price 0. Calculate margin.','Cost 0, price 100. Calculate markup.']){
  const result=advisorCalculation(message);
  assert.match(result.summary,/undefined/);assert.doesNotMatch(result.summary,/0\.00%/);
 }
});
test('captured Advisor pricing question returns locally before any inference',async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('No inference should be needed');};
 try{
  const vault=emptyVault(),snapshot=JSON.stringify(vault);
  const result=await orchestrateAiToolRequest({message:live,context:{conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}},vault,language:'ar'});
  assert.equal(calls,0);assert.equal(result.plannedBy,'local');assert.equal(result.proposal,null);
  assert.match(result.answer,/50\.00%/);assert.equal(JSON.stringify(vault),snapshot);
 }finally{globalThis.fetch=before;}
});
