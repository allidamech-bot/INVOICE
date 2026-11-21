import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
 validateAwsEnrollmentInstruction,requireAwsEnrollmentOperator,executeAwsEnrollmentInstruction,
} from '../api/_fiscal/aws-enrollment-operator.js';

const scope={environment:'simulation',accountUid:'synthetic-owner',workspaceId:'synthetic-business',egsId:'synthetic-egs'};
const env={LOUREX_AWS_STAGING_ENABLED:'true',LOUREX_AWS_ENROLLMENT_APPROVED:'true',CREDENTIALS_DIRECTORY:'/run/credentials/lourex-aws-enrollment.service'};
const input=(action,extra={})=>({version:'LOUREX_AWS_ENROLLMENT_COMMAND_V1',action,scope,...extra});
test('root-approved instruction is exactly one synthetic, allowlisted EGS and known step',()=>{
 for(const action of ['provision','begin','activate']){
  const c=validateAwsEnrollmentInstruction(input(action),[scope]);
  assert.equal(c.action,action);assert(Object.isFrozen(c.scope));
 }
 assert.equal(validateAwsEnrollmentInstruction(input('check',{expectedVersion:4}),[scope]).expectedVersion,4);
 assert.equal(validateAwsEnrollmentInstruction(input('operational',{expectedVersion:4}),[scope]).expectedVersion,4);
 for(const command of [
  input('submit'),input('begin',{otp:'000000'}),input('begin',{secret:'secret'}),
  input('activate',{expectedVersion:1}),input('check'),input('operational',{expectedVersion:0}),
  input('check',{expectedVersion:1.5}),input('provision',{url:'https://wrong.test'}),
  {...input('provision'),version:'wrong'},
  {...input('provision'),scope:{...scope,environment:'production'}},
  {...input('provision'),scope:{...scope,workspaceId:'other'}},
  {...input('provision'),scope:{...scope,accountUid:'other'}},
  {...input('provision'),scope:{...scope,egsId:'other'}},
  {...input('provision'),scope:{...scope,secret:'private'}},
 ])assert.throws(()=>validateAwsEnrollmentInstruction(command,[scope]),/LOUREX_AWS_ENROLLMENT_NOT_READY/);
});
test('separate operator gate never works under daemon, production, static credentials or developer flags',()=>{
 assert.equal(requireAwsEnrollmentOperator(env),true);
 for(const key of Object.keys(env))assert.throws(()=>requireAwsEnrollmentOperator({...env,[key]:undefined}),/LOUREX_AWS_ENROLLMENT_NOT_READY/);
 for(const field of ['LOUREX_AWS_WORKER_ENABLED','LOUREX_AWS_DISPATCH_APPROVED','VERCEL_ENV',
  'FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON']){
  assert.throws(()=>requireAwsEnrollmentOperator({...env,[field]:'true'}),/LOUREX_AWS_ENROLLMENT_NOT_READY/);
 }
 assert.throws(()=>requireAwsEnrollmentOperator({...env,CREDENTIALS_DIRECTORY:'/tmp/fake'}));
});
test('existing enrollment methods execute exactly once, return no secret material',async()=>{
 const calls=[];
 const runtime={
  provision:async s=>{calls.push(['provision',s]);return {keyId:'private'};},
  enrollment:{
   begin:async(identity,command)=>{calls.push(['begin',identity,command]);return {state:'checking',version:1,certificate:'private'};},
   check:async(identity,command)=>{calls.push(['check',identity,command]);return {state:'checks-complete',version:2};},
   operational:async(identity,command)=>{calls.push(['operational',identity,command]);return {state:'operational-recorded',version:3};},
  },
  activate:async s=>{calls.push(['activate',s]);return {state:'active',secret:'private'};},
 };
 let r=await executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('provision'),[scope]));
 assert.deepEqual(r,{action:'provision',state:'key-bound'});
 assert.deepEqual(await executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('begin'),[scope]),{otp:'123456'}),{action:'begin',state:'checking'});
 assert.deepEqual(await executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('check',{expectedVersion:1}),[scope])),{action:'check',state:'checks-complete'});
 assert.deepEqual(await executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('operational',{expectedVersion:2}),[scope])),{action:'operational',state:'operational-recorded'});
 assert.deepEqual(await executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('activate'),[scope])),{action:'activate',state:'active'});
 assert.equal(calls.length,5);
 assert.deepEqual(calls[1],[ 'begin',{uid:scope.accountUid,role:'owner'},
  {workspaceId:scope.workspaceId,egsId:scope.egsId,otp:'123456'} ]);
 assert(!JSON.stringify(r).includes('private'));
 for(const bad of [undefined,'12345','123456\n','1234567','abcdef']){
  await assert.rejects(executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('begin'),[scope]),{otp:bad}),/LOUREX_AWS_ENROLLMENT_NOT_READY/);
 }
 await assert.rejects(executeAwsEnrollmentInstruction(runtime,validateAwsEnrollmentInstruction(input('activate'),[scope]),{otp:'123456'}));
 assert.equal(calls.length,5);
});
test('restricted systemd unit never starts automatically and has no dispatch/secret logging',()=>{
 const unit=readFileSync(new URL('../deploy/fiscal/lourex-aws-enrollment.service',import.meta.url),'utf8');
 const runner=readFileSync(new URL('../scripts/fiscal/run-aws-staging-enrollment.mjs',import.meta.url),'utf8');
 execFileSync(process.execPath,['--check',new URL('../scripts/fiscal/run-aws-staging-enrollment.mjs',import.meta.url).pathname]);
 assert.match(unit,/Type=oneshot/);
 assert.match(unit,/Restart=no/);
 assert.match(unit,/ImportCredential=otp/);
 assert.match(unit,/LoadCredential=wrapping-key:/);
 assert.match(unit,/LoadCredential=pin-derivation-key:/);
 assert.match(unit,/ProtectHome=true/);
 assert.match(unit,/User=lourex-staging/);
 assert.match(unit,/NoNewPrivileges=true/);
 assert.doesNotMatch(unit,/^\[Install\]/m);
 assert.doesNotMatch(unit,/LOUREX_AWS_DISPATCH_APPROVED=true|LOUREX_AWS_WORKER_ENABLED=true/);
 assert.match(runner,/validateAwsEnrollmentInstruction/);
 assert.match(runner,/readAwsEnrollmentOtp/);
 assert.match(runner,/bindAwsTrustedRuntime/);
 assert.match(runner,/initializeAwsStagingFirebase/);
 assert.doesNotMatch(runner,/\.cycle\(|\.serve\(|runtime\.submit|process\.argv\[2\]|console\.log\(otp\)|runtime-adapter\.mjs/);
});
