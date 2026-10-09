import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('highest and lowest document totals sort within currencies instead of comparing currencies',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/value="highest"/);
  assert.match(source,/value="lowest"/);
  const marker='}).sort((a,b)=>{';
  const start=source.indexOf(marker);
  const end=source.indexOf('\n    });',start+marker.length);
  assert.ok(start>=0&&end>start,'use the actual document comparator');
  const body=source.slice(start+marker.length,end);
  const evaluate=new Function('a','b','calculateTotals','compareMoneyStrings','return (function(){'+body+'}).call(this);');
  const totals=items=>({grandTotal:items[0].amount});
  const money=(a,b)=>Math.sign(Number(a)-Number(b));
  const doc=(currency,amount,updatedAt)=>({currency,items:[{amount}],adjustments:{},updatedAt});
  const compare=(mode,a,b)=>evaluate.call({state:{sort:mode}},a,b,totals,money);
  const low=doc('USD','10.00','2026-10-03');
  const high=doc('USD','120.00','2026-10-02');
  const euro=doc('EUR','1.00','2026-10-01');
  assert.ok(compare('highest',high,low)<0,'higher USD amount must come first');
  assert.ok(compare('highest',low,high)>0,'lower USD amount must come later');
  assert.ok(compare('lowest',low,high)<0,'lower USD amount must come first');
  assert.ok(compare('highest',euro,high)<0,'EUR group precedes USD without comparing their totals');
  assert.ok(compare('lowest',euro,high)<0,'cross-currency grouping persists for low sort');
  assert.ok(compare('latest',low,high)<0,'latest timestamps remain deterministic');
  assert.ok(compare('oldest',low,high)>0,'oldest sort remains distinct');
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