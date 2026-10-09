import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('application keeps navigation within one current TailAdmin responsive shell',async()=>{
  const [app,shell,home]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/components/AppShell.tsx'),
    read('src/components/WorkspaceHome.tsx')
  ]);
  assert.match(app,/import \{ AppShell \}/);
  assert.match(app,/import \{ WorkspaceHome \}/);
  assert.match(app,/<AppShell/);
  assert.match(app,/<WorkspaceHome/);
  assert.doesNotMatch(app,/className="main-nav"/);
  assert.match(shell,/private navItem=/);
  assert.match(shell,/className=\{\x60ta-nav-item/);
  assert.match(shell,/className="ta-mobile-nav"/);
  assert.match(shell,/className="ta-mobile-sheet"/);
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
  assert.match(shell,/this\.syncStatus\('ta-sheet-sync'\)/);
  assert.match(shell,/aria-current=\{this\.props\.screen==='home'\?'page':undefined\}/);
  assert.match(home,/New Document/);
});

test('current mobile navigation retains five slots, keyboard-safe layers and touch targets',async()=>{
  const [shell,css]=await Promise.all([
    read('src/components/AppShell.tsx'),
    read('src/styles/tailadmin-shell-v320.css')
  ]);
  const nav=shell.slice(shell.indexOf('<nav className="ta-mobile-nav"'),shell.indexOf('</nav>',shell.indexOf('<nav className="ta-mobile-nav"')));
  assert.ok(nav.startsWith('<nav className="ta-mobile-nav"'));
  const buttonCount=(nav.match(/<button\b/g)||[]).length;
  assert.equal(buttonCount,5,'four navigation destinations and a central create action');
  for(const target of ["this.navigate('home')","this.navigate('documents')","this.navigate('customers')","this.openMobileQuickCreate","this.toggleMore"]){
    assert.ok(nav.includes(target),target);
  }
  assert.match(nav,/className="ta-mobile-create"/);
  assert.match(nav,/aria-controls="ta-mobile-more"/);
  assert.match(nav,/aria-expanded=\{this\.state\.moreOpen\}/);
  assert.match(css,/\.app-ui \.ta-mobile-nav \{/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/min-height:calc\(68px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css,/\.app-ui \.ta-mobile-create[\s\S]*min-height:50px/);
  assert.match(css,/\.app-ui \.ta-create-menu-mobile[\s\S]*bottom:calc\(76px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(shell,/id="ta-mobile-more" role="dialog" aria-modal="true"/);
  assert.match(shell,/dir=\{this\.props\.language==='ar'\?'rtl':'ltr'\}/);
});

test('active shell visual layer and source components are present in the offline runtime',async()=>{
  const [html,sw,css]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('src/styles/tailadmin-shell-v320.css')
  ]);
  const shell='./styles/tailadmin-shell-v320.css';
  const document='./styles/document-premium-redesign-v141.css';
  assert.ok(html.includes(shell),'current shell stylesheet must be loaded');
  assert.ok(html.indexOf(document)>=0&&html.indexOf(shell)>html.indexOf(document));
  assert.ok(html.includes('./styles/tailadmin-reliability-bridge-v320.css'));
  assert.match(css,/\.app-ui \.ta-mobile-nav/);
  assert.match(css,/z-index:var\(--lourex-z-nav,120\)/);
  assert.ok(sw.includes('./src/components/AppShell.js'));
  assert.ok(sw.includes('./src/components/WorkspaceHome.js'));
});
