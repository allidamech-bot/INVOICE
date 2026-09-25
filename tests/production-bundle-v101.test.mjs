import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const localStyles=html=>[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match=>match[1]);

test('production build collapses the source cascade into one bundle plus the standalone v337 runtime owner',async()=>{
  const [sourceHtml,distHtml,bundle]=await Promise.all([
    read('index.html'),
    read('dist/index.html'),
    read('dist/styles/app.bundle.css')
  ]);
  const sourceStyles=localStyles(sourceHtml);
  const distStyles=localStyles(distHtml);
  assert.ok(sourceStyles.length>30);
  assert.deepEqual(distStyles,['app.bundle.css','v331-draft-scroll-recovery.css']);
  assert.match(distHtml,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(distHtml,/data-lourex-v331-draft-recovery="true"/);
  let previous=-1;
  for(const name of sourceStyles){
    const marker=`/* --- ${name} --- */`;
    const index=bundle.indexOf(marker);
    assert.ok(index>previous,`${name} must retain its source cascade order in app.bundle.css`);
    previous=index;
  }
});

test('production service worker caches the bundle and the explicit v337 runtime owner instead of the full source stack',async()=>{
  const [sourceSw,distSw]=await Promise.all([read('public/sw.js'),read('dist/sw.js')]);
  assert.match(sourceSw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v\d+'/);
  assert.match(distSw,/\.\/styles\/app\.bundle\.css/);
  assert.match(distSw,/\.\/styles\/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(distSw,/\.\/styles\/v337-template-layout-balance\.css\?v=337-3/);
  assert.doesNotMatch(distSw,/\.\/styles\/app\.css["']/);
  assert.doesNotMatch(distSw,/\.\/styles\/performance-polish-v100\.css["']/);
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
