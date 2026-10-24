import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

const message='Analyze these supplied prices only, without consulting company records: cost 50, price 100.';
const context={screen:'home',conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},finance:{balance:'98765.00',currency:'USD'}};
test('supplied-only Advisor rejects record tools but retains deterministic calculations',async()=>{
 const old={fetch:globalThis.fetch,window:globalThis.window,firebase:globalThis.firebase};
 globalThis.window={setTimeout,clearTimeout};
 globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'synthetic-only',getIdToken:async()=> 'synthetic-token'}})};
 try{
  for(const [tool,args,allowed,question] of [
   ['finance.getSummary',{},false,message],
   ['fx.convertUsingRecordedRate',{amount:'50',fromCurrency:'USD',toCurrency:'EUR'},false,message],
   ['pricing.margin',{cost:'50',price:'100'},true,message],
   ['finance.getSummary',{},false,'حلل الأرقام المعطاة فقط، لا تستخدم سجلات الشركة: التكلفة 50 والسعر 100.'],
   ['finance.getSummary',{},false,'Do not use company records. Discuss the supplied price only.']
  ]){
   let calls=0,payload;
   globalThis.fetch=async(_url,options)=>{calls++;payload=JSON.parse(options.body);return{ok:true,status:200,json:async()=>({plan:{version:1,goal:'Use supplied data',calls:[{id:'calc-1',tool,args,reason:'Synthetic fixture'}]}})};};
   const vault=emptyVault(),before=JSON.stringify(vault);
   const result=await orchestrateAiToolRequest({message:question,context,vault,language:'en'});
   assert.equal(calls,1,'no second planning request');
   assert.equal(payload.dataScope,'supplied-only');
   assert.equal('entity' in payload,false,'selected workspace record must not redirect supplied-data calculations');
   if(!allowed)assert.equal(result,null,'record-dependent tool must not execute');
   else{assert.equal(result.proposal,null);assert.equal(result.results[0].data.percent,'50.00');assert.equal(result.results[0].class,'calculate');}
   assert.equal(JSON.stringify(vault),before);
  }
 }finally{Object.assign(globalThis,old);}
});

test('server enforces calculation-only scope even if the model ignores its schema',async()=>{
 const code=(await readFile(new URL('../api/ai-inbox.js',import.meta.url),'utf8')).replace(/^import .+;\s*$/gm,'').replace('export default async function handler','async function handler');
 let candidate,prompt,schema;
 const lib=vm.runInNewContext(code+'\n({handleToolPlan})',{Buffer,URL,console,process:{env:{}},routeAiStructured:async opts=>{prompt=opts.prompt;schema=opts.schema;return opts.validate(candidate)?{success:true,data:candidate}:{success:false,errorCode:'AI_INVALID_RESULT'};}});
 for(const [tool,argsJson,status] of [['finance.getSummary','{}',422],['fx.convertUsingRecordedRate','{}',422],['pricing.margin','{"cost":"50","price":"100"}',200]]){
  candidate={version:1,goal:'Synthetic supplied data',calls:[{id:'one',tool,argsJson,reason:'Synthetic'}]};
  const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await lib.handleToolPlan({message,scope:'business',conversationMode:'advisor',dataScope:'supplied-only'},res,'owner');
  assert.equal(res.statusCode,status,tool);
  const tools=schema.properties.calls.items.properties.tool.enum;
  assert.ok(!tools.includes('finance.getSummary'));
  assert.ok(!tools.includes('fx.convertUsingRecordedRate'));
  assert.ok(tools.includes('pricing.margin'));
  assert.match(prompt,/supplied-only/);
 }
});
