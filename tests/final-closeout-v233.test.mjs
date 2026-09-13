import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v233 keeps passive customer names in the active UI language while preserving bilingual data',async()=>{
  const [css,customers]=await Promise.all([
    read('src/styles/saved-items-picker-v232.css'),
    read('src/components/CustomersPage.tsx')
  ]);
  assert.match(customers,/function customerDisplayName\(customer:Customer\):string\{return \(isArabic\(\)\?\(customer\.companyNameAr\|\|customer\.companyNameEn\):\(customer\.companyNameEn\|\|customer\.companyNameAr\)\)\.trim\(\);\}/);
  assert.match(css,/\/\* v233 — final application closeout\./);
  assert.match(css,/\.app-ui \.customer-secondary-name,[\s\S]*\.app-ui \.customer-profile-secondary-name\{[\s\S]*display:none!important/);
  assert.match(customers,/companyNameEn/);
  assert.match(customers,/companyNameAr/);
});

test('v233 gives phone purchase editing an exclusive focused viewport',async()=>{
  const [css,operations,visual]=await Promise.all([
    read('src/styles/saved-items-picker-v232.css'),
    read('src/components/OperationsPage.tsx'),
    read('tests/visual/run-obsidian-financial.cjs')
  ]);
  assert.match(operations,/className="operations-editor purchase-editor"/);
  assert.match(css,/@media screen and \(max-width:720px\)\{[\s\S]*\.app-ui:has\(\.operations-page \.purchase-editor\) \.workspace-topbar,[\s\S]*\.mobile-bottom-nav\{[\s\S]*display:none!important[\s\S]*visibility:hidden!important[\s\S]*pointer-events:none!important/);
  assert.match(css,/\.operations-page:has\(\.purchase-editor\)>\.operations-hero,[\s\S]*\.operations-summary,[\s\S]*\.operations-integrity-warning,[\s\S]*\.operations-tabs\{[\s\S]*display:none!important/);
  assert.match(css,/\.workspace-content,[\s\S]*grid-row:1!important[\s\S]*padding-bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important/);
  assert.match(visual,/mobile nav covers purchase editor/);
  assert.match(visual,/purchase action bar covers editable fields/);
});

test('v233 refreshes installed PWA clients without touching printable document selectors',async()=>{
  const [css,pwa]=await Promise.all([
    read('src/styles/saved-items-picker-v232.css'),
    read('scripts/pwa-cache-v205.mjs')
  ]);
  assert.match(pwa,/lourex-invoice-v233: final mobile purchase and customer language closeout/);
  const v233=css.slice(css.indexOf('/* v233 — final application closeout.'));
  assert.doesNotMatch(v233,/\.invoice-page|\.invoice-pages/);
});
