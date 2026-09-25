import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v326 reliability bridge does not retheme application workspaces',async()=>{
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.doesNotMatch(css,/premium mobile owner/i);
  assert.doesNotMatch(css,/\.ta-finance-dashboard/);
  assert.doesNotMatch(css,/\.ta-documents-page/);
  assert.doesNotMatch(css,/\.lourex-advisor-card/);
  assert.doesNotMatch(css,/\.ta-kpi-grid/);
  assert.match(css,/runtime\/recovery geometry and UI safety contracts/i);
});

test('v326 defines one structural overlay ladder and protects mobile Create hit testing',async()=>{
  const css=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  for(const token of ['--lourex-z-nav','--lourex-z-backdrop','--lourex-z-sheet','--lourex-z-search','--lourex-z-ai','--lourex-z-modal','--lourex-z-toast','--lourex-z-critical']){
    assert.ok(css.includes(token),`missing overlay token ${token}`);
  }
  assert.match(css,/body:has\(#ta-mobile-create-menu\)[\s\S]*\.ta-mobile-nav\{z-index:calc\(var\(--lourex-z-backdrop\) \+ 2\)!important\}/);
  assert.match(css,/body:has\(#ta-mobile-create-menu\)[\s\S]*\.ta-mobile-nav>button\{pointer-events:none!important\}/);
  assert.match(css,/\.ta-mobile-create-wrap\{[\s\S]*pointer-events:auto!important/);
  assert.match(css,/\.ta-create-menu-mobile\{pointer-events:auto!important\}/);
});

test('v326 keeps transient cloud placement out of the visual priority layer',async()=>{
  const visual=await read('src/styles/tailadmin-design-mobile-priority-v323.css');
  assert.doesNotMatch(visual,/data-lourex-cloud-refresh/);
  assert.doesNotMatch(visual,/data-lourex-update/);
  const reliability=await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.match(reliability,/left:50%!important;right:auto!important;inset-inline:auto!important/);
  assert.match(reliability,/bottom:calc\(96px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
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
