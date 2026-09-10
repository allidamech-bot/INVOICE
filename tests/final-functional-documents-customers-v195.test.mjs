import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v195 Documents keeps quotation conversion single-flight until App conversion actually settles',async()=>{
  const [app,page]=await Promise.all([read('src/app/App.tsx'),read('src/components/DocumentsPage.tsx')]);
  assert.match(app,/this\.state\.screen==='documents'[\s\S]*?<DocumentsPage[\s\S]*?onConvert=\{this\.convert\}/);
  assert.doesNotMatch(app,/this\.state\.screen==='documents'[\s\S]*?onConvert=\{\(d\)=>void this\.convert\(d\)\}/);
  assert.match(page,/private quoteConversions=new Set<string>\(\)/);
  assert.match(page,/if\(this\.quoteConversions\.has\(doc\.id\)\)return/);
  assert.match(page,/Promise\.resolve\(this\.props\.onConvert\?\.\(doc\)\)\.finally\(\(\)=>this\.quoteConversions\.delete\(doc\.id\)\)/);
});

test('v195 payment mutations use immediate in-flight locks rather than render timing alone',async()=>{
  const panel=await read('src/components/InvoicePaymentsPanel.tsx');
  assert.match(panel,/private paymentSaveInFlight=false/);
  assert.match(panel,/private paymentDeletesInFlight=new Set<string>\(\)/);
  assert.match(panel,/if\(this\.paymentSaveInFlight\)return;[\s\S]*this\.paymentSaveInFlight=true/);
  assert.match(panel,/finally\{this\.paymentSaveInFlight=false;\}/);
  assert.match(panel,/if\(this\.paymentDeletesInFlight\.has\(payment\.id\)\)return/);
  assert.match(panel,/this\.paymentDeletesInFlight\.add\(payment\.id\)/);
  assert.match(panel,/this\.paymentDeletesInFlight\.delete\(payment\.id\)/);
});

test('v195 browser gate double-clicks payment save/delete in English and Arabic',async()=>{
  const [ci,runner]=await Promise.all([read('.github/workflows/ci.yml'),read('tests/visual/run-functional-payments-v195.cjs')]);
  assert.match(ci,/node tests\/visual\/run-functional-payments-v195\.cjs/);
  assert.match(runner,/button\.click\(\);button\.click\(\)/);
  assert.match(runner,/payment save must be single-flight/);
  assert.match(runner,/payment delete must be single-flight/);
  assert.match(runner,/runLanguage\(browser,'en'\)/);
  assert.match(runner,/runLanguage\(browser,'ar'\)/);
});
