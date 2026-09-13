import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const has=(source,needle,message)=>assert.ok(source.includes(needle),message||`missing: ${needle}`);

test('v233 customer identity surfaces follow the active UI language without changing bilingual data',async()=>{
  const [css,component,runner]=await Promise.all([
    read('src/styles/customer-language-purity-v233.css'),
    read('src/components/CustomersPage.tsx'),
    read('tests/visual/run-functional-customers-v196.cjs')
  ]);
  has(css,'.app-ui .customer-secondary-name');
  has(css,'.app-ui .customer-profile-secondary-name');
  has(css,'display:none!important');
  has(component,'function customerDisplayName(customer:Customer):string');
  has(component,'customer.companyNameAr||customer.companyNameEn');
  has(component,'customer.companyNameEn||customer.companyNameAr');
  has(runner,'customer list must use active UI language');
  has(runner,'customer profile must use active UI language');
  has(runner,'for(const viewport of [320,390,1024])');
  has(runner,"for(const lang of ['en','ar'])");
});

test('v233 is delivered late to screen UI and refreshed for installed PWA clients',async()=>{
  const [html,pwa]=await Promise.all([read('index.html'),read('scripts/pwa-cache-v205.mjs')]);
  const nested=html.indexOf('./styles/nested-surface-consistency-v229.css');
  const saved=html.indexOf('./styles/saved-items-picker-v232.css');
  const purity=html.indexOf('./styles/customer-language-purity-v233.css');
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(nested>=0&&saved>nested&&purity>saved&&printable>purity,'v233 must stay in late app chrome before printable document CSS');
  has(pwa,'./styles/customer-language-purity-v233.css');
  has(pwa,'lourex-invoice-v233: customer language purity refresh');
});

test('final closeout keeps purchase editing clear of phone bottom navigation and field overlays',async()=>{
  const [mobile,maintenance,runner]=await Promise.all([
    read('src/styles/obsidian-mobile-geometry-v193.css'),
    read('src/styles/maintenance-closeout-v207.css'),
    read('tests/visual/run-obsidian-financial.cjs')
  ]);
  has(mobile,'.operations-page .purchase-editor');
  has(mobile,'.mobile-bottom-nav');
  has(mobile,'visibility:hidden!important');
  has(mobile,'pointer-events:none!important');
  has(mobile,'opacity:0!important');
  has(maintenance,'.purchase-editor .operations-editor-actions');
  has(maintenance,'position:static!important');
  has(runner,'mobile nav covers purchase editor');
  has(runner,'purchase action bar covers editable fields');
  for(const viewport of ['{width:1440,height:1000}','{width:820,height:1180}','{width:390,height:844}','{width:320,height:568}'])has(runner,viewport);
});
