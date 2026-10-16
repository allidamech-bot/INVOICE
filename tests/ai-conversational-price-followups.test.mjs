import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,normalizeConversationKernel,composeKernelMemory} from '../dist/src/lib/ai-conversation-kernel.js';
import {stageScopedRecordList,setExactRecordSelection} from '../dist/src/lib/ai-record-selection.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';
import {parseConversationalSalePrice,resolvePriceProduct,parsePriceFollowup,prepareConversationalSalePrice} from '../dist/src/lib/ai-conversational-price.js';
const stamp='2026-10-01T00:00:00.000Z';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'qa-price',accountId:'account-one'};
const product=(id,name='Nutella 750g',unit='CTN',workspaceId='default')=>({
 id,workspaceId,branchId:'main',sku:'SKU-'+id,
 descriptionEn:name,descriptionAr:'',createdAt:stamp,updatedAt:stamp,unit,
 lastUnitPrice:'42',lastCurrency:'USD',lastUnitCost:'20',lastCostCurrency:'USD',category:'Food',tags:[],archived:false
});
function fixture(){const vault=emptyVault();vault.savedItems=[product('p1'),product('p2','Cola 330ml'),product('foreign','Secret product','CTN','other')];const kernel=newConversationKernel(scope);return{vault,kernel};}
test('the user can say selling price 50 per carton in Arabic and English without technical syntax',()=>{
 for(const phrase of ['سعر البيع 50 للكرتون','سعر البيع ٥٠ للكرتون','خلي سعر البيع 50 دولار للكرتون','Set selling price to 50 USD per carton']){
  const result=parseConversationalSalePrice(phrase);
  assert.equal(result?.amount,'50',phrase);
  assert.equal(result?.unit,'CTN',phrase);
 }
 for(const phrase of ['كم سعر البيع 50 للكرتون؟','لا تعدل سعر البيع 50 للكرتون','ما بدي تعديل سعر البيع 50 للكرتون','هل سعر البيع 50 للكرتون؟','سعر البيع للكرتون']){
  assert.equal(parseConversationalSalePrice(phrase),null,phrase);
 }
});
test('contextual selected product produces only a before/after approval payload',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault);
 const list=stageScopedRecordList(kernel,vault,'product');
 setExactRecordSelection(kernel,vault,list.id,['p1']);
 const item=resolvePriceProduct(vault,kernel,'');
 assert.equal(item?.id,'p1');
 const intent={...parseConversationalSalePrice('سعر البيع 50 للكرتون'),itemId:item.id,startedAtTurn:2};
 const batch=prepareConversationalSalePrice(vault,kernel,intent);
 assert.equal(batch.rows.length,1);
 assert.equal(batch.rows[0].preview.before.lastUnitPrice,'42');
 assert.equal(batch.rows[0].preview.after.lastUnitPrice,'50');
 assert.equal(batch.rows[0].preview.after.lastCurrency,'USD');
 assert.deepEqual(vault,before,'preview must never mutate any business record');
});
test('missing product can be clarified in another turn using an exact SKU or name',()=>{
 const {vault,kernel}=fixture();
 assert.equal(resolvePriceProduct(vault,kernel,''),null);
 const price=parseConversationalSalePrice('سعر البيع 50 للكرتون');
 kernel.pendingPrice={...price,itemId:'',startedAtTurn:1};kernel.turn=2;
 const restored=normalizeConversationKernel(structuredClone(kernel),scope);
 assert.equal(restored.pendingPrice.amount,'50');
 const user= parsePriceFollowup('Nutella 750g');
 assert.equal(resolvePriceProduct(vault,restored,user.target)?.id,'p1');
 const batch=prepareConversationalSalePrice(vault,restored,{...restored.pendingPrice,itemId:'p1'});
 assert.equal(batch.rows[0].preview.after.lastUnitPrice,'50');
 assert.match(composeKernelMemory(restored,[]),/pendingPrice/);
});
test('cross-company, multiple selections, wrong pricing unit and ambiguous names fail closed',()=>{
 const {vault,kernel}=fixture();
 assert.equal(resolvePriceProduct(vault,kernel,'Secret product'),null);
 const list=stageScopedRecordList(kernel,vault,'product');
 setExactRecordSelection(kernel,vault,list.id,['p1','p2']);
 assert.throws(()=>resolvePriceProduct(vault,kernel,''),/More than one/);
 setExactRecordSelection(kernel,vault,list.id,['p1']);
 const item=resolvePriceProduct(vault,kernel,'');
 const intent={amount:'50',currency:'',unit:'PCS',itemId:item.id,startedAtTurn:1};
 assert.throws(()=>prepareConversationalSalePrice(vault,kernel,intent),/unit differs/);
 vault.savedItems.push(product('other','Nutella 750g'));
 assert.throws(()=>resolvePriceProduct(vault,kernel,'Nutella 750g'),/ambiguous/);
 kernel.scope.branchId='other';
 assert.throws(()=>prepareConversationalSalePrice(vault,kernel,{...intent,unit:'CTN'}),/company or branch changed/i);
});
test('follow-up is short-lived and cannot restore a stale price approval',()=>{
 const {kernel}=fixture();
 kernel.turn=15;
 kernel.pendingPrice={amount:'50',currency:'USD',unit:'CTN',itemId:'p1',startedAtTurn:1};
 assert.equal(normalizeConversationKernel(kernel,scope).pendingPrice,undefined);
});
test('Controller runtime binds spoken price to canonical signed product approval, never direct vault mutation',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 assert.match(source,/parseConversationalSalePrice\(message\)/);
 assert.match(source,/prepareConversationalSalePrice\(fresh\.vault,kernel,/);
 assert.match(source,/stampProposal\(host,p,fresh\.vault\);stageReviewedMission\(kernel,p\)/);
 assert.match(source,/kernel\.pendingPrice=undefined/);
 assert.doesNotMatch(source,/await mutateVaultSafely\([\s\S]*?parseConversationalSalePrice/);
});


test('live compiled Controller asks for the product, then stages signed review without saving',async()=>{
  const {vault}=fixture(),original=structuredClone(vault);
  const {runtime,host,session}=await compiledReliabilityHarness(vault);
  const h=host();
  runtime.installIntelligenceRuntime(h);
  await runtime.refreshIntelligenceWorkspace(h);
  await runtime.assignIntelligenceConversationMode(h,'controller');
  await h.ask('سعر البيع 50 للكرتون');
  assert.match(h.state.messages.at(-1).text,/أي صنف/);
  assert.equal(h.state.proposal,null);
  assert.equal(h.__intelligenceKernel.pendingPrice.amount,'50');
  await h.ask('Nutella 750g');
  assert.equal(h.state.error,'');
  assert.equal(h.state.proposal?.tool,'product.bulkUpdate');
  assert.ok(h.state.proposal?.foundationApproval?.id);
  assert.equal(h.state.proposal.args.rows.length,1);
  assert.equal(h.state.proposal.args.rows[0].itemId,'p1');
  assert.equal(h.state.proposal.args.rows[0].preview.before.lastUnitPrice,'42');
  assert.equal(h.state.proposal.args.rows[0].preview.after.lastUnitPrice,'50');
  assert.deepEqual(session.vault,original,'only a reviewed proposal is staged; no company write');
});
