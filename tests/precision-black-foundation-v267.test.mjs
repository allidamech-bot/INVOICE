import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('approved dark matte foundation coexists with light mode and separate printable commercial paper',async()=>{
 const [html,dark,design]=await Promise.all([read('index.html'),read('src/styles/matte-black-dark-v360.css'),read('src/styles/tailadmin-design-closeout-v323.css')]);
 assert.ok(html.includes('matte-black-dark-v360.css'));
 assert.ok(html.includes('tailadmin-design-closeout-v323.css'));
 assert.equal(html.includes('precision-black-foundation-v267.css'),false,'retired monochrome theme cannot overwrite approved screens');
 assert.ok(dark.includes('html[data-ui-theme="dark"]'),'matte behavior is dark-theme-specific');
 assert.ok(dark.includes('background-image:none!important'));
 assert.ok(design.includes('var(--ft-')||design.includes('--ft-'));
 assert.ok(!dark.includes('.invoice-page'),'dark app theme must not alter printable paper');
});

test('v267 keeps the runtime visual language flat and restrained',async()=>{
  const css=await read('src/styles/precision-black-foundation-v267.css');
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter:[^n]/);
  assert.match(css,/--ds-shadow-card:none/);
  assert.match(css,/--ds-shadow-raised:0 16px 40px rgba\(0,0,0,\.44\)/);
  assert.match(css,/html\[dir='rtl'\] \.app-ui/);
  assert.match(css,/unicode-bidi:isolate/);
});
