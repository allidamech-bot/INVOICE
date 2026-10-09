import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('No approved public-repository workflow may use PR triggers, paid runners or production deployment',async()=>{
  const files=await readdir(new URL('.github/workflows/',root)).catch(error=>{
    if(error.code==='ENOENT')return [];throw error;
  });
  const yaml=files.filter(name=>/\.ya?ml$/.test(name));
  const approved=new Set(['lourex-free-premerge.yml','qa-legacy-fix-free.yml']);
  assert.ok(yaml.length>=1,'Free QA workflows must be present');
  assert.ok(yaml.every(name=>approved.has(name)),'Unapproved Actions workflow');
  for(const name of yaml){
    const workflow=await read('.github/workflows/'+name);
    assert.match(workflow,/^\s*push:\s*$/m);
    assert.doesNotMatch(workflow,/^\s*pull_request\s*:/m);
    const runners=[...workflow.matchAll(/^\s*runs-on:\s*(.+)$/gm)].map(row=>row[1].trim());
    assert.ok(runners.length>=1);
    assert.ok(runners.every(runner=>runner==='ubuntu-latest'));
    assert.doesNotMatch(workflow,/^\s*(?:deploy|environment|target)\s*:\s*production/m);
    assert.doesNotMatch(workflow,/^\s*secrets\s*:/m);
  }
});
test('Local signoff blocks security, build and changed contract regressions',async()=>{
  const local=await read('scripts/verify-local.mjs');
  for(const needed of ['--audit-level=high','security-check.mjs','typecheck','build','gitFiles()','--test','b07-sales-delivery-confirmation.test.mjs'])
    assert.ok(local.includes(needed),'Missing mandatory QA: '+needed);
  assert.match(local,/process.exitCode=1/);
  assert.match(local,/--quick skips mandatory browser QA/);
});
test('Mobile, iPad, document and Chromium/WebKit checks remain available locally',async()=>{
  const local=await read('scripts/verify-local.mjs');
  for(const suite of [
    'run-v326-access-surfaces.cjs',
    'run-v326-studio-security-overlays.cjs',
    'run-v337-draft-output.cjs',
    'run-v337-create-center.cjs',
    'run-v337-document-actions.cjs',
    'run-v337-shell-navigation.cjs',
    'run-v339-ipad-landscape-draft.cjs',
    'run-v339-ipad-portrait-draft.cjs'
  ])assert.ok(local.includes(suite),suite);
  for(const browser of ['chromium','webkit'])assert.ok(local.includes(browser),browser);
  assert.match(local,/assertBrowserReady/);
  assert.match(local,/runBrowserQa/);
  assert.match(local,/--legacy/);
});