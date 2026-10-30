import test from 'node:test';
import assert from 'node:assert/strict';
import {exactPdfTextQuote} from '../dist/src/lib/ai-pdf-offline-quote.js';
import {analyzeConversationAttachment} from '../dist/src/lib/ai-conversation-attachments.js';
import {fileProgressLabel} from '../dist/src/lib/ai-file-progress.js';

const pdfRows=[
  'Page 1',
  'SKU | Description | Quantity | Unit | Unit Price | Currency',
  'CT-1 | Dark chocolate | 6 | CTN | | USD',
  'CT-2 | Biscuits | 3 | CTN | 30 | USD'
].join('\n');

test('PDF named columns with missing prices preserve all rows locally without inventing a price',()=>{
  const result=exactPdfTextQuote(pdfRows);
  assert.ok(result);
  assert.equal(result.sourceRowCount,2);
  assert.deepEqual(result.items.map(row=>[row.sku,row.quantity,row.unit,row.unitPrice]),[
    ['CT-1','6','CTN',''],['CT-2','3','CTN','30']]);
  assert.equal(result.currency,'USD');
});

test('PDF local table refuses incomplete or competing data rather than silently dropping rows',()=>{
  assert.equal(exactPdfTextQuote(pdfRows+'\nUnrecognized product in footer'),null);
  assert.equal(exactPdfTextQuote('Page 1\nA scanned image without selectable text'),null);
  assert.throws(()=>exactPdfTextQuote('Description | Quantity | Unit\nChocolate | 1 | CTN\nBiscuits | BAD | CTN'),/SOURCE_INCOMPLETE/);
});

function file(text='SKU CT-1 quantity 6 CTN, prices not supplied'){
  return {name:'Ali source.txt',type:'text/plain',size:text.length,text:async()=>text};
}
async function withNetwork(route,run){
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalFirebase=globalThis.firebase;
  const calls=[];
  globalThis.firebase={apps:[{}],auth:()=>({currentUser:{uid:'qa-user',getIdToken:async()=> 'fixture-token'}})};
  globalThis.window={setTimeout,clearTimeout};
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push([url,body.mode||'extract']);
    return route(url,body);
  };
  try{return await run(calls);}finally{
    globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.firebase=originalFirebase;
  }
}
const unavailable=()=>({ok:false,status:503,json:async()=>({code:'AI_TEMPORARILY_UNAVAILABLE',message:'Unavailable'})});

test('classification provider outage keeps local text and avoids a second expensive failed provider call',async()=>{
  await withNetwork(()=>unavailable(),async calls=>{
    const text='SKU CT-1 quantity 6 CTN; prices not supplied';
    const phases=[];
    const result=await analyzeConversationAttachment(file(text),undefined,phase=>phases.push(phase),{mode:'controller'});
    assert.equal(result.source.extracted,text);
    assert.equal(result.source.route,'unknown');
    assert.equal(result.source.documentType,'original-text');
    assert.equal(result.source.confidence,0);
    assert.ok(!result.source.quoteSheetCandidate,'unstructured content cannot become a commercial draft');
    assert.deepEqual(calls,[['/api/ai-inbox','extract']]);
    assert.deepEqual(phases,['reading','classifying','extracting','complete']);
    const chip=fileProgressLabel([{id:'1',status:'done',source:result.source}],{id:'1',status:'done',source:result.source},true);
    assert.match(chip,/محليًا/);assert.match(chip,/تعذّر تحليل AI/);
  });
});

test('known quote route and both extraction providers unavailable still keep read-only original text, no draft',async()=>{
  await withNetwork((url,body)=>{
    if(url==='/api/ai-inbox'&&body.mode!=='source-summary')
      return{ok:true,status:200,json:async()=>({classification:{route:'quote_request',documentType:'customer_rfq',confidence:0.9,reason:'rfq'}})};
    return unavailable();
  },async calls=>{
    const result=await analyzeConversationAttachment(file(),undefined,undefined,{mode:'controller'});
    assert.equal(result.source.documentType,'original-text');
    assert.equal(result.source.route,'unknown');
    assert.equal(result.source.extracted,'SKU CT-1 quantity 6 CTN, prices not supplied');
    assert.deepEqual(calls.map(row=>row[0]),['/api/ai-inbox','/api/quote-source-ai','/api/ai-inbox']);
  });
});

test('unknown route summary outage preserves read-only original text without pretending extraction succeeded',async()=>{
  await withNetwork((url,body)=>body.mode==='source-summary'?unavailable():
   {ok:true,status:200,json:async()=>({classification:{route:'unknown',documentType:'unknown',confidence:0.7,reason:'ambiguous'}})},async calls=>{
    const result=await analyzeConversationAttachment(file(),undefined,undefined,{mode:'controller'});
    assert.equal(result.source.documentType,'original-text');
    assert.equal(result.source.route,'unknown');
    assert.equal(calls.length,2);
  });
});

test('oversized original text never becomes a misleading truncated review or draft',async()=>{
  await withNetwork(()=>unavailable(),async()=>{
    const original='A'.repeat(13000);
    await assert.rejects(analyzeConversationAttachment(file(original),undefined,undefined,{mode:'controller'}),/SOURCE_INCOMPLETE/);
  });
});

test('inbox-local 429 preserves complete readable file source without inventing a draft',async()=>{
 const localQuota=()=>({ok:false,status:429,json:async()=>({code:'AI_INBOX_RATE_LIMITED'})});
 await withNetwork(()=>localQuota(),async calls=>{
   const result=await analyzeConversationAttachment(file(),undefined,undefined,{mode:'controller'});
   assert.equal(result.source.documentType,'original-text');
   assert.equal(result.source.route,'unknown');
   assert.equal(result.source.confidence,0);
   assert.equal(result.source.extracted,'SKU CT-1 quantity 6 CTN, prices not supplied');
   assert.equal(result.source.quoteSheetCandidate,undefined);
   assert.equal(calls.length,1,'No additional model call after gateway throttling');
 });
});

test('quotation source local throttle preserves text after failed specific extraction',async()=>{
 await withNetwork((url,body)=>{
   if(url==='/api/ai-inbox'&&body.mode!=='source-summary')
     return{ok:true,status:200,json:async()=>({classification:{route:'quote_request',documentType:'customer_rfq',confidence:0.9,reason:'RFQ'}})};
   if(url==='/api/quote-source-ai')
     return{ok:false,status:429,json:async()=>({code:'AI_QUOTE_RATE_LIMITED'})};
   return{ok:false,status:503,json:async()=>({code:'AI_TEMPORARILY_UNAVAILABLE'})};
 },async calls=>{
   const result=await analyzeConversationAttachment(file(),undefined,undefined,{mode:'controller'});
   assert.equal(result.source.route,'unknown');
   assert.equal(result.source.documentType,'original-text');
   assert.equal(result.source.quoteSheetCandidate,undefined);
   assert.equal(calls.length,3);
 });
});
