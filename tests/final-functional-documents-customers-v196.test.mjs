import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v196 Documents preserves the real quotation conversion promise until invoice creation settles',async()=>{
  const [app,page]=await Promise.all([read('src/app/App.tsx'),read('src/components/DocumentsPage.tsx')]);
  const start=app.indexOf("{this.state.screen==='documents'?<DocumentsPage");
  const end=app.indexOf("{this.state.screen==='customers'?<CustomersPage",start);
  assert.ok(start>=0&&end>start,'DocumentsPage render block is missing');
  const documentsRender=app.slice(start,end);
  assert.match(documentsRender,/onConvert=\{this\.convert\}/);
  assert.doesNotMatch(documentsRender,/onConvert=\{\(d\)=>void this\.convert\(d\)\}/);
  assert.match(page,/private quoteConversions=new Set<string>\(\)/);
  assert.match(page,/if\(this\.quoteConversions\.has\(doc\.id\)\)return/);
  assert.match(page,/Promise\.resolve\(this\.props\.onConvert\?\.\(doc\)\)\.finally\(\(\)=>this\.quoteConversions\.delete\(doc\.id\)\)/);
});

test('v196 browser gate double-clicks customer Quote and Invoice actions in English and Arabic',async()=>{
  const [ci,runner]=await Promise.all([read('.github/workflows/ci.yml'),read('tests/visual/run-functional-customers-v196.cjs')]);
  assert.match(ci,/node tests\/visual\/run-functional-customers-v196\.cjs/);
  assert.match(runner,/button\.click\(\);button\.click\(\)/);
  assert.match(runner,/list quote action must be single-flight/);
  assert.match(runner,/profile invoice action must be single-flight/);
  assert.match(runner,/runLanguage\(browser,'en'\)/);
  assert.match(runner,/runLanguage\(browser,'ar'\)/);
});