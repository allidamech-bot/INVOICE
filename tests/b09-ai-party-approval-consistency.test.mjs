import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime,executeAiToolCall,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {prepareApprovedPartyPatch,applyApprovedPartyPatch} from '../dist/src/lib/ai-approved-party-patch.js';

const timestamp='2026-10-09T00:00:00.000Z';
function setup(){
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='default';
  vault.customers=[
    {id:'buyer-a',workspaceId:'default',updatedAt:timestamp,companyNameEn:'Buyer A',companyNameAr:'',email:'buyer@example.com',phone:'123',city:'Riyadh'},
    {id:'buyer-b',workspaceId:'default',updatedAt:timestamp,companyNameEn:'Buyer B',companyNameAr:'',email:'b@example.com',phone:''},
    {id:'buyer-foreign',workspaceId:'other',updatedAt:timestamp,companyNameEn:'Foreign Buyer',companyNameAr:'',email:'foreign@example.com'}
  ];
  vault.suppliers=[
    {id:'supplier-a',workspaceId:'default',updatedAt:timestamp,nameEn:'Supplier A',nameAr:'',email:'supplier@example.com',city:'Istanbul'},
    {id:'supplier-b',workspaceId:'default',updatedAt:timestamp,nameEn:'Supplier B',nameAr:'',email:'b-supplier@example.com'},
    {id:'supplier-foreign',workspaceId:'other',updatedAt:timestamp,nameEn:'Supplier Foreign',nameAr:'',email:'foreign-supplier@example.com'}
  ];
  return vault;
}
function proposal(vault,tool,id,patch,scope='business'){
  const runtime=createAiToolRuntime(vault,{assistantRuntime:{scope,workspaceId:'default',branchId:'main'}});
  return executeAiToolCall(runtime,{id:'approved-proposal',tool,
    args:{[tool==='customer.update'?'customerId':'supplierId']:id,patch},reason:'Update contact details'});
}

test('B09.2: AI customer patch produces an exact before/after review and mutates only after approval',()=>{
  const vault=setup();
  const result=proposal(vault,'customer.update','buyer-a',{city:'Jeddah'});
  assert.equal(result.ok,true);
  assert.equal(result.source,'approval-gate');
  const batch=result.data.args;
  assert.equal(batch.workspaceId,'default');
  assert.equal(batch.recordId,'buyer-a');
  assert.equal(batch.beforeUpdatedAt,timestamp);
  assert.equal(batch.preview.before.city,'Riyadh');
  assert.equal(batch.preview.after.city,'Jeddah');
  assert.equal(vault.customers[0].city,'Riyadh');
  const updated=applyApprovedPartyPatch(vault,batch);
  assert.equal(updated.customers[0].city,'Jeddah');
  assert.equal(updated.customers[1].companyNameEn,'Buyer B');
  assert.equal(vault.customers[0].city,'Riyadh');
});

test('B09.2: changed customer revision or company rejects stale approval without mutations',()=>{
  const vault=setup();
  const batch=proposal(vault,'customer.update','buyer-a',{city:'Jeddah'}).data.args;
  const changed=structuredClone(vault);
  changed.customers[0].updatedAt='2026-10-09T03:00:00.000Z';
  assert.throws(()=>applyApprovedPartyPatch(changed,batch),/changed since review/);
  assert.equal(changed.customers[0].city,'Riyadh');
  const switched=structuredClone(vault);
  switched.appSettings.activeWorkspaceId='other';
  assert.throws(()=>applyApprovedPartyPatch(switched,batch),/Active company changed/);
  assert.equal(switched.customers[0].city,'Riyadh');
});

