import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(path,'utf8');

test('document search includes saved line-item and trade metadata',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/doc\.items\.flatMap\(item=>\[item\.descriptionEn,item\.descriptionAr,item\.hsCode,item\.origin,item\.packing,item\.unit\]\)/);
  assert.match(source,/Search number, customer, item, HS code/);
  assert.match(source,/ابحث بالرقم أو العميل أو الصنف أو HS Code/);
  const start=source.indexOf('function documentSearchText('),end=source.indexOf('function statusLabel(',start);
  const exports={};
  const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(js+';exports.search=documentSearchText;', {exports,letterPlainText:()=>''});
  const data={number:'PI-2026-0002',currency:'USD',items:[{descriptionEn:'Hazelnut Snack',descriptionAr:'بندق',hsCode:'190531',origin:'Turkey',packing:'24x50g',unit:'box'}],
    customerSnapshot:{companyNameEn:'Acme Foods',companyNameAr:'شركة أكمي'},supplierSnapshot:null,
    terms:{incoterm:'CIF',paymentTerms:'Advance',finalDestination:'Jeddah',countryOfOrigin:'Turkey',portOfLoading:'Mersin'},notes:'Priority'};
  const haystack=exports.search(data);
  for(const term of ['pi-2026-0002','hazelnut snack','190531','24x50g','turkey','acme foods','cif','mersin'])assert.ok(haystack.includes(term),term);
});

test('final cancelled or voided documents remain exportable as archival copies',async()=>{
  const [documents,renderer]=await Promise.all([read('src/components/DocumentsPage.tsx'),read('src/templates/TemplateRenderer.tsx')]);
  assert.match(documents,/const canOutput=doc.kind==='draft'\|\|doc.status==='final'/);
  assert.match(documents,/doc.lifecycleStatus==='voided'\?t\('Open archive','فتح الأرشيف'\)/);
  assert.match(documents,/Open archive/);
  assert.match(documents,/فتح الأرشيف/);
  assert.match(renderer,/document-void-watermark/);
  assert.match(renderer,/localized\(doc,'CANCELLED','ملغى'\)/);
  assert.match(renderer,/localized\(doc,'VOID','ملغى'\)/);
});

test('issued and cancelled filters are mutually consistent with overview counts',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/type WorkspaceStatus='all'\|'draft'\|'ready'\|'final'\|'voided'/);
  assert.match(source,/function matchesWorkspaceStatus/);
  assert.match(source,/status==='voided'\)return doc\.lifecycleStatus==='voided'/);
  assert.match(source,/status==='final'\)return doc\.status==='final'&&doc\.lifecycleStatus!=='voided'/);
  assert.match(source,/value="voided">\{t\('Cancelled \/ Voided','ملغى'\)\}/);
  assert.match(source,/const issued=this\.props\.documents\.filter\(doc=>matchesWorkspaceStatus\(doc,'final'\)\)\.length/);
});

test('document detail uses kind-specific due, validity and requested-delivery wording',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  for(const marker of ["doc.kind==='invoice'?t('Due date','تاريخ الاستحقاق')","doc.kind==='purchase-order'?t('Requested delivery','التسليم المطلوب')","doc.kind==='proforma'||doc.kind==='proforma-invoice'","t('Valid until','صالح حتى')"])assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/Validity \/ due/);
});

test('document detail shows trade metadata and explicit tax percentage',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/item\.origin\?`\$\{t\('Origin','المنشأ'\)\}: \$\{item\.origin\}`/);
  assert.match(source,/item\.packing\?`\$\{t\('Packing','التعبئة'\)\}: \$\{item\.packing\}`/);
  assert.match(source,/Tax \$\{doc\.adjustments\.taxPercent\}%/);
  assert.match(source,/الضريبة \$\{doc\.adjustments\.taxPercent\}%/);
});

test('document detail links quote invoice and credit-note relationships',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/const sourceQuote=doc\.convertedFromId/);
  assert.match(source,/const sourceInvoice=doc\.creditForId/);
  assert.match(source,/const creditNotes=doc\.kind==='invoice'&&doc\.role==='standard'/);
  assert.match(source,/Related documents/);
  assert.match(source,/المستندات المرتبطة/);
});

test('voided documents do not reuse the issued visual status class',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/const visualState=doc\.lifecycleStatus==='voided'\?'voided':state/);
  assert.match(source,/className=\{\x60ta-doc-status status-\$\{visualState\}\x60\}/);
  assert.match(source,/const visualState=doc.lifecycleStatus==='voided'\?'voided':state/);
});

test('mobile document actions remain body-ported and dismissible',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/ta-doc-mobile-action-portal/);
  assert.match(source,/ta-doc-action-backdrop/);
  assert.match(source,/role="menu" aria-label=\{t\('Document actions','إجراءات المستند'\)\}/);
  assert.match(source,/ReactDOM\.createPortal/);
  assert.match(source,/onClick=\{\(\)=>this\.setState\(\{menuId:''\}\)\}/);
});

test('payment filtering remains invoice-only and excludes voided invoices',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/doc\.kind!=='invoice'\|\|doc\.role==='credit-note'\|\|doc\.status!=='final'\|\|doc\.lifecycleStatus==='voided'/);
});
