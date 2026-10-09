import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeConversationAttachment} from '../dist/src/lib/ai-conversation-attachments.js';

function textFile(text='SKU A1, quantity 15, unit cost 2.50 USD'){
  return {name:'supplier-quote.txt',type:'text/plain',size:text.length,text:async()=>text};
}
async function withResponses(handler,run){
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalFirebase=globalThis.firebase;
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture-user',getIdToken:async()=> 'signed-test-token'}})};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async(url,options)=>({ok:true,json:async()=>handler(url,JSON.parse(options.body))});
  try{return await run();}
  finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.firebase=originalFirebase;}
}

test('B04: a text attachment reports real reading, classification and extraction stages in order',async()=>{
  const phases=[];
  await withResponses((_url,payload)=>payload.mode==='source-summary'
    ? {source:{summary:'Price list',facts:['SKU A1 15 cartons'],missing:[],warnings:[]}}
    : {classification:{route:'unknown',documentType:'price_list',confidence:0.82,reason:'line items'}},
  async()=>{
    const analysis=await analyzeConversationAttachment(textFile(),undefined,phase=>phases.push(phase));
    assert.equal(analysis.source.fileName,'supplier-quote.txt');
    assert.match(analysis.source.extracted,/Price list/);
  });
  assert.deepEqual(phases,['reading','classifying','extracting','complete']);
});

test('B04: alternate extraction is labeled as a fallback, not falsely shown as success',async()=>{
  const phases=[];
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalFirebase=globalThis.firebase;
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'fixture-user',getIdToken:async()=> 'signed-test-token'}})};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async(url,options)=>{
    const request=JSON.parse(options.body);
    if(url==='/api/ai-inbox'&&request.mode==='source-summary')
      return{ok:true,json:async()=>({source:{summary:'Fallback found text',facts:[],missing:[],warnings:[]}})};
    if(url==='/api/ai-inbox')return{ok:true,json:async()=>({classification:{route:'supplier_purchase',documentType:'supplier_quote',confidence:0.8,reason:'quote'}})};
    throw new Error('Supplier extractor temporarily unavailable');
  };
  try{
    const analysis=await analyzeConversationAttachment(textFile(),undefined,phase=>phases.push(phase));
    assert.deepEqual(phases,['reading','classifying','extracting','fallback','complete']);
    assert.match(analysis.source.reason,/general read-only source extraction was used/);
  }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.firebase=originalFirebase;}
});

test('B04: cancellation during local file reading never shows completion',async()=>{
  const controller=new AbortController(),phases=[];
  const file={...textFile(),text:async()=>{controller.abort();return 'not to be used';}};
  await assert.rejects(analyzeConversationAttachment(file,controller.signal,phase=>phases.push(phase)),/AbortError/);
  assert.deepEqual(phases,['reading']);
});

test('B04: UI shows per-file localized progress and review before saving',async()=>{
  const script=await readFile('scripts/ai-batch3-premium-conversation.mjs','utf8');
  assert.match(script,/__lourexAttachmentLabel\(status,phase\)/);
  assert.match(script,/Reading file…/);
  assert.match(script,/Identifying document…/);
  assert.match(script,/Extracting details…/);
  assert.match(script,/Trying alternate extraction…/);
  assert.match(script,/جارٍ استخراج البيانات/);
  assert.match(script,/Extraction ready · review before saving/);
  assert.match(script,/analyzeConversationAttachment\(row\.file,controller\.signal,phase=>/);
  assert.match(script,/__lourexAttachmentLabel\(row\.status,row\.phase\)/);
  assert.match(script,/status:'processing',phase:'reading'/);
});
