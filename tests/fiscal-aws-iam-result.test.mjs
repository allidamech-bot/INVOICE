import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyIamCredentialsReply} from '../api/_fiscal/aws-google-iam-result.js';
test('IAMCredentials diagnostics never return raw Google errors',()=>{
 assert.equal(classifyIamCredentialsReply(200,{}),'PASSED');
 assert.equal(classifyIamCredentialsReply(403,{error:{message:"Permission 'iam.serviceAccounts.getAccessToken' denied on resource xxx"}}),'IAM_GET_ACCESS_TOKEN_DENIED');
 assert.equal(classifyIamCredentialsReply(403,{error:{message:"abc PRIVATE SECRET VALUE 123"}}),'IAM_PERMISSION_DENIED');
 assert.equal(classifyIamCredentialsReply(403,{error:{details:[{reason:'SERVICE_DISABLED'}]}}),'IAM_API_DISABLED');
 assert.equal(classifyIamCredentialsReply(404,{}),'IAM_ACCOUNT_NOT_FOUND');
});
