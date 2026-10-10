import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('one matte black startup presentation replaces retired ledger pulse and remains theme-safe',async()=>{
 const [retired,boot,html,app,theme,manifest]=await Promise.all([
  read('src/styles/ledger-pulse-loading-v250.css'),
  read('src/styles/v347-startup-single-layer.css'),
  read('index.html'),
  read('src/app/App.tsx'),
  read('public/theme-bootstrap-v347.js'),
  read('public/manifest.webmanifest')
 ]);
 assert.match(retired,/v351 compatibility stub/);
 assert.equal(html.includes('ledger-pulse-loading-v250.css'),false,'retired pulse cannot animate over the final startup owner');
 assert.match(html,/id="lourex-boot" class="loading-screen"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(boot,/@media screen/);
 assert.match(boot,/\.loading-screen/);
 assert.match(boot,/background:var\(--boot-bg/);
 assert.match(app,/if\(this\.state\.loading\)return <div className="loading-screen"><Brand logoDataUrl=\{this\.state\.publicLogo\} language=\{activeLanguage\}\/><span className="loading-line"\/><\/div>/);
 assert.match(theme,/dark='#0a1826',light='#f3f7fc'/);
 assert.equal(JSON.parse(manifest).background_color,'#0a1826');
});
test('v250 changes the generated service worker so installed clients refresh the launch assets',async()=>{
  const script=await read('scripts/desktop-runtime-v249.mjs');
  assert.match(script,/lourex-invoice-v249: desktop startup recovery refresh/);
  assert.match(script,/lourex-invoice-v250: ledger pulse launch experience refresh/);
  assert.match(script,/LAUNCH_RELEASE_MARKER/);
});
