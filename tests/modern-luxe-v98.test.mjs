import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v98 Modern Luxe layer loads last and ships in the PWA shell',async()=>{
  const [html,sw,manifest]=await Promise.all([read('index.html'),read('public/sw.js'),read('public/manifest.webmanifest')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'modern-luxe-v98.css');
  assert.match(html,/name="theme-color" content="#0d0f11"/);
  assert.match(sw,/lourex-invoice-v98/);
  assert.match(sw,/\.\/styles\/modern-luxe-v98\.css/);
  assert.match(manifest,/"background_color": "#0d0f11"/);
  assert.match(manifest,/"theme_color": "#0d0f11"/);
});

test('v98 uses a flat neutral financial workspace with restrained accents',async()=>{
  const css=await read('src/styles/modern-luxe-v98.css');
  assert.match(css,/--lx-bg:#0d0f11/);
  assert.match(css,/--lx-card:#16191d/);
  assert.match(css,/--lx-blue:#6ea2ff/);
  assert.match(css,/--lx-gold:#d8b46a/);
  assert.match(css,/--lx-green:#65c18c/);
  assert.match(css,/\.document-card,.app-ui \.premium-document-card\{[\s\S]*?background:#14171b!important/);
  assert.match(css,/\.documents-toolbar,.app-ui \.list-toolbar,.app-ui \.customers-toolbar\{[\s\S]*?background:transparent!important/);
  assert.match(css,/\.documents-overview>button\{[\s\S]*?background:var\(--lx-card\)!important/);
  assert.doesNotMatch(css,/\.document-card\.document-proforma[\s\S]{0,240}linear-gradient/);
  assert.doesNotMatch(css,/\.document-card\.document-invoice[\s\S]{0,240}linear-gradient/);
});

test('v98 covers app, auth, modal, settings and editor chrome consistently',async()=>{
  const css=await read('src/styles/modern-luxe-v98.css');
  for(const selector of ['.app-ui .app-header','.app-ui .modal{','.app-ui .settings-tabs{','.app-ui .editor-section{','.auth-page{','.auth-card,.welcome-card,.account-first-card{','.logo-touch-editor-sheet{']){
    assert.match(css,new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.documents-overview>button:first-child\{grid-column:1\/-1/);
});

test('v98 stays isolated from printable document and A4 selectors',async()=>{
  const css=await read('src/styles/modern-luxe-v98.css');
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
  assert.match(css,/Printable document output is not themed here/);
});
