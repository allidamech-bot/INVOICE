import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('production build collapses local stylesheet requests into one ordered bundle',async()=>{
  const [sourceHtml,distHtml,bundle]=await Promise.all([
    read('index.html'),
    read('dist/index.html'),
    read('dist/styles/app.bundle.css')
  ]);
  const sourceStyles=[...sourceHtml.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  const distStyles=[...distHtml.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.ok(sourceStyles.length>30);
  assert.deepEqual(distStyles,['app.bundle.css']);
  let previous=-1;
  for(const name of sourceStyles){
    const marker=`/* --- ${name} --- */`;
    const index=bundle.indexOf(marker);
    assert.ok(index>previous,`${name} must retain its source cascade order in app.bundle.css`);
    previous=index;
  }
});

test('production service worker caches the bundle instead of every source stylesheet',async()=>{
  const [sourceSw,distSw]=await Promise.all([read('public/sw.js'),read('dist/sw.js')]);
  assert.match(sourceSw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(distSw,/\.\/styles\/app\.bundle\.css/);
  assert.doesNotMatch(distSw,/\.\/styles\/app\.css/);
  assert.doesNotMatch(distSw,/\.\/styles\/performance-polish-v100\.css/);
});

test('production bundle keeps print and responsive rules rather than rebuilding CSS semantics',async()=>{
  const bundle=await read('dist/styles/app.bundle.css');
  assert.match(bundle,/@media print/);
  assert.match(bundle,/@media \(max-width:720px\)/);
  assert.match(bundle,/\.invoice-page/);
  assert.match(bundle,/performance-polish-v100\.css/);
});

test('web font request only loads the fonts actually used by the current interface and Arabic documents',async()=>{
  const html=await read('index.html');
  assert.match(html,/family=Inter:wght@400;500;600;700;800/);
  assert.match(html,/family=Noto\+Sans\+Arabic:wght@400;500;600;700;800;900/);
  for(const unused of ['Montserrat','Playfair+Display','Cairo','Tajawal','Noto+Kufi+Arabic','Noto+Naskh+Arabic']){
    assert.doesNotMatch(html,new RegExp(unused.replace(/\+/g,'\\+')));
  }
});
