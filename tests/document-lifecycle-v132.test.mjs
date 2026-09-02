import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('v132 adds encrypted document events revisions and dedicated credit note numbering',async()=>{
  const [types,defaults,merge,vault,docs]=await Promise.all([read('src/types.ts'),read('src/lib/defaults.ts'),read('src/storage/vault-merge.ts'),read('src/storage/vault.ts'),read('src/lib/documents.ts')]);
  assert.ok(types.includes('DocumentEventRecord'));
  assert.ok(types.includes('DocumentRevisionRecord'));
  assert.ok(types.includes('creditNotePrefix'));
  const schemaVersion=Number(defaults.match(/export const APP_SCHEMA_VERSION = (\d+)/)?.[1]??0);
  assert.ok(schemaVersion>=8,'document lifecycle requires schema v8 or later');
  assert.ok(defaults.includes('documentEvents: []'));
  assert.ok(defaults.includes('documentRevisions: []'));
  assert.ok(merge.includes('documentEvents:mergeRecords'));
  assert.ok(merge.includes('documentRevisions:mergeRecords'));
  assert.ok(vault.includes('document event'));
  assert.ok(vault.includes('document revision'));
  assert.ok(docs.includes('nextCreditNoteNumber'));
});

test('v132 safe revision snapshots final before opening a draft revision',async()=>{
  const [core,app,lifecycle]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/app/App.tsx'),read('src/lib/document-lifecycle.ts')]);
  assert.ok(core.includes('onBeginRevision'));
  assert.ok(core.includes('Create a safe revision'));
  assert.ok(!core.includes("const doc={...structuredClone(this.state.doc),status:'draft'"));
  assert.ok(app.includes('createRevisionRecord(current)'));
  assert.ok(app.includes('beginRevisionDraft(current)'));
  assert.ok(lifecycle.includes('snapshot:structuredClone(doc)'));
  assert.ok(app.includes('restoreRevisionSnapshot'));
});

test('v132 final documents preserve audit history through void and block destructive delete',async()=>{
  const [app,lifecycle,panel]=await Promise.all([read('src/app/App.tsx'),read('src/lib/document-lifecycle.ts'),read('src/components/DocumentLifecyclePanel.tsx')]);
  assert.ok(lifecycle.includes('An invoice with recorded payments cannot be voided'));
  assert.ok(lifecycle.includes('An invoice with issued credit notes cannot be voided'));
  assert.ok(app.includes('Issued or audited documents cannot be deleted'));
  assert.ok(panel.includes('Confirm Void'));
  assert.ok(panel.includes('reason'));
  assert.ok(panel.includes('Timeline'));
});

test('v132 credit notes are linked capped and cannot accept payments',async()=>{
  const [lifecycle,payments,renderer,docs]=await Promise.all([read('src/lib/document-lifecycle.ts'),read('src/lib/payments.ts'),read('src/templates/TemplateRenderer.tsx'),read('src/components/DocumentsPage.tsx')]);
  assert.ok(lifecycle.includes('Credit note cannot exceed the remaining invoice balance after payments and prior credits'));
  assert.ok(lifecycle.includes('creditForId:source.id'));
  assert.ok(payments.includes("invoice.role==='credit-note'"));
  assert.ok(renderer.includes('CREDIT NOTE'));
  assert.ok(renderer.includes('Source Invoice'));
  assert.ok(docs.includes('Credit Note'));
});

test('v132 ships lifecycle UI offline and preserves prior cache compatibility markers',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.ok(html.includes('document-lifecycle-v132.css'));
  assert.ok(html.indexOf('document-lifecycle-v132.css')<html.indexOf('performance-polish-v100.css'));
  for(const asset of ['document-lifecycle-v132.css','DocumentLifecyclePanel.js','document-lifecycle.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v132'"));
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v131'"));
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v120'"));
});

test('v132 blocks revision after financial activity and keeps ordinary drafts deletable',async()=>{
  const [app,lifecycle,editor]=await Promise.all([read('src/app/App.tsx'),read('src/lib/document-lifecycle.ts'),read('src/components/EditorPage.tsx')]);
  assert.ok(app.includes('payments or issued credit notes cannot be revised'));
  assert.ok(!app.includes('Number(capacity.available)'));
  assert.ok(lifecycle.includes("event.type!=='created'"));
  assert.ok(editor.includes("lifecycleStatus!=='voided'"));
  assert.ok(app.includes('cancelled quote cannot be converted'));
});
