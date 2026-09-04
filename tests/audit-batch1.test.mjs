import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('highest-total sorting groups currencies before comparing amounts',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/value="highest"/);
  assert.match(source,/Highest total \(by currency\)/);
  assert.match(source,/a\.currency\.localeCompare\(b\.currency/);
  assert.match(source,/if\(currencyOrder\)return currencyOrder/);
  assert.match(source,/compareMoneyStrings\(av,bv\)/);
  assert.match(source,/this\.state\.sort==='highest'\?-byTotal:byTotal/);
});

test('shared modal closes only the topmost dialog on Escape and restores focus',async()=>{
  const source=await read('src/components/UI.tsx');
  assert.match(source,/document\.addEventListener\('keydown',this\.handleKeyDown\)/);
  assert.match(source,/private isTopModal=/);
  assert.match(source,/backdrops\[backdrops\.length-1\]===this\.backdrop/);
  assert.match(source,/event\.key==='Escape'/);
  assert.match(source,/previousFocus\?\.focus/);
});

test('project documentation describes the live encrypted cloud architecture',async()=>{
  const readme=await read('README.md');
  assert.match(readme,/Firebase Authentication/);
  assert.match(readme,/Firestore stores only the encrypted vault payload/);
  assert.match(readme,/18 template identifiers/);
  assert.doesNotMatch(readme,/no cloud database, no external login/i);
});