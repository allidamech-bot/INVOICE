import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const catalogRuntime=async()=>{
  const source=await read('src/lib/document-kinds.ts');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context={exports:{}};
  vm.runInNewContext(compiled,context);
  return context.exports;
};

test('purchase orders have a genuine supplier document type, own numbering and printable title',async()=>{
  const [types,docs,vault,template,kinds]=await Promise.all([
    read('src/types.ts'),read('src/lib/documents.ts'),read('src/storage/vault.ts'),
    read('src/templates/TemplateRenderer.tsx'),catalogRuntime()
  ]);
  const po=kinds.businessDocumentDefinition('purchase-order');
  assert.equal(po.party,'supplier');
  assert.equal(po.financial,false,'a purchase order does not post a sales invoice');
  assert.equal(po.bankAllowed,false);
  assert.equal(kinds.documentKindTitle('purchase-order').en,'PURCHASE ORDER');
  assert.equal(kinds.documentNumberPrefix('purchase-order'),'PO');
  assert.equal(kinds.documentSecondaryDateKind('purchase-order'),'requested-delivery');
  assert.equal(kinds.documentCanConvertToInvoice('purchase-order'),false);
  assert.equal(kinds.businessDocumentDefinition('invoice').party,'customer');
  assert.equal(kinds.businessDocumentDefinition('invoice').financial,true);
  assert.match(types,/purchase-order/);
  assert.match(docs,/purchaseOrderPrefix/);
  assert.match(vault,/supplierSnapshot/);
  assert.match(template,/documentKindTitle\(doc\.kind,doc\.role\)/);
});

test('image and PDF attachments remain in the encrypted document payload with bounded uploads',async()=>{
  const [types,panel,vault]=await Promise.all([read('src/types.ts'),read('src/components/DocumentAttachmentsSection.tsx'),read('src/storage/vault.ts')]);
  assert.match(types,/interface DocumentAttachment/);
  assert.match(types,/attachments\?: DocumentAttachment\[\]/);
  assert.match(panel,/application\/pdf/);
  assert.match(panel,/MAX_TOTAL_BYTES/);
  assert.match(panel,/MAX_FILE_BYTES/);
  assert.match(panel,/MAX_FILES/);
  assert.match(panel,/checkBudget\(this\.props\.document\.attachments\?\?\[\]\)/);
  assert.match(panel,/multiple onChange=\{this\.add\}/);
  assert.match(vault,/attachments/);
});

test('an explicit Firebase login cannot reuse a previously unlocked PIN session',async()=>{
  const [entry,session,selector,html]=await Promise.all([
    read('src/app/index.tsx'),read('src/storage/session.ts'),
    read('src/app/AuthScreenSelector.tsx'),read('index.html')
  ]);
  const startup=entry.slice(entry.indexOf('async function resolveRequiredAccountSession'),entry.indexOf('function startAccountSignOutWatcher'));
  assert.match(startup,/lourex-auth-just-signed-in/);
  assert.match(startup,/if\(freshLogin\)await suspendSession\(\);else await resumeAccountSession\(user\.uid\)/);
  assert.match(startup,/setActiveAccountUid\(user\.uid\)/);
  assert.match(startup,/await activateAccountStorage\(user\.uid\)/);
  assert.ok(startup.indexOf('await activateAccountStorage(user.uid)')<startup.indexOf('if(freshLogin)await suspendSession()'));
  assert.match(session,/runtimePinAuthorized/);
  assert.match(selector,/currentCloudUser\(\)/);
  assert.match(html,/data-lourex-booting/);
  assert.doesNotMatch(startup,/establishSession\(/);
});

test('purchase orders use supplier parties and costs without customer/sales accounting',async()=>{
  const [home,details,renderer,settings,readiness,kinds]=await Promise.all([
    read('src/components/WorkspaceHome.tsx'),read('src/components/DocumentsPage.tsx'),
    read('src/templates/TemplateRenderer.tsx'),read('src/components/SettingsModal.tsx'),
    read('src/lib/readiness.ts'),catalogRuntime()
  ]);
  assert.equal(kinds.documentParty('purchase-order'),'supplier');
  assert.equal(kinds.isSupplierDocumentKind('purchase-order'),true);
  assert.equal(kinds.isSupplierDocumentKind('invoice'),false);
  assert.equal(kinds.documentBankAllowed('purchase-order'),false);
  assert.match(home,/if\(isSupplierDocumentKind\(doc\.kind\)\)/);
  assert.match(details,/if\(!isSupplierDocumentKind\(doc\.kind\)\)return customerName\(doc\)/);
  assert.match(details,/const supplier=doc\.supplierSnapshot/);
  assert.match(details,/this\.renderAttachments\(doc\)/);
  assert.match(renderer,/isSupplierDocumentKind\(doc\.kind\)\?'Buyer \/ From':'Seller \/ From'/);
  assert.match(renderer,/isSupplier\?'Supplier \/ Vendor':'Bill To \/ Customer'/);
  assert.match(renderer,/doc\.kind==='purchase-order'\?'Unit Cost':'Unit Price'/);
  assert.match(settings,/Purchase Order Prefix/);
  assert.match(readiness,/isSupplierDocumentKind\(doc\.kind\) \? !errors\.supplier : !errors\.customer/);
});

test('purchase order delivery date and cancellation are distinct from invoice due and void dates',async()=>{
  const [core,renderer,details,kinds]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/templates/TemplateRenderer.tsx'),
    read('src/components/DocumentsPage.tsx'),catalogRuntime()
  ]);
  assert.equal(kinds.documentSecondaryDateKind('purchase-order'),'requested-delivery');
  assert.equal(kinds.documentSecondaryDateKind('invoice'),'due-date');
  assert.equal(kinds.documentSecondaryDateKind('proforma'),'valid-until');
  assert.match(core,/if\(d\.kind!=='invoice'\)return next/);
  assert.match(core,/secondaryDateKind==='requested-delivery'\?t\('Requested Delivery'/);
  assert.match(renderer,/secondary==='requested-delivery'\?'Requested Delivery'/);
  assert.match(renderer,/doc\.kind==='proforma'\|\|doc\.kind==='purchase-order'\)\?localized\(doc,'CANCELLED','ملغى'\)/);
  assert.match(details,/doc\.kind==='proforma'\|\|doc\.kind==='purchase-order'\)\?t\('Cancelled','ملغى'\)/);
});
