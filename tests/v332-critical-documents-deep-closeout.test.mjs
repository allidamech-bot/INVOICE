import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const kinds=read('src/lib/document-kinds.ts');
const docs=read('src/lib/documents.ts');
const editor=read('src/components/EditorPageCore.tsx');
const review=read('src/components/DocumentReviewModal.tsx');
const shell=read('src/components/AppShell.tsx');
const app=read('src/app/App.tsx');
const entry=read('public/document-entry-v302.js');
const runtime=read('src/app/index.tsx');
const pull=read('public/pull-to-refresh.js');
const renderer=read('src/templates/TemplateRenderer.tsx');
const thumbs=read('src/templates/TemplateThumbnails.tsx');
const css=read('src/styles/v332-critical-documents-deep-closeout.css');
const v330=read('src/styles/v330-critical-documents-closeout.css');
const attachments=read('src/components/DocumentAttachmentsSection.tsx');

test('critical document catalog keeps all ten workflows in the requested order',()=>{
  const expected=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','credit-note','statement-account'];
  let last=-1;
  for(const kind of expected){
    const at=kinds.indexOf(`kind:'${kind}'`);
    assert.ok(at>last,`${kind} catalog position must stay stable`);
    last=at;
  }
  for(const kind of expected)assert.ok(entry.includes(`'${kind}'`)||entry.includes(`\"${kind}\"`),`runtime identity missing ${kind}`);
});

test('supplier documents stay supplier-owned through validation and final review',()=>{
  assert.match(kinds,/kind:'rfq'[\s\S]*party:'supplier'/);
  assert.match(kinds,/kind:'purchase-order'[\s\S]*party:'supplier'/);
  assert.match(docs,/isSupplierDocumentKind\(doc\.kind\)[\s\S]*errors\.supplier='Select a supplier\.'/);
  assert.match(editor,/isSupplierDocument\?<PurchaseOrderPartySection/);
  assert.match(review,/isSupplierDocumentKind\(doc\.kind\)/);
  assert.match(review,/label:t\('Supplier','المورد'\)/);
  assert.match(review,/company and supplier names/);
});

