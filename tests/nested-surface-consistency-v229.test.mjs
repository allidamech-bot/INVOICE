import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v229 normalizes nested application surfaces without touching printable pages',async()=>{
  const css=await read('src/styles/nested-surface-consistency-v229.css');
  for(const selector of [
    '.premium-selected-customer','.premium-item-card>header','.item-line-total','.editor-totals',
    '.commercial-row-card','.commercial-preset-chips button','.credit-limit-banner',
    '.customer-profile-card','.customer-profile-quick-actions>button',
    '.settings-workspace-v2','.settings-account-card','.mobile-more-sheet','.mobile-more-link'
  ]) assert.ok(css.includes(selector),`missing nested selector ${selector}`);
  assert.match(css,/\.app-ui \.premium-selected-customer\{[\s\S]*?background:transparent!important/);
  assert.match(css,/\.app-ui \.premium-item-card>header,[\s\S]*?background:var\(--ds-surface-strong\)!important/);
  assert.match(css,/\.app-ui :is\(\.mobile-more-account,\.mobile-more-link,\.mobile-more-settings\)\{[\s\S]*?background:var\(--ds-surface-strong\)!important/);
  assert.match(css,/\.app-ui \.settings-workspace-v2 \.settings-panel,[\s\S]*?background:var\(--ds-workspace\)!important/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages|@media print/);
});

test('approved TailAdmin semantic layers own nested screen surfaces and preserve separate A4 print',async()=>{
 const [html,bundle,css]=await Promise.all([read('index.html'),read('dist/styles/app.bundle.css'),read('src/styles/tailadmin-shell-v320.css')]);
 assert.equal(html.includes('nested-surface-consistency-v229.css'),false,'retired nested override must not re-enter the cascade');
 for(const name of ['tailadmin-shell-v320.css','tailadmin-settings-v320.css','tailadmin-editor-core-v320.css','document-premium-redesign-v141.css'])assert.ok(html.includes(name)&&bundle.includes(name),name);
 assert.ok(css.includes('var(--ft-surface)'),'nested surfaces should use semantic palette');
 assert.ok(!css.includes('.invoice-page'),'shell cannot alter A4 paper');
});

test('current application nested controls use theme surfaces rather than retired light-only sheets',async()=>{
 const [html,settings,editor,more]=await Promise.all([read('index.html'),read('src/styles/tailadmin-settings-v320.css'),read('src/styles/tailadmin-editor-core-v320.css'),read('src/styles/tailadmin-shell-v320.css')]);
 assert.equal(html.includes('nested-surface-consistency-v229.css'),false);
 for(const [label,css] of [['settings',settings],['editor',editor],['More',more]])assert.ok(css.includes('var(--ft-surface')||css.includes('var(--ft-line'),'semantic visual owner missing for '+label);
 assert.ok(more.includes('.ta-mobile-sheet')&&settings.includes('.ta-settings-shell'));
});

