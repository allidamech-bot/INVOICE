import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v267 Precision Black foundation is the final application-chrome layer before printable documents',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/precision-black-foundation-v267.css')
  ]);
  const foundation=html.indexOf('./styles/precision-black-foundation-v267.css');
  const runtimeAudit=html.indexOf('./styles/runtime-contrast-audit-v266.css');
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(foundation>runtimeAudit,'Precision Black must follow all legacy runtime visual patches');
  assert.ok(printable>foundation,'printable document styling must remain the final stylesheet');
  assert.match(css,/--ds-canvas:#080808/);
  assert.match(css,/--ds-surface:#131313/);
  assert.match(css,/--ds-accent:#B8A071/);
  assert.match(css,/--ds-space-1:4px/);
  assert.match(css,/--ds-space-7:48px/);
  assert.match(css,/--ds-control-h-touch:46px/);
  assert.match(css,/font-variant-numeric:tabular-nums lining-nums/);
  assert.match(css,/@media print/);
});

test('v267 keeps the runtime visual language flat and restrained',async()=>{
  const css=await read('src/styles/precision-black-foundation-v267.css');
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter:[^n]/);
  assert.match(css,/--ds-shadow-card:none/);
  assert.match(css,/--ds-shadow-raised:0 16px 40px rgba\(0,0,0,\.44\)/);
  assert.match(css,/html\[dir='rtl'\] \.app-ui/);
  assert.match(css,/unicode-bidi:isolate/);
});
