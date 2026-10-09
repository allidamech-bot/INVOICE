import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('PWA update activation is explicit, protects dirty workspaces and keeps iOS WebKit reload-free',async()=>{
  const [sw,index]=await Promise.all([read('public/sw.js'),read('src/app/index.tsx')]);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v\d+';/m,'the live service-worker cache generation must be explicit');
  assert.match(sw,/event\.data\?\.type==='SKIP_WAITING'/,'activation must be controlled by a user action');
  assert.doesNotMatch(sw,/install[\s\S]{0,500}await self\.skipWaiting\(\)/,'install must not unconditionally take over the session');
  assert.match(index,/function reloadUnsafeWorkspaceOpen\(\):boolean\{/);
  assert.match(index,/isDocumentEditorOpen\(\)\|\|document\.documentElement\.hasAttribute\('data-lourex-workspace-dirty'\)/);
  assert.match(index,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(index,/const userRequestedReload=reloadForUpdate/);
  assert.match(index,/if\(!userRequestedReload\)return;/,'controller changes must not automatically reload an editor or login');
  assert.match(index,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(index,/rememberWorkspaceBeforeAutomaticReload\(\);\s*window\.location\.replace\(window\.location\.href\)/);
  assert.match(index,/if\(iosWebKit\)\{[\s\S]*?getRegistrations\(\)[\s\S]*?return;/,'iPhone/iPad WebKit must retire background service-worker churn');
});

test('destructive vault transitions create encrypted safety snapshots first',async()=>{
  const [types,db,vault]=await Promise.all([read('src/types.ts'),read('src/storage/db.ts'),read('src/storage/vault.ts')]);
  assert.match(types,/interface SafetySnapshotRecord/);
  assert.match(types,/reason: SafetySnapshotReason/);
  assert.match(types,/security: SecurityMetadata/);
  assert.match(types,/vault: EncryptedVaultRecord/);
  assert.match(db,/createSafetySnapshot/);
  assert.match(vault,/createSafetySnapshot\('pre-migration'/);
  assert.match(vault,/createSafetySnapshot\('pre-restore'\)/);
  assert.match(vault,/createSafetySnapshot\('pre-pin-change'/);
  const restore=vault.indexOf("export async function restoreVaultWithCurrentKey");
  const restoreSnapshot=vault.indexOf("createSafetySnapshot('pre-restore')",restore);
  const restoreSave=vault.indexOf('await saveVault(key, migrated)',restore);
  assert.ok(restoreSnapshot>restore&&restoreSave>restoreSnapshot);
});

test('production build identifies and guards the canonical INVOICE repository',async()=>{
  const build=await read('scripts/build.mjs');
  assert.match(build,/EXPECTED_REPO_OWNER='allidamech-bot'/);
  assert.match(build,/EXPECTED_REPO_SLUG='INVOICE'/);
  assert.match(build,/VERCEL_GIT_REPO_SLUG/);
  assert.match(build,/Refusing production build/);
  assert.match(build,/sourceRepoOwner/);
  assert.match(build,/commitSha/);
});

test('unified diagnostics remain bounded and privacy-safe, with an error recovery link',async()=>{
  const [health,healthScript,vercel,errors]=await Promise.all([read('public/health.html'),read('public/health.js'),read('vercel.json'),read('src/app/AppErrorBoundary.tsx')]);
  assert.match(health,/Unified Diagnostics \/ التشخيص الشامل/);
  assert.match(health,/System health \/ صحة النظام/);
  assert.match(health,/privacy-safe report/i);
  assert.match(health,/id="diagnosticLog"/);
  assert.match(health,/id="report"/);
  assert.match(healthScript,/Deployment source/);
  assert.match(healthScript,/Encrypted local storage/);
  assert.match(healthScript,/PROBE_TIMEOUT_MS/);
  assert.match(healthScript,/HEALTH_DEADLINE_MS/);
  assert.match(healthScript,/finally\{finished=true;render\(\);\}/,'bounded diagnostics must always settle');
  assert.match(healthScript,/\.textContent=systemReportText\(\)/,'diagnostics must be rendered as text, not injected HTML');
  assert.doesNotMatch(healthScript,/companyNameEn|customerSnapshot|descriptionEn|decryptVault/);
  assert.doesNotMatch(healthScript,/indexedDB\.open\(|transaction\('records'|Safety snapshot/);
  assert.match(vercel,/\/sw\.js/);
  assert.match(vercel,/\/runtime-config\.js/);
  assert.match(vercel,/\/health\.html/);
  assert.match(vercel,/no-cache, no-store, must-revalidate/);
  assert.match(errors,/window\.location\.href='\.\/health\.html'/);
  assert.match(errors,/sourceRepoSlug/);
  assert.match(errors,/unifiedDiagnostics=/);
});
