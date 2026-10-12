import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { newConversationKernel, normalizeConversationKernel } from '../dist/src/lib/ai-conversation-kernel.js';
import {
  createAiToolRuntime, aiToolPlannerCatalog, validateAiToolPlan, executeAiToolCall,
} from '../dist/src/lib/ai-tool-orchestrator.js';
import { conversationModePermitsToolClass, conversationModePermitsCapability } from '../dist/src/lib/ai-conversation-mode.js';
import { orchestrateAiToolRequest } from '../dist/src/lib/ai-tool-client.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'mode-thread',accountId:'user-1'};
const call=(tool,args={})=>({id:tool,tool,args,reason:'contract test'});
const runtime=mode=>createAiToolRuntime(emptyVault(),{
  conversationMode:mode,
  assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},
  finance:{},advisorV2:{},business:{},pricing:{},drafting:{},
});

test('Advisor read-only tool catalog cannot list a write, preparation or navigation',()=>{
  const available=aiToolPlannerCatalog('business','advisor');
  assert.ok(available.length>5);
  assert.ok(available.every(item=>['read','calculate'].includes(item.class)));
  for(const forbidden of ['navigation.open','document.createDraft','document.updateDraft','quotation.prepare','invoice.prepare','customer.update','supplier.update','product.bulkUpdate','accounting.post']){
    assert.ok(!available.some(item=>item.id===forbidden),forbidden);
  }
  for(const safe of ['finance.getSummary','customer.getSummary','pricing.margin','reports.getMetrics']){
    assert.ok(available.some(item=>item.id===safe),safe);
  }
});

test('Direct tool executor forbids crafted Advisor writes regardless of model result',()=>{
  const rt=runtime('advisor');
  for(const tool of ['navigation.open','document.createDraft','document.updateDraft','quotation.prepare','message.prepare','customer.update','supplier.update','payment.record']){
    const result=executeAiToolCall(rt,call(tool));
    assert.equal(result.ok,false,tool);
    assert.equal(result.source,'advisor-read-only-guard',tool);
    assert.equal(result.data,null);
  }
  const read=executeAiToolCall(rt,call('finance.getSummary'));
  assert.equal(read.ok,true);
  const calc=executeAiToolCall(rt,call('pricing.margin',{cost:'80',price:'100'}));
  assert.equal(calc.ok,true);
  assert.equal(calc.data.percent,'20.00');
});

test('Model plans requesting mutations are rejected in Advisor, not silently promoted',()=>{
  const plan={version:1,goal:'change business data',calls:[call('document.createDraft')]};
  assert.equal(validateAiToolPlan(plan,'business','advisor'),null);
  assert.ok(validateAiToolPlan(plan,'business','controller'));
  const safePlan={version:1,goal:'calculate margin',calls:[call('pricing.margin',{cost:'80',price:'100'})]};
  assert.ok(validateAiToolPlan(safePlan,'business','advisor'));
  assert.equal(conversationModePermitsToolClass('advisor','high-impact'),false);
  assert.equal(conversationModePermitsToolClass('advisor','calculate'),true);
});

test('Legacy kernel without explicit mode is read-only after hydration',()=>{
  const old=newConversationKernel(scope);delete old.mode;old.turn=8;old.focus='operator';
  assert.equal(normalizeConversationKernel(null,scope).mode,'advisor','legacy thread with no kernel must fail closed');
  assert.equal(normalizeConversationKernel({version:1,scope,turn:1,focus:'auto',artifact:{lineIds:null}},scope).mode,'advisor','malformed legacy artifact cannot elevate permissions');
  const restored=normalizeConversationKernel(old,scope);
  assert.equal(restored.mode,'advisor');
  assert.equal(restored.turn,8);
  assert.equal(restored.focus,'operator','the historical focus is preserved, but no longer grants permissions');
  assert.equal(newConversationKernel(scope).mode,'controller','new threads begin as explicit Controller');
  const changed=normalizeConversationKernel({...old,mode:'controller'},scope);
  assert.equal(changed.mode,'controller');
  assert.equal(normalizeConversationKernel({...old,focus:'unknown'},scope).mode,'advisor');
  assert.equal(normalizeConversationKernel({...old,version:999},scope).mode,'advisor');
  assert.equal(normalizeConversationKernel({...old,scope:{...scope,branchId:'foreign'}},scope).mode,'advisor');
});

