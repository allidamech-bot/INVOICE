import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('Only free public-repository audit Actions are allowed, without PR triggers or deployment',async()=>{
  const files=await readdir(new URL('.github/workflows/',root)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const workflows=files.filter(f=>/\.ya?ml$/.test(f));
  assert.deepEqual(workflows,['lourex-free-premerge.yml']);
  const content=await readFile(new URL('.github/workflows/lourex-free-premerge.yml',root),'utf8');
  assert.match(content,/runs-on:\s*ubuntu-latest/);
  assert.match(content,/node-version:\s*'24'/);
  assert.match(content,/branches:\s*\n\s*- fix\/audit-workspace-payables-asof-20261009/);
  assert.doesNotMatch(content,/^\s*pull_request\s*:/m);
  assert.doesNotMatch(content,/^\s*(?:deploy|environment|target)\s*:\s*production/m);
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
  const mandatory=[...manifest.stability,...Object.values(manifest.current).flat(),...manifest.specialized];
  const historical=Object.values(manifest.legacy).flat();
  assert.ok(mandatory.length>=56,'Do not silently drop current or specialized browser regressions');
  assert.ok(manifest.specialized.length>=15,'Do not silently drop specialized former Actions gates');
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
    'run-accounting-foundation-batch7.cjs',
    'run-document-design-final-deep.cjs',
    'run-v538-quote-editor-final-flow.cjs',
    'run-ai-conversation-final-batch5.cjs',
    'run-tax-vat-batch10.cjs',
    'run-inventory-planning-batch7.cjs'
  ])assert.ok(mandatory.some(s=>s.file.endsWith('/'+name)),name+' must remain mandatory');
});

test('specialized contracts from all retired workflow files remain mandatory',async()=>{
  const source=await readFile(new URL('scripts/verify-local.mjs',root),'utf8');
  for(const contract of [
    'tests/notification-center-browser-batch5.test.mjs',
    'tests/quote-editor-final-lifecycle-v538.test.mjs',
    'tests/ai-conversation-final-batch5.test.mjs',
    'tests/document-design-final-deep-audit.test.mjs',
    'tests/roadmap-hardening-v473.test.mjs',
    'tests/tax-vat-batch10.test.mjs'
  ])assert.ok(source.includes(contract),contract+' must be mandatory');
  assert.match(source,/runBrowserQa\('specialized',MANIFEST\.specialized\)/);
});
