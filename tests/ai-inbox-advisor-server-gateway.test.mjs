import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const api=read('api/ai-inbox.js');
const client=read('src/lib/ai-tool-client.ts');
const registry=read('src/lib/ai-tool-orchestrator.ts');

// Exercise the real server planner implementation with a mocked model. Never
// contact an AI provider, Firestore or a business account in these tests.
function makeGateway(modelOutput){
  const offset=api.indexOf('export default async function handler(');
  assert.ok(offset>0,'Expected AI Inbox handler boundary');
  const source=api.slice(0,offset).replace(/^import .+;\s*$/gm,'');
  const requests=[];
  const policy=vm.runInNewContext(source+'\n({plannerToolIds,cleanToolPlan,handleToolPlan})',{
    routeAiStructured:async options=>{
      requests.push(options);
      return{success:true,data:modelOutput};
    },
    aiRouterPublicError:()=>({status:503,code:'AI_ERROR'}),
  });
  async function request(body){
    const response={
      statusCode:0,headers:{},body:null,
      setHeader(key,value){this.headers[key]=value;},
      end(json){this.body=JSON.parse(json);},
    };
    await policy.handleToolPlan(body,response);
    return response;
  }
  return{...policy,requests,request};
}

const plan=tool=>({
  version:1,goal:'test',calls:[{id:'one',tool,argsJson:'{}',reason:'test'}],
});
const message='Please check the current document';

test('Advisor planner exposes exactly read/calculate tools from the local registry',async()=>{
  const gateway=makeGateway(plan('document.get'));
  const response=await gateway.request({message,scope:'business',conversationMode:'advisor'});
  assert.equal(response.statusCode,200);
  assert.equal(response.body.plan.calls[0].tool,'document.get');
  assert.equal(gateway.requests.length,1);
  const allowed=gateway.requests[0].schema.properties.calls.items.properties.tool.enum;
  const classes=new Map([...registry.matchAll(/\['([^']+)','(read|calculate|prepare|execute|high-impact)'/g)].map(match=>[match[1],match[2]]));
  assert.equal(allowed.length,22);
  for(const tool of allowed)assert.ok(['read','calculate'].includes(classes.get(tool)),tool+' is not read-only');
  assert.ok(allowed.includes('search.records'));
  assert.ok(!allowed.includes('document.createDraft'));
  assert.ok(!allowed.includes('navigation.open'));
  assert.ok(!allowed.includes('report.prepare'));
  const catalog=gateway.requests[0].prompt.split('AVAILABLE TOOLS:')[1].split('USER REQUEST')[0];
  assert.ok(catalog.includes('document.get'));
  assert.ok(!catalog.includes('document.createDraft'));
});

test('Even model-generated executable plans are rejected after generation in Advisor',async()=>{
  for(const tool of ['document.createDraft','document.updateDraft','navigation.open','product.bulkUpdate','task.create','document.finalize']){
    const gateway=makeGateway(plan(tool));
    const response=await gateway.request({message:'Create an invoice',scope:'business',conversationMode:'advisor'});
    assert.equal(response.statusCode,422,tool);
    assert.equal(response.body.code,'NO_TOOL_PLAN',tool);
  }
});

test('Missing, invalid and legacy mode values fail closed to Advisor',async()=>{
  for(const mode of [undefined,null,'operator','Controller',false,{},'']){
    const gateway=makeGateway(plan('payment.record'));
    const response=await gateway.request({message:'Record payment',scope:'business',conversationMode:mode});
    assert.equal(response.statusCode,422,String(mode));
    assert.equal(gateway.requests[0].schema.properties.calls.items.properties.tool.enum.includes('payment.record'),false);
  }
});

test('Controller retains legacy proposals for review; personal Advisor cannot call any tools',async()=>{
  const controller=makeGateway(plan('document.createDraft'));
  const ready=await controller.request({message:'Create invoice',scope:'business',conversationMode:'controller'});
  assert.equal(ready.statusCode,200);
  assert.equal(ready.body.plan.calls[0].tool,'document.createDraft');
  assert.ok(controller.requests[0].schema.properties.calls.items.properties.tool.enum.includes('document.createDraft'));

  const advisor=makeGateway(plan('task.create'));
  const blocked=await advisor.request({message:'Create task',scope:'personal',conversationMode:'advisor'});
  assert.equal(blocked.statusCode,200);
  assert.deepEqual(JSON.parse(JSON.stringify(blocked.body.plan.calls)),[]);
  assert.equal(advisor.requests.length,0,'Advisor personal scope must not invoke the model planner');
});

test('Client explicitly transmits bounded conversation mode to server planner',()=>{
  assert.match(client,/mode:'tool-plan',conversationMode:runtime\.conversationMode==='controller'\?'controller':'advisor'/);
  assert.match(client,/validateAiToolPlan\(payload\?\.plan,runtime\.scope,runtime\.conversationMode\)/);
});

test('Controller server planner cannot expose high-impact accounting actions, regardless of signed user intent',async()=>{
  for(const tool of ['document.finalize','payment.record','inventory.adjust','financial.delete','accounting.post']){
    const gateway=makeGateway(plan(tool));
    const reply=await gateway.request({message:'Record and post the requested business operation',scope:'business',conversationMode:'controller'});
    assert.equal(reply.statusCode,422,tool+' must be rejected after model output');
    assert.equal(reply.body.code,'NO_TOOL_PLAN');
    assert.equal(gateway.requests.length,1);
    const allowed=gateway.requests[0].schema.properties.calls.items.properties.tool.enum;
    assert.equal(allowed.includes(tool),false,tool+' must not appear in provider schema');
    assert.equal(gateway.requests[0].prompt.includes(tool+':'),false,tool+' must not appear in provider tool catalog');
  }
});
test('Spoofed role, owner, UID or accounting permission in a tool-plan request cannot unlock protected tools',async()=>{
  for(const role of ['owner','admin','finance','sales','superuser']){
    const gateway=makeGateway(plan('accounting.post'));
    const response=await gateway.request({message:'Post journal',scope:'business',
      conversationMode:'controller',role,teamRole:role,permissions:['*'],
      uid:'claimed-owner',context:{role,owner:true,accountId:'claimed-owner'}});
    assert.equal(response.statusCode,422,role);
    assert.equal(response.body.code,'NO_TOOL_PLAN');
  }
});
