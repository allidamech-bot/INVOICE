import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {prepareAiBulkProductTransform,parseAiBulkProductTransformIntent} from '../dist/src/lib/ai-product-bulk-transforms.js';
import {applyAiBulkProductUpdate} from '../dist/src/lib/ai-product-bulk-update.js';
import {createAiToolRuntime,deterministicAiToolPlan,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';

const stamp='2026-09-20T00:00:00.000Z';
function product(id,sku,price,currency='USD',workspaceId='default'){
  return{id,workspaceId,createdAt:stamp,updatedAt:stamp,sku,
    descriptionEn:'Test '+id,descriptionAr:'',hsCode:'',origin:'TR',packing:'CTN',unit:'CTN',
    lastUnitPrice:price,lastCurrency:currency,usageCount:0,lastUsedAt:'',category:'Snacks',tags:[],archived:false};
}
function vault(){
  const v=emptyVault();
  v.savedItems=[
    product('a','SKU-0001','100.00'),product('b','A-2','19.99'),
    product('c','','50.00'),product('d','','14.00'),
    product('outside','EXT','800.00','USD','other')
  ];
  return v;
}
function runtime(v){
  return createAiToolRuntime(v,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null}});
}
test('B05: clear Arabic and English all-products percentage requests map locally, not through an LLM',()=>{
  assert.deepEqual(parseAiBulkProductTransformIntent('زود أسعار كل الأصناف ٥٪'),{selector:'all',pricePercent:'5'});
  assert.deepEqual(parseAiBulkProductTransformIntent('increase all product prices by 5%'),{selector:'all',pricePercent:'5'});
  assert.deepEqual(parseAiBulkProductTransformIntent('Reduce all product prices 20%'),{selector:'all',pricePercent:'-20'});
  assert.deepEqual(parseAiBulkProductTransformIntent('ولد SKU للأصناف اللي بدون كود'),{selector:'missingSku',generateMissingSku:true});
  assert.equal(parseAiBulkProductTransformIntent('What is the price of Chocolate?'),null);
  assert.equal(parseAiBulkProductTransformIntent('Increase the price of the Chocolate product by 5%'),null,'A single named product needs a precise identity');
  assert.equal(parseAiBulkProductTransformIntent('Raise and reduce all product prices 5%'),null);
});
test('B05: deterministic 5% price increase uses exact decimal rounding and no mutation before approval',()=>{
  const v=vault(),original=JSON.stringify(v);
  const plan=deterministicAiToolPlan('Increase all product prices 5%',runtime(v));
  assert.equal(plan?.calls[0].tool,'product.bulkUpdate');
  assert.equal(plan?.calls[0].args.transform.pricePercent,'5');
  const output=executeAiToolPlan(runtime(v),plan);
  assert.equal(output.proposal.capability,'tool.execute');
  assert.equal(output.proposal.preview.length,4);
  assert.equal(output.proposal.preview[0].after.lastUnitPrice,'105.00');
  assert.equal(output.proposal.preview[1].after.lastUnitPrice,'20.99');
  assert.equal(JSON.stringify(v),original);
  const saved=applyAiBulkProductUpdate(v,output.proposal.args,stamp.replace('20T','21T'));
  assert.equal(saved.savedItems[0].lastUnitPrice,'105.00');
  assert.equal(saved.savedItems[1].lastUnitPrice,'20.99');
  assert.equal(saved.savedItems[4].lastUnitPrice,'800.00');
});
test('B05: percentage markdown, fractions and localized currency are deterministic',()=>{
  const v=vault();
  const batch=prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'-12.5'});
  assert.equal(batch.rows[0].preview.after.lastUnitPrice,'87.50');
  assert.equal(batch.rows[1].preview.after.lastUnitPrice,'17.49');
  const arabic=prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'٥'});
  assert.equal(arabic.rows[0].preview.after.lastUnitPrice,'105.00');
});
test('B05: automatic missing SKU generation avoids collisions, preserves original SKUs and is atomic',()=>{
  const v=vault(),unchanged=JSON.stringify(v);
  const plan=deterministicAiToolPlan('ولد SKU للأصناف اللي بدون كود',runtime(v));
  assert.equal(plan?.calls[0].tool,'product.bulkUpdate');
  const result=executeAiToolPlan(runtime(v),plan);
  assert.equal(result.proposal?.preview?.length,2);
  assert.equal(result.proposal.preview[0].after.sku,'SKU-0002');
  assert.equal(result.proposal.preview[1].after.sku,'SKU-0003');
  assert.equal(JSON.stringify(v),unchanged);
  const saved=applyAiBulkProductUpdate(v,result.proposal.args,'2026-10-08T13:00:00.000Z');
  assert.equal(saved.savedItems[0].sku,'SKU-0001');
  assert.equal(saved.savedItems[2].sku,'SKU-0002');
  assert.equal(saved.savedItems[3].sku,'SKU-0003');
  assert.deepEqual(saved.savedItems[4],v.savedItems[4]);
});
test('B05: changes to catalog after preview block entire transformed batch',()=>{
  const v=vault(),batch=prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'5'});
  v.savedItems[2].updatedAt='2026-10-08T00:00:00.000Z';
  const before=JSON.stringify(v);
  assert.throws(()=>applyAiBulkProductUpdate(v,batch),/changed since preview/);
  assert.equal(JSON.stringify(v),before);
});
test('B05: out-of-range, zero, invalid percentages and missing prices fail without a partial proposal',()=>{
  const v=vault();
  for(const pct of ['0','-101','501','foo']){
    assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',pricePercent:pct}),/Percentage/);
  }
  const invalid=executeAiToolPlan(runtime(v),{version:1,goal:'invalid pricing',calls:[
    {id:'a',tool:'product.bulkUpdate',args:{transform:{selector:'all',pricePercent:'501'}},reason:'not authorized'}]});
  assert.equal(invalid.proposal,null);
  v.savedItems[1].lastUnitPrice='';
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'5'}),/valid recorded sale price/);
  v.savedItems[1].lastUnitPrice='19.99';
  v.savedItems[2].lastCurrency='';
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'5'}),/sale currency/);
});
test('B05: over-120 selections are rejected, not shortened silently',()=>{
  const v=vault();
  for(let i=0;i<120;i++)v.savedItems.push(product('extra-'+i,'X-'+i,'2.00'));
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'5'}),/More than 120/);
});
test('B05: prefix and company boundaries remain guarded',()=>{
  const v=vault();
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',generateMissingSku:true}),/missing-SKU/);
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'missingSku',generateMissingSku:true,skuPrefix:'INV SPACE'}),/SKU prefix/);
  assert.throws(()=>prepareAiBulkProductTransform(v,{selector:'all',pricePercent:'5',unapproved:true}),/Unsupported/);
  const first=prepareAiBulkProductTransform(v,{selector:'missingSku',generateMissingSku:true,skuPrefix:'LOUREX'});
  assert.equal(first.rows[0].patch.sku,'LOUREX-0001');
  v.appSettings.activeWorkspaceId='other';
  assert.throws(()=>applyAiBulkProductUpdate(v,first),/Active company changed/);
});
test('B05: server-origin or source-origin broad transforms cannot bypass local explicit intent',async()=>{
  const client=await readFile('src/lib/ai-tool-client.ts','utf8');
  const tool=await readFile('src/lib/ai-tool-orchestrator.ts','utf8');
  assert.match(client,/Object\.hasOwn\(call\.args,'transform'\)/);
  assert.match(tool,/parseAiBulkProductTransformIntent\(message\)/);
  assert.match(tool,/prepareAiBulkProductTransform\(runtime\.vault,args\.transform\)/);
});
