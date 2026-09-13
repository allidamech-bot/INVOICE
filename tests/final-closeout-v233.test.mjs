import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v233 customer identity surfaces follow the active UI language without changing bilingual data',async()=>{
  const [css,component,runner]=await Promise.all([
    read('src/styles/customer-language-purity-v233.css'),
    read('src/components/CustomersPage.tsx'),
    read('tests/visual/run-functional-customers-v196.cjs')
  ]);
  assert.match(css,/\.app-ui \.customer-secondary-name,[\s\S]*\.app-ui \.customer-profile-secondary-name\{[\s\S]*display:none!important/);
  assert.match(component,/function customerDisplayName\(customer:Customer\):string\{return \(isArabic\(\)\?\(customer\.companyNameAr\|\|customer\.companyNameEn\):\(customer\.companyNameEn\|\|customer\.companyNameAr\)\)\.trim\(\);\}/);
  assert.match(runner,/customer list must use active UI language/);
  assert.match(runner,/customer profile must use active UI language/);
  assert.match(runner,/for\(const viewport of \[320,390,1024\]\)for\(const lang of \['en','ar'\]\)/);
});

test('v233 is delivered late to screen UI and refreshed for installed PWA clients',async()=>{
  const [html,pwa]=await Promise.all([read('index.html'),read('scripts/pwa-cache-v205.mjs')]);
  const nested=html.indexOf('./styles/nested-surface-consistency-v229.css');
  const saved=html.indexOf('./styles/saved-items-picker-v232.css');
  const purity=html.indexOf('./styles/customer-language-purity-v233.css');
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(nested>=0&&saved>nested&&purity>saved&&printable>purity,'v233 must stay in late app chrome before printable document CSS');
  assert.match(pwa,/\.\/styles\/customer-language-purity-v233\.css/);
  assert.match(pwa,/lourex-invoice-v233: customer language purity refresh/);
});

test('final closeout keeps purchase editing clear of phone bottom navigation and field overlays',async()=>{
  const [mobile,maintenance,runner]=await Promise.all([
    read('src/styles/obsidian-mobile-geometry-v193.css'),
    read('src/styles/maintenance-closeout-v207.css'),
    read('tests/visual/run-obsidian-financial.cjs')
  ]);
  assert.match(mobile,/:has\(\.operations-page \.purchase-editor\) \.mobile-bottom-nav\{[\s\S]*visibility:hidden!important[\s\S]*pointer-events:none!important[\s\S]*opacity:0!important/);
  assert.match(maintenance,/\.purchase-editor \.operations-editor-actions\{[\s\S]*position:static!important/);
  assert.match(runner,/mobile nav covers purchase editor/);
  assert.match(runner,/purchase action bar covers editable fields/);
  assert.match(runner,/const viewports=\[\{width:1440,height:1000\},\{width:820,height:1180\},\{width:390,height:844\},\{width:320,height:568\}\]/);
});
