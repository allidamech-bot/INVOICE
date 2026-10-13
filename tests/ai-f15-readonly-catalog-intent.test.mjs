import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {summarizeReadOnlyProductSources} from '../dist/src/lib/ai-product-source-review.js';

const item=(sku,name,price='')=>({sku,descriptionEn:name,salePrice:price,saleCurrency:price?'USD':'',unit:'CTN'});
const file=(items,name='catalog.xlsx',confidence=.9)=>({
 fileName:name,route:'product_list',confidence,extracted:JSON.stringify({items})
});
const context=sources=>({conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},conversationSources:sources});
const ask=(message,sources,language='ar',vault=emptyVault())=>orchestrateAiToolRequest({message,vault,context:context(sources),language});

test('F15 analysis-only catalog creates no approval and no records in Arabic and English',async()=>{
 for(const [message,language] of [
  ['حلل الملف واعطني الأصناف','ar'],
  ['أعطني أسعار المنتجات من المرفق','ar'],
  ['Analyze this catalog only; do not register anything','en'],
  ['List every item and price from my file','en'],
 ]){
  const vault=emptyVault(),before=structuredClone(vault);
  const result=await ask(message,[file([item('RB-250','Red Bull 250 ml','26'),item('MON-500','Monster 500 ml')])],language,vault);
  assert.ok(result,message);
  assert.equal(result.proposal,null,message);
  assert.deepEqual(result.plan.calls,[],message);
  assert.equal(result.results.length,0);
  assert.match(result.answer,/Red Bull 250 ml/);
  assert.match(result.answer,/Monster 500 ml/);
  assert.deepEqual(vault,before,'no local product or invoice writes on analysis');
 }
});
test('F15 explicit registration still creates one reviewable approval but does not save',async()=>{
 const vault=emptyVault(),before=structuredClone(vault);
 const result=await ask('سجل جميع الأصناف من الملف',[file([item('A','Item A','7')])],'ar',vault);
 assert.equal(result.proposal?.tool,'product.importSource');
 assert.equal(result.proposal?.preview?.length,1);
 assert.deepEqual(vault,before);
});
test('F15 summaries are truthful about 120-row source and never claim omitted rows are displayed',async()=>{
 const items=Array.from({length:120},(_,i)=>item('SKU-'+i,'Product '+i,i===0?'7':''));
 const text=summarizeReadOnlyProductSources([file(items)],'en');
 assert.match(text,/Verified extracted rows: 120/);
 assert.match(text,/112 other rows are not displayed/);
 assert.match(text,/Product 0/);
 assert.doesNotMatch(text,/Product 119/);
 assert.match(text,/price not provided/);
 assert.doesNotMatch(text,/product registration was prepared/i);
});
test('F15 incomplete, untrusted or low-confidence extraction cannot become a fake successful preview',async()=>{
 const all=[
  {...file([item('A','Product A')]),confidence:.2},
  {...file([item('A','Product A')]),extracted:'{"items":['},
  {...file([item('A','Product A')]),extracted:JSON.stringify({items:[{sku:'A'}]})},
 ];
 for(const source of all){
  const result=await ask('حلل الملف فقط',[source]);
  assert.ok(result);
  assert.equal(result.proposal,null);
  assert.ok(result.answer);
  assert.doesNotMatch(result.answer,/Verified extracted rows:/);
 }
 const mixed=await ask('حلل هذين الملفين',[file([item('A','Product A')]),all[1]]);
 assert.equal(mixed.proposal,null);
 assert.doesNotMatch(mixed.answer,/إجمالي الصفوف المستخرجة/,'incomplete multi-file read must not claim completeness');
});
