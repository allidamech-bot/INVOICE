import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v268 Precision Black shell follows the foundation and stays outside printable document styling',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/precision-black-shell-v268.css')
  ]);
  const foundation=html.indexOf('./styles/precision-black-foundation-v267.css');
  const shell=html.indexOf('./styles/precision-black-shell-v268.css');
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(shell>foundation);
  assert.ok(printable>shell);
  assert.match(css,/grid-template-columns:236px minmax\(0,1fr\)/);
  assert.match(css,/\.app-ui \.shell-nav-button\.active::before/);
  assert.match(css,/width:2px/);
  assert.match(css,/\.app-ui \.mobile-bottom-nav/);
  assert.match(css,/height:calc\(62px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.lourex-ai-launcher/);
});

test('v268 shell avoids decorative effects on permanent navigation chrome',async()=>{
  const css=await read('src/styles/precision-black-shell-v268.css');
  assert.doesNotMatch(css,/linear-gradient|radial-gradient/);
  assert.match(css,/box-shadow:none!important/);
  assert.match(css,/backdrop-filter:none!important/);
});
