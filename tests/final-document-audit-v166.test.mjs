import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { paginateItems } from '../dist/src/lib/documents.js';

const read=path=>readFile(path,'utf8');

test('new quote and invoice drafts are persisted immediately when the editor opens',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/private ensureInitialDraftPersisted=\(\)=>/);
  assert.match(editor,/this\.props\.documents\.some\(item=>item\.id===doc\.id\)/);
  assert.match(editor,/this\.saveWithProtectedRetry\(structuredClone\(doc\),true\)/);
  assert.match(editor,/componentDidMount\(\):void\{[\s\S]*this\.ensureInitialDraftPersisted\(\)/);
  assert.match(editor,/prevProps\.document\.id!==this\.props\.document\.id[\s\S]*this\.ensureInitialDraftPersisted\(\)/);
  assert.match(editor,/Unable to save the new draft locally/);
});

test('desktop A4 preview takes a fresh editor snapshot when an iPad crosses the desktop breakpoint',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/private handlePreviewMedia=\(event:MediaQueryListEvent\)=>this\.setState\(state=>\(\{desktopPreview:event\.matches,previewDoc:event\.matches\?structuredClone\(state\.doc\):state\.previewDoc\}\)\)/);
  assert.match(core,/if\(!this\.state\.desktopPreview\)return/);
  assert.match(core,/TemplateRenderer document=\{this\.state\.previewDoc\} scale=\{0\.82\}/);
});

test('single-language legal identity fields honor output language without losing Arabic brand fallback',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/function identityPair\(doc: LourexDocument, en: string, ar: string\)/);
  assert.match(renderer,/if\(doc\.language==='en'\)return <span dir="auto">\{documentDisplayValue\(english,'en'\)\|\|'—'\}<\/span>/);
  assert.doesNotMatch(renderer,/if\(doc\.language==='en'\)[^\n]*english\|\|arabic/);
  assert.match(renderer,/if\(doc\.language==='ar'\)return <span dir="auto">\{arabic\|\|english\|\|'—'\}<\/span>/);
  assert.match(renderer,/function companyName[\s\S]*return identityPair\(doc, doc\.companySnapshot\.nameEn, doc\.companySnapshot\.nameAr\)/);
  assert.match(renderer,/function customerName[\s\S]*return identityPair\(doc, c\?\.companyNameEn \?\? '', c\?\.companyNameAr \?\? ''\)/);
  assert.match(renderer,/party-address">\{identityPair\(doc, addressEn, addressAr\)\}/);
  assert.match(renderer,/safeValue\(doc,cityRaw,'neutral'\)/);
  assert.match(renderer,/<bdi>\{city\}<\/bdi>/);
  assert.match(renderer,/\['Bank Name','اسم البنك',b\.bankName,'neutral'\]/);
  assert.match(renderer,/\['Account Name','اسم الحساب',b\.accountName,'neutral'\]/);
  assert.match(renderer,/if\(doc\.language==='ar'\)return doc\.companySnapshot\.nameAr\.trim\(\)\|\|doc\.companySnapshot\.nameEn\.trim\(\)\|\|'LOUREX'/);
  assert.match(renderer,/function valuePair[\s\S]*documentDisplayValue\(en,'en'\)[\s\S]*documentDisplayValue\(ar,'ar'\)/);
});

test('hidden translations do not create extra A4 item pages in a single-language document',()=>{
  const items=Array.from({length:7},(_,index)=>({
    id:`item-${index}`,
    descriptionEn:`Short product ${index+1}`,
    descriptionAr:'ع'.repeat(400),
    hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'10',unitCost:''
  }));
  assert.equal(paginateItems(items,false,7,'en').length,1);
  assert.ok(paginateItems(items,false,7,'ar').length>1);
  assert.ok(paginateItems(items,false,7,'bilingual').length>1);
});

test('first-page pressure counts only party identity that is actually visible in the document language',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/function identityOutputValues\(doc:LourexDocument,en:string,ar:string\):string\[\]/);
  assert.match(renderer,/if\(doc\.language==='en'\)[\s\S]*documentDisplayValue\(english,'en'\)/);
  assert.match(renderer,/const addressVisible=identityOutputValues\(doc,addressEn,addressAr\)\.length>0/);
  assert.match(renderer,/\.\.\.identityOutputValues\(doc,doc\.companySnapshot\.nameEn,doc\.companySnapshot\.nameAr\)/);
  assert.match(renderer,/\.\.\.identityOutputValues\(doc,c\?\.companyNameEn\?\?'',c\?\.companyNameAr\?\?''\)/);
  assert.doesNotMatch(renderer,/doc\.companySnapshot\.nameEn,doc\.companySnapshot\.nameAr,doc\.companySnapshot\.addressEn,doc\.companySnapshot\.addressAr/);
});

test('oversized item continuation rows keep unrelated cells blank instead of rendering placeholder dashes',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/function continuationValuePair/);
  assert.match(renderer,/continuation\?continuationValuePair\(doc,item\.descriptionEn,item\.descriptionAr\):valuePair/);
  assert.match(renderer,/continuation\?item\.hsCode:item\.hsCode\|\|'—'/);
  assert.match(renderer,/continuation\?origin:origin\|\|'—'/);
  assert.match(renderer,/continuation\?packing:packing\|\|'—'/);
  assert.match(renderer,/continuation\?unit:unit\|\|'—'/);
  assert.match(renderer,/continuation\?'':item\.quantity/);
  assert.match(renderer,/continuation\?'':item\.unitPrice/);
  assert.match(renderer,/continuation\?'':lineTotal\(item\.quantity,item\.unitPrice\)/);
});

test('document runtime changes ship through the explicit-update PWA cache generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
  assert.ok(sw.includes('./src/components/EditorPage.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.match(sw,/SKIP_WAITING/);
});
