import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {requestedAiProductImport,requestedAiProductSkuGeneration,prepareAiProductSourceImport,applyAiProductSourceImport,AI_PRODUCT_SOURCE_IMPORT_MAX} from '../dist/src/lib/ai-product-source-import.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {applyApprovedToolExecution} from '../dist/src/lib/ai-tool-actions.js';
import {registerVaultMutationBridge} from '../dist/src/storage/vault-mutation-bridge.js';
import {conversationAttachmentPayload} from '../dist/src/lib/ai-conversation-attachments.js';

function item(id='A-1',name='Test biscuits',price='8.50',currency='USD'){
  return{sku:id,descriptionEn:name,descriptionAr:'',salePrice:price,saleCurrency:currency,unitCost:'4.00',costCurrency:'USD',unit:'CTN',category:'Snacks',origin:'TR',packing:'12 pcs',hsCode:'190590'};
}
function file(items=[item()],name='catalog.xlsx',extra={}){
  return{fileName:name,route:'product_list',confidence:0.91,extracted:JSON.stringify({items,sourceCurrency:'',notes:'Source-extracted'}),...extra};
}
function vault(){return emptyVault();}
function runtime(v){return createAiToolRuntime(v,{assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});}
test('B05: only explicit user instructions authorize registering source products',()=>{
  assert.equal(requestedAiProductImport('سجل جميع الأصناف من الملف'),true);
  assert.equal(requestedAiProductImport('احفظ المنتجات كلها'),true);
  assert.equal(requestedAiProductImport('register all products in attached list'),true);
  assert.equal(requestedAiProductImport('What is in this catalog?'),false);
  assert.equal(requestedAiProductImport('List every product and price'),false);
  assert.equal(requestedAiProductImport('أعطني أسعار المنتجات'),false);
  assert.equal(requestedAiProductImport('Do not save any products; just list them'),false);
  assert.equal(requestedAiProductImport('لا تسجل المنتجات، اعرض فقط'),false);
  assert.equal(requestedAiProductImport('Preview only; do not register products'),false);
});
test('B05: explicit one-command product import can assign only missing SKUs before approving registration',()=>{
  assert.equal(requestedAiProductImport('سجل جميع الأصناف واضف SKU لكل صنف'),true);
  assert.equal(requestedAiProductSkuGeneration('سجل جميع الأصناف واضف SKU لكل صنف'),true);
  assert.equal(requestedAiProductSkuGeneration('register all products and add SKUs'),true);
  assert.equal(requestedAiProductSkuGeneration('Register the product file; do not add SKU'),false);
  assert.equal(requestedAiProductSkuGeneration('List every SKU'),false);
  const v=vault();
  const rows=[item('SKU-0001','Existing identified'),item('','Uncoded biscuit','3.50'),item('','Uncoded cookies','4.20')];
  const staged=prepareAiProductSourceImport(v,[file(rows)],{generateMissingSku:true});
  assert.equal(staged.rows.length,3);
  assert.equal(staged.rows[0].item.sku,'SKU-0001');
  assert.equal(staged.rows[1].item.sku,'SKU-0002');
  assert.equal(staged.rows[2].item.sku,'SKU-0003');
  assert.equal(staged.rows[1].preview.after.sku,'SKU-0002');
  assert.equal(v.savedItems.length,0);
  const committed=applyAiProductSourceImport(v,staged);
  assert.deepEqual(committed.savedItems.map(row=>row.sku),['SKU-0001','SKU-0002','SKU-0003']);
});
test('B05: generated SKUs avoid existing company codes and preserve other companies',()=>{
  const v=vault();const earlier=prepareAiProductSourceImport(v,[file([item('SKU-0001','Older')])]);
  v.savedItems=applyAiProductSourceImport(v,earlier).savedItems;
  const staged=prepareAiProductSourceImport(v,[file([item('','Another one')])],{generateMissingSku:true});
  assert.equal(staged.rows[0].preview.after.sku,'SKU-0002');
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('','Another one')])],{generateMissingSku:true,skuPrefix:'BAD SPACE'}),/prefix/);
});
test('B05: product list stages every source row for review without mutation',()=>{
  const v=vault(),before=JSON.stringify(v);
  const batch=prepareAiProductSourceImport(v,[file([item(),item('B-2','Date cookies','9.00')])]);
  assert.equal(batch.rows.length,2);
  assert.equal(batch.rows[0].fileName,'catalog.xlsx');
  assert.equal(batch.rows[0].preview.after.lastUnitPrice,'8.50');
  assert.equal(batch.rows[0].preview.after.lastCurrency,'USD');
  assert.equal(batch.rows[1].preview.after.sku,'B-2');
  assert.equal(JSON.stringify(v),before);
  const saved=applyAiProductSourceImport(v,batch);
  assert.equal(saved.savedItems.length,2);
  assert.equal(saved.savedItems[0].lastUnitPrice,'8.50');
  assert.equal(saved.savedItems[0].lastUnitCost,'4.00');
  assert.equal(saved.savedItems[1].descriptionEn,'Date cookies');
  assert.equal(v.savedItems.length,0);
});
test('B05: 50 extracted rows are all staged and registered atomically, no 40-row cut',async()=>{
  const v=vault(),items=Array.from({length:50},(_,i)=>item('SKU-'+i,'Product '+i));
  const batch=prepareAiProductSourceImport(v,[file(items)]);
  assert.equal(batch.rows.length,50);
  const after=applyAiProductSourceImport(v,batch);
  assert.equal(after.savedItems.length,50);
  assert.equal(new Set(after.savedItems.map(row=>row.id)).size,50);
  assert.equal(AI_PRODUCT_SOURCE_IMPORT_MAX,120);
  const extractor=await readFile('src/lib/ai-conversation-attachments.ts','utf8');
  assert.match(extractor,/MAX_PRODUCT_LIST_EXTRACT_CHARS=72_000/);
  assert.match(extractor,/classification\.route==='product_list'\?MAX_PRODUCT_LIST_EXTRACT_CHARS:MAX_EXTRACT_CHARS/);
});
test('B05: duplicate SKU across attachments, duplicate name and existing products abort every row',()=>{
  const v=vault();
  assert.throws(()=>prepareAiProductSourceImport(v,[file(),file([item('A-1','Other')],'later.pdf')]),/duplicated/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('A-1','Name'),item('A-2','Name')])]),/duplicated/);
  v.savedItems=applyAiProductSourceImport(v,prepareAiProductSourceImport(v,[file()])).savedItems;
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('B-2','New'),item('A-1','Test biscuits')])]),/duplicated/);
  assert.equal(v.savedItems.length,1);
});
test('B05: malformed, truncated, ambiguous or unrelated source blocks registration',()=>{
  const v=vault();
  assert.throws(()=>prepareAiProductSourceImport(v,[file([], 'empty.xlsx')]),/empty/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file(undefined,'broken.xlsx',{extracted:'{"items":['})]),/incomplete/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file(undefined,'uncertain.xlsx',{confidence:0.2})]),/Low-confidence/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file(undefined,'invoice.pdf',{route:'quote_request'})]),/verified product catalogs/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('X','', '')])]),/source-supported name/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('X','Example','10.00','')])]),/currency/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file([item('X','Example','-8','USD')])]),/negative/);
  assert.throws(()=>prepareAiProductSourceImport(v,[file(Array.from({length:121},(_,i)=>item('SKU-'+i,'Product '+i)))]),/safe AI import size/);
});
test('B05: missing optional data remains empty; never infer a sale currency or unit',()=>{
  const v=vault();
  const line={sku:'',descriptionEn:'Plain crackers',descriptionAr:'',salePrice:'',saleCurrency:'',unitCost:'',costCurrency:'',unit:'',category:''};
  const batch=prepareAiProductSourceImport(v,[file([line])]);
  assert.equal(batch.rows[0].item.lastUnitPrice,'');
  assert.equal(batch.rows[0].item.lastCurrency,'');
  assert.equal(batch.rows[0].item.unit,'');
  assert.equal(batch.rows[0].item.sku,'');
});
test('B05: changing active company or adding conflicting product after approval aborts save',()=>{
  const v=vault(),batch=prepareAiProductSourceImport(v,[file()]);
  v.appSettings.activeWorkspaceId='other';
  assert.throws(()=>applyAiProductSourceImport(v,batch),/active company changed/);
  v.appSettings.activeWorkspaceId='default';
  const rival=structuredClone(batch.rows[0].item);rival.id='other-id';
  v.savedItems.push(rival);
  const old=JSON.stringify(v);
  assert.throws(()=>applyAiProductSourceImport(v,batch),/duplicated/);
  assert.equal(JSON.stringify(v),old);
});
test('B05: changing approved pricing after preview is rejected before save',()=>{
  const v=vault(),batch=prepareAiProductSourceImport(v,[file()]);
  batch.rows[0].item.lastUnitPrice='10.00';
  assert.throws(()=>applyAiProductSourceImport(v,batch),/preview changed/);
  assert.equal(v.savedItems.length,0);
});
test('B05: AI tool approval requires an isolated, reviewable plan',()=>{
  const v=vault(),before=JSON.stringify(v);
  const plan={version:1,goal:'Register every row',calls:[{id:'register',tool:'product.importSource',args:{sources:[file()]},reason:'Explicit user command'}]};
  const result=executeAiToolPlan(runtime(v),plan);
  assert.equal(result.proposal?.tool,'product.importSource');
  assert.equal(result.proposal?.preview?.length,1);
  assert.equal(result.proposal.preview[0].fileName,'catalog.xlsx');
  assert.equal(JSON.stringify(v),before);
  const mixed=executeAiToolPlan(runtime(v),{...plan,calls:[...plan.calls,{id:'extra',tool:'task.create',args:{title:'Do it'},reason:'second step'}]});
  assert.equal(mixed.proposal,null);
});
test('B05: one explicit approval calls the Vault mutation once and verifies all products',async()=>{
  let current=vault(),calls=0;
  registerVaultMutationBridge(async mutation=>{calls++;current=mutation(current);return current;});
  const batch=prepareAiProductSourceImport(current,[file()]);
  const result=await applyApprovedToolExecution({capability:'tool.execute',tool:'product.importSource',args:batch,label:'Register',rationale:'Approved'});
  assert.equal(calls,1);
  assert.match(result.summary,/1 extracted products registered/);
  assert.equal(current.savedItems.length,1);
});
test('B05: oversized spreadsheet text fails before classification rather than cutting rows',async()=>{
  const payload='SKU,Name\\n'+'x'.repeat(120500);
  const file=new File([payload],'oversized.csv',{type:'text/csv'});
  await assert.rejects(()=>conversationAttachmentPayload(file),/safe AI source limit/);
});
test('B05: source import is local-only and approval UI shows all extracted fields',async()=>{
  const client=await readFile('src/lib/ai-tool-client.ts','utf8');
  const ui=await readFile('scripts/ai-conversation-owner-stage4-tools.mjs','utf8');
  assert.match(client,/requestedAiProductImport\(input\.message\)/);
  assert.match(client,/args:\\{sources:input\\.context\\.conversationSources,generateMissingSku:requestedAiProductSkuGeneration\\(input\\.message\\)\\}/);
  assert.match(client,/requestedAiProductSkuGeneration\\(input\\.message\\)/);
  assert.match(ui,/product\.importSource/);
  assert.match(ui,/lastUnitCost/);
});
