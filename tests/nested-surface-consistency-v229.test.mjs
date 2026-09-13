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

test('v229 follows Matte Black and remains before the canonical document stylesheet',async()=>{
  const [html,dist]=await Promise.all([read('index.html'),read('dist/styles/app.bundle.css')]);
  const matte=html.indexOf('./styles/matte-black-v228.css');
  const nested=html.indexOf('./styles/nested-surface-consistency-v229.css');
  const document=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(matte>=0&&nested>matte&&document>nested,'nested surface pass must sit after v228 and before printable document styling');
  assert.match(dist,/v229 — nested surface consistency pass/);
});

test('v229 explicitly replaces legacy light nested controls found in older layers',async()=>{
  const [legacyEditor,legacyCommercial,legacySettings,legacyMore,patch]=await Promise.all([
    read('src/styles/editor-system.css'),read('src/styles/commercial-controls-v136.css'),
    read('src/styles/settings-account-v163.css'),read('src/styles/mobile-more-visual-v204.css'),
    read('scripts/pwa-cache-v205.mjs')
  ]);
  assert.match(legacyEditor,/item-pricing-grid[\s\S]*?background:#f8fafb/);
  assert.match(legacyCommercial,/commercial-row-card[\s\S]*?background:#fff/);
  assert.match(legacySettings,/settings-workspace-v2[\s\S]*?background:#fffdfa/);
  assert.match(legacyMore,/mobile-more-link\.tone-reports[\s\S]*?linear-gradient/);
  assert.match(patch,/\.\/styles\/nested-surface-consistency-v229\.css/);
});
