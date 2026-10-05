import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const localStyles=html=>[...html.matchAll(/href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"/g)].map(match=>match[1]);

test('production build keeps the current bundle plus ordered standalone runtime owners',async()=>{
  const [sourceHtml,distHtml,bundle]=await Promise.all([
    read('index.html'),
    read('dist/index.html'),
    read('dist/styles/app.bundle.css')
  ]);
  const sourceStyles=localStyles(sourceHtml);
  const distStyles=localStyles(distHtml);
  assert.ok(sourceStyles.length>30);
  assert.deepEqual(distStyles,['app.bundle.css','v331-draft-scroll-recovery.css','v332-critical-documents-deep-closeout.css','v482-mobile-ux-repair.css']);
  assert.match(distHtml,/v331-draft-scroll-recovery\.css\?v=365-1/);
  assert.match(distHtml,/data-lourex-v331-draft-recovery="true"/);
  assert.match(distHtml,/v332-critical-documents-deep-closeout\.css\?v=332-1/);
  assert.match(distHtml,/data-lourex-v332-critical-documents="true"/);
  assert.match(distHtml,/v482-mobile-ux-repair\.css\?v=482/);
  assert.match(distHtml,/data-lourex-v482-mobile-ux="true"/);
  assert.ok(distHtml.indexOf('app.bundle.css')<distHtml.indexOf('v331-draft-scroll-recovery.css'));
  assert.ok(distHtml.indexOf('v331-draft-scroll-recovery.css')<distHtml.indexOf('v332-critical-documents-deep-closeout.css'));
  assert.ok(distHtml.indexOf('v332-critical-documents-deep-closeout.css')<distHtml.indexOf('v482-mobile-ux-repair.css'));
  let previous=-1;
  for(const name of sourceStyles){
    const marker=`/* --- ${name} --- */`;
    const index=bundle.indexOf(marker);
    assert.ok(index>previous,`${name} must retain its source cascade order in app.bundle.css`);
    previous=index;
  }
});

test('production service worker caches the bundle and every explicit standalone runtime owner',async()=>{
  const [sourceSw,distSw]=await Promise.all([read('public/sw.js'),read('dist/sw.js')]);
  assert.match(sourceSw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v\d+'/);
  assert.match(distSw,/\.\/styles\/app\.bundle\.css/);
  assert.match(distSw,/\.\/styles\/v331-draft-scroll-recovery\.css\?v=365-1/);
  assert.match(distSw,/\.\/styles\/v332-critical-documents-deep-closeout\.css\?v=332-1/);
  assert.match(distSw,/\.\/styles\/v482-mobile-ux-repair\.css\?v=482/);
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

test('web font request covers every font exposed by document design controls',async()=>{
  const html=await read('index.html');
  const families=[
    'Cairo','Inter','Montserrat','Noto\\+Kufi\\+Arabic','Noto\\+Naskh\\+Arabic',
    'Noto\\+Sans\\+Arabic','Outfit','Playfair\\+Display','Source\\+Sans\\+3','Tajawal'
  ];
  for(const family of families)assert.match(html,new RegExp(`family=${family}:wght@`),`${family} must be loaded by the document font selector`);
  assert.match(html,/family=Inter:wght@400;500;600;700;800/);
  assert.match(html,/family=Noto\+Kufi\+Arabic:wght@400;500;600;700;800;900/);
  assert.match(html,/family=Noto\+Naskh\+Arabic:wght@400;500;600;700/);
  assert.match(html,/family=Source\+Sans\+3:wght@400;500;600;700;800/);
});
