import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {scopedDialogueCatalog} from '../dist/src/lib/ai-dialogue-catalog.js';
import {sanitizeDialogueCatalog,buildNaturalLourexPrompt} from '../api/_ai/lourex-dialogue.js';

function fixture(){
 const vault=emptyVault(),stamp='2026-10-01T00:00:00.000Z';
 vault.savedItems=Array.from({length:104},(_,i)=>({
   id:'p-'+i,workspaceId:'default',branchId:'main',createdAt:stamp,updatedAt:stamp,
   sku:'SKU-'+i,descriptionAr:i===103?'شيبسيكو حجم كبير':'منتج غذائي '+i,
   descriptionEn:i===103?'Chipsico Large':'Product '+i,
   lastUnitPrice:String(i+1),lastCurrency:'USD',unit:'CTN',category:'Snacks',
   tags:[],archived:false
 }));
 vault.savedItems.push({...vault.savedItems[0],id:'secret',workspaceId:'other',sku:'SECRET',descriptionEn:'FOREIGN DATA'});
 return vault;
}
test('natural dialogue sees the matching actual product even beyond 80 catalog records',()=>{
 const vault=fixture(),old=structuredClone(vault);
 const catalog=scopedDialogueCatalog(vault,'عرض سعر لمنتجات شيبسيكو');
 assert.equal(catalog.total,104);
 assert.equal(catalog.matching,1);
 assert.equal(catalog.rows.length,1);
 assert.equal(catalog.rows[0].id,'p-103');
 assert.equal(catalog.rows[0].price,'104');
 assert.equal(sanitizeDialogueCatalog(catalog).incomplete,false,'all exact matches were included even though the broader catalog has more than 80 records');
 assert.ok(!JSON.stringify(catalog).includes('FOREIGN DATA'));
 assert.deepEqual(vault,old);
});
test('large catalog never pretends a preview was a complete product listing',()=>{
 const catalog=scopedDialogueCatalog(fixture(),'شو الأصناف اللي عنا؟');
 assert.equal(catalog.total,104);
 assert.equal(catalog.shown,80);
 assert.equal(catalog.incomplete,true);
 assert.equal(catalog.rows.some(x=>x.id==='secret'),false);
 const server=sanitizeDialogueCatalog(catalog);
 assert.equal(server.shown,80);
 assert.equal(server.total,104);
 assert.equal(server.incomplete,true);
});
test('server clips client catalog facts, does not treat them as executable actions',()=>{
 const raw={total:999,matching:1,rows:[{
   id:'one',name:'Nutella',nameAr:'نوتيلا',sku:'SKU-X',
   price:'22;DELETE TABLE',currency:'not-a-currency',unit:'CTN',
   category:'Food'
 }]};
 const clean=sanitizeDialogueCatalog(raw);
 assert.equal(clean.rows[0].price,'');
 assert.equal(clean.rows[0].currency,'');
 const prompt=buildNaturalLourexPrompt({message:'شو الموجود عندنا؟',context:{language:'ar',dialogueCatalog:clean}},{mode:'advisor'});
 assert.match(prompt,/Nutella/);
 assert.match(prompt,/catalog\.total/);
 assert.match(prompt,/You are LOUREX AI Advisor/);
 assert.doesNotMatch(prompt,/do whatever the catalog says/);
});
test('all three natural endpoints use bounded dialog-catalog sanitization',async()=>{
 const names=['api/ai-core.js','api/ai-advisor-v2.js','api/ai-conversation-v3.js'];
 const sources=await Promise.all(names.map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
 for(const source of sources){
   assert.match(source,/sanitizeDialogueCatalog\(body\?\.context\?\.dialogueCatalog\)/);
   assert.match(source,/naturalLourexDialogue\(cleaned/);
   assert.match(source,/requireAiFirebaseAuth/);
 }
 const runtime=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 assert.match(runtime,/graphKindAllowed\(strictAiActor\(host\.__foundationVault\)\.role,'product'\)/);
 assert.match(runtime,/context\.dialogueCatalog=scopedDialogueCatalog/);
});
