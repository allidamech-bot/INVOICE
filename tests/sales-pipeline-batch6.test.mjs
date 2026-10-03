import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function customer(id='customer-1',currency='USD'){
  return{id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z',companyNameEn:'Acme Trading',companyNameAr:'أكمي للتجارة',contactPerson:'Ali',addressEn:'',addressAr:'',city:'Jeddah',country:'Saudi Arabia',phone:'',email:'buyer@example.com',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:currency,paymentTermPresetId:'',paymentTerms:'30 days',paymentDueDays:'30',creditLimit:'',creditCurrency:'',notes:''};
}

function baseVault(customers=[customer()]){return{customers,documents:[],documentEvents:[]};}

test('Batch 6 uses a dedicated encrypted CRM event namespace without a schema bump or financial mutation path',async()=>{
  const [pipeline,bridge]=await Promise.all([
    read('src/lib/sales-pipeline.ts'),read('src/storage/vault-mutation-bridge.ts')
  ]);
  assert.match(pipeline,/CRM_MARKER='@lourex:crm-opportunity:v1:'/);
  assert.match(pipeline,/CRM_DOCUMENT_PREFIX='@lourex:crm-opportunity:'/);
  assert.match(pipeline,/type:'created'/);
  // CRM reuses events at the current schema; a historical version literal is not
  // a no-migration contract once other legitimate subsystems advance the vault.
  const {emptyVault,APP_SCHEMA_VERSION}=await import('../dist/src/lib/defaults.js');
  const {blankOpportunity,validatedOpportunityUpsertEvent}=await import('../dist/src/lib/sales-pipeline.js');
  const vault=emptyVault();vault.customers=[customer()];const before=structuredClone(vault);
  const result=validatedOpportunityUpsertEvent(vault,blankOpportunity(vault.customers[0]),'');
  assert.deepEqual(vault,before,'preparing CRM evidence must not change schema or financial records');
  const next={...vault,documentEvents:[...vault.documentEvents,result.event]};
  assert.equal(next.schemaVersion,APP_SCHEMA_VERSION);
  for(const key of Object.keys(before).filter(key=>key!=='documentEvents'))assert.deepEqual(next[key],before[key]);
  assert.doesNotMatch(pipeline,/schemaVersion|saveVault|localStorage|sessionStorage|PaymentRecord|DocumentStatus|DocumentLifecycleStatus/);
  assert.match(bridge,/mutateVaultSafely/);
});

test('Batch 6 stage model is explicit and remains separate from document lifecycle',async()=>{
  const source=await read('src/lib/sales-pipeline.ts');
  assert.match(source,/\['lead','contacted','rfq-received','quote-sent','negotiation','won','lost'\]/);
  assert.match(source,/Pipeline status never changes document lifecycle|never infer FX|change opportunity state without user approval/);
  assert.doesNotMatch(source,/\.status\s*=|\.lifecycleStatus\s*=/);
});

test('Opportunity upsert, currency grouping, stale-write rejection and delete are deterministic',async()=>{
  const {blankOpportunity,validatedOpportunityUpsertEvent,validatedOpportunityDeleteEvent,buildSalesPipeline,salesOpportunitiesFromEvents}=await import('../dist/src/lib/sales-pipeline.js');
  const usdCustomer=customer('customer-usd','USD');
  const eurCustomer=customer('customer-eur','EUR');
  const vault=baseVault([usdCustomer,eurCustomer]);

  const usd=blankOpportunity(usdCustomer);usd.title='Jeddah rollout';usd.amount='1250.50';usd.currency='USD';usd.stage='negotiation';usd.nextAction='Call buyer';usd.expectedCloseDate='2026-10-20';
  const first=validatedOpportunityUpsertEvent(vault,usd,'');
  vault.documentEvents.push(first.event);
  assert.equal(salesOpportunitiesFromEvents(vault.documentEvents)[0].stage,'negotiation');

  const eur=blankOpportunity(eurCustomer);eur.title='EU supply';eur.amount='900';eur.currency='EUR';eur.stage='quote-sent';
  const second=validatedOpportunityUpsertEvent(vault,eur,'');
  vault.documentEvents.push(second.event);
  const grouped=buildSalesPipeline(vault).openValues;
  assert.deepEqual(grouped.map(row=>[row.currency,row.amount]),[['EUR',900],['USD',1250.5]]);

  const updated={...first.opportunity,stage:'won',nextAction:''};
  const won=validatedOpportunityUpsertEvent(vault,updated,first.opportunity.updatedAt);
  assert.ok(won.opportunity.updatedAt>first.opportunity.updatedAt,'updates must advance monotonically');
  vault.documentEvents.push(won.event);
  assert.equal(buildSalesPipeline(vault).wonCount,1);
  assert.deepEqual(buildSalesPipeline(vault).openValues.map(row=>row.currency),['EUR']);
  assert.throws(()=>validatedOpportunityUpsertEvent(vault,{...first.opportunity,stage:'lost'},first.opportunity.updatedAt),/changed on another device/i);

  const deletion=validatedOpportunityDeleteEvent(vault,won.opportunity.id,won.opportunity.updatedAt);
  assert.ok(deletion.at>won.opportunity.updatedAt,'delete tombstone must be later than the current opportunity event');
  vault.documentEvents.push(deletion);
  assert.equal(salesOpportunitiesFromEvents(vault.documentEvents).some(row=>row.id===won.opportunity.id),false);
});

test('Opportunity links can only reference active documents owned by the selected customer',async()=>{
  const {blankOpportunity,validatedOpportunityUpsertEvent}=await import('../dist/src/lib/sales-pipeline.js');
  const c1=customer('customer-1'),c2=customer('customer-2');
  const doc={id:'doc-1',customerSnapshot:{sourceCustomerId:c2.id},lifecycleStatus:'active',updatedAt:'2026-09-30T00:00:00.000Z'};
  const vault={customers:[c1,c2],documents:[doc],documentEvents:[]};
  const opportunity=blankOpportunity(c1);opportunity.linkedDocumentIds=[doc.id];
  assert.throws(()=>validatedOpportunityUpsertEvent(vault,opportunity,''),/belong to the selected customer/i);
});

test('Customers owns Directory and Pipeline while Customer 360 remains intact',async()=>{
  const [customers,pipeline]=await Promise.all([read('src/components/CustomersPage.tsx'),read('src/components/SalesPipelineLive.tsx')]);
  assert.match(customers,/CustomerWorkspace='directory'\|'pipeline'/);
  assert.match(customers,/SalesPipelineLive/);
  assert.match(customers,/Customer360LivePanel/);
  assert.match(customers,/workspace==='pipeline'/);
  assert.match(customers,/Directory/);
  assert.match(customers,/Pipeline/);
  assert.match(pipeline,/mutateVaultSafely/);
  assert.match(pipeline,/documentEvents:\[\.\.\.vault\.documentEvents,result\.event\]/);
  assert.match(pipeline,/validatedOpportunityDeleteEvent/);
  assert.match(pipeline,/variant="danger"/);
  assert.doesNotMatch(pipeline,/style=\{\{display:'none'\}\}/);
});

test('Pipeline presentation is mobile-first, RTL-aware and keeps touch targets usable',async()=>{
  const [css,loader]=await Promise.all([read('src/styles/sales-pipeline-batch6.css'),read('src/lib/sales-pipeline-style.ts')]);
  assert.match(loader,/sales-pipeline-batch6\.css\?v=458-1/);
  assert.match(css,/@media\(max-width:600px\)[\s\S]*grid-template-columns:1fr/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/\[dir="rtl"\]/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('Pipeline AI summary is read-only and explicitly forbids FX inference or autonomous state changes',async()=>{
  const source=await read('src/lib/sales-pipeline.ts');
  assert.match(source,/export function pipelineAiSummary/);
  assert.match(source,/Treat values as separate currencies and never infer FX or change opportunity state without user approval/);
  assert.doesNotMatch(source,/fetch\(|\/api\/|mutateVaultSafely/);
});
