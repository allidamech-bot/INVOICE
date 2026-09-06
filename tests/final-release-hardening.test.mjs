import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PWA activation rechecks draft safety immediately before a requested reload',async()=>{
  const entry=await read('src/app/index.tsx');
  const controller=entry.slice(entry.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"),entry.indexOf('// Preserve the established non-fatal registration path'));
  assert.match(controller,/const userRequestedReload=reloadForUpdate/);
  assert.match(controller,/pendingUpdateWorker=null/);
  assert.match(controller,/if\(!userRequestedReload\)return/);
  assert.match(controller,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.ok(controller.indexOf('reloadUnsafeWorkspaceOpen()')<controller.indexOf('window.location.replace(window.location.href)'));
  assert.match(entry,/function updateNoticeDeferredForWorkspace\(\):void[\s\S]*reload\.disabled=false/);
  assert.match(entry,/reload\.style\.minHeight='44px'/);
});

test('cloud install revalidates account ownership and workspace safety at the local commit boundary',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault'),cloud.indexOf('export async function pushLocalVaultToCloud'));
  const pull=install.indexOf('const remote=await pullCloudVaultFromMeta(uid,meta)');
  const put=install.indexOf('await putSecurityAndVault(remote.security,remote.vault)');
  assert.ok(pull>=0&&put>pull);
  const between=install.slice(pull,put);
  assert.match(between,/requireCurrentUid\(uid\)/);
  assert.match(between,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  const guard=cloud.slice(cloud.indexOf('function inlineDraftWorkspaceOpen'),cloud.indexOf('function splitCipher'));
  assert.match(guard,/\.editor-screen,\.operations-page,\.product-library-pro\.editor-open/);
  assert.match(guard,/\.modal-backdrop/);
  assert.match(guard,/\.cloud-account-panel,\.cloud-auth-form/);
});

test('manual cloud restore reloads immediately after success instead of leaving a stale UI window',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  const restore=modal.slice(modal.indexOf('private restoreFromCloud=async'),modal.indexOf('render():any'));
  assert.match(restore,/await this\.props\.onRestore\(\)/);
  assert.match(restore,/window\.location\.reload\(\)/);
  assert.doesNotMatch(restore,/setTimeout[\s\S]*window\.location\.reload/);
});

test('Operations surfaces excluded legacy accounting records instead of silently hiding integrity loss',async()=>{
  const page=await read('src/components/OperationsPage.tsx');
  assert.match(page,/operationsIntegritySummary/);
  assert.match(page,/integrity\.totalInvalid\?<div className="operations-callout danger operations-integrity-warning" role="status">/);
  assert.match(page,/integrity\.invalidPurchases/);
  assert.match(page,/integrity\.invalidExpenses/);
  assert.match(page,/integrity\.invalidMovements/);
  assert.match(page,/excluded from accounting or inventory totals until corrected/);
});

test('coarse-pointer mobile controls retain reliable 44px touch targets in the final cascade and offline cache',async()=>{
  const [html,css,sw]=await Promise.all([read('index.html'),read('src/styles/final-mobile-accessibility-v168.css'),read('public/sw.js')]);
  assert.match(html,/design-system-v164\.css[\s\S]*final-mobile-accessibility-v168\.css[\s\S]*document-premium-redesign-v141\.css/);
  assert.match(css,/@media \(max-width:720px\) and \(pointer:coarse\)/);
  assert.match(css,/\.operations-tabs button/);
  assert.match(css,/\.reports-presets button/);
  assert.match(css,/\.documents-filter-toggle/);
  assert.match(css,/\.product-library-star/);
  assert.match(css,/\.customer-actions \.icon-btn/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/min-width:44px!important/);
  assert.match(css,/grid-template-columns:44px minmax\(0,1fr\) 44px!important/);
  assert.doesNotMatch(css,/invoice-page|template-renderer|document-page/);
  assert.ok(sw.includes('./styles/final-mobile-accessibility-v168.css'));
});

test('current release uses a fresh PWA cache generation instead of mutating the prior active cache in place',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v176';$/m);
  assert.match(sw,/lourex-invoice-v169: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v168: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v167: preserved as a legacy marker/);
  assert.doesNotMatch(sw,/^const CACHE = 'lourex-invoice-v168';$/m);
});

test('active PWA shell stays on one cached runtime generation until explicit worker activation',async()=>{
  const [sw,entry]=await Promise.all([read('public/sw.js'),read('src/app/index.tsx')]);
  assert.match(sw,/async function cacheFirst\(request\)[\s\S]*const cached=await cache\.match\(request\);[\s\S]*if\(cached\)return cached/);
  assert.match(sw,/event\.request\.mode==='navigate'\|\|FRESH_PATHS\.has\(url\.pathname\)\|\|isAppRuntimePath\(url\.pathname\)[\s\S]*event\.respondWith\(cacheFirst\(event\.request\)\)/);
  assert.doesNotMatch(sw,/event\.respondWith\(networkFirst\(event\.request\)\)/);
  assert.match(entry,/registration\.update\(\)/);
  assert.match(entry,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
});

test('financial CSV export neutralizes spreadsheet formulas while preserving numeric negatives',async()=>{
  const page=await read('src/components/ReportsPage.tsx');
  const csv=page.slice(page.indexOf('function csvCell'),page.indexOf('export class ReportsPage'));
  assert.match(page,/const CSV_NUMBER=\/\^-\?\(\?:\\d\+\|\\d\*\\\.\\d\+\)\$\//);
  assert.match(csv,/const probe=text\.trimStart\(\)/);
  assert.match(csv,/const formulaRisk=\/\^\[=\+@\]\/\.test\(probe\)\|\|\(probe\.startsWith\('-'\)&&!CSV_NUMBER\.test\(probe\)\)/);
  assert.match(csv,/const safe=formulaRisk\?`'\$\{text\}`:text/);
  assert.ok(csv.includes("safe.replace(/\"/g,'\"\"')"));
  assert.ok(csv.includes('.test(safe)?'));
});
