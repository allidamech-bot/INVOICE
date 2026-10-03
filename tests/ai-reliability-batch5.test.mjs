import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {explicitQuoteSource,includesExplicitSourceCodes} from '../api/_ai/source-lines.js';
import {explicitSourceDecimal,normalizeSourceNumber} from '../api/_ai/numbers.js';
import {routeAiStructured} from '../api/_ai/router.js';
import quoteHandler from '../api/quote-source-ai.js';
import productHandler from '../api/product-source-ai.js';
import supplierHandler from '../api/supplier-document-ai.js';

test('local explicit tables preserve repeated SKU rows, Arabic/Persian numbers and money without provider calls',()=>{
 const text='Customer: Northstar\nSKU | Description | Quantity | Unit | Unit Price | Currency\nAX-1 | Valve | ۲ | PCS | ١٢٫٥٠ | USD\nAX-1 | Spare valve | 3 | PCS | 10 | USD';
 const draft=explicitQuoteSource(text,normalizeSourceNumber);assert.equal(draft.items.length,2);assert.deepEqual(draft.items.map(row=>[row.sku,row.quantity,row.unitPrice]),[['AX-1','2','12.50'],['AX-1','3','10']]);assert.equal(draft.currency,'USD');
 assert.equal(includesExplicitSourceCodes(text,[draft.items[0]]),false);assert.equal(includesExplicitSourceCodes(text,draft.items),true);
});
test('ambiguous separators, zero quantity, mixed currency, malformed rows and oversized tables are never local complete success',()=>{
 assert.equal(explicitSourceDecimal('2,5'),'');assert.equal(explicitSourceDecimal('١٬٥'),'');assert.equal(explicitSourceDecimal('1,234.50'),'1234.50');assert.equal(explicitSourceDecimal('۱٬۲۳۴٫۵۰'),'1234.50');
 const header='SKU | Description | Quantity | Unit | Unit Price | Currency\n';
 for(const row of ['A-1 | Valve | 0 | PCS | 10 | USD','A-1 | Valve | 2,5 | PCS | 10 | USD','A-1 | Valve | 2 | | 10 | USD','A-1 | Valve | 2 | PCS | 10 |','A-1 | Valve | 2 | PCS | bad | USD','A-1 | Valve | 2 | PCS | 10 | USD\nB-1 | Valve | 3 | PCS | 10 | EUR','A-1 | Valve | 2 | PCS | 10 | USD\nB-1 | Valve | 3 | PCS | 10 |','A-1 | Valve | 2 | PCS | 10 | USD\nTRUNCATED'])assert.equal(explicitQuoteSource(header+row,normalizeSourceNumber),null,row);
 assert.equal(explicitQuoteSource(header+Array.from({length:81},(_,i)=>`P-${i} | Valve | 1 | PCS | 2 | USD`).join('\n'),normalizeSourceNumber),null);
});
test('duplicate quantity rows must survive extraction while incidental repeated references need not duplicate products',()=>{
 const rows='SKU A-1: Valve Qty 2 PCS\nSKU A-1: Spare Qty 3 PCS';assert.equal(includesExplicitSourceCodes(rows,[{sku:'A-1'}]),false);assert.equal(includesExplicitSourceCodes(rows,[{sku:'A-1'},{sku:'A-1'}]),true);
 assert.equal(includesExplicitSourceCodes('SKU A-1 Qty 2 PCS\nReference SKU A-1',[{sku:'A-1'}]),true);
 assert.equal(includesExplicitSourceCodes('SKU Description Quantity Price',[{sku:'A-1'}]),true,'column headings are not product codes');
});

