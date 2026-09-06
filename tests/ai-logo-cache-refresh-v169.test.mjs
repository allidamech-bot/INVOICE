import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI logo runtime remains cached after advancing beyond the v169 rollout',async()=>{
  const sw=await readFile('public/sw.js','utf8');
  assert.match(sw,/AI logo rollout cache refresh/);
  assert.match(sw,/\.\/src\/components\/SettingsModal\.js/);
  assert.match(sw,/\.\/src\/lib\/logo-rebuild\.js/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v173';$/m);
  assert.match(sw,/lourex-invoice-v169: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v168: preserved as a legacy marker/);
  assert.doesNotMatch(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
});
