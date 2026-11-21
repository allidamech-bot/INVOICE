import assert from 'node:assert/strict';
import test from 'node:test';
import {fiscalQaPreviewExternalAccount,requireFiscalQaPreviewFederation,validateFiscalQaPreviewToken} from '../api/_fiscal/vercel-qa-federation.js';

const now=1795241000,TEAM='alidaamishs-projects',PROJECT='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const env={VERCEL_ENV:'preview',VERCEL_PROJECT_ID:PROJECT,LOUREX_FISCAL_QA_AUTH_MODE:'vercel-oidc',LOUREX_FISCAL_QA_PROJECT_ID:'lourex-fiscal-qa'};
const claims={iss:'https://oidc.vercel.com/'+TEAM,aud:'https://vercel.com/'+TEAM,sub:'owner:'+TEAM+':project:invoice:environment:preview',
 project_id:PROJECT,environment:'preview',iat:now,nbf:now,exp:now+7200};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const make=(p=claims,h={alg:'RS256',kid:'synthetic',typ:'JWT'})=>({headers:{'x-vercel-oidc-token':enc(h)+'.'+enc(p)+'.'+'s'.repeat(128)}});
test('preview-only QA principal is distinct from production provider and AWS worker',()=>{
 assert.equal(requireFiscalQaPreviewFederation(env),'lourex-fiscal-qa');
 const token=make();
 assert.equal(validateFiscalQaPreviewToken(token,env,now),token.headers['x-vercel-oidc-token']);
 const c=fiscalQaPreviewExternalAccount('/tmp/lourex-qa-federation-xyz/token');
 assert.equal(c.type,'external_account');
 assert.equal(c.audience,'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-vercel/providers/vercel-qa');
 assert.equal(c.service_account_impersonation_url,'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/lourex-qa-vercel@lourex-fiscal-qa.iam.gserviceaccount.com:generateAccessToken');
 assert.equal(c.token_url,'https://sts.googleapis.com/v1/token');
 assert(!('private_key' in c));
});
test('no production environment, static key, emulator, wrong deployment, or AWS credentials',()=>{
 for(const patch of [{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'wrong'},{LOUREX_FISCAL_QA_PROJECT_ID:'lourex-invoice'},{LOUREX_FISCAL_QA_AUTH_MODE:'private-key'},
  {LOUREX_FISCAL_QA_SERVICE_ACCOUNT_JSON:'secret'},{LOUREX_FISCAL_COMMAND_SERVICE_ACCOUNT_JSON:'secret'},
  {LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON:'secret'},{FIRESTORE_EMULATOR_HOST:'localhost'},{FIREBASE_AUTH_EMULATOR_HOST:'localhost'}, {AWS_ACCESS_KEY_ID:'secret'}]){
  assert.throws(()=>requireFiscalQaPreviewFederation({...env,...patch}),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
 }
 assert.throws(()=>fiscalQaPreviewExternalAccount('/etc/passwd'),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
});
test('OIDC claims must be exact preview scope; local parsing never substitutes Google STS verification',()=>{
 for(const patch of [{iss:'invalid'},{aud:'invalid'},{sub:claims.sub.replace('preview','production')},{project_id:'other'},
  {environment:'production'},{iat:now-10801},{nbf:now+100},{exp:now+40},{exp:now+10801}]){
  assert.throws(()=>validateFiscalQaPreviewToken(make({...claims,...patch}),env,now),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
 }
 for(const header of [{alg:'none',kid:'synthetic'},{alg:'HS256',kid:'synthetic'},{alg:'RS256',kid:''}]){
  assert.throws(()=>validateFiscalQaPreviewToken(make(claims,header),env,now),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
 }
 assert.throws(()=>validateFiscalQaPreviewToken({headers:{}},env,now),/FISCAL_QA_FEDERATION_UNAVAILABLE/);
});
