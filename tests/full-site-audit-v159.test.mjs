import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v159 removes inline executable code while preserving canonical redirects offline',async()=>{
  const [html,redirect,config,sw]=await Promise.all([
    read('index.html'),
    read('public/canonical-redirect.js'),
    read('vercel.json'),
    read('public/sw.js')
  ]);

  assert.match(html,/<script src="\.\/runtime-config\.js"><\/script>\s*<script src="\.\/canonical-redirect\.js"><\/script>/);
  assert.doesNotMatch(html,/<script>(?:.|\n)*?<\/script>/);
  assert.match(redirect,/environment!=='production'/);
  assert.match(redirect,/window\.location\.replace/);
  assert.match(config,/script-src 'self';/);
  assert.doesNotMatch(config,/script-src [^;]*'unsafe-inline'/);
  assert.match(config,/Strict-Transport-Security/);
  assert.match(sw,/lourex-invoice-v160/);
  assert.match(sw,/canonical-redirect\.js/);
});

test('v159 uses cryptographic identifiers when randomUUID is unavailable',async()=>{
  const source=await read('src/lib/id.ts');
  assert.match(source,/cryptoObj\?\.randomUUID/);
  assert.match(source,/cryptoObj\?\.getRandomValues/);
  assert.match(source,/new Uint8Array\(16\)/);
  assert.doesNotMatch(source,/Math\.random/);
});

test('v159 makes transient menus and operations navigation keyboard accessible',async()=>{
  const [app,operations]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/components/OperationsPage.tsx')
  ]);

  assert.match(app,/closeTransientMenusOnEscape/);
  assert.match(app,/event\.key==='Escape'/);
  assert.match(app,/aria-haspopup="menu"/);
  assert.match(app,/aria-expanded=\{this\.state\.newMenu\}/);
  assert.match(app,/role="menuitem"/);
  assert.match(operations,/type="search" aria-label=/);
  assert.match(operations,/role="tab"[^>]*aria-controls=/);
  assert.match(operations,/role="tabpanel"[^>]*aria-labelledby=/);
  assert.match(operations,/aria-label=\{t\('Close editor'/);
  assert.match(operations,/aria-label=\{t\('Dismiss error'/);
});
