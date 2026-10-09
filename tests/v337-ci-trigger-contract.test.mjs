import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Hosted verification is limited to free feature-branch pushes and cannot publish Production',async()=>{
  const files=await readdir(new URL('.github/workflows/',root)).catch(error=>{
    if(error.code==='ENOENT')return [];throw error;
  });
  const workflows=files.filter(name=>/\.ya?ml$/.test(name));
  assert.ok(workflows.length,'free feature-branch verification must exist');
  for(const name of workflows){
    const yaml=await read(new URL('.github/workflows/'+name,root));
    assert.match(yaml,/\s+push:\s*\n\s+branches:\s*\n\s+-\s+fix\//,name);
    assert.match(yaml,/runs-on:\s*ubuntu-latest/,name);
    assert.match(yaml,/permissions:\s*\n\s*contents:\s*read/,name);
    assert.doesNotMatch(yaml,/^\s*(?:pull_request|pull_request_target|deployment|release|schedule):/m,name);
    assert.doesNotMatch(yaml,/^\s+-\s+main\s*$/m,name);
    assert.doesNotMatch(yaml,/\b(?:vercel\s+(?:deploy|promote|--prod)|gh\s+pr\s+merge|git\s+push\s+origin\s+main)\b/i,name);
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