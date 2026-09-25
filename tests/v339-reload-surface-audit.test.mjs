import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v339 pull-to-refresh remains opt-in and cannot operate in document editors',async()=>{
  const source=await read('public/pull-to-refresh.js');
  assert.match(source,/if\(!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
  assert.match(source,/data-lourex-document-editor/);
  assert.match(source,/\.editor-screen/);
});

test('v339 generated boot recovery reloads only before React/auth UI is mounted',async()=>{
  const source=await read('scripts/build.mjs');
  const block=source.slice(source.indexOf('const stuckBootRecovery='),source.indexOf("await writeFile('dist/runtime-config.js'"));
  assert.match(block,/document\.getElementById\('lourex-boot'\)/);
  assert.match(block,/!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(block,/if\(reloading\|\|!bootOnly\(\)\)return/);
});

test('v339 desktop recovery cannot classify a mounted editor as boot-only',async()=>{
  const source=await read('scripts/desktop-runtime-v249.mjs');
  const block=source.slice(source.indexOf('const desktopRecovery='),source.indexOf('// v253'));
  assert.match(block,/!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(block,/if\(reloading\|\|!bootOnly\(\)/);
});
