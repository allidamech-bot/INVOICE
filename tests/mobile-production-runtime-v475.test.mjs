import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v475 production build emits the redesign as a real post-bundle stylesheet',async()=>{
  const [pkg,script,reliability]=await Promise.all([
    read('package.json'),
    read('scripts/v475-production-style-runtime.mjs'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  assert.match(pkg,/v475-production-style-runtime\.mjs/);
  assert.match(script,/mobile-v475\.bundle\.css\?v=475-8/);
  assert.match(script,/mobile-command-center-v475\.css/);
  assert.match(script,/mobile-command-center-v475-elite\.css/);
  assert.match(script,/mobile-workspaces-v475\.css/);
  assert.match(script,/mobile-editor-v475\.css/);
  assert.match(script,/mobile-overlays-v475\.css/);
  assert.match(script,/mobile-auth-v475\.css/);
  assert.match(script,/mobile-review-v475\.css/);
  assert.match(script,/html\.replace\(bundleLink,`\$\{bundleLink\}\\n  \$\{mobileLink\}`\)/);
  assert.match(script,/LOCAL_CORE/);
  assert.match(reliability,/@import url\("\.\/mobile-command-center-v475-elite\.css\?v=475-2"\);/);
});
