import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const expected=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('the final quotation redesign covers exactly the complete 18-template selector',async()=>{
  const [selector,v128,v129]=await Promise.all([
    read('src/templates/TemplateThumbnails.tsx'),
    read('src/styles/document-flagship-v128.css'),
    read('src/styles/document-template-system-v129.css')
  ]);
  const ids=[...selector.matchAll(/\{ id: '([^']+)'/g)].map(match=>match[1]);
  assert.deepEqual(ids,expected);
  const combined=v128+'\n'+v129;
  for(const id of ids)assert.match(combined,new RegExp(`template-${id}`),id);
});

test('final QA does not alter document data fields or editor/application chrome',async()=>{
  const qa=await read('src/styles/document-final-qa-v130.css');
  assert.doesNotMatch(qa,/input|textarea|select|\.editor-|\.documents-|\.settings-|\.customer-/);
  assert.match(qa,/\.invoice-page/);
  assert.match(qa,/\.template-preview-/);
});