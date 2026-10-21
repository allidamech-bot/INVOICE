import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {auditEventsFor,auditEventsGlobal} from '../dist/src/lib/audit-trail.js';

function draft(vault,id,number,workspaceId='company-1',branchId='east'){
  const doc=createBlankDocument('invoice',number,vault.company);
  return {...doc,id,number,status:'draft',workspaceId,branchId,revision:1};
}

test('deleting only one draft preserves its exact audit identity and scope without reviving the document',()=>{
  const before=emptyVault(),removed=draft(before,'draft-to-remove','INV-DRAFT-054'),keep=draft(before,'draft-keep','INV-DRAFT-055');
  before.documents=[removed,keep];
  const intended={...before,documents:[keep]};
  const result=appendAuditEventsForVaultDiff(before,intended);
  assert.deepEqual(result.documents.map(row=>row.id),['draft-keep']);
  assert.equal(before.documentEvents.length,0,'source snapshot remains unchanged');
  const events=auditEventsFor(result.documentEvents,'document',removed.id);
  assert.equal(events.length,1);
  const event=events[0];
  assert.equal(event.type,'audit');assert.equal(event.auditAction,'deleted');
  assert.equal(event.auditEntityId,removed.id);assert.equal(event.auditEntityLabel,removed.number);
  assert.equal(event.documentId,removed.id);assert.equal(event.documentNumber,removed.number);
  assert.equal(event.workspaceId,'company-1');assert.equal(event.branchId,'east');
  assert.match(event.note,/Deleted unissued draft/);
  assert.ok(!result.documents.some(row=>row.id===removed.id));
  assert.equal(auditEventsGlobal(JSON.parse(JSON.stringify(result.documentEvents))).length,1);
  assert.deepEqual(appendAuditEventsForVaultDiff(result,result).documentEvents,result.documentEvents,'saved result does not duplicate its deletion');
});

test('an issued or voided financial record is not disguised as a deletable draft',()=>{
  const before=emptyVault(),final=draft(before,'issued-invoice','INV-FINAL');
  final.status='final';before.documents=[final];
  const result=appendAuditEventsForVaultDiff(before,{...before,documents:[]});
  assert.equal(auditEventsFor(result.documentEvents,'document',final.id).length,0);
});

test('existing activity persists while only the removed draft gets a deletion record',()=>{
  const before=emptyVault(),one=draft(before,'draft-a','DRAFT-A','company-1','east'),two=draft(before,'draft-b','DRAFT-B','company-2','west');
  before.documents=[one,two];before.documentEvents=[{id:'prior-event',documentId:'',documentNumber:'',type:'audit',at:'2026-10-20T00:00:00.000Z',note:'Prior action',relatedDocumentId:'',relatedDocumentNumber:'',amount:'',currency:'',auditEntityType:'supplier',auditEntityId:'supplier-1',auditEntityLabel:'Supplier',auditAction:'created',auditActorKind:'user',workspaceId:'company-2',branchId:'west'}];
  const result=appendAuditEventsForVaultDiff(before,{...before,documents:[one]});
  assert.equal(result.documentEvents.filter(event=>event.id==='prior-event').length,1);
  assert.equal(auditEventsFor(result.documentEvents,'document','draft-a').length,0);
  assert.equal(auditEventsFor(result.documentEvents,'document','draft-b').length,1);
  assert.equal(auditEventsFor(result.documentEvents,'document','draft-b')[0].workspaceId,'company-2');
  assert.equal(auditEventsFor(result.documentEvents,'document','draft-b')[0].branchId,'west');
});

test('the real App draft-delete action goes through the audited persistence path',async()=>{
  const app=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  const deleted=app.slice(app.indexOf('private deleteDocument=async('),app.indexOf('private savePayment=async(',app.indexOf('private deleteDocument=async(')));
  const saved=app.slice(app.indexOf('private persist=async('),app.indexOf('private persistFullMutation=async('));
  assert.match(deleted,/auditedDocument\(vault,target\)/);
  assert.match(deleted,/await this\.persist\(\{\.\.\.vault,documents:vault\.documents\.filter\(d=>d\.id!==target\.id\)\}\)/);
  assert.match(saved,/appendAuditEventsForVaultDiff\(latest,merged\)/);
});
