import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v226 health diagnostics execute under the production self-only script policy',async()=>{
  const [html,script,patch,vercel]=await Promise.all([
    read('public/health.html'),
    read('public/health.js'),
    read('scripts/pwa-cache-v205.mjs'),
    read('vercel.json')
  ]);
  assert.match(html,/<script src="\.\/health\.js" defer><\/script>/);
  assert.doesNotMatch(html,/<script>\s*\(\(\) =>/);
  assert.doesNotThrow(()=>new Function(script));
  assert.match(script,/HEALTH_DEADLINE_MS=8000/);
  assert.match(script,/Diagnostic deadline reached/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v227'/);
  assert.match(patch,/\.\/health\.js/);
  assert.match(vercel,/"source": "\/health\.js"[\s\S]*?no-cache, no-store, must-revalidate/);
});

test('v226 keeps account entry actions at a reliable touch size',async()=>{
  const css=await read('src/styles/auth-entry.css');
  assert.match(css,/\.auth-account-card \.premium-auth-language\{[^}]*min-height:44px/s);
  assert.match(css,/\.auth-account-card \.account-entry-tabs button\{[^}]*min-height:44px/s);
  assert.match(css,/\.auth-account-card \.account-forgot\{[^}]*min-height:44px[^}]*display:inline-flex/s);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.auth-account-card \.premium-auth-language\{[^}]*min-height:44px/);
});

test('v226 refresh status follows live Arabic and English direction changes',async()=>{
  const script=await read('public/pull-to-refresh.js');
  assert.match(script,/new MutationObserver/);
  assert.match(script,/attributeFilter:\['dir','lang'\]/);
  assert.match(script,/lastCopyState=''/);
  assert.match(script,/isArabic\(\)\?'اسحب للتحديث':'Pull to refresh'/);
});
