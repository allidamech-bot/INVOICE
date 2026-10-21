import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const product=(sku,changes={})=>({sku,descriptionEn:'Product '+sku,descriptionAr:'',brand:'',hsCode:'',origin:'',packing:'',cartonQuantity:'',unit:'PCS',salePrice:'',saleCurrency:'',unitCost:'',costCurrency:'',category:'',notes:'',...changes});
const source=(fileName,items,currency='')=>({fileName,draft:{items,sourceCurrency:currency,notes:''}});

test('Product AI aggregates every row and preserves original source ordering and currency',async()=>{
  const [{combineProductAiSourceDrafts:combine},{reviewProductAiRows:review}]=await Promise.all([
    import('../dist/src/lib/ai-product-multi-source.js'),
    import('../dist/src/lib/product-ai-review.js')
  ]);
  const group=combine([
    source('Arabic carton.png',[product('ONE',{salePrice:'15.50'})],'SAR'),
    source('List.xlsx',[product('TWO',{unitCost:'12.70'}),product('THREE')],'USD'),
    source('Third.pdf',[product('FOUR',{salePrice:'18',saleCurrency:'EUR'})],'GBP')
  ]);
  assert.equal(group.draft.items.length,4);
  assert.deepEqual(group.rowFiles,['Arabic carton.png','List.xlsx','List.xlsx','Third.pdf']);
  assert.deepEqual(group.sourceNames,['Arabic carton.png','List.xlsx','Third.pdf']);
  assert.equal(group.draft.items[0].saleCurrency,'SAR');
  assert.equal(group.draft.items[1].costCurrency,'USD');
  assert.equal(group.draft.items[3].saleCurrency,'EUR');
  assert.equal(group.draft.sourceCurrency,'','batch must never invent one shared currency');
  assert.deepEqual(review([],group.draft.items,group.draft.sourceCurrency).map(row=>row.classification),['new-product','new-product','new-product','new-product']);
});

test('Product AI marks cross-file duplicates as blocked before any default selection',async()=>{
  const {combineProductAiSourceDrafts:combine}=await import('../dist/src/lib/ai-product-multi-source.js');
  const {reviewProductAiRows:review}=await import('../dist/src/lib/product-ai-review.js');
  const combined=combine([source('first.jpg',[product('SKU-77')]),source('second.jpg',[product('SKU-77')])]);
  const matched=review([],combined.draft.items,combined.draft.sourceCurrency);
  assert.equal(matched.length,2);
  assert.deepEqual(matched.map(row=>row.classification),['duplicate-candidate','duplicate-candidate']);
  assert.deepEqual(matched.map(row=>row.defaultSelected),[false,false]);
});

test('Product AI cannot proceed after one empty source, file overflow or combined row overflow',async()=>{
  const {combineProductAiSourceDrafts:combine}=await import('../dist/src/lib/ai-product-multi-source.js');
  assert.throws(()=>combine([source('first.png',[product('A')]),source('empty.png',[])]),/SOURCE_INCOMPLETE/);
  assert.throws(()=>combine(Array.from({length:5},(_,i)=>source('file'+i+'.png',[product('SKU'+i)]))),/1–4/);
  assert.throws(()=>combine([source('first.xlsx',Array.from({length:110},(_,i)=>product('SKU-'+i))),source('second.xlsx',Array.from({length:11},(_,i)=>product('SKN-'+i)))]),/120 rows/);
  assert.throws(()=>combine([source('bad.xlsx',[product('SKU')],'INVALID')]),/invalid currency/);
});

test('Product AI importer keeps shell unchanged and revalidates the fresh product catalog before saving',async()=>{
  const [modal,workflow,bridge]=await Promise.all([
    read('src/components/ProductAiSourceReview.tsx'),
    read('src/components/AiWorkflowTools.tsx'),
    read('public/lourex-ai-workflows.js')
  ]);
  assert.match(workflow,/private chooseProductFiles=\(files:File\[\]\)=>/);
  assert.match(workflow,/multiple=\{this.state.forcedRoute==='product_list'\}/);
  assert.match(workflow,/setPendingSource\(route,file,route==='product_list'/);
  assert.match(bridge,/files:Array\.isArray\(pending\.files\)\?pending\.files:undefined/);
  assert.match(modal,/for\(let index=0;index<files.length;index\+\+\)/);
  assert.match(modal,/combineProductAiSourceDrafts\(extracted\)/);
  assert.match(modal,/reviewProductAiRows\(resumed\.vault\.savedItems,combined\.draft\.items/);
  assert.match(modal,/rowFiles\[index\]/);
  assert.match(modal,/const fresh=reviewProductAiRows\(vault\.savedItems,draft\.items/);
  assert.match(modal,/return applyDraft\(vault,draft,this\.state\.selected,fresh\)/);
  assert.match(modal,/Retry all files/);
  assert.doesNotMatch(modal,/mutateVaultSafely\(vault=>applyDraft\(vault,draft,this\.state\.selected,this\.state\.reviews\)\)/);
});
