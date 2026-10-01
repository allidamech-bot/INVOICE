import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

const [css,reliability,home,shell]=await Promise.all([
  read('src/styles/mobile-command-center-v475.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('src/components/WorkspaceHome.tsx'),
  read('src/components/AppShell.tsx')
]);

test('v475 is loaded as a presentation-only mobile layer',()=>{
  assert.match(reliability,/@import url\("\.\/mobile-command-center-v475\.css\?v=475-1"\);/);
  assert.ok(
    reliability.indexOf('mobile-command-center-v475.css?v=475-1')<reliability.indexOf('/* LOUREX v351'),
    'CSS imports must remain before normal reliability rules'
  );
  assert.match(css,/Presentation-only mobile redesign/);
  assert.match(css,/@media screen and \(max-width:900px\)/);
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

test('v475 preserves mobile reachability, RTL typography and safe-area clearance',()=>{
  assert.match(css,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(css,/padding-bottom:calc\(104px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css,/bottom:calc\(9px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/overflow-x:clip/);
  assert.doesNotMatch(css,/\.ta-mobile-nav\s*\{[^}]*display:none/);
  assert.doesNotMatch(css,/\.ta-finance-dashboard\s*\{[^}]*display:none/);
});

test('v475 keeps the approved semantic color roles distinct',()=>{
  for(const token of ['--lx475-blue','--lx475-cyan','--lx475-emerald','--lx475-violet','--lx475-amber','--lx475-rose']){
    assert.match(css,new RegExp(token.replaceAll('-','\\-')+':'));
  }
  assert.match(css,/\.ta-kpi-card:nth-child\(1\)\{--lx475-kpi-tone:var\(--lx475-blue\)/);
  assert.match(css,/\.ta-kpi-card:nth-child\(4\)\{--lx475-kpi-tone:var\(--lx475-rose\)/);
});
