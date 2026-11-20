import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAwsIdentityAdc,AWS_GOOGLE_IDENTITY_CODES} from '../api/_fiscal/aws-google-identity.js';
const serviceAccount='lourex-aws-staging@lourex-invoice.iam.gserviceaccount.com';
const config={type:'external_account',audience:'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-aws-staging/providers/ec2-staging',subject_token_type:'urn:ietf:params:aws:token-type:aws4_request',token_url:'https://sts.googleapis.com/v1/token',service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+serviceAccount+':generateAccessToken',credential_source:{environment_id:'aws1',region_url:'http://169.254.169.254/latest/meta-data/placement/availability-zone',url:'http://169.254.169.254/latest/meta-data/iam/security-credentials',imdsv2_session_token_url:'http://169.254.169.254/latest/api/token',regional_cred_verification_url:'https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15'}};
test('pinned AWS identity-only external account credentials',()=>{
 assert.equal(validateAwsIdentityAdc(config),true);
 for(const bad of [{...config,audience:config.audience.replace('985119320046','123')},{...config,private_key:'forbidden'},{...config,type:'service_account'},{...config,service_account_impersonation_url:config.service_account_impersonation_url.replace('lourex-aws-staging','lourex-fiscal-runtime')},{...config,credential_source:{...config.credential_source,imdsv2_session_token_url:''}},{...config,credential_source:{...config.credential_source,url:'https://evil.example'}}])assert.throws(()=>validateAwsIdentityAdc(bad));
});

test('diagnostic vocabulary is fixed and never emits sensitive errors',()=>{
 assert(AWS_GOOGLE_IDENTITY_CODES.includes('REMOTE_GOOGLE_403'));
 assert(AWS_GOOGLE_IDENTITY_CODES.includes('LOCAL_FILE'));
 assert(!AWS_GOOGLE_IDENTITY_CODES.some(code=>/token_value|private_key/i.test(code)));
});
