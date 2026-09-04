import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('documents workspace exposes direct quote and invoice creation without removing search/filter workflow',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  assert.match(page,/New Quote/);
  assert.match(page,/New Invoice/);
  assert.match(page,/onNew\('proforma'\)/);
  assert.match(page,/onNew\('invoice'\)/);
  assert.match(page,/Number, customer, phone, email/);
  assert.match(page,/Highest total/);
  assert.match(page,/itemCountLabel/);
});

test('current service worker ships the template and workspace changes to installed devices',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/src\/components\/DocumentsPage\.js/);
  assert.match(sw,/src\/templates\/TemplateThumbnails\.js/);
  assert.match(sw,/styles\/template-preferences\.css/);
});
