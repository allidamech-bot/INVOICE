import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 7 inventory planning is contextual inside Products & Inventory',async()=>{
  const workspace=await read('src/components/ProductsInventoryWorkspace.tsx');
  assert.match(workspace,/type Tab='products'\|(?:'[^']+'\|)*'inventory'\|'planning'\|'movements'/);
  assert.match(workspace,/id:'planning'/);
  assert.match(workspace,/<InventoryPlanningLive\/>/);
  assert.doesNotMatch(workspace,/window\.location/);
});

test('planning policies use encrypted append-only vault events instead of a schema bump',async()=>{
  const engine=await read('src/lib/inventory-planning.ts');
  assert.match(engine,/PLAN_MARKER='@lourex:inventory-plan:v1:'/);
  assert.match(engine,/type:'created'/);
  assert.match(engine,/documentEvents/);
  assert.match(engine,/validatedInventoryPlanningUpsertEvent/);
  assert.match(engine,/assertFresh/);
  assert.doesNotMatch(engine,/schemaVersion/);
});

test('planning math uses valid inventory ledger balance and issue-only demand velocity',async()=>{
  const engine=await read('src/lib/inventory-planning.ts');
  assert.match(engine,/inventoryMovementAccountingIsValid/);
  assert.match(engine,/movement\.type!=='issue'/);
  assert.match(engine,/leadDemandScaled=averageDailyScaled\*BigInt\(policy\?\.leadTimeDays\?\?0\)/);
  assert.match(engine,/reorderTriggerScaled=maxBigInt\(reorderScaled,leadDemandScaled\+safetyScaled\)/);
  assert.match(engine,/suggestedScaled=needsOrder&&targetScaled>onHandScaled\?targetScaled-onHandScaled:0n/);
  assert.match(engine,/status:InventoryPlanStatus=onHandScaled<=0n\?'critical':!configured\?'unconfigured'/);
  assert.doesNotMatch(engine,/purchaseTotals\(/);
  assert.doesNotMatch(engine,/allocateLandedCost\(/);
  assert.doesNotMatch(engine,/postPurchase\(/);
});

test('policy validation blocks unsafe or incoherent planning inputs',async()=>{
  const engine=await read('src/lib/inventory-planning.ts');
  assert.match(engine,/Target stock must be greater than or equal to the reorder point/);
  assert.match(engine,/Lead time must be a whole number from 0 to 3650 days/);
  assert.match(engine,/preferred supplier no longer exists/i);
  assert.match(engine,/isNonNegativeDecimalInput/);
});

test('planning UI is advisory, bilingual and mobile-first',async()=>{
  const [component,style]=await Promise.all([read('src/components/InventoryPlanningLive.tsx'),read('src/styles/inventory-planning-batch7.css')]);
  assert.match(component,/Suggestion only — never auto-posted/);
  assert.match(component,/لا يتم الترحيل تلقائيًا/);
  assert.match(component,/Planning signals use only recorded inventory movements/);
  assert.match(component,/إشارات التخطيط تستخدم حركات المخزون المسجلة فقط/);
  assert.match(component,/preferredSupplierId/);
  assert.match(component,/90-day issue rate/);
  assert.match(style,/@media\(max-width:640px\)/);
  assert.match(style,/min-height:44px/);
  assert.match(style,/html\[dir="rtl"\]/);
  assert.match(style,/html\[data-ui-theme="dark"\]/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
});

test('planning styles load as an isolated runtime layer',async()=>{
  const loader=await read('src/lib/inventory-planning-style.ts');
  assert.match(loader,/inventory-planning-batch7\.css/);
  assert.match(loader,/data-\$\{STYLE_KEY\}/);
  assert.match(loader,/document\.head\.appendChild\(link\)/);
});
