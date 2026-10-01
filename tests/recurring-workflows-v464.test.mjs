import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault, APP_SCHEMA_VERSION } from '../dist/src/lib/defaults.js';
import { migrateVault } from '../dist/src/storage/vault.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';
import { completeRecurringRun, createDocumentRecurringWorkflow, createPurchaseRecurringWorkflow, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, nextRecurringDate, recurringWorkflowDue } from '../dist/src/lib/recurring-workflows.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('batch12 migrates encrypted vault schema with recurring workflows',()=>{
  const legacy=emptyVault();
  legacy.schemaVersion=16;
  delete legacy.recurringWorkflows;
  const migrated=migrateVault(legacy);
  assert.ok(APP_SCHEMA_VERSION>=17);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.deepEqual(migrated.recurringWorkflows,[]);
});

test('batch12 cadence math clamps month ends deterministically',()=>{
  assert.equal(nextRecurringDate('2026-01-31','monthly',1),'2026-02-28');
  assert.equal(nextRecurringDate('2028-01-31','monthly',1),'2028-02-29');
  assert.equal(nextRecurringDate('2026-10-01','quarterly',2),'2027-04-01');
  assert.equal(nextRecurringDate('2026-10-01','weekly',2),'2026-10-15');
});

test('batch12 recurring document only materializes a clean reviewable draft once per scheduled date',()=>{
  const vault=emptyVault();
  const source=createBlankDocument('invoice','INV-2026-0010',vault.company);
  source.status='final';source.issueDate='2026-09-01';source.dueDate='2026-10-01';
  source.customerSnapshot={sourceCustomerId:'c1',companyNameEn:'Acme',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  source.attachments=[{id:'a1',name:'secret.pdf',mimeType:'application/pdf',size:4,dataUrl:'data:application/pdf;base64,AAAA',createdAt:'2026-09-01T00:00:00.000Z'}];
  const workflow=createDocumentRecurringWorkflow(source,{cadence:'monthly',nextRunDate:'2026-10-01'});
  assert.equal(workflow.documentTemplate.status,'draft');
  assert.deepEqual(workflow.documentTemplate.attachments,[]);
  assert.deepEqual(workflow.generatedRuns,[]);
  const draft=materializeRecurringDocumentDraft(workflow,'INV-2026-0011');
  assert.equal(draft.status,'draft');assert.equal(draft.lifecycleStatus,'active');assert.equal(draft.issueDate,'2026-10-01');assert.equal(draft.dueDate,'2026-10-31');
  assert.notEqual(draft.id,source.id);assert.deepEqual(draft.attachments,[]);
  const completed=completeRecurringRun(workflow,{id:draft.id,number:draft.number});
  assert.equal(completed.generatedRuns.length,1);assert.equal(completed.nextRunDate,'2026-11-01');
  assert.throws(()=>materializeRecurringDocumentDraft(completed,'INV-2026-0012','2026-10-01'),/already generated/i);
});

test('batch12 recurring purchase stays draft and never posts inventory automatically',()=>{
  const supplier=createSupplier();supplier.id='s1';supplier.nameEn='Supplier';
  const source=createPurchase([], [supplier], 'USD');source.date='2026-09-15';source.dueDate='2026-10-15';source.items=[createPurchaseItem()];source.items[0].descriptionEn='Carton';source.items[0].quantity='5';source.items[0].unitCost='10';
  const workflow=createPurchaseRecurringWorkflow(source,{cadence:'monthly',nextRunDate:'2026-10-15'});
  assert.deepEqual(workflow.generatedRuns,[]);
  const draft=materializeRecurringPurchaseDraft(workflow,'PUR-2026-0002');
  assert.equal(draft.status,'draft');assert.equal(draft.postedAt,'');assert.equal(draft.reversedAt,'');assert.equal(draft.date,'2026-10-15');assert.equal(draft.dueDate,'2026-11-14');
});

test('batch12 due predicate respects pause, end date, and generated-run idempotence',()=>{
  const vault=emptyVault();const source=createBlankDocument('proforma','QUO-2026-0001',vault.company);source.issueDate='2026-09-01';
  const workflow=createDocumentRecurringWorkflow(source,{cadence:'monthly',nextRunDate:'2026-10-01',endDate:'2026-12-01'});
  assert.equal(recurringWorkflowDue(workflow,'2026-10-01'),true);
  assert.equal(recurringWorkflowDue({...workflow,enabled:false},'2026-10-01'),false);
  const completed=completeRecurringRun(workflow,{id:'doc2',number:'QUO-2026-0002'});
  assert.equal(recurringWorkflowDue(completed,'2026-10-01'),false);
});

test('batch12 merge keeps independent recurring workflow writes and rejects conflicting edits',()=>{
  const base=emptyVault();const source=createBlankDocument('proforma','QUO-2026-0001',base.company);source.issueDate='2026-09-01';
  const workflow=createDocumentRecurringWorkflow(source,{cadence:'monthly',nextRunDate:'2026-10-01'});base.recurringWorkflows=[workflow];
  const intended=structuredClone(base),latest=structuredClone(base);
  intended.recurringWorkflows[0].title='Local title';
  latest.customers=[];
  const merged=mergeVaultIntent(base,intended,latest);
  assert.equal(merged.recurringWorkflows[0].title,'Local title');
  const conflictLatest=structuredClone(base);conflictLatest.recurringWorkflows[0].title='Remote title';
  assert.throws(()=>mergeVaultIntent(base,intended,conflictLatest),/Recurring workflow changed on another device/);
});

test('batch12 UI contract exposes recurring manager in documents and purchasing without finalize/send automation',async()=>{
  const [app,docs,ops,manager]=await Promise.all([read('src/app/App.tsx'),read('src/components/DocumentsPage.tsx'),read('src/components/OperationsPage.tsx'),read('src/components/RecurringWorkflowsManager.tsx')]);
  assert.match(app,/RecurringWorkflowsManager/);
  assert.match(app,/processDueRecurringWorkflows/);
  assert.match(docs,/onMakeRecurring/);
  assert.match(ops,/onMakeRecurringPurchase/);
  assert.match(manager,/never finalize, post, approve, or send automatically/);
  assert.doesNotMatch(app,/finalizeRecurring|sendRecurring|postRecurring/);
});