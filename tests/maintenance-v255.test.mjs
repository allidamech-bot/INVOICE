import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v255 rejects stale payment edits and deletes before financial records merge',async()=>{
  const source=await read('src/storage/vault-merge.ts');
  assert.match(source,/guardConcurrentRecordChanges\(base\.payments,intended\.payments,latest\.payments,'Payment'/);
  assert.match(source,/Reopen the invoice before saving or deleting the payment/);
  assert.ok(source.indexOf('guardConcurrentRecordChanges(base.payments')<source.indexOf('const payments=mergeRecords(base.payments'));
});

test('v255 preserves requested PDF or share mode through draft issuance',async()=>{
  const source=await read('src/components/EditorPageCore.tsx');
  const start=source.indexOf('private issueAndContinue=async()=>');
  const end=source.indexOf('private unlockFinal=',start);
  const workflow=source.slice(start,end);
  assert.match(workflow,/if\(mode!=='issue'\)\{/);
  assert.match(workflow,/__LOUREX_PREPARE_PDF__\?\.\(mode\)/);
  assert.ok(workflow.indexOf('__LOUREX_PREPARE_PDF__')<workflow.indexOf('await this.props.onPrint(finalDoc,mode)'));
});

test('v255 refreshes installed PWA clients with the settlement and output fixes',async()=>{
  const [sourceWorker,builtWorker]=await Promise.all([read('public/sw.js'),read('dist/sw.js')]);
  const marker='lourex-invoice-v255: preserve concurrent payments and draft PDF/share output intent';
  assert.ok(sourceWorker.includes(marker));
  assert.ok(builtWorker.includes(marker));
  for(const asset of ['./src/components/EditorPageCore.js','./src/storage/vault-merge.js'])assert.ok(builtWorker.includes(asset),asset);
});
