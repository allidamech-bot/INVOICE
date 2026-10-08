import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {parseAiProductDraftCommand,reviseAiProductImportDraft} from '../dist/src/lib/ai-product-import-draft.js';
import {applyAiProductSourceImport,prepareAiProductSourceImport} from '../dist/src/lib/ai-product-source-import.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {registerVaultMutationBridge} from '../dist/src/storage/vault-mutation-bridge.js';
import {applyApprovedToolExecution} from '../dist/src/lib/ai-tool-actions.js';

const sourceItems=[
 {sku:'SN-50',descriptionEn:'Snickers 50g',salePrice:'8',saleCurrency:'USD',category:'Confectionery',unit:'CTN'},
 {sku:'',descriptionEn:'Snickers Peanut 50 g',salePrice:'9',saleCurrency:'USD',category:'Confectionery',unit:'CTN'},
 {sku:'SN-150',descriptionEn:'Snickers 150g',salePrice:'11',saleCurrency:'USD',category:'Confectionery',unit:'CTN'},
 {sku:'MARS-50',descriptionEn:'Mars 50g',salePrice:'7',saleCurrency:'USD',category:'Confectionery',unit:'CTN'}
];
function file(items=sourceItems){return{fileName:'candy.pdf',route:'product_list',confidence:.96,extracted:JSON.stringify({items})};}
function ctx(extra={}){return{assistantRuntime:{scope:'business',workspaceId:'default',threadId:'review-1',branchId:'default'},...extra};}
function vault(){return emptyVault();}
const result=(message,v,pending)=>orchestrateAiToolRequest({message,vault:v,context:ctx(pending?{pendingProductImport:pending}:{}),language:'ar'});
test('B05: user file analysis stages a complete read-only preview, then three conversational edits, then one approval',async()=>{
 const v=vault(),before=JSON.stringify(v);
 const first=await orchestrateAiToolRequest({message:'حلل الملف واعطني تفاصيل الأصناف',vault:v,context:ctx({conversationSources:[file()]}),language:'ar'});
 assert.equal(first.proposal?.tool,'product.importSource');
 assert.equal(first.proposal.preview.length,4);
 assert.match(first.answer,/لم أسجّل|لم أسجل/);
 assert.equal(JSON.stringify(v),before);
 const step1=await result('غيّر تصنيف جميع الأصناف إلى Snacks',v,first.proposal.args);
 assert.equal(step1.proposal.preview.length,4);
 assert(step1.proposal.args.rows.every(row=>row.item.category==='Snacks'));
 assert.equal(first.proposal.args.rows[0].item.category,'Confectionery','old preview stays immutable');
 const step2=await result('Set Snickers 50g price to 12.50 USD',v,step1.proposal.args);
 assert.equal(step2.proposal.preview.length,4);
 assert.deepEqual(step2.proposal.args.rows.map(row=>row.item.lastUnitPrice),['12.5','12.5','11','7']);
 const step3=await result('أضف SKU لكل الأصناف الناقصة',v,step2.proposal.args);
 assert.equal(step3.proposal.preview.length,4);
 assert.equal(step3.proposal.args.rows[1].item.sku,'SKU-0001');
 assert.equal(JSON.stringify(v),before,'no rows persisted before explicit approval');
 let count=0,current=v;
 registerVaultMutationBridge(async mutation=>{count++;current=mutation(current);return current;});
 const commit=await applyApprovedToolExecution(step3.proposal);
 assert.equal(count,1);
 assert.match(commit.summary,/4 extracted products registered/);
 assert.deepEqual(current.savedItems.map(item=>item.sku),['SN-50','SKU-0001','SN-150','MARS-50']);
 assert.deepEqual(current.savedItems.map(item=>item.lastUnitPrice),['12.5','12.5','11','7']);
 assert(current.savedItems.every(item=>item.category==='Snacks'));
});
test('B05: exact SKU edits update one row only and avoid ambiguous name matching',()=>{
 const v=vault(),base=prepareAiProductSourceImport(v,[file()]);
 const update=reviseAiProductImportDraft(v,base,'Set price of SKU MARS-50 to 20 USD');
 assert.deepEqual(update.rows.map(row=>row.item.lastUnitPrice),['8','9','11','20']);
 assert.equal(base.rows[3].item.lastUnitPrice,'7');
 assert.throws(()=>reviseAiProductImportDraft(v,base,'Set price of SKU UNKNOWN-50 to 20 USD'),/No staged product/);
});
test('B05: failed follow-up edits cannot partially modify the unsaved draft',()=>{
 const v=vault(),base=prepareAiProductSourceImport(v,[file()]);
 const snapshot=JSON.stringify(base);
 assert.throws(()=>reviseAiProductImportDraft(v,base,'Set Snickers 75g price to 30 USD'),/No staged product/);
 assert.throws(()=>reviseAiProductImportDraft(v,base,'Set Snickers 50g price to -30 USD'),/Specify an exact draft edit/);
 assert.throws(()=>reviseAiProductImportDraft(v,base,'غيّر تصنيف جميع الأصناف إلى Confectionery'),/unchanged/);
 assert.equal(JSON.stringify(base),snapshot);
 assert.equal(v.savedItems.length,0);
});
test('B05: stale company, duplicate SKU and stale catalog reject updated draft atomically',()=>{
 const v=vault(),base=prepareAiProductSourceImport(v,[file()]);
 v.appSettings.activeWorkspaceId='other';
 assert.throws(()=>reviseAiProductImportDraft(v,base,'غيّر تصنيف جميع الأصناف إلى Sweets'),/active company changed/);
 v.appSettings.activeWorkspaceId='default';
 const item=structuredClone(base.rows[0].item);item.id='conflict';v.savedItems=[item];
 assert.throws(()=>reviseAiProductImportDraft(v,base,'غيّر تصنيف جميع الأصناف إلى Sweets'),/duplicated/);
 assert.equal(v.savedItems.length,1);
});
test('B05: explicit commands only; read-only, negated and unknown instructions do not mutate',()=>{
 assert.equal(parseAiProductDraftCommand('What products are here?'),null);
 assert.equal(parseAiProductDraftCommand('لا تعدل تصنيف كل الأصناف'),null);
 assert.equal(parseAiProductDraftCommand('Preview only. Do not change Snickers 50g price'),null);
 assert.equal(parseAiProductDraftCommand('I think Snickers 50g price maybe 20 USD'),null);
 assert.equal(parseAiProductDraftCommand('غيّر تصنيف جميع الأصناف إلى Snacks')?.kind,'category');
 assert.equal(parseAiProductDraftCommand('Set Snickers 50g price to 12 USD')?.kind,'price');
 assert.equal(parseAiProductDraftCommand('أضف SKU لكل الأصناف الناقصة')?.kind,'skuGeneration');
});
test('B05: 100-row draft survives staged category, price and SKU revisions without lost rows',()=>{
 const items=Array.from({length:100},(_,i)=>({sku:'',descriptionEn:'Batch Item '+i+' 50g',salePrice:'8',saleCurrency:'USD',unit:'CTN',category:'General'}));
 const v=vault(),base=prepareAiProductSourceImport(v,[file(items)]);
 const category=reviseAiProductImportDraft(v,base,'غيّر تصنيف جميع الأصناف إلى Snacks');
 const pricing=reviseAiProductImportDraft(v,category,'Set Batch Item 1 50g price to 12 USD');
 const skus=reviseAiProductImportDraft(v,pricing,'أضف SKU لكل الأصناف الناقصة');
 assert.equal(skus.rows.length,100);
 assert.equal(new Set(skus.rows.map(row=>row.item.sku)).size,100);
 assert.equal(skus.rows.filter(row=>row.item.lastUnitPrice==='12').length,1);
 assert.equal(v.savedItems.length,0);
 const saved=applyAiProductSourceImport(v,skus);
 assert.equal(saved.savedItems.length,100);
});
test('B05: generated conversation runtime retains source batch only for the same thread and clears on approval/cancel',async()=>{
 const script=await readFile('scripts/ai-conversation-owner-stage4-tools.mjs','utf8');
 assert.match(script,/__lourexPendingImportContext\(this,context\)/);
 assert.match(script,/function __lourexImportScope/);
 assert.match(script,/if\(pending\.scope!==__lourexImportScope\(context\)\)/);
 assert.match(script,/if\(step\.tool==='product\.importSource'\)instance\.__lourexPendingProductImport=null/);
 assert.match(script,/instance\.__lourexPendingProductImport=null;__lourexAdvanceToolPresentation\(instance,'dismissed'\)/);
});
