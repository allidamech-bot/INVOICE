import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('GitHub Actions workflow YAML is absent',async()=>{
  const files=await readdir(new URL('.github/workflows/',root)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  assert.deepEqual(files.filter(f=>/\.ya?ml$/.test(f)),[]);
});
test('local signoff requires security, Batch 7 contracts and browser QA',async()=>{
  const content=await readFile(new URL('scripts/verify-local.mjs',root),'utf8');
  for(const fragment of ['--audit-level=high','security-check.mjs','typecheck','build','gitFiles()','assertBrowserReady','runBrowserQa','b07-sales-delivery-confirmation.test.mjs','webkit','chromium','process.exitCode=1'])
    assert.ok(content.includes(fragment),fragment);
});
