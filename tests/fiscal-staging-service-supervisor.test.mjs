import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingServiceSupervisor,validateStagingServiceScopes} from '../api/_fiscal/staging-service-supervisor.js';

const a={environment:'simulation',accountUid:'owner',workspaceId:'shop',egsId:'egs1'};
const b={...a,egsId:'egs2'};
const count={submitted:1,recovered:0,reconciled:0,held:0,failed:0};
test('rejects production, extra fields, duplicate scopes and unsafely broad scans',()=>{
 assert.equal(validateStagingServiceScopes([a,b]).length,2);
 for(const scopes of [[],[a,a],[{...a,environment:'production'}],[{...a,admin:true}],[{...a,egsId:'bad/id'}],new Array(65).fill(a)]){
  assert.throws(()=>validateStagingServiceScopes(scopes),/FISCAL_STAGING_SERVICE_DENIED/);
 }
});
test('scope cycles are sequential, aggregated and cannot be reentered',async()=>{
 const observed=[];let release;
 const blocker=new Promise(resolve=>{release=resolve;});
 const s=createStagingServiceSupervisor({scopes:[a,b],cycle:async scope=>{
  observed.push(scope.egsId);
  if(scope.egsId==='egs1')await blocker;
  return count;
 }});
 const first=s.runOnce();
 await Promise.resolve();
 await assert.rejects(s.runOnce(),/FISCAL_STAGING_SERVICE_DENIED/);
 release();
 assert.deepEqual(await first,{submitted:2,recovered:0,reconciled:0,held:0});
 assert.deepEqual(observed,['egs1','egs2']);
});
test('fail closed on row errors, malformed result and network errors',async()=>{
 for(const value of [{...count,failed:1},{...count,submitted:-1},{submitted:0},null]){
  const s=createStagingServiceSupervisor({scopes:[a],cycle:async()=>value});
  await assert.rejects(s.runOnce(),/FISCAL_STAGING_SERVICE_DENIED/);
 }
 const s=createStagingServiceSupervisor({scopes:[a],cycle:async()=>{throw Error('NETWORK');}});
 await assert.rejects(s.runOnce(),/NETWORK/);
});
test('stop does not start a second cycle and awaits in-flight work',async()=>{
 const controller=new AbortController();let calls=0;
 const s=createStagingServiceSupervisor({scopes:[a],cycle:async()=>{
  calls++;controller.abort();return count;
 }});
 await s.serve(controller.signal);
 assert.equal(calls,1);
});
