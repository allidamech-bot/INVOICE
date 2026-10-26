import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
const api=readFileSync(new URL('../api/ai-inbox.js',import.meta.url),'utf8');
const read={version:1,goal:'Read product',calls:[{id:'read',tool:'product.getSummary',argsJson:'{"sku":"QA-50"}',reason:'Read product'}]};
const create={version:1,goal:'Quotation',calls:[{id:'create',tool:'document.createDraft',argsJson:'{"kind":"proforma","items":[{"descriptionEn":"QA Carton","quantity":"50","unit":"Carton","unitPrice":""}]}',reason:'Review request'}]};
function gateway(outputs,role='owner'){
 let options,checks=[];
 const source=api.slice(0,api.indexOf('export default async function handler(')).replace(/^import .+;\s*$/gm,'');
 const {handleToolPlan}=vm.runInNewContext(source+'\n({handleToolPlan})',{
 routeAiStructured:async o=>{options=o;for(const data of outputs){const valid=o.validate(data);checks.push(valid);if(valid)return{success:true,data};}return{success:false,errorCode:'AI_INVALID_RESULT'};},
 aiRouterPublicError:()=>({status:503,code:'AI_ERROR'})});
 return{checks,get options(){return options;},async run(body){const r={setHeader(){},end(s){this.body=JSON.parse(s);}};await handleToolPlan(body,r,role);return r;}};
}
for(const message of ['سويلي عرض سعر ب٥٠ كرتون منه','سويلي عرض سعر ب50 كرتون منه','Prepare a quotation for 50 cartons of that item'])test('server rejects read-only completion and uses same bounded route: '+message,async()=>{
 const g=gateway([read,create]),r=await g.run({message,scope:'business',conversationMode:'controller',documentGoal:'proforma'});
 assert.deepEqual(g.checks,[false,true]);assert.equal(r.statusCode,200);assert.equal(r.body.plan.calls[0].tool,'document.createDraft');assert.equal(g.options.totalBudgetMs,11000);
});
test('server rejects wrong document kind and all-read output even after routing',async()=>{
 const wrong={...create,calls:[{...create.calls[0],argsJson:'{"kind":"invoice"}'}]};
 const g=gateway([read,wrong]),r=await g.run({message:'Create quotation',scope:'business',conversationMode:'controller',documentGoal:'proforma'});
 assert.deepEqual(g.checks,[false,false]);assert.equal(r.statusCode,422);
});
test('ordinary reads, Advisor and unavailable creation permissions retain their allowlists',async()=>{
 for(const body of [{scope:'business',conversationMode:'controller'}, {scope:'business',conversationMode:'advisor',documentGoal:'proforma'}, {scope:'temporary',conversationMode:'controller',documentGoal:'proforma'}]){
 const g=gateway([read]),r=await g.run({message:'Show product',...body});assert.equal(r.statusCode,200);assert.deepEqual(g.checks,[true]);}
});
test('client sends creation goal and never accepts a returned read plan as quote completion',async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window,firebase:globalThis.firebase};let requests=[];
 globalThis.window={setTimeout,clearTimeout};globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture',getIdToken:async()=>'fixture-token'}})};
 globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({plan:{...read,calls:read.calls.map(c=>({...c,args:JSON.parse(c.argsJson)}))}})};};
 try{for(const message of ['سويلي عرض سعر ب٥٠ كرتون منه','سويلي عرض سعر ب50 كرتون منه','Prepare a quotation for 50 cartons of that item']){
 const vault=emptyVault(),before=structuredClone(vault);
 const result=await orchestrateAiToolRequest({message,vault,context:{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}},language:'ar'});
 assert.equal(requests.at(-1).documentGoal,'proforma');assert.ok(result);assert.equal(result.proposal,null);assert.deepEqual(result.results,[]);assert.match(result.answer,/لم أتمكن/);assert.deepEqual(vault,before);
 }assert.equal(requests.length,3,'one planning request per turn; no additional dialogue retries');}
 finally{Object.assign(globalThis,original);}
});

test('completion hint cannot grant document creation to a viewer',async()=>{
 const g=gateway([create],'viewer'),r=await g.run({message:'Create invoice',scope:'business',conversationMode:'controller',documentGoal:'invoice'});
 assert.equal(r.statusCode,422);assert.equal(g.options.schema.properties.calls.items.properties.tool.enum.includes('document.createDraft'),false);
});
test('complete creation remains valid with missing selling price and buyer',async()=>{
 const g=gateway([create]),r=await g.run({message:'Create quotation',scope:'business',conversationMode:'controller',documentGoal:'proforma'});
 assert.equal(r.statusCode,200);assert.equal(r.body.plan.calls[0].args.items[0].unitPrice,'');assert.equal(r.body.plan.calls[0].args.customerId,undefined);
});

test('an empty creation payload is not goal completion',async()=>{
 const empty={...create,calls:[{...create.calls[0],argsJson:'{"kind":"proforma","items":[]}'}]};
 const g=gateway([empty]),r=await g.run({message:'Create quotation',scope:'business',conversationMode:'controller',documentGoal:'proforma'});
 assert.equal(r.statusCode,422);
});

test('bare explicit draft creation requests missing buyer/products locally without a guessed proposal',async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window,firebase:globalThis.firebase};
 const vault=emptyVault(),before=structuredClone(vault),requests=[];
 globalThis.window={setTimeout,clearTimeout};globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture',getIdToken:async()=>'fixture-token'}})};
 globalThis.fetch=async()=>{requests.push('unexpected');throw new Error('The bare create route must remain local.');};
 try{
  const result=await orchestrateAiToolRequest({message:'أنشئ مسودة عرض سعر',vault,context:{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}},language:'ar'});
  assert.equal(requests.length,0,'bare request must not depend on an external tool planner');
  assert.equal(result.plannedBy,'local');assert.equal(result.planningFailure,undefined);
  assert.equal(result.proposal,null);assert.equal(result.workingDraft.capability,'document.createDraft');
  assert.equal(result.workingDraft.customerId,'');assert.equal(result.workingDraft.items.length,0);
  assert.match(result.answer,/العميل/);assert.match(result.answer,/سعر البيع/);
  assert.deepEqual(vault,before);assert.deepEqual(result.results,[]);
 }finally{Object.assign(globalThis,original);}
});
