import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProductionEnrollmentCommand,parseProductionEnrollmentCommand} from '../api/_fiscal/production-enrollment-command.js';
const owner={uid:'owner',role:'owner'},w='company',unit={environment:'production',accountUid:'owner',workspaceId:w,egsId:'unit',branchId:'branch',state:'enrolling',privateKey:'never-return'};
function fixture(configured=true,{active=false,issuanceConfigured=false,verifyIssuanceReady,twoUnits=false}={}){
 const selectedUnit={...unit,state:active?'active':unit.state};
 const secondUnit={...selectedUnit,egsId:'unit2',branchId:'branch2'};
 const entries=[selectedUnit,...(twoUnits?[secondUnit]:[])];
 const calls=[],db={doc:p=>p,collection:p=>({limit:()=>p}),runTransaction:async fn=>fn({get:async path=>({exists:false,docs:path==='fiscalProductionV1/owner/workspaces/company/egs'?entries.map(u=>({id:u.egsId,data:()=>u})):[]})})};
 const loadWorkspace=async(_tx,s)=>{assert.equal(s.accountUid,'owner');return {branches:entries.map(u=>({id:u.branchId,workspaceId:w,active:true}))};};
 const enrollment=Object.fromEntries(['inspect','begin','check','operational','activate'].map(k=>[k,async(_i,args)=>{calls.push([k,args]);const selected=entries.find(x=>x.egsId===args?.egsId)??selectedUnit;return {...selected,state:active?'operational-recorded':'not-started',unitActive:active,enrollmentHeld:false,version:active?9:0,passed:active?6:0,required:6,secret:'never-return'};}]));
 return {calls,execute:createProductionEnrollmentCommand({db,loadWorkspace,enrollment:configured?enrollment:undefined,issuanceConfigured,verifyIssuanceReady})};
}
test('strict command schema refuses credentials, environment and foreign identities',()=>{
 const input={operation:'enrollment-begin',workspaceId:w,egsId:'unit',otp:'123456'};
 assert.deepEqual(parseProductionEnrollmentCommand(input),input);
 for(const patch of [{accountUid:'other'},{privateKey:'secret'},{environment:'simulation'},{otp:'bad'},{certificate:'fake'}])assert.throws(()=>parseProductionEnrollmentCommand({...input,...patch}),/INVALID/);
});
test('missing live runtime exposes status but never accepts OTP',async()=>{
 const {execute,calls}=fixture(false);
 assert.deepEqual(await execute(owner,{operation:'enrollment-status',workspaceId:w}),{environment:'production',workspaceId:w,available:false,registeredUnits:1,units:[],branches:[{branchId:'branch',label:'branch',state:'registered'}],profileVersion:0,issuanceEnabled:false});
 await assert.rejects(execute(owner,{operation:'enrollment-begin',workspaceId:w,egsId:'unit',otp:'123456'}),/UNAVAILABLE/);assert.equal(calls.length,0);
});
test('authenticated owner selects only a published branch unit; response is redacted and refresh-only',async()=>{
 const {execute,calls}=fixture();const status=await execute(owner,{operation:'enrollment-status',workspaceId:w});
 assert.equal(status.available,true);assert.equal(status.units.length,1);assert(!JSON.stringify(status).includes('never-return'));
 await assert.rejects(execute(owner,{operation:'enrollment-begin',workspaceId:w,egsId:'other',otp:'123456'}),/FORBIDDEN/);
 await assert.rejects(execute({...owner,role:'viewer'},{operation:'enrollment-status',workspaceId:w}),/FORBIDDEN/);
 assert.deepEqual(await execute(owner,{operation:'enrollment-begin',workspaceId:w,egsId:'unit',otp:'123456'}),{environment:'production',workspaceId:w,refreshRequired:true});
 assert.equal(calls.filter(c=>c[0]==='begin').length,1);
});

test('registration intake rejects extra identity and invalid branch, type or version',()=>{
 const input={operation:'enrollment-request',workspaceId:w,branchId:'branch',expectedProfileVersion:1,functionalityMap:'1100',businessCategory:'Retail'};
 assert.deepEqual(parseProductionEnrollmentCommand(input),input);
 for(const patch of [{accountUid:'other'},{otp:'123456'},{branchId:'../other'},{functionalityMap:'1111'},{expectedProfileVersion:0}])assert.throws(()=>parseProductionEnrollmentCommand({...input,...patch}),/INVALID/);
});

test('unavailable ZATCA runtime rejects provisioning before any Firestore read or write',async()=>{
 const db={
   doc:()=>{throw Error('DATABASE_WAS_ACCESSED');},
   collection:()=>{throw Error('DATABASE_WAS_ACCESSED');},
   runTransaction:()=>{throw Error('DATABASE_WAS_ACCESSED');}
 };
 const execute=createProductionEnrollmentCommand({db,loadWorkspace:async()=>{throw Error('WORKSPACE_WAS_ACCESSED');}});
 await assert.rejects(execute(owner,{operation:'enrollment-request',workspaceId:w,branchId:'branch',expectedProfileVersion:1,functionalityMap:'1100',businessCategory:'Retail'}),e=>e.message==='FISCAL_ENROLLMENT_UNAVAILABLE');
});