const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,originalEnv={...process.env};
function restore(){globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
test.afterEach(restore);
test('provider timeout includes an unfinished response body and safely falls back',async()=>{
 process.env.GROQ_API_KEY='fixture';process.env.CLOUDFLARE_AI_API_TOKEN='fixture';process.env.CLOUDFLARE_ACCOUNT_ID='fixture';
 globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,Math.min(ms,5),...args);const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push(String(url));return{ok:true,headers:new Headers(),text:()=>String(url).includes('api.groq.com')?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('fixture body aborted','AbortError')),{once:true})):Promise.resolve(JSON.stringify({choices:[{message:{content:'{"value":"fallback"}'}}]}))};};
 const result=await routeAiStructured({taskType:'workspace_help',prompt:'bounded fixture',schema:{type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']},timeoutMs:3000});assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.fallbackUsed,true);assert.equal(calls.length,2);
});
async function requestQuote(text,ip,handler=quoteHandler){const req=Readable.from([JSON.stringify({kind:'text',text})]);req.method='POST';req.headers={host:'invoice.example.test',origin:'https://invoice.example.test','x-requested-with':'LOUREX-Invoice','x-forwarded-for':ip};const res={setHeader(){},end(body){this.body=JSON.parse(body);}};await handler(req,res);return res;}
test('the real API parses a complete table locally and returns a review-only draft',async()=>{
 globalThis.fetch=()=>{throw new Error('local source must not call a provider');};const res=await requestQuote('SKU | Description | Qty | Unit\nA-1 | Valve | 2 | PCS','batch5-local');assert.equal(res.statusCode,200);assert.equal(res.body.draft.items[0].quantity,'2');assert.equal(res.body.draft.currency,'');assert.ok(!res.body.saved&&!res.body.documentId);
});
test('real extraction API rejects missing duplicate lines, zero quantity and malformed explicit price',async()=>{
 process.env.GROQ_API_KEY='fixture';delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;
 const item={sku:'A-1',descriptionEn:'Valve',descriptionAr:'',quantity:'2',unit:'PCS',unitPrice:'10',quantityConfidence:1,quantityAmbiguous:false,quantityNote:'Source line',productConfidence:1,productNote:'Source SKU'};
 const base={customerName:'',customerEmail:'',customerPhone:'',customerConfidence:0,customerNote:'',currency:'USD',incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:''};
 let index=0;
 for(const items of [[item],[item,{...item,quantity:'0'}],[item,{...item,unitPrice:'2,5'}],[item,null]]){
  globalThis.fetch=async()=>({ok:true,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({...base,items})}}]})});
  const res=await requestQuote('SKU A-1: Valve Qty 2 PCS\nSKU A-1: Spare Qty 3 PCS',`batch5-reject-${index++}`);assert.equal(res.statusCode,422);assert.ok(!res.body.draft&&!res.body.saved);
 }
});
test('quantity/product confidence participates in quality fallback; an absent customer is not a paid extra request',async()=>{
 process.env.GROQ_API_KEY='fixture';process.env.CLOUDFLARE_AI_API_TOKEN='fixture';process.env.CLOUDFLARE_ACCOUNT_ID='fixture';
 const schema={type:'OBJECT',properties:{quantityConfidence:{type:'NUMBER'},productConfidence:{type:'NUMBER'},customerConfidence:{type:'NUMBER'},customerName:{type:'STRING'}},required:['quantityConfidence','productConfidence','customerConfidence','customerName']};let calls=0;
 globalThis.fetch=async url=>{calls++;return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({quantityConfidence:String(url).includes('api.groq.com')?.2:1,productConfidence:1,customerConfidence:0,customerName:''})}}]})};};
 const result=await routeAiStructured({taskType:'quote_extract',prompt:'fixture',schema,qualityFallback:true});assert.equal(result.provider,'cloudflare');assert.equal(result.validation.lowConfidence,false);assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({quantityConfidence:1,productConfidence:1,customerConfidence:0,customerName:''})}}]})};};
 const noCustomer=await routeAiStructured({taskType:'quote_extract',prompt:'fixture',schema,qualityFallback:true});assert.equal(noCustomer.provider,'groq');assert.equal(calls,1);
});
test('supplier/product malformed explicit values cannot silently become blank successful proposals',async()=>{
 process.env.GROQ_API_KEY='fixture';delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;
 const blank=schema=>schema.type==='object'?Object.fromEntries(Object.entries(schema.properties).map(([key,child])=>[key,blank(child)])):schema.type==='array'?[]:schema.type==='number'?1:schema.type==='boolean'?false:'';
 let index=0;
 for(const [handler,patch,rootPatch] of [[supplierHandler,{quantity:'0'},{}],[supplierHandler,{quantity:'2',unitCost:'8'},{freight:'2,5'}],[productHandler,{salePrice:'2,5'},{}],[productHandler,{cartonQuantity:'0'},{}]]){
  globalThis.fetch=async(url,options)=>{const schema=JSON.parse(options.body).response_format.json_schema.schema;const payload=blank(schema);payload.items=[{...blank(schema.properties.items.items),sku:'A-1',descriptionEn:'Valve',quantity:'2',unitCost:'8',...patch}];for(const key of Object.keys(payload.items[0]))if(!schema.properties.items.items.properties[key])delete payload.items[0][key];Object.assign(payload,rootPatch);return{ok:true,headers:new Headers(),text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]})};};
  const res=await requestQuote('SKU A-1',`batch5-other-${index++}`,handler);assert.equal(res.statusCode,422);assert.ok(!res.body.draft&&!res.body.saved);
 }
});
test('client cancellation, body timeout and malformed responses clean up without returning success',async()=>{
 globalThis.window={setTimeout:(fn,ms)=>originalTimeout(fn,ms),clearTimeout};const {requestAiJson}=await import('../dist/src/lib/ai-request.js');
 globalThis.fetch=async()=>({ok:true,json:async()=>[]});await assert.rejects(requestAiJson('/fixture',{}),/unreadable/);
 globalThis.fetch=async(url,options)=>({ok:true,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))});
 await assert.rejects(requestAiJson('/fixture',{},undefined,5),/timed out/);
 const controller=new AbortController();const pending=requestAiJson('/fixture',{},controller.signal,1000);controller.abort();await assert.rejects(pending,error=>error.name==='AbortError');
 const stopped=new AbortController();stopped.abort();await assert.rejects(requestAiJson('/fixture',{},stopped.signal),error=>error.name==='AbortError');
});
