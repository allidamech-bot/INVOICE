import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [css,elite,workspaces,reliability,home,shell]=await Promise.all([
  read('src/styles/mobile-command-center-v475.css'),
  read('src/styles/mobile-command-center-v475-elite.css'),
  read('src/styles/mobile-workspaces-v475.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('src/components/WorkspaceHome.tsx'),
  read('src/components/AppShell.tsx')
]);

test('v475 loads base, elite and deep workspace presentation layers in order',()=>{
  assert.match(reliability,/@import url\("\.\/mobile-command-center-v475-elite\.css\?v=475-2"\);/);
  assert.match(reliability,/@import url\("\.\/mobile-workspaces-v475\.css\?v=475-3"\);/);
  assert.ok(
    reliability.indexOf('mobile-command-center-v475-elite.css?v=475-2')<reliability.indexOf('mobile-workspaces-v475.css?v=475-3'),
    'workspace layer must refine the elite command-center layer'
  );
  assert.ok(
    reliability.indexOf('mobile-workspaces-v475.css?v=475-3')<reliability.indexOf('/* LOUREX v351'),
    'mobile design imports must remain before normal reliability rules'
  );
  assert.match(elite,/@import url\("\.\/mobile-command-center-v475\.css\?v=475-1"\);/);
  assert.match(css,/Presentation-only mobile redesign/);
  assert.match(elite,/Presentation-only/);
  assert.match(workspaces,/Deep presentation-only pass/);
  assert.match(css,/@media screen and \(max-width:900px\)/);
  assert.match(elite,/@media screen and \(max-width:900px\)/);
  assert.match(workspaces,/@media screen and \(max-width:900px\)/);
  assert.doesNotMatch(home,/mobile-command-center-v475/);
  assert.doesNotMatch(shell,/mobile-command-center-v475/);
});

test('v475 establishes a real mobile information architecture instead of a palette swap',()=>{
  assert.match(css,/\.screen-home \.ta-dashboard-header\{/);
  assert.match(css,/\.screen-home \.ta-kpi-grid\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.screen-home \.ta-quick-actions\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.screen-home \.ta-dashboard-primary-grid\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.ta-mobile-nav\{[\s\S]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/\.ta-create-menu-mobile \.ta-create-menu-grid\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('v475 elite direction adds a differentiated command-deck hierarchy',()=>{
  assert.match(elite,/business command deck/i);
  assert.match(elite,/KPI cluster/i);
  assert.match(elite,/Quick launcher/i);
  assert.match(elite,/Analytics card/i);
  assert.match(elite,/AI is a first-class branded surface/i);
  assert.match(elite,/Bottom dock/i);
  assert.match(elite,/More \/ Create sheets/i);
  assert.match(elite,/\.workspace-shell\.screen-home \.ta-finance-dashboard \.ta-dashboard-header/);
  assert.match(elite,/\.workspace-shell\.screen-home \.ta-kpi-grid \.ta-kpi-card/);
  assert.match(elite,/\.workspace-shell\.screen-home \.lourex-advisor-card/);
  assert.match(elite,/\.workspace-shell:not\(\.is-editor\) \.ta-mobile-nav/);
});

test('v475.3 redesign reaches every primary mobile workspace and detail surface',()=>{
  for(const selector of [
    '.ta-documents-page','.ta-doc-detail-page','.ta-customers-page','.ta-customer-profile',
    '.ta-products-workspace','.ta-operations-page','.ta-finance-page','.ta-reports-page',
    '.ta-settings-shell','.ta-customer-form-section','.modal'
  ]){
    assert.ok(workspaces.includes(selector),`missing deep mobile styling for ${selector}`);
  }
  assert.match(workspaces,/Documents — register becomes a mobile document command stack/);
  assert.match(workspaces,/Customers — directory \+ 360 profile/);
  assert.match(workspaces,/Products \/ Inventory — app-style inventory workspace/);
  assert.match(workspaces,/Purchasing \/ operations — operational command surface/);
  assert.match(workspaces,/Finance \/ Reports — financial instrument layout/);
  assert.match(workspaces,/Settings \/ account — compact control console/);
  assert.match(workspaces,/Modal and sheet polish shared by customer\/product\/settings flows/);
});

test('v475.3 converts dense desktop registers to mobile-native cards without removing content roots',()=>{
  assert.match(workspaces,/\.ta-doc-table-head\{display:none!important;\}/);
  assert.match(workspaces,/\.ta-doc-row\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 44px/);
  assert.match(workspaces,/\.ta-customers-table-head\{display:none!important;\}/);
  assert.match(workspaces,/\.ta-customer-row\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(workspaces,/\.ta-product-table-head\{display:none!important;\}/);
  assert.match(workspaces,/\.ta-product-row\{/);
  assert.match(workspaces,/\.ta-account-row\{[\s\S]*grid-template-columns:1fr/);
  assert.doesNotMatch(workspaces,/\.ta-doc-row\s*\{[^}]*display:none/);
  assert.doesNotMatch(workspaces,/\.ta-customer-row\s*\{[^}]*display:none/);
  assert.doesNotMatch(workspaces,/\.ta-product-row\s*\{[^}]*display:none/);
});

test('v475 preserves mobile reachability, RTL typography and safe-area clearance',()=>{
  assert.match(css,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(elite,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(workspaces,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(css,/padding-bottom:calc\(104px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(elite,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(workspaces,/env\(safe-area-inset-bottom,0px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(workspaces,/min-height:44px/);
  assert.match(css,/overflow-x:clip/);
  assert.match(workspaces,/overflow-x:clip/);
  assert.doesNotMatch(css,/\.ta-mobile-nav\s*\{[^}]*display:none/);
  assert.doesNotMatch(css,/\.ta-finance-dashboard\s*\{[^}]*display:none/);
});

test('v475 keeps the approved semantic color roles distinct',()=>{
  for(const token of ['--lx475-blue','--lx475-cyan','--lx475-emerald','--lx475-violet','--lx475-amber','--lx475-rose']){
    assert.match(css,new RegExp(token.replaceAll('-','\\-')+':'));
  }
  assert.match(css,/\.ta-kpi-card:nth-child\(1\)\{--lx475-kpi-tone:var\(--lx475-blue\)/);
  assert.match(css,/\.ta-kpi-card:nth-child\(4\)\{--lx475-kpi-tone:var\(--lx475-rose\)/);
  for(const token of ['--lx475-electric','--lx475-aqua','--lx475-mint','--lx475-purple','--lx475-gold','--lx475-red']){
    assert.match(elite,new RegExp(token.replaceAll('-','\\-')+':'));
  }
  for(const tone of ['var(--lx475-blue)','var(--lx475-cyan)','var(--lx475-emerald)','var(--lx475-amber)','var(--lx475-violet)']){
    assert.ok(workspaces.includes(tone));
  }
});

test('v475 remains presentation-only and never couples to data mutation',()=>{
  const forbidden=[
    'localStorage','indexedDB','firebase','firestore','calculateTotals(',
    'setState(','onNew(','onOpen(','onDelete(','onSave(','vault.'
  ];
  for(const token of forbidden){
    const pattern=new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    assert.doesNotMatch(css,pattern);
    assert.doesNotMatch(elite,pattern);
    assert.doesNotMatch(workspaces,pattern);
  }
});