test('Workspace exposes two modes and preserves separate thread scopes',()=>{
  const component=read('src/components/AiConversationWorkspace.tsx');
  const runtimeSource=read('src/lib/ai-intelligence-runtime.ts');
  const gateway=read('public/ai-composer-v449.js');
  const styles=read('src/styles/ai-conversation-workspace.css');
  assert.match(component,/role="tablist"/);
  assert.match(component,/role="tab" aria-selected/);
  assert.match(component,/conversationModeDescription\(mode,ar\?'ar':'en'\)/);
  assert.doesNotMatch(component,/<select value=\{k\.focus\}/,'four old focus choices must not be the visible mode UI');
  assert.match(component,/__workspaceSwitchMode=async/);
  assert.match(component,/host\.__lourexOpenThread\(matching\[0\]\.id\)/);
  assert.match(component,/host\.__lourexNewConversation\(\)/);
  assert.match(component,/drafts\.set\(kernelScopeKey\(previous\.scope\)/);
  assert.match(runtimeSource,/mode:normalizeAiConversationMode\(t\.kernel\?\.mode\)/);
  assert.match(runtimeSource,/thread\?normalizeConversationKernel\(thread\.kernel,scope\):newConversationKernel\(scope\)/);
  assert.match(runtimeSource,/Advisor cannot approve actions/);
  assert.match(runtimeSource,/Advisor can analyze but cannot edit a workspace/);
  assert.match(runtimeSource,/conversationMode:requestedMode/);
  assert.match(runtimeSource,/context\.allowedCapabilities=context\.allowedCapabilities\.filter/,'Advisor provider input must remove execution and navigation capabilities');
  assert.match(runtimeSource,/conversationModePermitsCapability\('advisor',capability\)/,'model capability filtering is deny-only');
  assert.match(gateway,/panel\.dataset\.workspaceMode==='advisor'/);
  assert.match(styles,/\.lxw-mode-description\{/);
  assert.match(styles,/\.lxw-mode-tabs button\[aria-selected='true'\]/);
});

test('legacy personal-memory and attachment shortcuts do not prepare actions in Advisor',()=>{
  const client=read('src/lib/ai-tool-client.ts');
  const runtimeSource=read('src/lib/ai-intelligence-runtime.ts');
  assert.match(client,/runtime\.conversationMode!=='advisor'&&sources\.every\(row=>row\.route==='product_list'\)/,
    'product list review must not silently propose a product import in Advisor');
  assert.match(client,/runtime\.conversationMode!=='advisor'&&requestedAiProductImport\(input\.message\)/,
    'attachment import requests must bypass the executor in Advisor');
  assert.match(client,/runtime\.conversationMode==='advisor'&&local\.proposal/,
    'legacy local commands must not surface a write proposal');
  assert.match(client,/No data was changed/, 'Advisor must state that no action was performed');
  assert.match(runtimeSource,/Advisor cannot revise documents/,'legacy revision shortcut requires Controller');
  assert.match(runtimeSource,/host\.__workspaceModeSwitchBusy\|\|!proposal/,'approval cannot race tab switching');
});

test('Malformed explicit mode cannot elevate Advisor to Controller through runtime or capability guard',()=>{
  const malformed=createAiToolRuntime(emptyVault(),{
    conversationMode:'legacy-operator',
    assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},
  });
  assert.equal(malformed.conversationMode,'advisor');
  assert.equal(conversationModePermitsCapability('legacy-operator','document.createDraft'),false);
  assert.equal(conversationModePermitsCapability('legacy-operator','finance.explain'),true);
  assert.equal(conversationModePermitsToolClass('legacy-operator','execute'),false);
  const blocked=executeAiToolCall(malformed,call('document.createDraft',{kind:'proforma'}));
  assert.equal(blocked.ok,false);
  assert.equal(blocked.source,'advisor-read-only-guard');
  assert.equal(blocked.data,null);
});

test('Advisor imperatives return to normal chat instead of planning a navigation or mutation',async()=>{
  const vault=emptyVault();
  const context={conversationMode:'advisor',screen:'items',assistantRuntime:{
    scope:'temporary',workspaceId:'default',branchId:'main',
  }};
  for(const message of ['افتح الفواتير','Create a quotation','Update all product prices']){
    const result=await orchestrateAiToolRequest({message,vault,context,language:'en'});
    assert.equal(result,null, message+' should be discussed without an action proposal');
  }
  const read=await orchestrateAiToolRequest({
    message:'ما وضع الشركة المالي؟',vault,context,language:'ar'
  });
  assert.ok(read,'Advisor must retain deterministic read-only financial analysis');
  assert.equal(read.proposal,null);
  assert.equal(read.plan.calls[0]?.tool,'finance.getSummary');
  assert.ok(read.results.every(row=>row.class==='read'||row.class==='calculate'));
});
