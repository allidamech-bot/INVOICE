import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanRequest} from '../api/ai-conversation-v3.js';

const source=index=>({id:String(index),fileName:'file-'+index+'.pdf',route:'quote_request',documentType:'customer_rfq',confidence:0.9,extracted:'Product '+index});
const payload=sources=>({message:'Compare all attached files',context:{screen:'documents',language:'en',conversationSources:sources}});

test('Advisor source context accepts ten complete documents without dropping rows',()=>{
  const data=cleanRequest(payload([1,2,3,4,5,6,7,8,9,10].map(source)));
  assert.ok(data);
  assert.equal(data.sources.length,10);
  assert.deepEqual(data.sources.map(row=>row.fileName),['file-1.pdf','file-2.pdf','file-3.pdf','file-4.pdf','file-5.pdf','file-6.pdf','file-7.pdf','file-8.pdf','file-9.pdf','file-10.pdf']);
});

test('Advisor source context rejects 11-file overflow rather than dropping the last document',()=>{
  assert.equal(cleanRequest(payload([1,2,3,4,5,6,7,8,9,10,11].map(source))),null);
  assert.equal(cleanRequest(payload([])),null);
});

test('Advisor source context rejects oversized or invalid sources rather than dropping facts',()=>{
  assert.equal(cleanRequest(payload([{...source(1),extracted:'x'.repeat(12001)}])),null);
  assert.equal(cleanRequest(payload([source(1),{...source(2),route:'not_supported'}])),null);
  assert.equal(cleanRequest(payload([source(1),null])),null);
});
