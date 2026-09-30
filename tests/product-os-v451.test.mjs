import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v451 product OS keeps the reliability bridge as the final local style owner',async()=>{
  const html=await read('index.html');
  const foundation='./styles/product-os-v451.css?v=451-1';
  const workspaces='./styles/product-os-workspaces-v451.css?v=451-1';
  const reliability='./styles/tailadmin-reliability-bridge-v320.css?v=320-2';
  assert.ok(html.includes(foundation));
  assert.ok(html.includes(workspaces));
  assert.ok(html.includes(reliability));
  assert.ok(html.indexOf(foundation)<html.indexOf(workspaces));
  assert.ok(html.indexOf(workspaces)<html.indexOf(reliability));

  const localStyles=[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
  assert.equal(localStyles.at(-1),'tailadmin-reliability-bridge-v320.css');
  assert.equal(new Set(localStyles).size,localStyles.length,'local styles must not be linked twice');
});

test('v451 semantic design system distinguishes AI, action and financial surfaces',async()=>{
  const [foundation,workspaces]=await Promise.all([
    read('src/styles/product-os-v451.css'),
    read('src/styles/product-os-workspaces-v451.css')
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

test('v451 restructuring map records the exact baseline and financial safety boundaries',async()=>{
  const map=await read('docs/LOUREX_PRODUCT_OS_V451.md');
  assert.match(map,/101a91316ff1ef8846313c1bdfda4064a2965ea3/);
  assert.match(map,/Do not change totals, taxes, discounts, currencies, landed-cost allocation, receivables, payment allocation or document lifecycle/);
  assert.match(map,/Cash Flow/);
  assert.match(map,/Do not add a “Cash Flow” report unless inflow\/outflow coverage is deterministic and complete/);
});
