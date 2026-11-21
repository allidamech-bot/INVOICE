import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createFiscalStatusHandler} from '../api/_fiscal/status-handler.js';
import {createFiscalCommandHandler} from '../api/_fiscal/command-handler.js';

const scriptUrl=new URL('../scripts/fiscal/prepare-google-qa-preview-wif.sh',import.meta.url);
const script=readFileSync(scriptUrl,'utf8');

test('QA preview IAM bootstrap keeps production Vercel provider and data IAM unchanged',()=>{
 execFileSync('bash',['-n',scriptUrl.pathname]);
 assert.match(script,/POOL='lourex-vercel'/);
 assert.match(script,/EXISTING_PROVIDER='vercel'/);
 assert.match(script,/PROVIDER='vercel-qa'/);
 assert.match(script,/SOURCE_NUMBER='985119320046'/);
 assert.match(script,/QA_NUMBER='448656707310'/);
 assert.match(script,/QA='lourex-fiscal-qa'/);
 assert.match(script,/--project="\$QA"/);
 assert.match(script,/--role=roles\/iam\.workloadIdentityUser/);
 assert.match(script,/--role=roles\/datastore\.user/);
 assert.match(script,/--role=roles\/firebaseauth\.viewer/);
 assert.match(script,/PRODUCTION_VERCEL_PROVIDER_CHANGED/);
 assert.doesNotMatch(script,/gcloud\s+billing\s+projects\s+link|--billing-account|gcloud\s+projects\s+add-iam-policy-binding\s+"\$IDENTITY"|gcloud\s+iam\s+service-accounts\s+keys\s+create/);
});
test('QA status and commands never parse or require long-lived service account keys',()=>{
 const files=['status-runtime.js','command-runtime.js'].map(n=>readFileSync(new URL('../api/_fiscal/'+n,import.meta.url),'utf8'));
 for(const source of files){
  assert.match(source,/prepareFiscalQaPreviewCredential/);
  assert.match(source,/credential:applicationDefault\(\)/);
  assert.doesNotMatch(source,/credential:cert\(account\)|account\.private_key|JSON\.parse\(env\.LOUREX_FISCAL/);
 }
});
test('HTTP handlers forward verified request context to the OIDC runtime',async()=>{
 const request={method:'POST',headers:{host:'qa.example.test',origin:'https://qa.example.test',
 'x-requested-with':'LOUREX-Invoice','content-type':'application/json',authorization:'Bearer '+'a'.repeat(128),
 'x-vercel-oidc-token':'synthetic-test-token'},body:{operation:'status',workspaceId:'ws',documentId:'doc'}};
 let received;
 const response=()=>({setHeader(){},end(){},set statusCode(v){this.code=v;}});
 const status=createFiscalStatusHandler({getRuntime:async r=>{received=r;return {verifyIdentity:async()=>({role:'owner',uid:'owner'}),status:async()=>({status:'not-prepared'})};}});
 await status(request,response());
 assert.equal(received,request);
 const command=createFiscalCommandHandler({getRuntime:async r=>{received=r;return {verifyIdentity:async()=>({role:'owner',uid:'owner'}),execute:async()=>({status:'ok'})};}});
 await command({...request,body:{operation:'inspect',workspaceId:'ws'}},response());
 assert.equal(received.headers['x-vercel-oidc-token'],'synthetic-test-token');
});
