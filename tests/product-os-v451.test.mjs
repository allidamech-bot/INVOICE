import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v451 product OS keeps the reliability bridge as the final local style owner',async()=>{
  const html=await read('index.html');
  const foundation='./styles/product-os-v451.css?v=451-1';
  const workspaces='./styles/product-os-workspaces-v451.css?v=451-1';
  const detail='./styles/product-os-detail-v451.css?v=451-1';
  const reliability='./styles/tailadmin-reliability-bridge-v320.css?v=320-2';
  assert.ok(html.includes(foundation));
  assert.ok(html.includes(workspaces));
  assert.ok(html.includes(detail));
  assert.ok(html.includes(reliability));
  assert.ok(html.indexOf(foundation)<html.indexOf(workspaces));
  assert.ok(html.indexOf(workspaces)<html.indexOf(detail));
  assert.ok(html.indexOf(detail)<html.indexOf(reliability));

  const localStyles=[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
  assert.equal(localStyles.at(-1),'tailadmin-reliability-bridge-v320.css');
  assert.equal(new Set(localStyles).size,localStyles.length,'local styles must not be linked twice');
});

test('v451 semantic design system distinguishes AI, action and financial surfaces',async()=>{
  const [foundation,workspaces,detail]=await Promise.all([
    read('src/styles/product-os-v451.css'),
    read('src/styles/product-os-workspaces-v451.css'),
    read('src/styles/product-os-detail-v451.css')
  ]);
  for(const token of ['--lx-canvas','--lx-shell','--lx-surface-ai','--lx-surface-warning','--lx-surface-critical','--lx-surface-success'])assert.ok(foundation.includes(token),token);
  assert.match(foundation,/\.lourex-advisor-card/);
  assert.match(foundation,/\.ta-attention-card/);
  assert.match(foundation,/lourex-logo\.svg/);
  assert.match(foundation,/prefers-reduced-motion:reduce/);
  assert.match(foundation,/min-height:48px/);
  assert.match(workspaces,/\.ta-dashboard-intelligence-grid/);
  assert.match(workspaces,/grid-template-columns:minmax\(0,1\.55fr\)/);
  assert.match(workspaces,/safe-area-inset-bottom/);
  assert.match(workspaces,/\.global-search-panel/);
  assert.match(workspaces,/\.lx-product-info/);
  assert.match(detail,/\.ta-settings-shell/);
  assert.match(detail,/\.ta-report-filterbar/);
  assert.match(detail,/\.ta-doc-detail-hero/);
});

test('dashboard puts intelligence and action before analysis without inventing financial context',async()=>{
  const home=await read('src/components/WorkspaceHome.tsx');
  const intelligence=home.indexOf('ta-dashboard-intelligence-grid');
  const kpis=home.indexOf('ta-kpi-grid');
  const analysis=home.indexOf('ta-dashboard-primary-grid');
  assert.ok(intelligence>0&&kpis>intelligence&&analysis>kpis,'DOM order must be intelligence/action, KPI, then analysis');
  assert.ok(home.indexOf('ta-advisor-slot',intelligence)<kpis,'LOUREX Advisor belongs before KPI analysis');
  assert.ok(home.indexOf('ta-attention-card',intelligence)<kpis,'Action Center belongs before KPI analysis');
  assert.doesNotMatch(home,/chartCurrency[\s\S]{0,280}\|\|'USD'/);
  assert.match(home,/\|\|null;/);
  assert.doesNotMatch(home,/Cashflow overview/);
  assert.match(home,/Business performance/);
  assert.match(home,/No recorded currency activity/);
  assert.match(home,/Create document/);
  assert.match(home,/Customer receivables/);
});

test('mobile center action reuses canonical global quick create while specialist document creation remains available',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/openMobileQuickCreate/);
  assert.match(shell,/lourex-global-search-open/);
  assert.match(shell,/Quick create or search/);
  assert.match(shell,/ta-desktop-create-menu/);
  for(const kind of ["'draft'","'rfq'","'proforma-invoice'","'purchase-order'","'delivery-note'","'payment-receipt'"])assert.ok(shell.includes(kind),`specialist document ${kind} must remain available`);
  for(const group of ['Overview','Sales & relationships','Operations','Finance & insights'])assert.ok(shell.includes(group),group);
});

test('mobile overlays, horizontal discovery and accessibility keep iPhone-safe product contracts',async()=>{
  const detail=await read('src/styles/product-os-detail-v451.css');
  assert.match(detail,/@media \(max-width:900px\)/);
  assert.match(detail,/\.modal-backdrop>\.modal/);
  assert.match(detail,/align-items:flex-end/);
  assert.match(detail,/safe-area-inset-bottom/);
  assert.match(detail,/min-height:44px/);
  assert.match(detail,/font-size:16px/);
  assert.match(detail,/overscroll-behavior:contain/);
  assert.match(detail,/scroll-snap-type:x proximity/);
  assert.match(detail,/\[dir="rtl"\]/);
  assert.match(detail,/:focus-visible/);
  assert.match(detail,/prefers-reduced-motion:reduce/);
});

test('operational finance and management reports remain conceptually separate',async()=>{
  const [finance,reports]=await Promise.all([
    read('src/components/FinanceWorkspace.tsx'),
    read('src/components/ReportsPage.tsx')
  ]);
  assert.match(finance,/Operational Finance/);
  assert.match(finance,/Revenue ≠ collections ≠ receivables/);
  assert.match(finance,/Operating expense records/);
  assert.doesNotMatch(finance,/Operating cash out/);
  assert.match(finance,/Period sales and profitability analysis stays in Reports & Insights/);
  assert.match(reports,/Sales, collections, receivables and gross profitability with each currency kept separate/);
  assert.match(reports,/Profitability data is incomplete/);
});

test('help, privacy, terms and about are real product surfaces without invented runtime metadata',async()=>{
  const [shell,info]=await Promise.all([
    read('src/components/AppShell.tsx'),
    read('src/components/ProductInfoModal.tsx')
  ]);
  assert.match(shell,/ProductInfoModal/);
  assert.match(shell,/Help & Product Info/);
  for(const section of ["'help'","'privacy'","'terms'","'about'"])assert.ok(info.includes(section),section);
  assert.match(info,/window as any\.__LOUREX_RUNTIME__/);
  assert.match(info,/Not exposed by this runtime/);
  assert.match(info,/Missing source values must remain missing rather than being invented/);
  assert.match(info,/does not replace a jurisdiction-specific privacy notice/);
});

test('v451 restructuring map records the exact baseline and financial safety boundaries',async()=>{
  const map=await read('docs/LOUREX_PRODUCT_OS_V451.md');
  assert.match(map,/101a91316ff1ef8846313c1bdfda4064a2965ea3/);
  assert.match(map,/Do not change totals, taxes, discounts, currencies, landed-cost allocation, receivables, payment allocation or document lifecycle/);
  assert.match(map,/Cash Flow/);
  assert.match(map,/Do not add a “Cash Flow” report unless inflow\/outflow coverage is deterministic and complete/);
});
