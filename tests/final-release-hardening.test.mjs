import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PWA controller activation reloads only after an explicit user update and rechecks workspace safety',async()=>{
  const entry=await read('src/app/index.tsx');
  const controller=entry.slice(entry.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"),entry.indexOf("void navigator.serviceWorker.register('./sw.js')"));
  assert.match(controller,/const userRequestedReload=reloadForUpdate/);
  assert.match(controller,/pendingUpdateWorker=null/);
  assert.match(controller,/if\(!userRequestedReload\)return/);
  assert.match(controller,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  const requestedGuard=controller.indexOf('if(reloadUnsafeWorkspaceOpen()){updateNoticeDeferredForWorkspace();return;}');
  const requestedReload=controller.lastIndexOf('window.location.replace(window.location.href)');
  assert.ok(requestedGuard>=0&&requestedReload>requestedGuard);
  assert.doesNotMatch(controller,/safeSignedOutAuthGatewayForAutomaticReload\(\)/);
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

test('account surface keeps restore automatic and sign-out returns immediately to the account gateway',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  assert.doesNotMatch(modal,/private restoreFromCloud=async|Restore from Cloud|confirmRestore/);
  const signOut=modal.slice(modal.indexOf('private signOut=async'),modal.indexOf('private resolveConflict=async'));
  assert.match(signOut,/await this\.props\.onSignOut\(\)/);
  assert.match(signOut,/await suspendSession\(\)/);
  assert.match(signOut,/window\.location\.reload\(\)/);
  assert.doesNotMatch(signOut,/setTimeout[\s\S]*window\.location\.reload/);
});

test('Operations surfaces expose excluded legacy accounting records instead of silently hiding integrity loss',async()=>{
  const page=await read('src/components/OperationsPage.tsx');
  assert.match(page,/operationsIntegritySummary/);
  assert.match(page,/integrity\.totalInvalid\?<div className="operations-callout danger operations-integrity-warning" role="status">/);
  assert.match(page,/integrity\.invalidPurchases/);
  assert.match(page,/integrity\.invalidExpenses/);
  assert.match(page,/integrity\.invalidMovements/);
  assert.match(page,/excluded from accounting or inventory totals until corrected/);
});

test('v351 coarse-pointer controls retain a final 44px physical target floor without a second page-design owner',async()=>{
  const [html,controls,mobile,reliability,build]=await Promise.all([
    read('index.html'),
    read('src/styles/mobile-controls-density-v177.css'),
    read('src/styles/tailadmin-design-mobile-priority-v323.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('scripts/build.mjs')
  ]);
  assert.match(html,/mobile-controls-density-v177\.css/);
  assert.match(html,/tailadmin-design-mobile-priority-v323\.css/);
  assert.match(html,/tailadmin-reliability-bridge-v320\.css/);
  assert.match(controls,/@media \(max-width:1366px\) and \(pointer:coarse\)/);
  assert.match(controls,/min-height:44px!important/);
  assert.match(mobile,/\.ta-doc-actions button\{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important/);
  assert.match(reliability,/\.template-favorite-button\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important\}/);
  assert.match(reliability,/\.lourex-advisor-compose form>button\{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important\}/);
  assert.match(build,/app\.bundle\.css/);
});

test('v351 build promotes a genuinely fresh PWA generation while preserving historical source markers',async()=>{
  const [sw,refresh]=await Promise.all([read('public/sw.js'),read('scripts/v303-visual-cache-refresh.mjs')]);
  assert.match(refresh,/const RELEASE_GENERATION=351/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v314';$/m);
  assert.match(sw,/lourex-invoice-v195: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v193: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v185: preserved as a legacy marker/);
});

test('active PWA shell uses network-first for navigation/runtime and cache-first only for immutable residual assets',async()=>{
  const [sw,entry]=await Promise.all([read('public/sw.js'),read('src/app/index.tsx')]);
  assert.match(sw,/async function networkFirst\(request\)[\s\S]*fetch\(request,\{cache:'no-store'\}\)/);
  assert.match(sw,/event\.request\.mode==='navigate'\|\|FRESH_PATHS\.has\(url\.pathname\)\|\|isAppRuntimePath\(url\.pathname\)\)\{event\.respondWith\(networkFirst\(event\.request\)\);return;\}/);
  assert.match(sw,/event\.respondWith\(cacheFirst\(event\.request\)\)/);
  assert.match(sw,/pathname==='\/manifest\.webmanifest'/);
  assert.match(entry,/registration\.update\(\)/);
  assert.match(entry,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
});

test('v351 storage cleanup never deletes by fingerprint or timestamp alone',async()=>{
  const cleanup=await read('public/storage-cleanup-v347.js');
  assert.match(cleanup,/function currentAuthenticatedUid\(\)/);
  assert.match(cleanup,/firebaseApi\.auth\(\)\.currentUser\?\.uid/);
  assert.match(cleanup,/if\(!authenticatedUid\|\|active\.uid!==authenticatedUid\)[\s\S]*account-identity-unverified[\s\S]*return/);
  assert.match(cleanup,/function activeWorkspaceVerified\(\)/);
  assert.match(cleanup,/function sameSecurity\(candidate,active\)/);
  assert.match(cleanup,/relation==='same'&&sameSecurity\(candidate\.security,active\.security\)/);
  assert.match(cleanup,/\(relation==='same'\|\|relation==='older'\)&&activeWorkspaceVerified\(\)/);
  assert.match(cleanup,/deferred-unverified/);
  assert.match(cleanup,/kept-newer/);
  assert.match(cleanup,/kept-unknown/);
  const cleanupBody=cleanup.slice(cleanup.indexOf('async function cleanup()'));
  assert.ok(cleanupBody.indexOf('recoverStagedPublicPreferences()')<cleanupBody.indexOf('const meta=activeMeta()'));
  assert.match(cleanup,/if\(!await deleteDatabase\(PUBLIC_DB\)\)\{clearStagedPublicPreferences\(\);return false;\}/);
  assert.match(cleanup,/catch\{return false;\}[\s\S]*finally\{try\{fresh\?\.close\(\)/);
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
