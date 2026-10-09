import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('documents workspace exposes one-tap resume for the latest unfinished document',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/filter\(doc=>doc\.status!=='final'\)/);
  assert.match(source,/sort\(\(a,b\)=>b\.updatedAt\.localeCompare\(a\.updatedAt\)\)/);
  assert.match(source,/Continue where you left off/);
  assert.match(source,/onClick=\{\(\)=>this\.props\.onOpen\(resume\)\}/);
  assert.match(source,/Ready to issue/);
  assert.match(source,/Continue editing/);
});

test('summary and document-type tabs remain truthful, scope-safe one-click filters',async()=>{
 const source=await read('src/components/DocumentsPage.tsx');
 assert.match(source,/private setOverview=.*payment:'all',currency:'all',query:''/);
 assert.match(source,/private overviewActive=.*payment==='all'.*currency==='all'.*!this\.state\.query\.trim\(\)/);
 for(const token of [
  "this.typeTab('proforma',","this.typeTab('invoice',","this.typeTab('credit',",
  "this.setOverview('all','draft')","this.setOverview('all','final')",
  "this.overviewActive('all','all')"
 ])assert.ok(source.includes(token),token);
 assert.match(source,/private typeCount=\(kind:DocumentKind\)=>this\.props\.documents\.filter\(doc=>doc\.kind===kind&&doc\.role==='standard'\)\.length/);
 assert.match(source,/this\.props\.documents\.filter\(doc=>doc\.role==='credit-note'\)\.length/);
 assert.match(source,/aria-pressed=\{active\}/);
 assert.ok(source.includes("t('Credit Note','إشعار دائن')"));
 assert.doesNotMatch(source,/const invoices=this\.props\.documents\.filter\(doc=>doc\.kind==='invoice'\)\.length/,'credit notes must not count as standard invoices');
});

test('empty filtered workspace provides a direct reset action',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/private clearFilters=/);
  assert.match(source,/Clear filters/);
  assert.match(source,/مسح التصفية/);
  assert.match(source,/icon="refresh"/);
});

test('workflow styling keeps the resume card and overview filters touch-friendly and responsive',async()=>{
  const css=await read('src/styles/workflow-premium.css');
  assert.match(css,/\.resume-document-card\{/);
  assert.match(css,/grid-template-columns:auto minmax\(0,1fr\) auto/);
  assert.match(css,/\.documents-overview>button\{/);
  assert.match(css,/\.documents-overview>button\.active/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.resume-document-card\{grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css,/\.documents-overview>button\{padding:11px 12px;border-radius:14px;min-height:58px\}/);
});

test('v60 workspace assets remain present in the current PWA release',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/DocumentsPage.js'));
  assert.ok(sw.includes('./styles/workflow-premium.css'));
});
