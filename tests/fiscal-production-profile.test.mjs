import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionFiscalProfileService,parseProductionProfileCommand} from '../api/_fiscal/production-profile.js';
import {productionProfileConfig,productionProfileIdentity,publishedCompanyLoader} from '../api/_fiscal/production-profile-runtime.js';
import {createProductionFiscalProfileHandler} from '../api/_fiscal/production-profile-handler.js';
const owner={uid:'owner-a',role:'owner'},other={uid:'owner-b',role:'owner'};
const company={country:'Saudi Arabia',nameAr:'شركة اختبار',nameEn:'Synthetic',vatNumber:'300000000000003',commercialRegistration:'1010123456',addressAr:'عنوان',city:'Riyadh'};
const details={street:'Test street',district:'Test district',buildingNumber:'1234',postalCode:'12345',sellerIdScheme:'CRN',otherSellerId:''};
const cmd=(workspaceId,expectedVersion=0,d=details)=>({operation:'save',workspaceId,expectedVersion,details:d});
const inspect=workspaceId=>({operation:'inspect',workspaceId});
function fixture(){
  const rows=new Map(),companies=new Map([['owner-a/one',company],['owner-a/two',{...company,nameAr:'شركة ثانية'}],['owner-b/one',{...company,nameAr:'شركة ثالثة'}]]);
  const db={doc:p=>p,runTransaction:async fn=>fn({get:async p=>({exists:rows.has(p),data:()=>structuredClone(rows.get(p))}),create:(p,v)=>{assert(!rows.has(p));rows.set(p,structuredClone(v));},update:(p,v)=>{assert(rows.has(p));rows.set(p,structuredClone(v));}})};
  return {rows,companies,execute:createProductionFiscalProfileService({db,loadCompany:async(_tx,s)=>companies.get(s.accountUid+'/'+s.workspaceId),clock:()=> '2026-11-20T00:00:00.000Z'})};
}
test('independent company and owner drafts never activate fiscal issuance',async()=>{
  const {execute,rows}=fixture();
  const first=await execute(owner,cmd('one'));assert.equal(first.state,'pending-verification');assert.equal(first.version,1);assert.equal(first.regime,'unresolved');assert.equal(first.onboardingAvailable,false);assert.equal(first.issuanceEnabled,false);
  assert.equal((await execute(owner,inspect('two'))).state,'not-started');
  assert.equal((await execute(other,inspect('one'))).state,'not-started');
  await execute(owner,cmd('two'));await execute(other,cmd('one'));assert.equal(rows.size,3);
  assert.equal((await execute(owner,cmd('one',1))).version,1);
  assert.deepEqual((await execute(owner,inspect('one'))).details,details);
});
test('rejects foreign company, subordinate role, forged owner, environment or authority status',async()=>{
  const {execute}=fixture();
  await assert.rejects(execute(other,inspect('two')),/FORBIDDEN/);
  await assert.rejects(execute({...owner,role:'finance'},inspect('one')),/FORBIDDEN/);
  for(const extra of [{accountUid:'owner-b'},{regime:'phase-2'},{environment:'simulation'},{otp:'123456'},{active:true}])assert.throws(()=>parseProductionProfileCommand({...cmd('one'),...extra}),/INVALID/);
});
test('compare-and-set, source identity changes and locked records fail closed',async()=>{
  const {execute,companies,rows}=fixture();await execute(owner,cmd('one'));
  await assert.rejects(execute(owner,cmd('one',0,{...details,street:'Other'})),/STALE/);
  companies.set('owner-a/one',{...company,vatNumber:'300000000000013'});
  assert.equal((await execute(owner,inspect('one'))).state,'profile-changed');
  assert.equal((await execute(owner,cmd('one',1))).version,2);
  const key='fiscalProductionV1/owner-a/workspaces/one/profiles/current';rows.set(key,{...rows.get(key),environment:'simulation'});
  await assert.rejects(execute(owner,inspect('one')),/LOCKED/);
});
test('additional seller ID only when existing commercial registration is absent',async()=>{
  const {execute,companies}=fixture();
  await assert.rejects(execute(owner,cmd('one',0,{...details,sellerIdScheme:'700',otherSellerId:'700123'})),/SELLER_ID/);
  companies.set('owner-a/one',{...company,commercialRegistration:''});
  await assert.rejects(execute(owner,cmd('one')),/SELLER_ID/);
  assert.equal((await execute(owner,cmd('one',0,{...details,sellerIdScheme:'700',otherSellerId:'700123'}))).version,1);
  for(const d of [{...details,buildingNumber:'12'},{...details,postalCode:'1234'},{...details,otherSellerId:'duplicate'}])assert.throws(()=>parseProductionProfileCommand(cmd('one',0,d)),/INVALID/);
});
test('foreign country or incomplete Saudi number does not become an approved regime',async()=>{
  const {execute,companies}=fixture();companies.set('owner-a/one',{...company,country:'TR'});
  assert.equal((await execute(owner,inspect('one'))).checks.saudiCountry,false);
  await assert.rejects(execute(owner,cmd('one')),/INCOMPLETE/);
  companies.set('owner-a/one',{...company,vatNumber:'123'});
  await assert.rejects(execute(owner,cmd('one')),/INCOMPLETE/);
});
test('production runtime requires explicit deployment and rejects QA or anonymous identity',()=>{
  const env={VERCEL_ENV:'production',LOUREX_FISCAL_PROFILE_ENABLED:'true',LOUREX_PERIOD_SERVER_ENABLED:'true',LOUREX_PERIOD_RULES_VERSION:'1',LOUREX_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'lourex-invoice',client_email:'unit@lourex-invoice.iam.gserviceaccount.com',private_key:'synthetic'})};
  assert.equal(productionProfileConfig(env).project_id,'lourex-invoice');
  for(const extra of [{VERCEL_ENV:'preview'},{FIRESTORE_EMULATOR_HOST:'localhost'},{LOUREX_FISCAL_PROFILE_ENABLED:'false'},{LOUREX_PERIOD_RULES_VERSION:'0'}])assert.throws(()=>productionProfileConfig({...env,...extra}),/UNAVAILABLE/);
  const token={uid:'owner-a',sub:'owner-a',aud:'lourex-invoice',iss:'https://securetoken.google.com/lourex-invoice',firebase:{sign_in_provider:'password'}};
  assert.deepEqual(productionProfileIdentity(token),owner);
  for(const extra of [{aud:'dev-fiscal-qa'},{firebase:{sign_in_provider:'anonymous'}},{lourexWorkspaceUid:'owner-b'},{lourexAiRole:'viewer'}])assert.throws(()=>productionProfileIdentity({...token,...extra}),/FORBIDDEN/);
});
test('published company loader only reads owner directory and requires committed generations',async()=>{
  const meta={chunkStorage:'period-generations-v1',revision:'synthetic-rev',chunkCount:1},control={format:'LOUREX_PERIOD_CONTROL_V1',version:1,ownerUid:'owner-a',generation:1};
  const root='users/owner-a',rows=new Map([[root+'/workspace/meta',meta],[root+'/accounting/control',control],[root+'/periodGenerations/synthetic-rev/chunks/chunk-synthetic-rev-00000',{data:'test'}]]);
  const tx={get:async p=>({exists:rows.has(p),data:()=>rows.get(p)})};
  const load=publishedCompanyLoader({doc:p=>p},{validateMeta:m=>assert.equal(m,meta),decodeWorkspace:(_m,chunks)=>{assert.equal(chunks.length,1);return {workspaces:[{id:'one',company}],branches:[]};}});
  assert.equal(await load(tx,{accountUid:'owner-a',workspaceId:'one'}),company);
  await assert.rejects(load(tx,{accountUid:'owner-a',workspaceId:'two'}),/FORBIDDEN/);
  await assert.rejects(load(tx,{accountUid:'owner-b',workspaceId:'one'}),/SYNC_REQUIRED/);
  rows.delete(root+'/accounting/control');await assert.rejects(load(tx,{accountUid:'owner-a',workspaceId:'one'}),/SYNC_REQUIRED/);
});
test('endpoint denies cross origin, missing auth and extra commands',async()=>{
  const {execute}=fixture(),handler=createProductionFiscalProfileHandler({getRuntime:async()=>({verifyIdentity:async()=>owner,execute})});
  const headers={origin:'https://invoice.test',host:'invoice.test','x-requested-with':'LOUREX-Invoice','content-type':'application/json',authorization:'Bearer '+'a'.repeat(100)};
  async function request(body,over={}){let result;const res={setHeader(){},end(v){result=JSON.parse(v);}};await handler({method:'POST',headers,body,...over},res);return [res.statusCode,result];}
  assert.equal((await request(inspect('one'),{headers:{...headers,origin:'https://wrong.test'}}))[0],403);
  assert.equal((await request(inspect('one'),{headers:{...headers,authorization:''}}))[0],401);
  assert.equal((await request({...cmd('one'),otp:'123456'}))[0],400);
  assert.equal((await request(cmd('one')))[0],200);
});

test('registration lock allows inspection and identical save but rejects new profile details or identity',async()=>{
 const {execute,rows,companies}=fixture();await execute(owner,cmd('one'));
 const base='fiscalProductionV1/owner-a/workspaces/one/profiles/';const current=rows.get(base+'current');
 rows.set(base+'registration-lock',{environment:'production',accountUid:'owner-a',workspaceId:'one',profileVersion:1,sourceDigest:current.sourceDigest});
 assert.equal((await execute(owner,inspect('one'))).registrationLocked,true);
 assert.equal((await execute(owner,cmd('one',1))).version,1);
 await assert.rejects(execute(owner,cmd('one',1,{...details,street:'New'})),/LOCKED/);
 assert.equal((await execute(owner,cmd('two'))).registrationLocked,false);
 companies.set('owner-a/one',{...company,nameAr:'Changed'});
 await assert.rejects(execute(owner,cmd('one',1)),/LOCKED/);
});
