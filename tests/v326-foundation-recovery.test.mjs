import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v326 reliability bridge stays a runtime/reachability owner instead of retheming page internals',async()=>{
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.doesNotMatch(css,/premium mobile owner/i);
  assert.doesNotMatch(css,/\.lourex-advisor-card/);
  assert.doesNotMatch(css,/\.ta-kpi-grid/);
  assert.doesNotMatch(css,/\.ta-doc-summary-grid/);
  assert.doesNotMatch(css,/\.ta-customers-summary/);
  assert.match(css,/runtime\/recovery geometry and UI safety contracts/i);
});

test('v326 defines one structural overlay ladder',async()=>{
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  for(const token of ['--lourex-z-nav','--lourex-z-backdrop','--lourex-z-popover','--lourex-z-sheet','--lourex-z-search','--lourex-z-ai','--lourex-z-modal','--lourex-z-toast','--lourex-z-preview','--lourex-z-critical']){
    assert.ok(css.includes(token),`missing overlay token ${token}`);
  }
  assert.match(css,/\.ta-create-menu-mobile\{z-index:var\(--lourex-z-popover\)!important;pointer-events:auto!important\}/);
  assert.match(css,/\.mobile-preview-overlay,[\s\S]*\.draft-mobile-preview\{z-index:var\(--lourex-z-preview\)!important\}/);
  assert.doesNotMatch(css,/body:has\(#ta-mobile-create-menu\)[\s\S]*\.ta-mobile-nav\{z-index/);
});

test('v326 mobile Create menu is structurally outside the bottom navigation stacking context',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const navStart=shell.indexOf('<nav className="ta-mobile-nav"');
  const navEnd=shell.indexOf('</nav>',navStart);
  assert.ok(navStart>=0&&navEnd>navStart,'mobile nav markup must exist');
  const navMarkup=shell.slice(navStart,navEnd);
  assert.doesNotMatch(navMarkup,/createMenu\('ta-mobile-create-menu'/,'Create menu must not be nested inside the dock');
  assert.match(shell,/this\.props\.newMenu&&mobile\?this\.createMenu\('ta-mobile-create-menu','ta-create-menu-mobile'\):null/);
  assert.match(navMarkup,/aria-controls="ta-mobile-create-menu"/,'dock Create trigger must still own menu semantics');
});

test('v326 keeps transient cloud placement out of page visual layers',async()=>{
  const mobileVisual=await read('src/styles/tailadmin-design-mobile-priority-v323.css');
  const closeout=await read('src/styles/tailadmin-design-closeout-v323.css');
  for(const visual of [mobileVisual,closeout]){
    assert.doesNotMatch(visual,/data-lourex-cloud-refresh/);
    assert.doesNotMatch(visual,/data-lourex-update/);
  }
  const reliability=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.match(reliability,/left:50%!important;right:auto!important;inset-inline:auto!important/);
  assert.match(reliability,/bottom:calc\(96px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
});

test('v351 mobile dock clearance is reserved once by the shell and normalized by the final reachability owner',async()=>{
  const [shellOwner,controls,reliability]=await Promise.all([
    read('src/styles/tailadmin-mobile-header-v322.css'),
    read('src/styles/mobile-controls-density-v177.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  assert.match(shellOwner,/padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(reliability,/\.ta-finance-dashboard,[\s\S]*\.ta-reports-page[\s\S]*padding-bottom:24px!important/);
  assert.doesNotMatch(controls,/\.ta-finance-dashboard|\.ta-documents-page|\.ta-reports-page/);
});

test('v326 mobile shell has one presentation owner',async()=>{
  const shellOwner=await read('src/styles/tailadmin-mobile-header-v322.css');
  const pagePriority=await read('src/styles/tailadmin-design-mobile-priority-v323.css');
  assert.match(shellOwner,/premium mobile shell owner/i);
  assert.match(shellOwner,/\.ta-mobile-nav/);
  assert.match(shellOwner,/\.ta-create-menu-mobile/);
  assert.match(shellOwner,/\.ta-mobile-sheet/);
  assert.match(shellOwner,/\.lourex-ai-launcher/);
  assert.doesNotMatch(pagePriority,/\.ta-mobile-nav/);
  assert.doesNotMatch(pagePriority,/\.ta-mobile-create/);
  assert.doesNotMatch(pagePriority,/\.lourex-ai-launcher/);
});

test('v326 shell correction contract keeps RTL rails and More affordance stable',async()=>{
  const css=await read('src/styles/tailadmin-shell-contract-v326.css');
  assert.match(css,/html\[dir="rtl"\][\s\S]*\.ta-shell\{[\s\S]*direction:ltr!important;[\s\S]*grid-template-columns:minmax\(0,1fr\) 272px!important/);
  assert.match(css,/html\[dir="rtl"\][\s\S]*\.ta-sidebar\{[\s\S]*grid-column:2!important;[\s\S]*direction:rtl!important/);
  assert.match(css,/\.ta-topbar,[\s\S]*\.ta-main\{[\s\S]*grid-column:1!important;[\s\S]*direction:rtl!important/);
  assert.match(css,/\.ta-mobile-sheet \.ta-sheet-chevron\{[\s\S]*display:block!important/);
  const html=await read('index.html');
  const closeout=html.indexOf('tailadmin-design-closeout-v323.css');
  const contract=html.indexOf('tailadmin-shell-contract-v326.css');
  const priority=html.indexOf('tailadmin-design-mobile-priority-v323.css');
  const reliability=html.indexOf('tailadmin-reliability-bridge-v320.css');
  assert.ok(closeout>=0&&contract>closeout&&priority>contract&&reliability>priority,'shell contract must load after page closeout and before mobile priority/reliability');
});

test('v326 application chrome always uses official LOUREX identity',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/const logo='\.\/brand\/lourex-logo\.svg'/);
  assert.doesNotMatch(shell,/const logo=this\.props\.logoDataUrl/);
});

test('v326 resets the workspace scroll owner whenever the active screen changes',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  assert.match(shell,/private resetWorkspaceScroll=\(\)=>\{/);
  assert.match(shell,/document\.querySelector<HTMLElement>\('\.ta-main'\)/);
  assert.match(shell,/if\(prevProps\.screen!==this\.props\.screen\)[\s\S]*this\.resetWorkspaceScroll\(\)/);
  assert.match(shell,/window\.requestAnimationFrame\(reset\)/);
});

test('production cascade still ends at the reliability bridge',async()=>{
  const html=await read('index.html');
  const links=[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)/g)].map(match=>match[1]);
  assert.equal(links.at(-1),'tailadmin-reliability-bridge-v320.css');
});
