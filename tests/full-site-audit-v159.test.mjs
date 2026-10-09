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

  const configTag='<script src="./runtime-config.js"></script>';
  const redirectTag='<script src="./canonical-redirect.js"></script>';
  const startupTag='<script src="./startup-watchdog-v321.js?v=347"></script>';
  const configAt=html.indexOf(configTag),startupAt=html.indexOf(startupTag),redirectAt=html.indexOf(redirectTag);
  assert.ok(configAt>=0&&startupAt>configAt&&redirectAt>startupAt,
    'CSP-safe config, startup watchdog and canonical redirect must remain ordered');
  assert.doesNotMatch(html,/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/,
    'production bootstrap must not inject inline executable JavaScript');
  assert.match(redirect,/environment!=='production'/);
  assert.match(redirect,/window\.location\.replace/);
  assert.match(config,/script-src 'self' https:\/\/apis\.google\.com https:\/\/www\.gstatic\.com;/);
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

test('v159 keeps transient menus and operations navigation keyboard accessible',async()=>{
  const [app,shell,operations]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/components/AppShell.tsx'),
    read('src/components/OperationsPage.tsx')
  ]);

  assert.match(app,/closeTransientMenusOnEscape/);
  assert.match(app,/event\.key==='Escape'/);
  assert.match(shell,/aria-haspopup="menu"/);
  assert.match(shell,/aria-expanded=\{this\.props\.newMenu\}/);
  assert.match(shell,/role="menuitem"/);
  assert.match(operations,/type="search" aria-label=/);
  assert.match(operations,/role="tab"[^>]*aria-controls=/);
  assert.match(operations,/role="tabpanel"[^>]*aria-labelledby=/);
  assert.match(operations,/aria-label=\{t\('Close editor'/);
  assert.match(operations,/aria-label=\{t\('Dismiss error'/);
});
