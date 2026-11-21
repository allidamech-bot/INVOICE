import assert from 'node:assert/strict';
import test from 'node:test';
import {validateAwsStagingAdc} from '../api/_fiscal/staging-aws-firebase.js';
const opts={projectId:'test-fiscal-qa',audience:'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging',serviceAccount:'fiscal-worker@test-fiscal-qa.iam.gserviceaccount.com'};
const adc={type:'external_account',audience:opts.audience,subject_token_type:'urn:ietf:params:aws:token-type:aws4_request',token_url:'https://sts.googleapis.com/v1/token',service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+opts.serviceAccount+':generateAccessToken',credential_source:{environment_id:'aws1',region_url:'http://169.254.169.254/latest/meta-data/placement/availability-zone',url:'http://169.254.169.254/latest/meta-data/iam/security-credentials',imdsv2_session_token_url:'http://169.254.169.254/latest/api/token',regional_cred_verification_url:'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'}};
test('only pinned QA project, AWS IMDSv2 and Google STS federation allowed',()=>{
 assert.equal(validateAwsStagingAdc(opts,adc),true);
 for(const bad of [{...adc,type:'service_account'},{...adc,private_key:'forbidden'},{...adc,token_url:'https://other.example/token'},{...adc,audience:'untrusted'},{...adc,service_account_impersonation_url:adc.service_account_impersonation_url.replace('test-fiscal-qa','lourex-invoice')},{...adc,credential_source:{...adc.credential_source,imdsv2_session_token_url:undefined}},{...adc,credential_source:{...adc.credential_source,url:'http://other.example'}}])assert.throws(()=>validateAwsStagingAdc(opts,bad));
 assert.throws(()=>validateAwsStagingAdc({...opts,projectId:'lourex-invoice'},adc));
 assert.throws(()=>validateAwsStagingAdc({...opts,audience:opts.audience.replace('ec2-staging','other-provider')},{...adc,audience:opts.audience.replace('ec2-staging','other-provider')}));
});
