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

test('local QA manifest keeps every baseline browser suite and verifies files exist',async()=>{
  const source=await readFile(new URL('scripts/verify-local.mjs',root),'utf8');
  const start=source.indexOf('const MANIFEST=');
  const end=source.indexOf(';\nconst CONTRACTS',start);
  assert.ok(start>=0&&end>start,'Mandatory browser suite manifest must be parseable');
  const manifest=JSON.parse(source.slice(start+'const MANIFEST='.length,end));
  const mandatory=[...manifest.stability,...Object.values(manifest.current).flat()];
  const historical=Object.values(manifest.legacy).flat();
  assert.ok(mandatory.length>=41,'Do not silently drop current browser regressions');
  assert.ok(historical.length>=14,'Keep existing historical diagnostics available');
  for(const suite of [...mandatory,...historical]){
    assert.match(suite.file,/^tests\/visual\/run-[a-z0-9.-]+\.cjs$/);
    assert.ok(Number.isInteger(suite.seconds)&&suite.seconds>=90);
    await readFile(new URL(suite.file,root),'utf8');
  }
  for(const name of [
    'run-v339-ipad-landscape-draft.cjs',
    'run-obsidian-settings.cjs',
    'run-functional-payments.cjs',
    'run-accounting-foundation-batch7.cjs'
  ])assert.ok(mandatory.some(s=>s.file.endsWith('/'+name)),name+' must remain mandatory');
});
