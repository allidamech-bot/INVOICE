import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v266 late runtime contrast layer closes the mobile report-date white-surface leak',async()=>{
  const [html,auditCss,legacyCss]=await Promise.all([
    read('index.html'),
    read('src/styles/runtime-contrast-audit-v266.css'),
    read('src/styles/ux-recovery-v152.css')
  ]);
  assert.match(legacyCss,/\.reports-date-control\{[\s\S]*?background:#fff/);
  assert.match(auditCss,/\.app-ui \.reports-date-control\{[\s\S]*?background:var\(--ds-input\)!important/);
  assert.match(auditCss,/border-color:var\(--ds-input-line\)!important/);
  assert.match(auditCss,/color:var\(--ds-text\)!important/);
  const runtime=html.indexOf('./styles/runtime-contrast-audit-v266.css');
  assert.ok(runtime>html.indexOf('./styles/product-library-contrast-v257.css'));
  assert.ok(runtime<html.indexOf('./styles/document-premium-redesign-v141.css'));
});
