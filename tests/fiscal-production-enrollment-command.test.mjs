import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProductionEnrollmentCommand,parseProductionEnrollmentCommand} from '../api/_fiscal/production-enrollment-command.js';
const owner={uid:'owner',role:'owner'},w='company',unit={environment:'production',accountUid:'owner',workspaceId:w,egsId:'unit',branchId:'branch',state:'enrolling',privateKey:'never-return'};
function fixture(configured=true){
 const calls=[],db={doc:p=>p,collection:p=>({limit:()=>p}),runTransaction:async fn=>fn({get:async path=>({exists:false,docs:path==='fiscalProductionV1/owner/workspaces/company/egs'?[{id:'unit',data:()=>unit}]:[]})})};
 const loadWorkspace=async(_tx,s)=>{assert.equal(s.accountUid,'owner');return {branches:[{id:'branch',workspaceId:w,active:true}]};};
 const enrollment=Object.fromEntries(['inspect','begin','check','operational','activate'].map(k=>[k,async(_i,args)=>{calls.push([k,args]);return {...unit,state:'not-started',unitActive:false,enrollmentHeld:false,version:0,passed:0,required:6,secret:'never-return'};}]));
 return {calls,execute:createProductionEnrollmentCommand({db,loadWorkspace,enrollment:configured?enrollment:undefined})};
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
