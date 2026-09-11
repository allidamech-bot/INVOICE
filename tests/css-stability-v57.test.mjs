import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('every local stylesheet loaded by the app exists and is available offline',async()=>{
  const [html,sourceSw,distSw,bundle]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('dist/sw.js'),read('dist/styles/app.bundle.css')
  ]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.ok(styles.length>=10,'expected the application stylesheet stack');
  assert.equal(new Set(styles).size,styles.length,'stylesheet links must not be duplicated');
  let previous=-1;
  for(const style of styles){
    await access(`src/styles/${style}`);
    const marker=`/* --- ${style} --- */`;
    const bundledAt=bundle.indexOf(marker);
    assert.ok(bundledAt>previous,`production bundle must contain styles/${style} in source order`);
    previous=bundledAt;
  }
  assert.ok(sourceSw.includes('./styles/app.css'),'source worker must retain a stylesheet cache path for local/dev compatibility');
  assert.ok(distSw.includes('./styles/app.bundle.css'),'production worker must cache the consolidated stylesheet bundle');
});

test('final editor layer stays isolated from printable document internals',async()=>{
  const [html,css]=await Promise.all([read('index.html'),read('src/styles/editor-system.css')]);
  assert.ok(html.indexOf('editor-system.css')>html.indexOf('document.css'));
  assert.ok(html.indexOf('editor-system.css')>html.indexOf('templates-modern.css'));
  assert.ok(html.indexOf('editor-system.css')>html.indexOf('templates-dark.css'));
  assert.doesNotMatch(css,/\.a4[-_]|\.document-page|\.invoice-page/i);
  assert.match(css,/\.app-ui \.editor-screen/);
});

test('v57 consolidation removes the superseded final override files from runtime references',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  for(const legacy of ['mobile-editor-fixes.css','editor-premium-v56.css']){
    assert.doesNotMatch(html,new RegExp(legacy.replace('.','\\.')));
    assert.doesNotMatch(sw,new RegExp(legacy.replace('.','\\.')));
  }
  assert.match(sw,/lourex-invoice-v\d+/);
});
