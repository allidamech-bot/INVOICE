import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [css,bridge,bundler,pkg,home,shell,orbit]=await Promise.all([
  read('src/styles/executive-command-center-v480.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('scripts/v480-bundle-executive-design.mjs'),
  read('package.json'),
  read('src/components/WorkspaceHome.tsx'),
  read('src/components/AppShell.tsx'),
  read('public/brand/lourex-command-orbit.svg')
]);

test('v480 is the only active redesign owner and v475 is retired from runtime',()=>{
  assert.match(bridge,/@import url\("\.\/executive-command-center-v480\.css\?v=480-1"\);/);
  assert.doesNotMatch(bridge,/mobile-(?:command-center|workspaces|editor|overlays|auth|review)-v475/);
  assert.match(css,/LOUREX Executive Command Center v480/);
  assert.match(css,/Presentation-only/);
});

test('v480 production build inlines the owner before the reliability bridge',()=>{
  assert.match(pkg,/node scripts\/v363-bundle-visual-owners\.mjs && node scripts\/v480-bundle-executive-design\.mjs/);
  assert.match(bundler,/executive-command-center-v480\.css/);
  assert.match(bundler,/tailadmin-reliability-bridge-v320\.css/);
  assert.match(bundler,/runtime v480 @import survived production bundling/);
  assert.match(bundler,/bundle=`\$\{bundle\.slice\(0,insertion\)\}\$\{marker\}/);
});

test('v480 implements the approved mobile command-center hierarchy',()=>{
  assert.match(css,/@media screen and \(max-width:900px\)/);
  assert.match(css,/Hero: the approved global command-center language/);
  assert.match(css,/\.workspace-shell\.screen-home \.ta-dashboard-header\{order:1!important;\}/);
  assert.match(css,/\.workspace-shell\.screen-home \.ta-kpi-grid\{order:2!important;\}/);
  assert.match(css,/\.workspace-shell\.screen-home \.ta-dashboard-primary-grid\{order:4!important;\}/);
  assert.match(css,/\.workspace-shell\.screen-home \.ta-dashboard-intelligence-grid\{order:5!important;\}/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/url\("\.\.\/\.\.\/brand\/lourex-command-orbit\.svg"\)/);
  assert.match(css,/LOUREX AI is a first-class product surface/);
  assert.match(css,/Floating hardware-like mobile dock/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
});

test('v480 preserves semantic color, Arabic, light mode and mobile reachability',()=>{
  for(const token of ['--lx480-blue','--lx480-cyan','--lx480-emerald','--lx480-violet','--lx480-amber','--lx480-rose'])assert.ok(css.includes(token),`missing ${token}`);
  assert.match(css,/html\[data-ui-theme="light"\]/);
  assert.match(css,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/overflow-x:clip/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('v480 binds only to existing presentation roots',()=>{
  for(const selector of ['ta-finance-dashboard','ta-dashboard-header','ta-kpi-grid','ta-quick-actions','ta-dashboard-primary-grid','ta-dashboard-intelligence-grid'])assert.ok(home.includes(selector),`home root missing ${selector}`);
  for(const selector of ['ta-topbar','ta-mobile-nav','ta-mobile-create','ta-mobile-sheet','ta-create-menu-mobile'])assert.ok(shell.includes(selector),`shell root missing ${selector}`);
  assert.match(orbit,/viewBox="0 0 1200 560"/);
  assert.doesNotMatch(orbit,/https?:\/\//);
});

test('v480 cannot mutate LOUREX business or storage state',()=>{
  const forbidden=['localStorage','indexedDB','firebase','firestore','calculateTotals(','setState(','onNew(','onOpen(','onDelete(','onSave(','vault.','fetch('];
  for(const token of forbidden){
    const pattern=new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    assert.doesNotMatch(css,pattern,`presentation CSS must not contain ${token}`);
  }
});
