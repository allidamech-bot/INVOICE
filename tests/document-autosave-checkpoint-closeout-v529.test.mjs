import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v529 proves scoped Vault identity cannot be used as the automatic-draft checkpoint gate',async()=>{
  const [app,workspaces,v350,patch]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/lib/workspaces.ts'),
    read('scripts/v350-rendering-storage-hardening.mjs'),
    read('scripts/v529-document-autosave-checkpoint-fix.mjs')
  ]);

  assert.match(app,/private requireVault\(\):VaultPayload\{[^}]*return scopeVault\(this\.state\.vault\)/s);
  assert.match(workspaces,/export function scopeVault\(vault:VaultPayload\):VaultPayload\{[\s\S]*appSettings:\{\.\.\.vault\.appSettings/);
  assert.match(v350,/intended\.appSettings===base\.appSettings/);
  assert.match(patch,/const impossibleIdentityGate=.*intended\.appSettings===base\.appSettings/);
  assert.match(patch,/const scopedAutosaveGate=.*intended\.documents!==base\.documents\);/);
  assert.match(patch,/source=source\.replace\(impossibleIdentityGate,scopedAutosaveGate\)/);
});

test('v529 runs immediately after v350 and before later production-runtime consumers',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const v350=build.indexOf('node scripts/v350-rendering-storage-hardening.mjs');
  const v529=build.indexOf('node scripts/v529-document-autosave-checkpoint-fix.mjs');
  const precache=build.indexOf('node scripts/pwa-auto-precache.mjs');
  assert.ok(v350>=0,'v350 runtime owner missing from production build');
  assert.ok(v529>v350,'v529 checkpoint fix must run after v350 emits the runtime owner');
  assert.ok(precache>v529,'v529 checkpoint fix must run before production runtime consumers/precache');
});

test('v529 keeps the existing company-prop feedback-loop guard while enabling the small checkpoint path',async()=>{
  const [editor,v350]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('scripts/v350-rendering-storage-hardening.mjs')
  ]);
  assert.match(editor,/function sameEditorCompany\(/);
  assert.match(editor,/const company=this\.editorCompany\(props\.company\)/);
  assert.match(v350,/const autoDraft=Boolean\(auto&&doc\.status==='draft'\)/);
  assert.match(v350,/autosaveDocumentId=doc\.id/);
  assert.match(v350,/saveDocumentAutosaveCheckpoint\(key,checkpointDocument,checkpointEvents/);
});
