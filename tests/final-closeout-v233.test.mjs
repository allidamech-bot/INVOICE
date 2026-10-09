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

test('v233 customer identity styling remains after picker and before current customer owner',async()=>{
 const [html,pwa,distSw]=await Promise.all([read('index.html'),read('scripts/pwa-cache-v205.mjs'),read('dist/sw.js')]);
 const saved=html.indexOf('./styles/saved-items-picker-v232.css');
 const purity=html.indexOf('./styles/customer-language-purity-v233.css');
 const customerOwner=html.indexOf('./styles/tailadmin-customers-v320.css');
 assert.ok(saved>=0&&purity>saved&&customerOwner>purity,'language-pure customer fields must precede current customer shell');
 assert.ok(html.includes('./styles/document-premium-redesign-v141.css'),'commercial print base remains independent');
 has(pwa,'./styles/customer-language-purity-v233.css');
 has(pwa,'lourex-invoice-v233: customer language purity refresh');
 assert.ok(distSw.includes('styles/app.bundle.css'),'new installed clients receive current CSS owners');
});
test('mobile purchasing keeps navigation and editable actions clear of field overlays',async()=>{
 const [mobile,current,runner]=await Promise.all([
   read('src/styles/obsidian-mobile-geometry-v193.css'),
   read('src/styles/tailadmin-operations-v320.css'),
   read('tests/visual/run-obsidian-financial.cjs')
 ]);
 for(const token of ['.operations-page .purchase-editor','.mobile-bottom-nav','visibility:hidden!important','pointer-events:none!important','opacity:0!important'])has(mobile,token);
 for(const token of ['.ta-ops-editor-scroll','.ta-ops-editor-actions','overflow:auto','env(safe-area-inset-bottom'])has(current,token);
 has(current,'min-height:44px');
 has(runner,'mobile nav covers purchase editor');
 has(runner,'purchase action bar covers editable fields');
 for(const viewport of ['{width:1440,height:1000}','{width:820,height:1180}','{width:390,height:844}','{width:320,height:568}'])has(runner,viewport);
});