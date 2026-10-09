import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('batch 7 defines one canonical application token vocabulary',async()=>{
  const css=await read('src/styles/design-system-v164.css');
  for(const token of [
    '--ds-navy-900','--ds-gold-500','--ds-ivory-100','--ds-surface','--ds-text',
    '--ds-muted','--ds-line','--ds-success','--ds-warning','--ds-danger',
    '--ds-space-1','--ds-space-7','--ds-radius-control','--ds-radius-card','--ds-focus'
  ])assert.ok(css.includes(token),`${token} must exist`);
  assert.match(css,/--shell-navy:var\(--ds-navy-900\)/);
  assert.match(css,/--ux-navy:var\(--ds-navy-900\)/);
  assert.match(css,/--editor-ink:var\(--ds-text\)/);
});

test('batch 7 standardizes accessible controls, numbers and RTL without touching document output',async()=>{
  const css=await read('src/styles/design-system-v164.css');
  assert.match(css,/:focus-visible/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-variant-numeric:tabular-nums lining-nums/);
  assert.match(css,/html\[dir='rtl'\] \.app-ui/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/\.invoice-page\b/);
  assert.doesNotMatch(css,/\.items-table\b/);
});

test('current runtime owns semantic app styling and retires superseded mobile sheets',async()=>{
  const html=await read('index.html');
  const shell=html.indexOf('tailadmin-shell-v320.css');
  const documents=html.indexOf('tailadmin-documents-v320.css');
  const foundation=html.indexOf('tailadmin-design-closeout-v323.css');
  assert.ok(shell>=0&&documents>shell&&foundation>documents,'current app cascade must retain ordered shell, documents and design owners');
  for(const retired of ['design-system-v164.css','mobile-document-actions-v122.css','mobile-document-actions-v123.css','mobile-document-actions-v124.css']){
    assert.equal(html.includes(retired),false,`${retired} must not return to the active cascade`);
  }
  assert.match(html,/mobile-document-actions-v125\\.css/);
});

test('current mobile document portal is mounted on body with accessible close and safe-area rules',async()=>{
  const [page,css,legacy]=await Promise.all([
    read('src/components/DocumentsPage.tsx'),
    read('src/styles/tailadmin-documents-v320.css'),
    read('src/styles/mobile-document-actions-v125.css')
  ]);
  assert.match(page,/ReactDOM\\.createPortal\\(<div className="app-ui ta-doc-mobile-action-portal"/);
  assert.match(page,/ta-doc-mobile-action-sheet" role="menu"/);
  assert.match(page,/ta-doc-action-backdrop" aria-label=/);
  assert.match(page,/,document\\.body\\)/);
  assert.match(css,/\\.ta-doc-mobile-action-portal/);
  assert.match(css,/\\.ta-doc-mobile-action-sheet/);
  assert.match(css,/env\\(safe-area-inset-bottom/);
  assert.doesNotMatch(legacy,/\\.mobile-document-action-portal\\s*\\{/,'retired v125 stub must not reclaim portal geometry');
});
