import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI logo rollout uses a fresh v169 cache generation so the waiting worker cannot mutate the active v168 runtime',async()=>{
  const sw=await readFile('public/sw.js','utf8');
  assert.match(sw,/AI logo rollout cache refresh/);
  assert.match(sw,/\.\/src\/components\/SettingsModal\.js/);
  assert.match(sw,/\.\/src\/lib\/logo-rebuild\.js/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
  assert.match(sw,/lourex-invoice-v168: preserved as a legacy marker/);
  assert.doesNotMatch(sw,/^const CACHE = 'lourex-invoice-v168';$/m);
});
