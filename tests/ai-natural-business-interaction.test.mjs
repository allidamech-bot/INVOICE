import test from 'node:test';
import assert from 'node:assert/strict';
import {orchestrateAiToolRequest,explicitAiActionRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {sanitizeReadEvidence,buildNaturalLourexPrompt} from '../api/_ai/lourex-dialogue.js';
const context={screen:'home',conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},finance:{balance:'100.00',currency:'USD'}};
async function planned(tool,run){
 const old={fetch:globalThis.fetch,window:globalThis.window,firebase:globalThis.firebase};let calls=0;
 globalThis.window={setTimeout,clearTimeout};
 globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'test-user',getIdToken:async()=> 'fixture-token'}})};
 globalThis.fetch=async()=>{calls++;return{ok:true,status:200,json:async()=>({plan:{version:1,goal:'Understand recorded balance',calls:[{id:'read-1',tool,args:{},reason:'Retrieve recorded evidence'}]}})};};
 try{await run(()=>calls);}finally{Object.assign(globalThis,old);}
}
test('a colloquial business question can retrieve facts without an imperative command',async()=>{
 const vault=emptyVault(),before=JSON.stringify(vault);
 await planned('finance.getSummary',async calls=>{
  const result=await orchestrateAiToolRequest({message:'ليش رصيد الزبون هيك؟',context,vault,language:'ar'});
  assert.equal(calls(),1);
  assert.equal(result.plannedBy,'ai');
  assert.equal(result.results[0].tool,'finance.getSummary');
  assert.equal(result.proposal,null);
 });
 assert.equal(JSON.stringify(vault),before);
});
test('a question cannot turn a hallucinated write plan into an action',async()=>{
 await planned('task.create',async()=>{
  const result=await orchestrateAiToolRequest({message:'ليش رصيد الزبون هيك؟',context,vault:emptyVault(),language:'ar'});
  assert.equal(result,null);
 });
});
test('ordinary greetings remain conversational and polite requests are understood as requests',async()=>{
 await planned('finance.getSummary',async calls=>{
  assert.equal(await orchestrateAiToolRequest({message:'مرحبا',context,vault:emptyVault(),language:'ar'}),null);
  assert.equal(calls(),0);
 });
 assert.equal(explicitAiActionRequest('ممكن تجهز عرض سعر؟'),true);
 assert.equal(explicitAiActionRequest('كيف أعدل بيانات العميل؟'),false);
});
test('read evidence preserves exact currencies and decimals while excluding executable results',()=>{
 const facts=sanitizeReadEvidence([
  {ok:true,class:'read',tool:'finance.getSummary',source:'recorded',data:{USD:'100.00',EUR:'75.50'}},
  {ok:true,class:'execute',tool:'document.createDraft',data:{permission:'save'}},
  {ok:false,class:'read',tool:'missing',data:{amount:999}}
 ]);
 assert.equal(facts.length,1);
 assert.deepEqual(facts[0].data,{USD:'100.00',EUR:'75.50'});
 assert.equal(facts[0].excerptOnly,true);
 const bounded=sanitizeReadEvidence([{ok:true,class:'read',tool:'x',data:{rows:Array.from({length:100},()=>({text:'x'.repeat(10000)}))}}]);
 assert.ok(JSON.stringify(bounded).length<20000);
});
test('natural explanation uses verified reads and adapts to detail preference without a command template',()=>{
 const request={message:'شو بتنصحني بناء على هالأرقام؟',context:{aiResponseDetail:'detailed',verifiedReadEvidence:[{ok:true,class:'read',tool:'finance.getSummary',data:{USD:'100.00'}}]}};
 const prompt=buildNaturalLourexPrompt(request,{mode:'advisor'});
 assert.ok(prompt.includes('100.00'));
 assert.match(prompt,/Explain the relevant reasoning and evidence/);
 assert.match(prompt,/without requiring command keywords or a rigid workflow/);
 assert.doesNotMatch(prompt,/politely decline in one sentence/);
 const brief=buildNaturalLourexPrompt({...request,context:{...request.context,aiResponseDetail:'brief'}},{mode:'advisor'});
 assert.match(brief,/Keep the answer brief and direct/);
});

