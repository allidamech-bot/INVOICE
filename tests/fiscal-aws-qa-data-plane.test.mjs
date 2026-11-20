import assert from 'node:assert/strict';
import test from 'node:test';
import {validateAwsQaAdc,isExplicitPermissionDenial} from '../scripts/fiscal/probe-aws-qa-data-plane.mjs';
const sa='lourex-aws-worker@lourex-fiscal-qa.iam.gserviceaccount.com';
const config={
 type:'external_account',
 audience:'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging',
 subject_token_type:'urn:ietf:params:aws:token-type:aws4_request',
 token_url:'https://sts.googleapis.com/v1/token',
 service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+sa+':generateAccessToken',
 credential_source:{
  environment_id:'aws1',
  region_url:'http://169.254.169.254/latest/meta-data/placement/availability-zone',
  url:'http://169.254.169.254/latest/meta-data/iam/security-credentials',
  imdsv2_session_token_url:'http://169.254.169.254/latest/api/token',
  regional_cred_verification_url:'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'
 }};
test('only exact QA WIF provider, keyless impersonation and IMDSv2 are accepted',()=>{
 assert.equal(validateAwsQaAdc(config),true);
 const bad=[
 {...config,audience:config.audience.replace('985119320046','448656707310')},
 {...config,audience:config.audience.replace('ec2-staging','evil-provider')},
 {...config,service_account_impersonation_url:config.service_account_impersonation_url.replace('lourex-fiscal-qa','lourex-invoice')},
 {...config,private_key:'static-secret'},
 {...config,token_url:'http://evil.invalid'},
 {...config,credential_source:{...config.credential_source,imdsv2_session_token_url:undefined}},
 {...config,credential_source:{...config.credential_source,region_url:'https://evil.invalid'}},
 {...config,credential_source:{...config.credential_source,extra:'hidden'}},
 {...config,service_account_impersonation:{token_lifetime_seconds:7200}}
 ];
 for(const value of bad)assert.throws(()=>validateAwsQaAdc(value),/LOUREX_QA_ADC_UNTRUSTED/);
});
test('only actual permission-denied outcomes prove production isolation',()=>{
 assert.equal(isExplicitPermissionDenial({code:7}),true);
 assert.equal(isExplicitPermissionDenial({code:'permission-denied'}),true);
 assert.equal(isExplicitPermissionDenial({status:'PERMISSION_DENIED'}),true);
 for(const error of [{code:5},{code:14},{code:404},{code:0},new Error('network timeout'),null]){
  assert.equal(isExplicitPermissionDenial(error),false);
 }
});
