import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 retires the legacy v176 modal escape hatch instead of keeping a second z-index ladder',async()=>{
  const [v176,reliability]=await Promise.all([
    read('src/styles/mobile-overlap-recovery-v176.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  assert.match(v176,/retired compatibility stub/i);
  assert.doesNotMatch(v176,/z-index\s*:/i);
  assert.doesNotMatch(v176,/\.modal-backdrop\s*\{/);
  for(const token of ['--lourex-z-backdrop','--lourex-z-popover','--lourex-z-sheet','--lourex-z-modal','--lourex-z-preview','--lourex-z-critical'])assert.ok(reliability.includes(token));
});

test('v351 current document action portal closes before actions can open dialogs',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  assert.match(page,/ta-doc-mobile-action-portal/);
  assert.match(page,/private runAction=\(action:\(\)=>void\)=>this\.setState\(\{menuId:''\},action\)/);
  assert.match(page,/onClick=\{\(\)=>this\.runAction\(/);
  assert.doesNotMatch(page,/mobile-document-action-portal/);
});

test('v351 obsolete 6000-level document portal stylesheet is a no-op compatibility path',async()=>{
  const legacy=await read('src/styles/mobile-document-actions-v125.css');
  assert.match(legacy,/retired compatibility stub/i);
  assert.doesNotMatch(legacy,/z-index\s*:/i);
  assert.doesNotMatch(legacy,/position\s*:\s*fixed/i);
  assert.doesNotMatch(legacy,/pointer-events\s*:/i);
});
