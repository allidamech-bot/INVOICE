import test from 'node:test';
import assert from 'node:assert/strict';
import {externalAccountConfiguration,validateVercelWorkloadToken,requireProductionFederation} from '../api/_accounting/vercel-federated-credential.js';
const env={LOUREX_FIREBASE_AUTH_MODE:'vercel-oidc',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ'};
const now=1795172400;
const claims={iss:'https://oidc.vercel.com/alidaamishs-projects',aud:'https://vercel.com/alidaamishs-projects',sub:'owner:alidaamishs-projects:project:invoice:environment:production',iat:now,nbf:now,exp:now+3600};
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const request=(p=claims,h={alg:'RS256',kid:'synthetic'})=>({headers:{'x-vercel-oidc-token':enc(h)+'.'+enc(p)+'.signature'}});
test('only pinned production project and workload claims enter the ADC path',()=>{
 assert.equal(validateVercelWorkloadToken(request(),env,now),request().headers['x-vercel-oidc-token']);
 for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'wrong'},{FIRESTORE_EMULATOR_HOST:'localhost'},{LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON:'key'},{FIREBASE_AUTH_EMULATOR_HOST:'localhost'}])assert.throws(()=>requireProductionFederation({...env,...patch}),/UNAVAILABLE/);
 for(const patch of [{sub:claims.sub.replace('invoice','other')},{sub:claims.sub.replace('production','preview')},{iss:'https://wrong.test'},{aud:'wrong'},{exp:now},{nbf:now+100},{iat:now+100}])assert.throws(()=>validateVercelWorkloadToken(request({...claims,...patch}),env,now),/UNAVAILABLE/);
 assert.throws(()=>validateVercelWorkloadToken({headers:{}},env,now),/UNAVAILABLE/);
 assert.throws(()=>validateVercelWorkloadToken(request(claims,{alg:'none',kid:'x'}),env,now),/UNAVAILABLE/);
});
test('external account config is pinned to the created pool and restricted service account',()=>{
 const c=externalAccountConfiguration('/tmp/synthetic-token');
 assert.equal(c.type,'external_account');
 assert.equal(c.audience,'//iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-vercel/providers/vercel');
 assert.equal(c.service_account_impersonation_url,'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/lourex-fiscal-runtime@lourex-invoice.iam.gserviceaccount.com:generateAccessToken');
 assert.equal(c.token_url,'https://sts.googleapis.com/v1/token');assert.equal(c.credential_source.file,'/tmp/synthetic-token');
 assert(!('private_key' in c));
});
