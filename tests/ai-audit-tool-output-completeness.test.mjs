import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAiToolAnswer} from '../dist/src/lib/ai-tool-client.js';

const reply=(data,language='en')=>formatAiToolAnswer(
  {version:1,goal:'Synthetic, read-only result',calls:[]},
  [{id:'qa-result',tool:'inventory.getStatus',class:'read',ok:true,data,summary:'',source:'synthetic'}],
  language,
);

test('AI audit: results with over 50 rows disclose the exact missing count in both languages',()=>{
  const rows=Array.from({length:75},(_,i)=>({name:'QA-'+String(i+1).padStart(3,'0'),quantity:i}));
  const en=reply(rows),ar=reply(rows,'ar');
  assert.match(en,/75 total records; only the first 50 were prepared, with 25 more not shown/);
  assert.match(ar,/75 سجلًا بالمجموع/);
  assert.match(ar,/25 سجلًا غير معروض/);
  assert.match(en,/QA-050/);
  assert.doesNotMatch(en,/QA-051/);
  assert.ok(en.length<=5000&&ar.length<=5000);
});

test('AI audit: final response length never cuts off without a visible partial-answer warning',()=>{
  const rows=Array.from({length:50},(_,i)=>({name:'QA-'+String(i+1),detail:'a'.repeat(300)}));
  const en=reply(rows),ar=reply(rows,'ar');
  assert.ok(en.length<=5000&&ar.length<=5000);
  assert.match(en,/This is a partial answer; additional results are not shown/);
  assert.match(ar,/هذا عرض مختصر فقط؛ توجد نتائج إضافية لم تُعرض/);
  assert.ok(en.includes('QA-1'));
});

test('AI audit: truncated upstream JSON is not exposed as verified evidence',()=>{
  const data={truncated:true,preview:'\\\"secret\\\":\\\"PARTIAL-UNVERIFIED\\\"'};
  const en=reply(data),ar=reply(data,'ar');
  assert.match(en,/tool result is incomplete/);
  assert.match(ar,/نتيجة الأداة غير مكتملة/);
  assert.doesNotMatch(en,/PARTIAL-UNVERIFIED/);
  assert.doesNotMatch(ar,/PARTIAL-UNVERIFIED/);
});

test('AI audit: incomplete evidence and omitted object fields are signposted',()=>{
  const fields=Object.fromEntries(Array.from({length:29},(_,i)=>['key'+i,String(i)]));
  assert.match(reply(fields),/1 additional fields are not shown/);
  const result=reply({total:75,shown:30,incomplete:true,rows:[{name:'QA-stock',quantity:0}]});
  assert.match(result,/source marks this result incomplete/);
  assert.match(result,/QA-stock/);
});

test('AI audit: small complete results preserve their values without false warnings',()=>{
  const en=reply([{name:'Known stock',quantity:0,unit:'CTN'}]);
  assert.match(en,/Known stock/);
  assert.match(en,/quantity: 0/);
  assert.doesNotMatch(en,/partial answer|Partial result|incomplete/i);
});
