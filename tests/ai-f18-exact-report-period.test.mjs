import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {requestedAiReportPeriod,safeAiReportPeriod} from '../dist/src/lib/ai-report-period.js';
import {createAiToolRuntime,deterministicAiToolPlan,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('F18 Arabic/English exact report months map to complete calendar ranges without guesswork',()=>{
 const today='2026-10-13';
 const examples=[
 ['افتح تقرير مبيعات سبتمبر 2026',{from:'2026-09-01',to:'2026-09-30'}],
 ['افتح تقرير شهر أيلول ٢٠٢٦',{from:'2026-09-01',to:'2026-09-30'}],
 ['Open sales report for September 2026',{from:'2026-09-01',to:'2026-09-30'}],
 ['Show the February 2024 report',{from:'2024-02-01',to:'2024-02-29'}],
 ['افتح تقرير مبيعات فبراير 2025',{from:'2025-02-01',to:'2025-02-28'}],
 ['افتح تقرير شهر أكتوبر',{from:'2026-10-01',to:'2026-10-31'}],
 ];
 for(const [message,period] of examples)assert.deepEqual(requestedAiReportPeriod(message,today),period,message);
});
test('F18 rejects negation, unsupported/multiple dates and non-report instructions',()=>{
 for(const message of [
  'لا تفتح تقرير سبتمبر 2026',
  'Analyze September 2026 sales',
  'افتح الفاتورة INV-2026-0001',
  'افتح تقرير من سبتمبر 2025 إلى أكتوبر 2026',
  'افتح تقرير مبيعات سبتمبر ونوفمبر 2026',
  'افتح تقرير المبيعات 2099 و2100',
 ]){
  assert.equal(requestedAiReportPeriod(message,'2026-10-13'),null,message);
 }
 assert.equal(safeAiReportPeriod({from:'2026-09-31',to:'2026-10-02'}),null);
 assert.equal(safeAiReportPeriod({from:'2026-10-01',to:'2026-09-01'}),null);
 assert.equal(safeAiReportPeriod({from:'2026-09-01',to:'2026-09-30'}).to,'2026-09-30');
});
test('F18 deterministic Controller report navigation carries exact period and does not write any records',()=>{
 const vault=emptyVault(),before=structuredClone(vault);
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 const plan=deterministicAiToolPlan('افتح تقرير مبيعات سبتمبر 2026',runtime);
 assert.equal(plan.calls.length,1);
 assert.equal(plan.calls[0].tool,'navigation.open');
 assert.equal(plan.calls[0].args.target,'reports');
 assert.deepEqual(plan.calls[0].args.reportPeriod,{from:'2026-09-01',to:'2026-09-30'});
 const executed=executeAiToolPlan(runtime,plan);
 assert.equal(executed.proposal?.capability,'workspace.navigate');
 assert.equal(executed.proposal?.target,'reports');
 assert.deepEqual(executed.proposal?.reportPeriod,{from:'2026-09-01',to:'2026-09-30'});
 assert.deepEqual(vault,before);
});
test('F18 approved AI navigation applies period to real ReportsPage state instead of year default',()=>{
 const copilot=read('src/components/AiCopilot.tsx');
 const reports=read('src/components/ReportsPage.tsx');
 const app=read('src/app/App.tsx');
 assert.match(copilot,/requestedAiReportPeriod\(message\)/);
 assert.match(copilot,/this\.props\.onNavigate\(proposal\.target,proposal\.reportPeriod\)/);
 assert.match(reports,/from:this\.props\.initialPeriod\?\.from/);
 assert.match(reports,/to:this\.props\.initialPeriod\?\.to/);
 assert.match(reports,/preset:this\.props\.initialPeriod\?null:'year'/);
 assert.match(app,/reportsPeriodVersion:state\.reportsPeriodVersion\+1/);
 assert.match(app,/initialPeriod=\{this\.state\.reportsPeriod\|\|undefined\}/);
 assert.match(app,/key=\{'report-period-'\+this\.state\.reportsPeriodVersion\}/);
});
