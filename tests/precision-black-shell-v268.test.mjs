import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current mobile and desktop shell uses semantic navigation, RTL and safe-area geometry',async()=>{
 const [html,css]=await Promise.all([read('index.html'),read('src/styles/tailadmin-shell-v320.css')]);
 assert.ok(html.includes('tailadmin-shell-v320.css'));
 assert.equal(html.includes('precision-black-shell-v268.css'),false);
 for(const token of ['.ta-sidebar','.ta-mobile-nav','.ta-mobile-sheet','env(safe-area-inset-bottom','html[dir="rtl"]','var(--ft-canvas)'])assert.ok(css.includes(token),token);
 assert.ok(!css.includes('.invoice-page'),'shell cannot overwrite commercial print');
});

test('v268 shell avoids decorative effects on permanent navigation chrome',async()=>{
  const css=await read('src/styles/precision-black-shell-v268.css');
  assert.doesNotMatch(css,/linear-gradient|radial-gradient/);
  assert.match(css,/box-shadow:none!important/);
  assert.match(css,/backdrop-filter:none!important/);
});
