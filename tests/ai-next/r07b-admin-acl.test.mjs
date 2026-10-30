import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07B3_MEMBERSHIP_PRODUCTION_ENABLED,R07B3_COLLECTION,
  R07B3AdminMembershipStore,
} from '../../dist/src/ai-next/security/admin-membership-store.js';
import {authorizeR07ScopedRequest}
  from '../../dist/src/ai-next/security/server-membership.js';

const now=1783000000;
const doc=(overrides={})=>({
  schemaVersion:1,ownerUid:'owner-verified',actorUid:'owner-verified',
  active:true,authorizationVersion:3,
  memberships:[{
    accountId:'acct-1',companyId:'co-1',branchId:'br-1',
    active:true,permittedRoles:['owner'],
  }],...overrides,
});
function database(saved=doc()){
  const accesses=[];
  const db={collection:name=>{
    accesses.push('collection:'+name);
    return {doc:id=>{
      accesses.push('doc:'+id);
      return {get:async()=>({exists:saved!==null,data:()=>structuredClone(saved)})};
    }};
  }};
  return {db,accesses};
}
const query=(overrides={})=>({
  verifiedUid:'owner-verified',accountId:'acct-1',companyId:'co-1',branchId:'br-1',
  ...overrides,
});
test('root ACL backend stays disabled and never uses user-vault scope',()=>{
  assert.equal(R07B3_MEMBERSHIP_PRODUCTION_ENABLED,false);
  assert.equal(R07B3_COLLECTION,'aiNextAuthMembershipsV1');
});
test('exact active top-level membership returns scoped permission and auth epoch',async()=>{
  const {db,accesses}=database(),store=new R07B3AdminMembershipStore(db);
  const row=await store.readForActor(query());
  assert.deepEqual(row,{
    ownerUid:'owner-verified',actorUid:'owner-verified',
    accountId:'acct-1',companyId:'co-1',branchId:'br-1',
    permittedRoles:['owner'],authorizationVersion:3,active:true,
  });
  assert.deepEqual(accesses,['collection:aiNextAuthMembershipsV1','doc:owner-verified']);
});
test('missing membership is not synthesized from client workspace',async()=>{
  const {db}=database(null);
  assert.equal(await new R07B3AdminMembershipStore(db).readForActor(query()),null);
});
test('wrong owner UID, company, account and branch are denied',async()=>{
  const {db}=database(),store=new R07B3AdminMembershipStore(db);
  for(const override of [
    {verifiedUid:'other'}, {accountId:'acct-2'},
    {companyId:'co-2'}, {branchId:'br-2'},
  ])assert.equal(await store.readForActor(query(override)),null);
});
test('inactive document or branch denies membership',async()=>{
  for(const saved of [doc({active:false}),doc({memberships:[
    {...doc().memberships[0],active:false},
  ]})]){
    const {db}=database(saved);
    assert.equal(await new R07B3AdminMembershipStore(db).readForActor(query()),null);
  }
});
test('duplicate tuple, extra fields and invalid roles fail closed',async()=>{
  const item=doc().memberships[0];
  for(const invalid of [
    doc({memberships:[item,item]}),
    doc({memberships:[{...item,role:'owner'}]}),
    doc({memberships:[{...item,permittedRoles:['owner','owner']}]}),
    doc({memberships:[{...item,permittedRoles:['root']}] }),
    doc({clientCanWrite:true}),
    doc({authorizationVersion:0}),
    doc({actorUid:'other'}),
  ]){
    const {db}=database(invalid);
    assert.equal(await new R07B3AdminMembershipStore(db).readForActor(query()),null);
  }
});
test('unavailable server-only ACL does not fall back to client workspace',async()=>{
  const db={collection:()=>({doc:()=>({get:async()=>{throw Error('backend offline');}})})};
  await assert.rejects(new R07B3AdminMembershipStore(db).readForActor(query()),
    /backend offline/);
});
test('invalid UID is rejected without issuing database query',async()=>{
  const {db,accesses}=database(),store=new R07B3AdminMembershipStore(db);
  assert.equal(await store.readForActor(query({verifiedUid:'../escape'})),null);
  assert.deepEqual(accesses,[]);
});
test('signed actor + stored company/branch authority integrates with R03',async()=>{
  const {db}=database();
  const store=new R07B3AdminMembershipStore(db);
  const trusted={
    verify:async()=>({
      uid:'owner-verified',role:'owner',tokenIssuedAt:now-5,
      tokenExpiresAt:now+300,authenticatedAt:now-60,anonymous:false,
    }),
  };
  const scope=await authorizeR07ScopedRequest({
    bearerToken:'synthetic-bearer-token-for-authorized-scope',
    body:{
      schemaVersion:1,accountId:'acct-1',companyId:'co-1',
      branchId:'br-1',threadId:'thread-1',scopeType:'business',
    },
    principal:trusted,membership:store,serverNowEpochSeconds:now,
  });
  assert.equal(scope.ownerUid,'owner-verified');
  assert.equal(scope.authorizationVersion,3);
  assert.equal(scope.companyId,'co-1');
  assert.equal(scope.branchId,'br-1');
});
test('scope authorization denies role escalation not present in server ACL',async()=>{
  const {db}=database();
  await assert.rejects(authorizeR07ScopedRequest({
    bearerToken:'synthetic-bearer-token-for-authorized-scope',
    body:{
      schemaVersion:1,accountId:'acct-1',companyId:'co-1',
      branchId:'br-1',threadId:'thread-1',scopeType:'business',
    },
    principal:{verify:async()=>({
      uid:'owner-verified',role:'finance',tokenIssuedAt:now-5,
      tokenExpiresAt:now+300,authenticatedAt:now-60,anonymous:false,
    })},
    membership:new R07B3AdminMembershipStore(db),
    serverNowEpochSeconds:now,
  }),/AUTH_MEMBERSHIP_DENIED/);
});
