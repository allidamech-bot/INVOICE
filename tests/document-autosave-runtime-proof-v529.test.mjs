import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v529 runtime proof executes the emitted AdaptiveCloudApp in WebKit against real encrypted storage',async()=>{
  const [runner,fixture]=await Promise.all([
    read('tests/visual/run-v529-runtime-autosave-proof.cjs'),
    read('tests/visual/v529-runtime-autosave-proof.html')
  ]);
  assert.match(runner,/dist\/src\/app\/index\.js/);
  assert.match(runner,/export \{ AdaptiveCloudApp \}/);
  assert.match(runner,/webkit\.launch/);
  assert.match(runner,/setupVault\('2468',full\)/);
  assert.match(runner,/await app\.saveDocument\(edited,true\)/);
  assert.match(runner,/db\.getRecord\('document-autosave'\)/);
  assert.match(runner,/automatic draft save must not rewrite the full encrypted Vault/);
  assert.match(runner,/app\.closeEditor\(\)/);
  assert.match(runner,/editor close must fold the checkpoint into full encrypted Vault persistence/);
  assert.match(fixture,/dist\/vendor\/react\.production\.min\.js/);
});

test('v529 runtime proof has a dedicated pull-request WebKit workflow',async()=>{
  const workflow=await read('.github/workflows/document-autosave-runtime-proof.yml');
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/npm run build/);
  assert.match(workflow,/playwright@1\.55\.0/);
  assert.match(workflow,/playwright install --with-deps webkit/);
  assert.match(workflow,/run-v529-runtime-autosave-proof\.cjs/);
});