test('quotation family and invoice conversion remain explicit and safe',()=>{
  assert.match(kinds,/documentCanConvertToInvoice\(kind:DocumentKind\):boolean\{return kind==='proforma'\|\|kind==='proforma-invoice'/);
  assert.match(docs,/Only an active Final quotation or proforma invoice can be converted/);
  assert.match(docs,/kind: 'invoice'/);
  assert.match(app,/convertedFromId/);
  assert.match(app,/documentCanConvertToInvoice/);
});

test('RFQ and Delivery Note are non-priced documents in editor, detail and output',()=>{
  assert.match(kinds,/kind:'rfq'[\s\S]*priceOptional:true/);
  assert.match(kinds,/kind:'delivery-note'[\s\S]*priceOptional:true/);
  assert.match(docs,/!documentPriceOptional\(doc\.kind\) && !item\.unitPrice\.trim\(\)/);
  for(const kind of ['rfq','delivery-note']){
    assert.ok(css.includes(`data-document-kind=\"${kind}\"`));
    assert.ok(css.includes(`kind-${kind}`));
  }
  assert.match(css,/\.mobile-total[\s\S]*display:none!important/);
  assert.match(css,/items-table th:nth-last-child\(-n\+2\)/);
  assert.match(renderer,/documentPriceOptional\(doc\.kind\)/);
});

test('Payment Receipt defaults and presentation are receipt-specific',()=>{
  assert.match(kinds,/kind:'payment-receipt'[\s\S]*priceOptional:false[\s\S]*bankAllowed:false/);
  assert.match(docs,/if\(kind==='payment-receipt'\)item\.unit='Unit'/);
  assert.match(docs,/const noAdjustments=documentPriceOptional\(kind\)\|\|paymentReceipt/);
  assert.match(docs,/showHsCode: !paymentReceipt, showOrigin: !paymentReceipt/);
  assert.match(css,/kind-payment-receipt/);
  assert.match(css,/Receipt Amount/);
  assert.match(css,/مبلغ الإيصال/);
});

test('Credit Note can only originate from an eligible issued invoice',()=>{
  assert.match(app,/openCreditNoteLauncher/);
  assert.match(app,/invoiceCreditCapacity/);
  assert.match(app,/source\.role==='credit-note'/);
  assert.match(app,/Create a new credit note from the source invoice instead of duplicating a credit note/);
  assert.match(app,/createCreditNote\(source\)/);
  assert.match(renderer,/data-role=\{doc\.role\}/);
  assert.match(css,/data-document-role=\"credit-note\"/);
});

test('Statement of Account remains a finance workflow rather than a fake vault document',()=>{
  assert.match(app,/catalogLauncher:'statement-account'/);
  assert.match(app,/lourex-finance-statement/);
  assert.doesNotMatch(read('src/types.ts'),/DocumentKind[^\n]*statement-account/);
});

test('all 18 templates remain selectable and actual output keeps template/kind/role identity',()=>{
  const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
  for(const id of templates){
    assert.ok(thumbs.includes(`id: '${id}'`),`thumbnail missing ${id}`);
    assert.ok(v330.includes(`template-${id}`),`print identity finish missing ${id}`);
  }
  assert.match(renderer,/className=\{`invoice-page template-\$\{variant\} kind-\$\{doc\.kind\} role-\$\{doc\.role\}/);
  assert.match(renderer,/data-kind=\{doc\.kind\}/);
  assert.match(renderer,/data-role=\{doc\.role\}/);
});

test('Create Center has stable runtime document identities even if visual order changes',()=>{
  for(const kind of ['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt'])assert.ok(shell.includes(`createDocument('${kind}')`));
  assert.match(entry,/menuLabelKinds=new Map/);
  assert.match(entry,/kindFromMenuButton/);
  assert.match(entry,/normalizeCreateMenuKinds/);
  assert.match(entry,/button\.dataset\.kind=kind/);
});

test('editor actions preserve save, preview, PDF and share paths',()=>{
  assert.match(editor,/this\.output\('pdf'\)/);
  assert.match(editor,/this\.output\('share'\)/);
  assert.match(editor,/this\.save\(false\)/);
  assert.match(editor,/mobilePreview:true/);
  assert.match(editor,/DocumentReviewModal/);
});

test('attachments remain encrypted-workspace supporting files with iPhone budgets',()=>{
  assert.match(attachments,/MAX_FILE_BYTES=\(IOS_WEBKIT\?3:5\)\*MB/);
  assert.match(attachments,/MAX_TOTAL_BYTES=\(IOS_WEBKIT\?5:8\)\*MB/);
  assert.match(attachments,/application\/pdf/);
  assert.match(attachments,/image\/jpeg/);
  assert.match(attachments,/genuineAttachment/);
  assert.match(editor,/DocumentAttachmentsSection/);
});

test('no automatic account, cloud or pull refresh can tear down an open document editor',()=>{
  assert.match(entry,/guardAutomaticAccountTransition/);
  assert.match(entry,/editorOrUnsafeWorkspaceOpen/);
  assert.match(runtime,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(runtime,/isDocumentEditorOpen\(\)/);
  assert.match(runtime,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(pull,/if\(!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
  assert.match(pull,/data-lourex-document-editor/);
  assert.match(pull,/\.editor-main,.editor-screen/);
});

test('v332 owns theme-safe final review surfaces and document-specific mobile semantics',()=>{
  assert.match(css,/issue-review-status/);
  assert.match(css,/background:var\(--ft-surface-2\)!important/);
  assert.match(css,/data-document-kind=\"payment-receipt\"[\s\S]*item-pricing-grid/);
  assert.match(css,/data-document-kind=\"rfq\"[\s\S]*mobile-total/);
  assert.match(css,/data-document-kind=\"delivery-note\"[\s\S]*mobile-total/);
});
