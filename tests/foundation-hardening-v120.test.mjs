import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('PWA update activation is explicit and blocked while the document editor is open',async()=>{
  const [sw,index]=await Promise.all([read('public/sw.js'),read('src/app/index.tsx')]);
  assert.match(sw,/const CACHE = 'lourex-invoice-v120'/);
  assert.match(sw,/event\.data\?\.type==='SKIP_WAITING'/);
  assert.doesNotMatch(sw,/install[\s\S]{0,500}await self\.skipWaiting\(\)/);
  assert.match(index,/isDocumentEditorOpen/);
  assert.match(index,/document\.querySelector\('\.editor-screen'\)/);
  assert.match(index,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(index,/if\(reloadForUpdate\)window\.location\.reload\(\)/);
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

test('system health page exposes platform diagnostics without decrypted business fields',async()=>{
  const [health,vercel,errors]=await Promise.all([read('public/health.html'),read('vercel.json'),read('src/app/AppErrorBoundary.tsx')]);
  assert.match(health,/System Health/);
  assert.match(health,/Deployment source/);
  assert.match(health,/Safety snapshot/);
  assert.match(health,/Privacy-safe diagnostics/);
  assert.doesNotMatch(health,/companyNameEn|customerSnapshot|descriptionEn|decryptVault/);
  assert.match(vercel,/\/sw\.js/);
  assert.match(vercel,/\/runtime-config\.js/);
  assert.match(vercel,/\/health\.html/);
  assert.match(vercel,/no-cache, no-store, must-revalidate/);
  assert.match(errors,/health\.html/);
  assert.match(errors,/sourceRepoSlug/);
});
