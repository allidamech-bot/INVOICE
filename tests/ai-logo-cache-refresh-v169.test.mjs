import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI logo rollout forces a service-worker byte change so cached Settings/AI runtime is refreshed',async()=>{
  const sw=await readFile('public/sw.js','utf8');
  assert.match(sw,/AI logo rollout cache refresh/);
  assert.match(sw,/\.\/src\/components\/SettingsModal\.js/);
  assert.match(sw,/\.\/src\/lib\/logo-rebuild\.js/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v168';$/m);
});