const {readFileSync}=await import('node:fs');
const runtimeSource=readFileSync('dist/src/lib/ai-intelligence-runtime.js','utf8');
const runSource=runtimeSource.slice(runtimeSource.indexOf('async function runIntelligenceTools('),runtimeSource.indexOf('function stampProposal('));
function explanationHarness(responder,message='ليش هالرقم؟'){
 const scope={accountId:'test-user',scope:'business',workspaceId:'A',branchId:'main',threadId:'one'};
 const result={answer:'Recorded balance: 100.00 USD',proposal:null,plannedBy:'ai',plan:{calls:[]},results:[{id:'r',tool:'finance.getSummary',class:'read',ok:true,source:'recorded',data:{USD:'100.00'}}]};
 const host={mode:'controller',__intelligenceKernel:{scope},state:{messages:[]}};
 const deps={currentConversationMode:h=>h.mode,currentAiExperiencePreferences:()=>({detail:'balanced'}),resolveAiConversationReplyLanguage:()=> 'ar',orchestrateAiToolRequest:async()=>result,resumeVaultSession:async()=>({vault:{}}),scopeFor:()=>host.__intelligenceKernel.scope,kernelScopeKey:s=>JSON.stringify(s),currentAiInterfaceLanguage:()=> 'ar',foundationToolOutcomes:()=>[],intelligenceRequestMessage:()=> 'scoped user facts',requestAiJson:async(...args)=>responder(host,...args)};
 const keys=Object.keys(deps);const run=new Function(...keys,runSource+';return runIntelligenceTools;')(...keys.map(k=>deps[k]));
 return {host,result,run:()=>run(host,{message,language:'ar',context})};
}
test('verified read results receive a natural answer through the read-only channel',async()=>{
 const h=explanationHarness(async(_host,endpoint,payload)=>{
  assert.equal(endpoint,'/api/ai-advisor-v2');
  assert.equal(payload.context.conversationMode,'advisor');
  assert.equal(payload.context.verifiedReadEvidence[0].data.USD,'100.00');
  return {answer:'الرصيد المسجل 100.00 USD. إليك تفسيره.',proposal:null};
 });
 const result=await h.run();
 assert.equal(result.foundationSelectionText,'الرصيد المسجل 100.00 USD. إليك تفسيره.');
 assert.equal(result.proposal,null);
 assert.equal(h.host.mode,'controller');
});
test('explanation failure preserves retrieved facts instead of losing the answer',async()=>{
 const h=explanationHarness(async()=>{throw Error('provider unavailable');});
 assert.equal(await h.run(),h.result);
 assert.equal(h.result.answer,'Recorded balance: 100.00 USD');
});
test('a thread change during explanation cannot deliver previous-thread facts',async()=>{
 const h=explanationHarness(async host=>{host.__intelligenceKernel.scope={...host.__intelligenceKernel.scope,threadId:'another'};return {answer:'stale answer'};});
 await assert.rejects(h.run(),/Conversation changed/);
});


test('simple local financial reads avoid a second provider call and retain exact accounting evidence',async()=>{
 let providerCalls=0;
 for(const message of ['Show treasury and cash status','أعطني رصيد الخزينة','Calculate margin 20% from 100 USD']){
  const h=explanationHarness(async()=>{providerCalls++;throw Error('Do not use model for direct reads');},message);
  const result=await h.run();
  assert.equal(result,h.result);
  assert.equal(result.answer,'Recorded balance: 100.00 USD');
  assert.equal(result.foundationSelectionText,undefined);
 }
 assert.equal(providerCalls,0,'Avoid paying the latency and provider quota twice for deterministic responses');
});
