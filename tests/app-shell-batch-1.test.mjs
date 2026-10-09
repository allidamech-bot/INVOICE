import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('the current desktop and mobile navigation share the authoritative AppShell',async()=>{
  const [app,shell,home]=await Promise.all([
    read('src/app/App.tsx'),read('src/components/AppShell.tsx'),read('src/components/WorkspaceHome.tsx')
  ]);
  assert.match(app,/import \{ AppShell \} from '\.\.\/components\/AppShell\.js'/);
  assert.match(app,/import \{ WorkspaceHome \} from '\.\.\/components\/WorkspaceHome\.js'/);
  assert.match(app,/<AppShell[\s\S]*<WorkspaceHome/);
  assert.doesNotMatch(app,/className="main-nav"/);
  assert.doesNotMatch(app,/header-lock-button/);
  assert.ok(shell.includes('workspace-shell fintech-shell-v280 ta-shell'));
  assert.match(shell,/<nav className="ta-sidebar-nav">/);
  assert.match(shell,/<nav className="ta-mobile-nav" aria-label=\{t\('Mobile navigation','تنقل الجوال'\)\}>/);
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
  assert.match(shell,/this\.syncStatus\('ta-sheet-sync'\)/);
  for(const label of [
    "t('Home','الرئيسية')","t('Products & Inventory','المنتجات والمخزون')",
    "t('Finance & insights','المالية والتحليلات')","t('More','المزيد')"
  ])assert.ok(shell.includes(label),label);
  assert.match(home,/New Document/);
});

test('mobile dock retains five actionable slots and safe-area-contained create control',async()=>{
  const [shell,css]=await Promise.all([read('src/components/AppShell.tsx'),read('src/styles/tailadmin-shell-v320.css')]);
  const start=shell.indexOf('<nav className="ta-mobile-nav"');
  const end=shell.indexOf('</nav>',start);
  assert.ok(start>=0&&end>start,'current mobile navigation must exist');
  const dock=shell.slice(start,end);
  assert.equal([...dock.matchAll(/<button type="button"/g)].length,5,'Home, Documents, Create, Customers and More are independently actionable');
  assert.match(dock,/className="ta-mobile-create" aria-haspopup="dialog"/);
  assert.match(dock,/onClick=\{this\.openMobileQuickCreate\}/);
  assert.match(dock,/aria-controls="ta-mobile-more"/);
  assert.match(dock,/aria-expanded=\{this\.state\.moreOpen\}/);
  assert.match(css,/@media \(max-width:900px\)/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
  assert.match(css,/\.app-ui \.ta-mobile-create \{/);
  assert.doesNotMatch(css,/\.ta-mobile-create\s*\{[^}]*background:linear-gradient/);
});

test('shell styles ship with installed PWA without replacing document print layers',async()=>{
  const [html,sw,css]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('src/styles/tailadmin-shell-v320.css')
  ]);
  assert.match(html,/\.\/styles\/tailadmin-shell-v320\.css\?v=/);
  assert.match(html,/\.\/styles\/document-premium-redesign-v141\.css/);
  assert.match(sw,/\.\/src\/components\/AppShell\.js/);
  assert.match(sw,/\.\/src\/components\/WorkspaceHome\.js/);
  assert.match(sw,/\.\/styles\/document\.css/);
  assert.match(css,/\.app-ui \.ta-shell/);
  assert.match(css,/\.app-ui \.ta-mobile-nav/);
  assert.match(css,/@media \(max-width:900px\)/);
});
