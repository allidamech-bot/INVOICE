import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('current More sheet groups business navigation by task with short descriptions',async()=>{
 const shell=await read('src/components/AppShell.tsx');
 for(const token of ['ta-sheet-header','ta-sheet-utilities','ta-sheet-account','ta-sheet-workspace','ta-sheet-group','Products & Inventory','Purchasing','Suppliers and purchase workflow','Receivables, collections and expenses','Reports & Insights','Period analysis and profitability','Settings','Notifications & Follow-up','Help & Product Info'])assert.ok(shell.includes(token),token);
 assert.ok(shell.includes("this.mobileSheetItem('items'"));
 assert.ok(shell.includes("this.mobileSheetItem('operations'"));
 assert.ok(shell.includes("this.mobileSheetItem('receivables'"));
 assert.ok(shell.includes("this.mobileSheetItem('reports'"));
 assert.ok(!shell.includes('Suppliers, purchases, expenses and inventory'),'deprecated mixed destination must not reappear');
});

test('current More sheet uses accessible, theme-aware, mobile-only style ownership',async()=>{
 const [css,reliability,html]=await Promise.all([read('src/styles/tailadmin-shell-v320.css'),read('src/styles/tailadmin-reliability-bridge-v320.css'),read('index.html')]);
 for(const token of ['.ta-mobile-sheet','.ta-sheet-account','.ta-sheet-link','.ta-sheet-link-icon','.ta-sheet-link-copy','.ta-sheet-group','.ta-sheet-chevron','safe-area-inset-bottom'])assert.ok(css.includes(token),token);
 for(const token of ['var(--ft-text-strong)','var(--ft-surface-2)','var(--ft-accent)'])assert.ok(css.includes(token),token);
 assert.ok(reliability.includes('focus-visible'));
 assert.ok(html.includes('tailadmin-shell-v320.css'));
 assert.ok(!html.includes('mobile-more-visual-v204.css'),'retired v204 CSS cannot override current shell');
 assert.ok(!css.includes('.invoice-page'),'mobile More styles cannot affect commercial print');
});

test('v204 build refreshes the installed PWA generation',async()=>{
  const build=await read('scripts/build.mjs');
  assert.match(build,/lourex-invoice-v204/);
  assert.match(build,/lourex-invoice-v203: preserved as a legacy marker/);
});