test('customer registration controls are hidden until a trusted enrollment runtime is available',async()=>{
 const ui=await readFile(new URL('../src/components/FiscalProductionEnrollmentPanel.tsx',import.meta.url),'utf8');
 assert.match(ui,/s\.available&&s\.profileVersion>0&&s\.branches\.some/);
 assert.match(ui,/طلب تسجيل داخلي محفوظ في LOUREX/);
});

test('a persisted active unit never enables issuance without current signing-session proof',async()=>{
 const {execute}=fixture(true,{active:true,issuanceConfigured:true});
 const status=await execute(owner,{operation:'enrollment-status',workspaceId:w});
 assert.equal(status.units[0].unitActive,true);
 assert.equal(status.issuanceEnabled,false);
 assert(!JSON.stringify(status).includes('never-return'));
});
test('issuance readiness calls only the authenticated tenant scope and returns redacted status',async()=>{
 const calls=[],verifyIssuanceReady=async scope=>{calls.push(scope);return true;};
 const {execute}=fixture(true,{active:true,issuanceConfigured:true,verifyIssuanceReady});
 const status=await execute(owner,{operation:'enrollment-status',workspaceId:w});
 assert.equal(status.issuanceEnabled,true);
 assert.deepEqual(calls,[{environment:'production',accountUid:'owner',workspaceId:'company',egsId:'unit'}]);
 assert(!JSON.stringify(status).includes('never-return'));
});
test('expired or unreachable protected signer denies readiness without exposing errors',async()=>{
 for(const verifyIssuanceReady of [async()=>false,async()=>{throw Error('secret signer failure');}]){
  const {execute}=fixture(true,{active:true,issuanceConfigured:true,verifyIssuanceReady});
  const status=await execute(owner,{operation:'enrollment-status',workspaceId:w});
  assert.equal(status.issuanceEnabled,false);
  assert(!JSON.stringify(status).includes('secret signer failure'));
 }
 let checked=false;
 const {execute}=fixture(true,{issuanceConfigured:true,verifyIssuanceReady:async()=>{checked=true;return true;}});
 assert.equal((await execute(owner,{operation:'enrollment-status',workspaceId:w})).issuanceEnabled,false);
 assert.equal(checked,false);
});

test('two active EGS devices never borrow each other\'s signing readiness',async()=>{
 const verified=[];
 const {execute}=fixture(true,{active:true,twoUnits:true,issuanceConfigured:true,
   verifyIssuanceReady:async scope=>{verified.push(scope);if(scope.egsId==='unit2')throw Error('private HSM unavailable');return scope.egsId==='unit';}});
 const status=await execute(owner,{operation:'enrollment-status',workspaceId:w});
 assert.equal(status.registeredUnits,2);
 assert.equal(status.issuanceEnabled,true);
 assert.deepEqual(status.units.map(u=>({egsId:u.egsId,issuanceReady:u.issuanceReady})),
   [{egsId:'unit',issuanceReady:true},{egsId:'unit2',issuanceReady:false}]);
 assert.deepEqual(verified.map(s=>s.egsId),['unit','unit2']);
 for(const scope of verified)assert.deepEqual(
   Object.keys(scope).sort(),['accountUid','egsId','environment','workspaceId']);
 assert(!JSON.stringify(status).includes('private HSM unavailable'));
 assert(!JSON.stringify(status).includes('never-return'));
});
test('missing signer and failed certificate verification return per-unit false without leaking evidence',async()=>{
 for(const verifyIssuanceReady of [undefined,async()=>false,async()=>{throw Error('private key material');}]){
  const {execute}=fixture(true,{active:true,twoUnits:true,issuanceConfigured:true,verifyIssuanceReady});
  const s=await execute(owner,{operation:'enrollment-status',workspaceId:w});
  assert.equal(s.issuanceEnabled,false);
  assert.deepEqual(s.units.map(x=>x.issuanceReady),[false,false]);
  assert(!JSON.stringify(s).includes('private key material'));
 }
});
test('fiscal client and UI require exact per-device readiness instead of workspace readiness',async()=>{
 const client=await readFile(new URL('../src/lib/fiscal-production-enrollment-client.ts',import.meta.url),'utf8');
 const panel=await readFile(new URL('../src/components/FiscalProductionEnrollmentPanel.tsx',import.meta.url),'utf8');
 assert.match(client,/issuanceReady:boolean/);
 assert.match(client,/v\.issuanceEnabled!==units\.some\(u=>u\.issuanceReady\)/);
 assert.match(panel,/u\?\.issuanceReady/);
 assert.doesNotMatch(panel,/s\.issuanceEnabled\?t\(/);
});
