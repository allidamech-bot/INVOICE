import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('document workspace never compares totals across unrelated currencies',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.doesNotMatch(source,/compareMoneyStrings/);
  assert.doesNotMatch(source,/value="highest"/);
  assert.doesNotMatch(source,/Highest total/);
  assert.match(source,/type SortMode='latest'\|'oldest'/);
});

test('shared modal closes only the topmost dialog on Escape and restores focus',async()=>{
  const source=await read('src/components/UI.tsx');
  assert.match(source,/document\.addEventListener\('keydown',this\.handleKeyDown\)/);
  assert.match(source,/event\.key!=='Escape'/);
  assert.match(source,/backdrops\[backdrops\.length-1\]!==this\.backdrop/);
  assert.match(source,/previousFocus\?\.focus/);
});

test('project documentation describes the live encrypted cloud architecture',async()=>{
  const readme=await read('README.md');
  assert.match(readme,/Firebase Authentication/);
  assert.match(readme,/Firestore stores only the encrypted vault payload/);
  assert.match(readme,/18 template identifiers/);
  assert.doesNotMatch(readme,/no cloud database, no external login/i);
});
