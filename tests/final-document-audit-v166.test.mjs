import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { paginateItems } from '../dist/src/lib/documents.js';

const read=path=>readFile(path,'utf8');

test('new quotation, invoice and customer drafts are durably stored before the editor opens',async()=>{
  const [app,editor]=await Promise.all([read('src/app/App.tsx'),read('src/components/EditorPage.tsx')]);
  const create=app.slice(app.indexOf('private newDocument=async('),app.indexOf('private newDocumentForCustomer=async('));
  const customer=app.slice(app.indexOf('private newDocumentForCustomer=async('),app.indexOf('private saveDocument=async('));
  assert.match(create,/if\(this\.documentCreateBusy\|\|!confirmWorkspaceDeparture\(\)\)return/);
  assert.match(create,/await reservation;await this\.persist\(\{\.\.\.vault,documents:\[\.\.\.vault\.documents,doc\]\}\)/);
  assert.ok(create.indexOf('await this.persist(')<create.indexOf("this.setState({screen:'editor'"),
    'draft must be stored before entering the editor');
  assert.match(customer,/const prepared=applyCustomerCommercialDefaults/);
  assert.match(customer,/await this\.persist\(\{\.\.\.vault,documents:\[\.\.\.vault\.documents,prepared\]\}\)/);
  assert.ok(customer.indexOf('await this.persist(')<customer.indexOf("this.setState({screen:'editor'"),
    'customer defaults must be saved before opening the document');
  assert.doesNotMatch(editor,/ensureInitialDraftPersisted/,'opening an editor must not trigger a second implicit save loop');
  assert.match(editor,/private saveWithProtectedRetry=async\(doc:LourexDocument,auto\?:boolean\)/);
});

test('live A4 preview is mounted only where the desktop preview pane is actually visible',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/window\.matchMedia\('\(min-width:1181px\)'\)/);
  assert.doesNotMatch(core,/window\.matchMedia\('\(min-width:901px\)'\)/);
  assert.match(core,/private handlePreviewMedia=\(event:MediaQueryListEvent\)=>this\.setState\(state=>\(\{desktopPreview:event\.matches,previewDoc:event\.matches\?previewDocument\(state\.doc\):state\.previewDoc\}\)\)/);
  assert.match(core,/return doc\.attachments\?\.length\?\{\.\.\.doc,attachments:\[\]\}:doc/);
  assert.match(core,/if\(!this\.state\.desktopPreview\)return/);
  assert.match(core,/TemplateRenderer document=\{this\.state\.previewDoc\} scale=\{0\.82\}/);
});

test('single-language legal identity fields honor output language without losing Arabic brand fallback',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/function identityPair\(doc: LourexDocument, en: string, ar: string\)/);
  assert.match(renderer,/if\(doc\.language==='en'\)return englishFragment\(documentDisplayValue\(english,'en'\)\|\|'—'\)/);
  assert.match(renderer,/function englishFragment\(value:string\)[\s\S]*lang="en" dir="ltr"/);
  assert.doesNotMatch(renderer,/if\(doc\.language==='en'\)[^\n]*english\|\|arabic/);
  assert.match(renderer,/if\(doc\.language==='ar'\)return arabicFragment\(arabic\|\|english\|\|'—'\)/);
  assert.match(renderer,/function arabicFragment\(value:string\)[\s\S]*lang="ar" dir="rtl"/);
  assert.match(renderer,/function companyName[\s\S]*return identityPair\(doc, doc\.companySnapshot\.nameEn, doc\.companySnapshot\.nameAr\)/);
  assert.match(renderer,/function customerName[\s\S]*return identityPair\(doc, c\?\.companyNameEn \?\? '', c\?\.companyNameAr \?\? ''\)/);
  assert.match(renderer,/const addressVisible=identityOutputValues\(doc,addressEn,addressAr\)\.length>0/);
  assert.match(renderer,/addressVisible\?<div className="party-address">\{identityPair\(doc,addressEn,addressAr\)\}<\/div>:null/);
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
  assert.match(renderer,/continuation\?'':documentPriceOptional\(doc\.kind\)\?'—':item\.unitPrice/);
  assert.match(renderer,/continuation\?'':documentPriceOptional\(doc\.kind\)\?'—':lineTotal\(item\.quantity,item\.unitPrice\)/);
  assert.match(renderer,/unitPrice:index===0\?item\.unitPrice:''/);
});

test('document runtime changes ship through the explicit-update PWA cache generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
  assert.ok(sw.includes('./src/components/EditorPage.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.match(sw,/SKIP_WAITING/);
});