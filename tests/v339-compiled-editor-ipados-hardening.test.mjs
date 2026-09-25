import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v339 build patches both heavy document editors before PWA precache',async()=>{
  const [pkg,script]=await Promise.all([read('package.json'),read('scripts/v339-ipados-desktop-stability.mjs')]);
  const build=JSON.parse(pkg).scripts.build;
  const patchAt=build.indexOf('node scripts/v339-ipados-desktop-stability.mjs');
  const precacheAt=build.indexOf('node scripts/pwa-auto-precache.mjs');
  assert.ok(patchAt>=0&&precacheAt>patchAt,'compiled editor hardening must run before PWA precache');
  assert.match(script,/EditorPageCore\.js/);
  assert.match(script,/DraftDocumentEditor\.js/);
  assert.match(script,/MacIntel/);
  assert.match(script,/maxTouchPoints/);
  assert.match(script,/matches!==1/);
});
