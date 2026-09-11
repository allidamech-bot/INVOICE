import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v204 More sheet exposes a clear compact information hierarchy',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/mobile-more-heading-copy/);
  assert.match(shell,/Quick access to business tools and settings/);
  assert.match(shell,/mobile-more-status-row/);
  assert.match(shell,/mobile-more-account-copy/);
  assert.match(shell,/Products and services library/);
  assert.match(shell,/Open balances and collections/);
  assert.match(shell,/Sales and financial insights/);
  assert.match(shell,/Purchases, expenses and activity/);
  assert.match(shell,/Company, appearance and security/);
  for(const tone of ['items','receivables','reports','operations'])assert.match(shell,new RegExp(`'${tone}'`));
});

test('v204 More sheet uses distinct semantic tones without changing printable templates',async()=>{
  const [css,index]=await Promise.all([read('src/styles/mobile-more-visual-v204.css'),read('index.html')]);
  assert.match(index,/mobile-more-visual-v204\.css/);
  assert.match(css,/\.tone-items/);
  assert.match(css,/\.tone-receivables/);
  assert.match(css,/\.tone-reports/);
  assert.match(css,/\.tone-operations/);
  assert.match(css,/mobile-more-account/);
  assert.match(css,/mobile-more-settings/);
  assert.match(css,/max-height:min\(78dvh,690px\)/);
  assert.match(css,/background-color:#101d24!important/);
  for(const forbidden of ['.invoice-page','.quotation-page','.document-sheet','.print-']){
    assert.equal(css.includes(forbidden),false,`v204 mobile menu CSS must not target ${forbidden}`);
  }
});

test('v204 build refreshes the installed PWA generation',async()=>{
  const build=await read('scripts/build.mjs');
  assert.match(build,/lourex-invoice-v204/);
  assert.match(build,/lourex-invoice-v203: preserved as a legacy marker/);
});
