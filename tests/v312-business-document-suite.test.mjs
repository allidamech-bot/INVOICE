import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(path,'utf8');

test('v312 keeps the requested ten-document order and labels',async()=>{
  const [catalog,shell]=await Promise.all([read('src/lib/document-kinds.ts'),read('src/components/AppShell.tsx')]);
  const expected=[
    ['draft','Draft','مسودة'],
    ['rfq','RFQ','طلب عرض سعر'],
    ['proforma','Quotation','عرض سعر'],
    ['proforma-invoice','Proforma Invoice','فاتورة مبدئية'],
    ['purchase-order','Purchase Order','طلب شراء'],
    ['invoice','Commercial Invoice','فاتورة تجارية'],
    ['delivery-note','Delivery Note','سند تسليم'],
    ['payment-receipt','Payment Receipt','إيصال دفع'],
    ['credit-note','Credit Note','إشعار دائن'],
    ['statement-account','Statement of Account','كشف حساب']
  ];
  let last=-1;
  for(const [kind,en,ar] of expected){
    assert.ok(catalog.includes(`kind:'${kind}'`));
    assert.ok(catalog.includes(`en:'${en}'`));
    assert.ok(catalog.includes(`ar:'${ar}'`));
    const at=shell.indexOf(`data-kind=\"${kind}\"`);
    assert.ok(at>last,`${kind} should follow requested order`);
    last=at;
  }
});

test('v312 preserves new kinds through vault reload and keeps accounting scoped',async()=>{
  const [vault,editor,documents]=await Promise.all([
    read('src/storage/vault.ts'),
    read('src/components/EditorPage.tsx'),
    read('src/lib/documents.ts')
  ]);
  for(const kind of ['rfq','proforma-invoice','delivery-note','payment-receipt'])assert.ok(vault.includes(`'${kind}'`));
  assert.ok(!vault.includes("'statement-account'"),'statement workflow must remain owned by Finance rather than vault document kinds');
  assert.match(vault,/kind:documentKindValue\(document\?\.kind\)/);
  assert.match(vault,/snapshot\.kind=documentKindValue\(snapshot\.kind\)/);
  assert.match(editor,/props\.document\.kind==='invoice'\?<InvoicePaymentsPanel/);
  assert.match(editor,/props\.document\.kind==='proforma-invoice'/);
  assert.match(documents,/isSupplierDocumentKind\(doc\.kind\)/);
  assert.match(documents,/documentPriceOptional\(doc\.kind\)/);
});

test('v312 output titles are centralized and PWA recognizes every new kind',async()=>{
  const [renderer,entry]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('public/document-entry-v302.js')]);
  assert.match(renderer,/documentKindTitle\(doc\.kind,doc\.role\)/);
  for(const kind of ['rfq','proforma-invoice','delivery-note','payment-receipt','statement-account'])assert.ok(entry.includes(`kind='${kind}'`)||entry.includes(`'${kind}'`));
});


test('v312 pre-merge audit keeps search, readiness and routing semantically aligned',async()=>{
  const [search,readiness,shell,entry,page,quality]=await Promise.all([
    read('src/components/GlobalSearch.tsx'),read('src/lib/readiness.ts'),read('src/components/AppShell.tsx'),
    read('public/document-entry-v302.js'),read('src/components/DocumentsPage.tsx'),read('src/lib/document-quality.ts')
  ]);
  assert.ok(search.includes('documentKindLabel(document.kind,document.role)'));
  assert.ok(search.includes('isSupplierDocumentKind(document.kind)'));
  assert.ok(readiness.includes('const priceOptional=documentPriceOptional(doc.kind)'));
  assert.ok(readiness.includes('isSupplierDocumentKind(doc.kind)'));
  assert.ok(shell.includes('data-kind="statement-account"'));
  assert.ok(shell.includes("onClick={()=>this.navigate('receivables')}"));
  assert.ok(entry.includes('const creatableKinds=new Set'));
  assert.ok(entry.includes('removeItem(pendingKindKey)'));
  assert.ok(page.includes("documentPriceOptional(doc.kind)?'—'"));
  assert.ok(quality.includes('!documentPriceOptional(doc.kind)'));
});
