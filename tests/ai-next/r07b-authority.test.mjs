import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyR07FirebasePrincipal,R07B_AUTHENTICATED_API_ENABLED,
} from '../../api/_ai-next/firebase-principal.js';
import {
  authorizeR07ScopedRequest,parseR07RequestEnvelope,R07B_NEXT_API_ENABLED,
} from '../../dist/src/ai-next/security/server-membership.js';

const now=1783000000;
const signedPayload=(override={})=>({
  sub:'owner-verified-uid',iat:now-50,exp:now+3600,auth_time:now-100,
  firebase:{sign_in_provider:'password'},...override,
});
const fakeJwt=payload=>[
  Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'synthetic-key'})).toString('base64url'),
  Buffer.from(JSON.stringify(payload)).toString('base64url'),
  'x'.repeat(120),
].join('.');
const token=fakeJwt(signedPayload());
const signer=async t=>{assert.equal(t,token);return {uid:'owner-verified-uid',role:'owner'};};
const principal={verify:async()=>({
  uid:'owner-verified-uid',role:'owner',tokenIssuedAt:now-50,
  tokenExpiresAt:now+3600,authenticatedAt:now-100,anonymous:false,
})};
const membership={
  readForActor:async keys=>({
    ownerUid:'owner-verified-uid',actorUid:'owner-verified-uid',accountId:'account-1',
    companyId:'company-1',branchId:'branch-1',authorizationVersion:5,
    active:true,permittedRoles:['owner'],
  }),
};
const body=()=>({
  schemaVersion:1,accountId:'account-1',companyId:'company-1',
  branchId:'branch-1',threadId:'thread-1',scopeType:'business',
});
const auth=(override={})=>authorizeR07ScopedRequest({
  bearerToken:'synthetic-bearer-token-1234567890',body:body(),
  principal,membership,serverNowEpochSeconds:now,...override,
});
test('R07 authenticated HTTP paths remain disabled by default',()=>{
  assert.equal(R07B_AUTHENTICATED_API_ENABLED,false);
  assert.equal(R07B_NEXT_API_ENABLED,false);
});
test('signed principal extraction succeeds only after verifier outcome',async()=>{
  const p=await verifyR07FirebasePrincipal(token,now,signer);
  assert.deepEqual(p,{
    uid:'owner-verified-uid',role:'owner',tokenIssuedAt:now-50,
    tokenExpiresAt:now+3600,authenticatedAt:now-100,anonymous:false,
  });
  assert.equal(Object.isFrozen(p),true);
});
test('unverified JWT cannot grant identity merely because payload is parsable',async()=>{
  let calls=0;
  await assert.rejects(verifyR07FirebasePrincipal(token,now,async()=>{calls++;throw Error('invalid signature');}),
    /R07_TOKEN_NOT_VERIFIED/);
  assert.equal(calls,1);
});
test('signed claims must match cryptographically verified UID',async()=>{
  await assert.rejects(verifyR07FirebasePrincipal(token,now,
    async()=>({uid:'different',role:'owner'})),/R07_INVALID_SIGNED_TOKEN_CLAIMS/);
});
for(const [name,claims] of [
  ['expired',{exp:now-1}],['anonymous',{firebase:{sign_in_provider:'anonymous'}}],
  ['future iat',{iat:now+500}],['future auth',{auth_time:now+500}],
  ['invalid exp',{exp:'tomorrow'}],
]){
  test('rejects '+name+' signed principal',async()=>{
    const t=fakeJwt(signedPayload(claims));
    await assert.rejects(verifyR07FirebasePrincipal(t,now,async()=>({
      uid:'owner-verified-uid',role:'owner',
    })),/R07_INVALID_SIGNED_TOKEN_CLAIMS/);
  });
}
test('no browser role, actor, permission, approval or scope injection keys',()=>{
  assert.deepEqual(parseR07RequestEnvelope(body()),body());
  for(const injected of [
    {actorId:'owner-verified-uid'},{role:'owner'},{authorizationVersion:5},
    {approved:true},{ownerUid:'owner-verified-uid'},{selectedOperator:'owner'},
  ]){
    assert.throws(()=>parseR07RequestEnvelope({...body(),...injected}),/R07_INVALID_REQUEST_ENVELOPE/);
  }
});
test('current server ACL proves exact account/company/branch',async()=>{
  const scope=await auth();
  assert.deepEqual({
    uid:scope.ownerUid,role:scope.role,company:scope.companyId,
    branch:scope.branchId,epoch:scope.authorizationVersion,
  },{uid:'owner-verified-uid',role:'owner',company:'company-1',
    branch:'branch-1',epoch:5});
});
test('missing ACL denies and does not synthesize a company',async()=>{
  await assert.rejects(auth({membership:{readForActor:async()=>null}}),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('wrong account/company/branch and different actor fail closed',async()=>{
  const variants=[
    {...body(),accountId:'account-2'},
    {...body(),companyId:'company-2'},
    {...body(),branchId:'branch-2'},
  ];
  for(const b of variants)
    await assert.rejects(auth({body:b}),/AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(auth({principal:{verify:async()=>({
    uid:'other-uid',role:'owner',tokenIssuedAt:now-2,
    tokenExpiresAt:now+20,authenticatedAt:now-5,anonymous:false,
  })}}),/AUTH_MEMBERSHIP_DENIED/);
});
test('ACL claimed owner different from verified actor is rejected',async()=>{
  await assert.rejects(auth({membership:{readForActor:async()=>({
    ownerUid:'other-owner',actorUid:'owner-verified-uid',accountId:'account-1',
    companyId:'company-1',branchId:'branch-1',authorizationVersion:1,
    active:true,permittedRoles:['owner'],
  })}}),/AUTH_MEMBERSHIP_DENIED/);
});
test('server membership revocation and role mismatch deny',async()=>{
  const b=await membership.readForActor({});
  await assert.rejects(auth({membership:{readForActor:async()=>({...b,active:false})}}),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(auth({membership:{readForActor:async()=>({...b,permittedRoles:['viewer']})}}),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('token expiry denied even with valid membership',async()=>{
  await assert.rejects(auth({principal:{verify:async()=>({
    uid:'owner-verified-uid',role:'owner',tokenIssuedAt:now-50,
    tokenExpiresAt:now,authenticatedAt:now-100,anonymous:false,
  })}}),/AUTH_INVALID_PRINCIPAL/);
});
test('ACL errors abort request instead of falling back to client scope',async()=>{
  await assert.rejects(auth({membership:{readForActor:async()=>{throw Error('database unavailable');}}}),
    /database unavailable/);
});
test('authorization is repeated for each request and honors revocation',async()=>{
  let allow=true,lookup=0;
  const acl={readForActor:async()=>{
    lookup++;
    return allow?membership.readForActor({}):null;
  }};
  await auth({membership:acl});
  allow=false;
  await assert.rejects(auth({membership:acl}),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(lookup,2);
});
