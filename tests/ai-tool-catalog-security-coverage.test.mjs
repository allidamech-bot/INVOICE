import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {
  AI_TOOL_REGISTRY, createAiToolRuntime, executeAiToolCall,
  executeAiToolPlan, aiToolPlannerCatalog, validateAiToolPlan
} from '../dist/src/lib/ai-tool-orchestrator.js';

const registry=Array.from(AI_TOOL_REGISTRY);
const context=(mode)=>({
  conversationMode:mode,
  assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},
  screen:'documents'
});
const sample=(tool)=>({id:'test-'+tool,tool,args:{},reason:'read-only regression harness'});
function runtime(mode){
  return createAiToolRuntime(emptyVault(),context(mode));
}

test('AI catalog contains 58 unique classified tools with no undefined capability',()=>{
  assert.equal(registry.length,58);
  assert.equal(new Set(registry.map(x=>x.id)).size,58,'every tool ID must be unique');
  assert.deepEqual(
    Object.fromEntries(['read','calculate','prepare','execute','high-impact'].map(cls=>[cls,registry.filter(x=>x.class===cls).length])),
    {'read':13,'calculate':9,'prepare':8,'execute':23,'high-impact':5}
  );
  for(const x of registry){
    assert.ok(x.description.length>=12,x.id+' requires an understandable description');
    assert.ok(x.maxResultChars>0,x.id+' needs a response-size limit');
    if(x.class==='high-impact')assert.equal(x.mutation,true);
  }
});

test('Advisor cannot stage any preview, mutation, navigation or high-impact operation across all 58 tools',()=>{
  const advisor=runtime('advisor'),snapshot=JSON.stringify(advisor.vault);
  const allowed=new Set(aiToolPlannerCatalog('business','advisor').map(x=>x.id));
  assert.equal(allowed.size,22,'Advisor catalog must expose only read/calculation tools');
  for(const definition of registry){
    const action=sample(definition.id);
    const result=executeAiToolCall(advisor,action);
    assert.equal(result.class,definition.class,definition.id);
    if(definition.class==='read'||definition.class==='calculate'){
      assert.notEqual(result.source,'advisor-read-only-guard',definition.id+' should remain eligible for analysis');
      assert.ok(allowed.has(definition.id),definition.id+' must be in Advisor catalog');
    }else{
      assert.equal(result.ok,false,definition.id+' is blocked for Advisor');
      assert.equal(result.data,null,definition.id+' must return no executable payload');
      assert.equal(result.source,'advisor-read-only-guard',definition.id+' must be blocked before execution');
      assert.ok(!allowed.has(definition.id),definition.id+' must not appear in Advisor catalog');
      const plan={version:1,calls:[action],goal:'attempt execute'};
      assert.equal(validateAiToolPlan(plan,'business','advisor'),null,definition.id+' should not validate for Advisor');
    }
    assert.equal(JSON.stringify(advisor.vault),snapshot,'Advisor tool '+definition.id+' altered the vault');
  }
});

test('Controller preview and execute plan paths never directly mutate the vault, including finance/posting operations',()=>{
  const controller=runtime('controller'),snapshot=JSON.stringify(controller.vault);
  for(const definition of registry){
    const action=sample(definition.id);
    const result=executeAiToolCall(controller,action);
    assert.equal(result.class,definition.class,definition.id);
    if(definition.class==='high-impact'){
      assert.equal(result.ok,false,definition.id+' must be blocked');
      assert.equal(result.data,null,definition.id+' must not carry a proposal');
      assert.equal(result.source,'high-impact-guard',definition.id+' is never executed in the conversation');
      const execution=executeAiToolPlan(controller,{version:1,calls:[action],goal:'attempt high-impact'});
      assert.equal(execution.proposal,null,definition.id+' cannot become an approval');
      assert.equal(execution.blockedHighImpact,true,definition.id);
    }
    if(definition.class==='execute'){
      assert.ok(result.source==='approval-gate'||result.source==='approval-preflight',
        definition.id+' must only prepare an approval or fail closed; got '+result.source);
    }
    assert.equal(JSON.stringify(controller.vault),snapshot,'Controller tool '+definition.id+' mutated vault before explicit approval');
  }
});

test('invalid AI tool plans cannot invent, repeat, or mix unsafe actions',()=>{
  assert.equal(validateAiToolPlan({version:1,calls:[{tool:'not-a-tool'}]},'business','controller'),null);
  assert.equal(validateAiToolPlan({version:1,calls:new Array(6).fill(sample('finance.getSummary'))},'business','controller'),null);
  const controller=runtime('controller'),before=JSON.stringify(controller.vault);
  const mixed={version:1,goal:'do not partially apply',calls:[
    sample('customer.update'),sample('accounting.post')
  ]};
  const blocked=executeAiToolPlan(controller,mixed);
  assert.equal(blocked.proposal,null,'one high-impact action must prevent an unsafe mixed approval');
  assert.equal(JSON.stringify(controller.vault),before);
});
