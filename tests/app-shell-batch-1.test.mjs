import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('batch 1 moves application navigation into one responsive shell',async()=>{
  const [app,shell,home]=await Promise.all([
    read('src/app/App.tsx'),
    read('src/components/AppShell.tsx'),
    read('src/components/WorkspaceHome.tsx')
  ]);
  assert.match(app,/import \{ AppShell \}/);
  assert.match(app,/import \{ WorkspaceHome \}/);
  assert.match(app,/screen:'home'\|'documents'\|'customers'\|'receivables'\|'reports'\|'items'\|'operations'\|'editor'/);
  assert.match(app,/<AppShell/);
  assert.match(app,/<WorkspaceHome/);
  assert.doesNotMatch(app,/className="main-nav"/);
  assert.doesNotMatch(app,/header-lock-button/);
  for(const token of ['workspace-sidebar','mobile-bottom-nav','mobile-more-sheet','shell-sync-status'])assert.ok(shell.includes(token),token);
  for(const label of ["t('Home','الرئيسية')","t('Finance','المالية')","t('Business','الأعمال')","t('More','المزيد')"])assert.ok(shell.includes(label),label);
  assert.match(home,/New Quotation/);
  assert.match(home,/New Invoice/);
});

test('batch 1 mobile navigation keeps five clear slots with a central create action',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const css=await read('src/styles/app-shell-v161.css');
  assert.match(shell,/className="mobile-bottom-nav"/);
  assert.match(shell,/className="mobile-create-button"/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/min-height:calc\(58px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css,/bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
});

test('batch 1 shell is last application layer while printable document redesign remains final',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const shell='./styles/app-shell-v161.css';
  const document='./styles/document-premium-redesign-v141.css';
  assert.ok(html.includes(shell));
  assert.ok(html.indexOf(shell)<html.indexOf(document));
  assert.ok(sw.includes(shell));
  assert.ok(sw.includes('./src/components/AppShell.js'));
  assert.ok(sw.includes('./src/components/WorkspaceHome.js'));
});
