import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v208 mobile More menu uses true logical-start RTL alignment',async()=>{
  const [shell,css]=await Promise.all([
    read('src/components/AppShell.tsx'),
    read('src/styles/maintenance-closeout-v207.css')
  ]);

  assert.match(shell,/mobile-more-sheet[^>]*dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(css,/mobile-more-sheet\[dir='rtl'\][\s\S]*direction:rtl!important/);
  assert.match(css,/mobile-more-heading-copy,[\s\S]*mobile-more-settings-copy\{[\s\S]*align-items:flex-start!important;[\s\S]*text-align:start!important/);
  assert.match(css,/mobile-more-status-row\{\s*justify-content:flex-start!important/);
  assert.match(css,/mobile-more-account-icon,[\s\S]*mobile-more-settings-icon\{[\s\S]*grid-column:1!important/);
  assert.match(css,/mobile-more-account-copy,[\s\S]*mobile-more-settings-copy\{[\s\S]*grid-column:2!important/);
  assert.match(css,/mobile-more-chevron\{[\s\S]*grid-column:3!important;[\s\S]*justify-self:end!important/);
  assert.match(css,/mobile-more-group>p\{[\s\S]*justify-content:flex-start!important;[\s\S]*text-align:start!important/);
});

test('v208 PWA cache forces installed clients to receive the RTL correction',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v208'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v207'.*legacy marker/);
});
