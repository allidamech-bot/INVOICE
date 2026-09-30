import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Batch 0 blueprint freezes the current canonical workspace map and mobile navigation contract',async()=>{
  const map=await read('docs/LOUREX_EXPANSION_BATCH0_BLUEPRINT.md');
  for(const workspace of ['Home / Dashboard','Documents','Customers','Products & Inventory','Purchasing','Finance','Reports & Insights'])assert.ok(map.includes(workspace),workspace);
  for(const mobile of ['Home','Documents','Create','Customers','More'])assert.ok(map.includes(`- ${mobile}`),mobile);
  assert.match(map,/Expansion work must \*\*not\*\* create one mobile navigation item per new capability/);
});

test('Batch 0 preserves current financial, lifecycle and encrypted-vault boundaries',async()=>{
  const map=await read('docs/LOUREX_EXPANSION_BATCH0_BLUEPRINT.md');
  assert.match(map,/`LourexDocument\.status` = `draft \| final`/);
  assert.match(map,/Do not overload `draft\/final` with sales statuses/);
  assert.match(map,/Do not overload customer `PaymentRecord` for supplier payments/);
  assert.match(map,/Do not treat descriptive bank accounts as cash\/bank ledgers/);
  assert.match(map,/Do not invent Input VAT from purchases/);
  assert.match(map,/Do not expose encrypted-vault records through a public portal link/);
  assert.match(map,/Do not combine currencies unless an explicit FX layer with dated rates is enabled/);
});

test('Batch 1 placement keeps commercial tracking additive and outside document lifecycle status',async()=>{
  const map=await read('docs/LOUREX_EXPANSION_BATCH0_BLUEPRINT.md');
  const batch1=map.slice(map.indexOf('## Batch 1 — Commercial Flow + Quote Tracking'),map.indexOf('## Batch 2 — Sales Pipeline'));
  assert.match(batch1,/Primary: \*\*Documents\*\*/);
  assert.match(batch1,/CommercialDocumentTrackingRecord/);
  assert.match(batch1,/commercialStatus: draft\/internal-ready\/sent\/accepted\/rejected\/expired\/converted/);
  assert.match(batch1,/do not repurpose `DocumentStatus`/i);
  assert.match(batch1,/Secure automatic `Viewed` depends on Batch 10/);
});

test('Batch 0 records all twenty expansion batches before implementation starts',async()=>{
  const map=await read('docs/LOUREX_EXPANSION_BATCH0_BLUEPRINT.md');
  for(let batch=1;batch<=20;batch+=1)assert.ok(map.includes(`## Batch ${batch} —`),`Batch ${batch} must be mapped`);
});
