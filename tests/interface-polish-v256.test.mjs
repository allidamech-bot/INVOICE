import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('home navigation uses a dedicated house icon on desktop and mobile',async()=>{
  const [ui,shell]=await Promise.all([
    read('src/components/UI.tsx'),
    read('src/components/AppShell.tsx')
  ]);
  assert.match(ui,/IconName = 'plus'\|'home'\|/);
  assert.match(ui,/home:<g><path d="m3 10 9-7 9 7"/);
  assert.match(shell,/navButton\('home','home'/);
  assert.match(shell,/screen==='home'[\s\S]*?<Icon name="home"\/>/);
  assert.doesNotMatch(shell,/navButton\('home','menu'/);
});

test('interface polish is responsive, application-scoped and loaded before document output',async()=>{
  const [css,html,sw]=await Promise.all([
    read('src/styles/interface-polish-v256.css'),
    read('index.html'),
    read('public/sw.js')
  ]);
  assert.match(css,/--polish-control-height:44px/);
  assert.match(css,/@media screen and \(max-width:960px\)/);
  assert.match(css,/@media screen and \(max-width:720px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(css,/\.invoice-page\b/);
  assert.ok(html.indexOf('interface-polish-v256.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(sw,/interface-polish-v256\.css/);
});
