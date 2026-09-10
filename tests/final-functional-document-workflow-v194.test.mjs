import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v194 issued output retries clear stale errors without reissuing the saved Final document',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  const start=core.indexOf('private issueAndContinue=async()=>');
  const end=core.indexOf('private unlockFinal=async()=>');
  assert.ok(start>=0&&end>start,'issueAndContinue workflow must exist');
  const workflow=core.slice(start,end);
  assert.match(workflow,/this\.setState\(\{issuing:true,errors:\{\}\}\)/);
  assert.match(workflow,/if\(!alreadyFinal\)\{[\s\S]*await this\.props\.onSave\(finalDoc,false\)/);
  assert.match(workflow,/if\(mode!=='issue'\)await this\.props\.onPrint\(finalDoc,mode\)/);
  assert.match(workflow,/reviewMode:null,issuing:false,doc:finalDoc,saveState:'saved',errors:\{\}/);
});

test('v194 browser workflow covers autosave, issue, PDF/share, retry, quote conversion and close races',async()=>{
  const runner=await read('tests/visual/run-functional-document-workflow.cjs');
  for(const marker of [
    'draft-invoice-pdf-',
    'issue-only-proforma',
    'output-failure-retry',
    'final-quote-conversion-single-flight',
    'linked-final-quote-blocks-reconversion',
    'save-and-close-waits-for-inflight-autosave'
  ])assert.ok(runner.includes(marker),marker);
  assert.match(runner,/PDF output must start only after the final snapshot is saved/);
  assert.match(runner,/retrying output must not issue\/save the document a second time/);
});

test('v194 remains preserved after later immutable PWA generations advance',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/v194 functional document workflow/);
  const current=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
  assert.ok(current&&Number(current[1])>=196,'current immutable PWA generation must not regress below v196');
  assert.match(sw,/lourex-invoice-v195: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v194: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v193: preserved as a legacy marker/);
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
});
