import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('current mobile More sheet exposes accessible grouped workspace navigation with real actions',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/className="ta-mobile-sheet" id="ta-mobile-more" role="dialog" aria-modal="true"/);
  assert.match(shell,/dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(shell,/className="ta-sheet-close" onClick=\{this\.closeMore\}/);
  assert.match(shell,/className="ta-sheet-account" onClick=\{this\.openAccount\}/);
  assert.match(shell,/this\.mobileSheetItem\('items'/);
  assert.match(shell,/this\.mobileSheetItem\('operations'/);
  assert.match(shell,/this\.mobileSheetItem\('receivables'/);
  assert.match(shell,/this\.mobileSheetItem\('reports'/);
  for(const label of ['Products & Inventory','Products, stock and movement','Purchasing',
    'Suppliers and purchase workflow','Receivables, collections and expenses',
    'Period analysis and profitability','Identity, business profile and account access',
    'Business, documents, security and data','Notifications & Follow-up']){
    assert.ok(shell.includes(label),'mobile More loses '+label);
  }
  assert.match(shell,/className="ta-sheet-link" onClick=\{this\.openNotifications\}/);
  assert.match(shell,/className="ta-sheet-link" onClick=\{this\.openSettings\}/);
  assert.doesNotMatch(shell,/Suppliers, purchases, expenses and inventory/,
    'retired generic Operations routing must not return');
});

test('current More visual owner provides bounded overlay depth, safe areas and semantic surfaces',async()=>{
  const [visual,premium,html]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('src/styles/premium-overlays-v481.css'),
    read('index.html')
  ]);
  assert.doesNotMatch(html,/mobile-more-visual-v204\.css/,'retired stylesheet must not be active');
  assert.match(premium,/\.ta-mobile-sheet/);
  assert.match(premium,/\.ta-sheet-group/);
  assert.match(premium,/\.ta-sheet-link/);
  assert.match(premium,/text-align:start!important/);
  assert.match(visual,/\.ta-mobile-sheet/);
  assert.match(visual,/\.ta-sheet-group/);
  assert.match(visual,/\.ta-sheet-link/);
  assert.match(visual,/\.ta-sheet-theme/);
  assert.match(visual,/max-height:calc\(100dvh - 32px - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)/,
    'mobile More must fit within hardware safe areas');
  assert.match(visual,/\.ta-mobile-sheet\{touch-action:pan-y!important;overscroll-behavior-y:contain!important;overflow-y:auto!important/);
  assert.match(visual,/\.ta-sheet-link\{min-height:64px!important/,'commands must exceed the 44px touch floor');
});

test('v204 build refreshes the installed PWA generation',async()=>{
  const build=await read('scripts/build.mjs');
  assert.match(build,/lourex-invoice-v204/);
  assert.match(build,/lourex-invoice-v203: preserved as a legacy marker/);
});
