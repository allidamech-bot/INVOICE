import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {requestedCatalogQuoteFamily,catalogProductCandidates,naturalCatalogQuoteReply} from '../dist/src/lib/ai-catalog-conversation.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

function fixture(){
 const v=emptyVault();
 const row=(id,descriptionAr,descriptionEn)=>({
   id,descriptionAr,descriptionEn,sku:'SKU-'+id,workspaceId:'default',
   archived:false,tags:[],category:'Snacks',packing:'CTN',
   unit:'CTN',lastUnitPrice:'12.50',lastCurrency:'USD'
 });
 v.savedItems=[
   row('1','شيبسيكو ملح 40 غ','Chipsico Salt'),
   row('2','شيبسيكو جبنة 40 غ','Chipsico Cheese'),
   row('3','رز بسمتي','Basmati Rice')
 ];
 return v;
}
test('natural quotations recognize the user intent but do not intercept a quantified plan',()=>{
 for(const message of ['اريد عرض سعر لمنتجات شيبسيكو','بدي عرض سعر لمنتجات شيبسيكو','جهّز عرض سعر لأصناف شيبسيكو'])
   assert.equal(requestedCatalogQuoteFamily(message),'شيبسيكو',message);
 assert.equal(requestedCatalogQuoteFamily('بدي عرض سعر لمنتجات شيبسيكو 10 كراتين لكل نوع'),null);
 assert.equal(requestedCatalogQuoteFamily('لا تعمل عرض سعر لمنتجات شيبسيكو'),null);
 assert.equal(requestedCatalogQuoteFamily('اعرض جميع المنتجات'),null);
});
test('product family responses show real saved variants, never a guessed substitute or price',()=>{
 const v=fixture(),before=structuredClone(v);
 const found=catalogProductCandidates(v,'شيبسيكو');
 assert.deepEqual(found.exact.map(x=>x.id),['1','2']);
 const answer=naturalCatalogQuoteReply(v,'شيبسيكو','ar');
 assert.match(answer,/شيبسيكو ملح/);assert.match(answer,/شيبسيكو جبنة/);
 assert.doesNotMatch(answer,/رز بسمتي/);assert.doesNotMatch(answer,/12\.50/);
 assert.match(answer,/كم كرتون/);
 const unknown=naturalCatalogQuoteReply(v,'شوكولاته','ar');
 assert.match(unknown,/رز بسمتي/);assert.match(unknown,/بدون ما أفترض/);
 assert.deepEqual(v,before);
});
test('natural Arabic family request bypasses generic record0 planner without saving a document',async()=>{
 const v=fixture(),before=structuredClone(v);
 const result=await orchestrateAiToolRequest({
   message:'اريد عرض سعر لمنتجات شيبسيكو',vault:v,language:'ar',
   context:{conversationMode:'controller',assistantRuntime:{scope:'business'}}
 });
 assert.ok(result);
 assert.equal(result.proposal,null);
 assert.equal(result.workingDraft,undefined);
 assert.equal(result.plan.calls.length,0);
 assert.deepEqual(result.results,[]);
 assert.match(result.answer,/شيبسيكو جبنة/);
 assert.doesNotMatch(result.answer,/record0|نتائج البحث:/);
 assert.deepEqual(v,before);
});
test('existing finance product visibility stays scoped to the active company',async()=>{
 const v=fixture(),foreign={...v.savedItems[0],id:'foreign',workspaceId:'other',descriptionAr:'منتج غير مصرح به'};
 v.savedItems.push(foreign);
 // Finance is allowed to read products by graphKindAllowed, but never from
 // another workspace. Do not invent a role prohibition not in governance.
 v.teamMembers[0].role='finance';
 const result=await orchestrateAiToolRequest({
   message:'اريد عرض سعر لمنتجات شيبسيكو',vault:v,language:'ar',
   context:{conversationMode:'controller',assistantRuntime:{scope:'business'}}
 });
 assert.ok(result);
 assert.match(result.answer,/شيبسيكو جبنة/);
 assert.doesNotMatch(result.answer,/منتج غير مصرح به/);
 assert.equal(result.proposal,null);
});
test('assistant chat formats natural paragraphs and lists without parsing unsafe HTML',async()=>{
 const component=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../src/styles/ai-conversation-workspace.css',import.meta.url),'utf8');
 assert.match(component,/function assistantMessageBlocks/);
 assert.match(component,/sender==='assistant'\?content\.flatMap/);
 assert.match(component,/className="lxw-ai-compact-result-row"/);
 assert.match(component,/lxw-formatted-reply/);
 assert.match(css,/\.lxw-formatted-reply>ul/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.doesNotMatch(component,/dangerouslySetInnerHTML/);
});
