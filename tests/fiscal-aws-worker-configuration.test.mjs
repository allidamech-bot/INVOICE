import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validateAwsFiscalWorkerConfig,requireAwsFiscalDispatchApproval,
 AWS_FISCAL_QA_PROJECT,AWS_FISCAL_QA_SERVICE_ACCOUNT,
 AWS_FISCAL_WIF_AUDIENCE,AWS_FISCAL_ADC_PATH,
} from '../api/_fiscal/aws-worker-configuration.js';

const scope={environment:'simulation',accountUid:'owner1',workspaceId:'workspace1',egsId:'device1'};
const config={projectId:AWS_FISCAL_QA_PROJECT,serviceAccount:AWS_FISCAL_QA_SERVICE_ACCOUNT,
 audience:AWS_FISCAL_WIF_AUDIENCE,adcPath:AWS_FISCAL_ADC_PATH,scopes:[scope],profileSha256:'a'.repeat(64)};
const goodEnv={LOUREX_AWS_STAGING_ENABLED:'true',LOUREX_AWS_WORKER_ENABLED:'true',LOUREX_AWS_DISPATCH_APPROVED:'true'};
test('pins the separate QA data plane, WIF source and reviewed trust profile',()=>{
 const approved=validateAwsFiscalWorkerConfig(config);
 assert.equal(approved.projectId,'lourex-fiscal-qa');
 assert.equal(approved.scopes.length,1);
 assert(Object.isFrozen(approved));
 assert(Object.isFrozen(approved.scopes));
 assert(Object.isFrozen(approved.scopes[0]));
});
test('rejects production, alternate IAM and invalid trust profile checksums',()=>{
 for(const value of [
  {...config,projectId:'lourex-invoice'},
  {...config,projectId:'lourex-other-fiscal-qa'},
  {...config,serviceAccount:'lourex-aws-staging@lourex-invoice.iam.gserviceaccount.com'},
  {...config,audience:config.audience.replace('ec2-staging','ec2-other')},
  {...config,adcPath:'/tmp/qa-adc.json'},
  {...config,profileSha256:'unknown'},
  {...config,admin:true},
  {...config,scopes:[{...scope,environment:'production'}]},
  {...config,scopes:[scope,scope]},
  {...config,scopes:[]},
  {...config,scopes:[{...scope,otherTenant:true}]},
  null,
 ])assert.throws(()=>validateAwsFiscalWorkerConfig(value),/LOUREX_AWS_WORKER_CONFIGURATION_DENIED/);
});
test('requires a third explicit dispatch approval, denies dev and static credentials',()=>{
 assert.equal(requireAwsFiscalDispatchApproval(goodEnv),true);
 for(const k of Object.keys(goodEnv))assert.throws(()=>requireAwsFiscalDispatchApproval({...goodEnv,[k]:undefined}),/LOUREX_AWS_WORKER_CONFIGURATION_DENIED/);
 for(const k of ['VERCEL_ENV','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON']){
  assert.throws(()=>requireAwsFiscalDispatchApproval({...goodEnv,[k]:'bad'}),/LOUREX_AWS_WORKER_CONFIGURATION_DENIED/);
 }
});
