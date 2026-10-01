import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const now='2026-10-01T08:00:00.000Z';
function opportunity(overrides={}){return{id:'opp-1',createdAt:now,updatedAt:now,title:'Jeddah distribution deal',stage:'lead',customerId:'',partyName:'Prospect Co',contactPerson:'Ali',email:'buyer@example.com',phone:'+966500000000',value:'10000',currency:'SAR',expectedCloseDate:'2026-11-15',nextAction:'Call buyer',nextActionDate:'2026-10-03',notes:'',lostReason:'',linkedDocumentIds:[],...overrides};}

test('Batch 6 schema v16 creates encrypted opportunity collection and migrates v15 safely',async()=>{
  const {APP_SCHEMA_VERSION,emptyVault}=await import('../dist/src/lib/defaults.js');
  const {migrateVault}=await import('../dist/src/storage/vault.js');
  assert.equal(APP_SCHEMA_VERSION,16);
  const fresh=emptyVault();assert.deepEqual(fresh.opportunities,[]);
  const old=structuredClone(fresh);delete old.opportunities;old.schemaVersion=15;
  const migrated=migrateVault(old);
  assert.equal(migrated.schemaVersion,16);assert.deepEqual(migrated.opportunities,[]);
});

test('Opportunity validation keeps CRM state separate from accounting and requires explicit currency with value',async()=>{
  const {validateOpportunity,opportunityIsOpen,OPPORTUNITY_STAGES}=await import('../dist/src/lib/sales-pipeline.js');
  assert.deepEqual(OPPORTUNITY_STAGES,['lead','contacted','rfq-received','quote-sent','negotiation','won','lost']);
  assert.deepEqual(validateOpportunity(opportunity()),[]);
  assert.ok(validateOpportunity(opportunity({currency:''})).some(error=>/currency/i.test(error)));
  assert.ok(validateOpportunity(opportunity({value:'-1'})).some(error=>/zero or greater/i.test(error)));
  assert.ok(validateOpportunity(opportunity({stage:'lost',lostReason:''})).some(error=>/Lost reason/i.test(error)));
  assert.equal(opportunityIsOpen(opportunity({stage:'won'})),false);
  assert.equal(opportunityIsOpen(opportunity({stage:'negotiation'})),true);
});

test('Cloud merge carries opportunity edits and rejects divergent concurrent edits',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {mergeVaultIntent}=await import('../dist/src/storage/vault-merge.js');
  const base=emptyVault();base.opportunities=[opportunity()];
  const intended=structuredClone(base);intended.opportunities[0]={...intended.opportunities[0],stage:'contacted',updatedAt:'2026-10-01T09:00:00.000Z'};
  const latest=structuredClone(base);
  const merged=mergeVaultIntent(base,intended,latest);
  assert.equal(merged.opportunities[0].stage,'contacted');
  const remote=structuredClone(base);remote.opportunities[0]={...remote.opportunities[0],stage:'rfq-received',updatedAt:'2026-10-01T09:01:00.000Z'};
  assert.throws(()=>mergeVaultIntent(base,intended,remote),/Opportunity changed on another device/);
});

test('Batch 6 model does not overload document or lifecycle status and does not grant AI mutation authority',async()=>{
  const [types,pipeline,merge]=await Promise.all([read('src/crm-types.ts'),read('src/lib/sales-pipeline.ts'),read('src/storage/vault-merge.ts')]);
  assert.match(types,/OpportunityStage/);assert.match(types,/linkedDocumentIds:string\[\]/);
  assert.doesNotMatch(types,/DocumentStatus|DocumentLifecycleStatus/);
  assert.doesNotMatch(pipeline,/saveVault|mutateVaultSafely|firebase|exchangeRate|fxRate/i);
  assert.match(merge,/guardOpportunityChanges/);assert.match(merge,/Reopen the Pipeline/);
});
