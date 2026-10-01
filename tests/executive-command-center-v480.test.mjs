import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [homeCss,workspaceCss,editorCss,overlayCss,bridge,bundler,pkg,home,shell,orbit]=await Promise.all([
  read('src/styles/executive-command-center-v480.css'),
  read('src/styles/executive-workspaces-v480.css'),
  read('src/styles/executive-editor-v480.css'),
  read('src/styles/executive-overlays-auth-v480.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('scripts/v480-bundle-executive-design.mjs'),
  read('package.json'),
  read('src/components/WorkspaceHome.tsx'),
  read('src/components/AppShell.tsx'),
  read('public/brand/lourex-command-orbit.svg')
]);
const layers=[homeCss,workspaceCss,editorCss,overlayCss];

test('v480 is the only active redesign stack and v475 is retired from runtime',()=>{
  for(const [name,version] of [
    ['executive-command-center-v480.css','480-1'],
    ['executive-workspaces-v480.css','480-2'],
    ['executive-editor-v480.css','480-3'],
    ['executive-overlays-auth-v480.css','480-4']
  ])assert.match(bridge,new RegExp(`@import url\\("\\./${name.replaceAll('.','\\.')}\\?v=${version}"\\);`));
  assert.doesNotMatch(bridge,/mobile-(?:command-center|workspaces|editor|overlays|auth|review)-v475/);
  assert.match(homeCss,/LOUREX Executive Command Center v480/);
  assert.match(workspaceCss,/LOUREX Executive Workspaces v480/);
  assert.match(editorCss,/LOUREX Executive Editor v480/);
  assert.match(overlayCss,/LOUREX Executive Overlays \+ Auth v480/);
});

test('v480 production build inlines all four owners before the reliability bridge',()=>{
  assert.match(pkg,/node scripts\/v363-bundle-visual-owners\.mjs && node scripts\/v480-bundle-executive-design\.mjs/);
  for(const owner of ['executive-command-center-v480.css','executive-workspaces-v480.css','executive-editor-v480.css','executive-overlays-auth-v480.css'])assert.ok(bundler.includes(owner),`bundler missing ${owner}`);
  assert.match(bundler,/tailadmin-reliability-bridge-v320\.css/);
  assert.match(bundler,/runtime executive @import survived production bundling/);
  assert.ok(bundler.includes("parts.join('\\n\\n')"));
});

test('v480 implements the approved Home command-center hierarchy',()=>{
  assert.match(homeCss,/@media screen and \(max-width:900px\)/);
  assert.match(homeCss,/Hero: the approved global command-center language/);
  assert.match(homeCss,/\.workspace-shell\.screen-home \.ta-dashboard-header\{order:1!important;\}/);
  assert.match(homeCss,/\.workspace-shell\.screen-home \.ta-kpi-grid\{order:2!important;\}/);
  assert.match(homeCss,/\.workspace-shell\.screen-home \.ta-dashboard-primary-grid\{order:4!important;\}/);
  assert.match(homeCss,/\.workspace-shell\.screen-home \.ta-dashboard-intelligence-grid\{order:5!important;\}/);
  assert.match(homeCss,/url\("\.\.\/\.\.\/brand\/lourex-command-orbit\.svg"\)/);
  assert.match(homeCss,/LOUREX AI is a first-class product surface/);
  assert.match(homeCss,/Floating hardware-like mobile dock/);
  assert.match(homeCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
});

test('v480 reaches every primary workspace and converts desktop registers for touch',()=>{
  for(const selector of ['.ta-documents-page','.ta-doc-detail-page','.ta-customers-page','.ta-customer-profile','.ta-products-workspace','.ta-operations-page','.ta-finance-page','.ta-reports-page','.ta-settings-shell'])assert.ok(workspaceCss.includes(selector),`workspace owner missing ${selector}`);
  assert.match(workspaceCss,/\.ta-doc-table-head\{display:none!important;\}/);
  assert.match(workspaceCss,/\.ta-doc-row\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 44px/);
  assert.match(workspaceCss,/\.ta-customers-table-head\{display:none!important;\}/);
  assert.match(workspaceCss,/\.ta-customer-row\{/);
  assert.match(workspaceCss,/\.ta-product-table-head\{display:none!important;\}/);
  assert.match(workspaceCss,/\.ta-product-row\{/);
  assert.match(workspaceCss,/\.ta-account-table-head\{display:none!important;\}/);
  assert.match(workspaceCss,/\.ta-account-row\{[\s\S]*grid-template-columns:1fr/);
  assert.match(workspaceCss,/Mobile document actions as a true native bottom sheet/);
});

test('v480 redesign reaches commercial editor, Draft Studio and final review',()=>{
  for(const selector of ['.workspace-shell.screen-editor','.editor-topbar','.ta-editor-step-nav','.document-readiness','.editor-section','.mobile-editor-actionbar','.draft-studio-topbar','.draft-control-section','.draft-block-card','.draft-mobile-actionbar','.document-attachments-section'])assert.ok(editorCss.includes(selector),`editor owner missing ${selector}`);
  assert.match(editorCss,/\.editor-preview-pane,.preview-pane/);
  assert.match(editorCss,/\.draft-studio-preview\{display:none!important;\}/);
  assert.match(editorCss,/\.modal:has\(\.issue-review\)/);
  assert.match(editorCss,/\.issue-review-grid/);
  assert.match(editorCss,/\.accounting-guardian-review/);
  assert.match(editorCss,/env\(safe-area-inset-bottom,0px\)/);
});

test('v480 redesign reaches search, follow-up, AI, sheets and secure access',()=>{
  for(const selector of ['.global-search-panel','.global-search-actions','.global-search-result','.lx-notification-summary','.lx-notification-item','.lx-notification-actions','.lourex-ai-panel','.lourex-ai-head','.lourex-ai-compose','.ta-mobile-sheet','.ta-create-menu-mobile','.ta-auth-page','.ta-auth-card','.ta-setup-card','.ta-unlock-card','.auth-recovery-state'])assert.ok(overlayCss.includes(selector),`overlay/auth owner missing ${selector}`);
  assert.match(overlayCss,/mobile command palette/i);
  assert.match(overlayCss,/executive inbox/i);
  assert.match(overlayCss,/full personal advisor sheet/i);
  assert.match(overlayCss,/secure executive access/i);
  assert.match(overlayCss,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(overlayCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
});

test('v480 preserves semantic color, Arabic, light mode, safe areas and touch floors',()=>{
  for(const token of ['--lx480-blue','--lx480-cyan','--lx480-emerald','--lx480-violet','--lx480-amber','--lx480-rose'])assert.ok(homeCss.includes(token),`missing ${token}`);
  for(const layer of layers){
    assert.match(layer,/@media screen and \(max-width:900px\)/);
    assert.match(layer,/html\[data-ui-theme="light"\]/);
    assert.match(layer,/env\(safe-area-inset-bottom,0px\)/);
  }
  for(const layer of [homeCss,workspaceCss,editorCss,overlayCss])assert.match(layer,/min-height:44px|height:44px/);
  assert.match(homeCss,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(workspaceCss,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(editorCss,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(overlayCss,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(homeCss,/prefers-reduced-motion:reduce/);
  assert.match(workspaceCss,/prefers-reduced-motion:reduce/);
  assert.match(editorCss,/prefers-reduced-motion:reduce/);
  assert.match(overlayCss,/prefers-reduced-motion:reduce/);
});

test('v480 binds only to existing Home and shell presentation roots',()=>{
  for(const selector of ['ta-finance-dashboard','ta-dashboard-header','ta-kpi-grid','ta-quick-actions','ta-dashboard-primary-grid','ta-dashboard-intelligence-grid'])assert.ok(home.includes(selector),`home root missing ${selector}`);
  for(const selector of ['ta-topbar','ta-mobile-nav','ta-mobile-create','ta-mobile-sheet','ta-create-menu-mobile'])assert.ok(shell.includes(selector),`shell root missing ${selector}`);
  assert.match(orbit,/viewBox="0 0 1200 560"/);
  assert.doesNotMatch(orbit,/(?:href|src)=["']https?:\/\//i);
});

test('v480 presentation owners cannot mutate LOUREX business or storage state',()=>{
  const forbidden=['localStorage','indexedDB','firebase','firestore','calculateTotals(','setState(','onNew(','onOpen(','onDelete(','onSave(','vault.','fetch('];
  for(const token of forbidden){
    const pattern=new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    for(const layer of layers)assert.doesNotMatch(layer,pattern,`presentation CSS must not contain ${token}`);
  }
});