test('B09.2: cross-company target and unsupported fields are blocked at tool preflight',()=>{
  const vault=setup();
  const foreign=proposal(vault,'customer.update','buyer-foreign',{city:'Riyadh'});
  assert.equal(foreign.ok,false);
  assert.equal(foreign.source,'approval-preflight');
  assert.match(foreign.summary,/another company/);
  const unsupported=proposal(vault,'customer.update','buyer-a',{workspaceId:'other',city:'Jeddah'});
  assert.equal(unsupported.ok,false);
  assert.match(unsupported.summary,/Unapproved/);
  const foreignSupplier=proposal(vault,'supplier.update','supplier-foreign',{city:'Ankara'});
  assert.equal(foreignSupplier.ok,false);
  const personal=proposal(vault,'customer.update','buyer-a',{city:'Jeddah'},'personal');
  assert.equal(personal.ok,false);
});

test('B09.2: supplier edits reject late changes and protect another company after approval',()=>{
  const vault=setup();
  const result=proposal(vault,'supplier.update','supplier-a',{city:'Ankara'});
  assert.equal(result.ok,true);
  const batch=result.data.args;
  const saved=applyApprovedPartyPatch(vault,batch);
  assert.equal(saved.suppliers[0].city,'Ankara');
  assert.equal(vault.suppliers[0].city,'Istanbul');
  assert.throws(()=>applyApprovedPartyPatch(saved,batch),/changed since review/);
});

test('B09.2: replays, tampered previews, duplicate identity and legacy unversioned proposals fail closed',()=>{
  const vault=setup(),batch=prepareApprovedPartyPatch(vault,'customer','buyer-a',{city:'Jeddah'});
  const saved=applyApprovedPartyPatch(vault,batch);
  assert.throws(()=>applyApprovedPartyPatch(saved,batch),/changed since review/);
  assert.throws(()=>applyApprovedPartyPatch(vault,{...batch,preview:{...batch.preview,name:'Forged'}}),/preview changed/);
  assert.throws(()=>prepareApprovedPartyPatch(vault,'customer','buyer-a',{email:'b@example.com'}),/already has/);
  assert.throws(()=>prepareApprovedPartyPatch(vault,'supplier','supplier-a',{email:'b-supplier@example.com'}),/already has/);
  assert.throws(()=>applyApprovedPartyPatch(vault,{party:'customer',recordId:'buyer-a',patch:{city:'Jeddah'}}),/Active company changed/);
});

test('B09.2: a malformed party step blocks a valid AI task in the same plan',()=>{
  const vault=setup(),runtime=createAiToolRuntime(vault,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
  const plan={version:1,goal:'Update a customer and create reminder',calls:[
    {id:'one',tool:'task.create',args:{title:'Call Buyer A'},reason:'User requested'},
    {id:'two',tool:'customer.update',args:{customerId:'buyer-foreign',patch:{city:'Jeddah'}},reason:'User requested'}
  ]};
  const result=executeAiToolPlan(runtime,plan);
  assert.equal(result.proposal,null);
  assert.equal(result.results.find(row=>row.tool==='task.create').source,'plan-preflight-guard');
  assert.equal(result.results.find(row=>row.tool==='customer.update').source,'approval-preflight');
  assert.equal(vault.customers[0].city,'Riyadh');
});

test('B09 closeout: approval timestamp strictly advances over future or same-millisecond source revisions',()=>{
  const vault=setup(),future='2099-01-01T00:00:00.000Z';
  vault.customers[0].updatedAt=future;
  const first=prepareApprovedPartyPatch(vault,'customer','buyer-a',{city:'Jeddah'});
  const once=applyApprovedPartyPatch(vault,first);
  assert.equal(once.customers[0].updatedAt,'2099-01-01T00:00:00.001Z');
  assert.throws(()=>applyApprovedPartyPatch(once,first),/changed since review/);
  const second=prepareApprovedPartyPatch(once,'customer','buyer-a',{city:'Dammam'});
  const twice=applyApprovedPartyPatch(once,second);
  assert.equal(twice.customers[0].updatedAt,'2099-01-01T00:00:00.002Z');
  assert.throws(()=>applyApprovedPartyPatch(twice,second),/changed since review/);
  assert.equal(vault.customers[0].city,'Riyadh','Review and apply never mutate old snapshots');
});
