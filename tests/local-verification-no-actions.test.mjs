import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('GitHub QA uses only safe read-only free branch runners, never production deployment',async()=>{
  const files=await readdir(new URL('.github/workflows/',root)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const workflows=files.filter(f=>/\.ya?ml$/.test(f));
  assert.ok(workflows.length>=1,'free branch QA must remain available');
  for(const file of workflows){
    const yaml=await readFile(new URL('.github/workflows/'+file,root),'utf8');
    assert.match(yaml,/runs-on:\s*ubuntu-latest/,file);
    assert.match(yaml,/permissions:\s*\n\s*contents:\s*read/,file);
    assert.match(yaml,/^on:\s*\n(?:[\s\S]*?)(?:^  (?:push|pull_request):)/m,'safe QA trigger required: '+file);
    const pushBlock=yaml.match(/^  push:\s*\n([\s\S]*?)(?=^  [a-z_]+:|^permissions:|^jobs:|$(?![\s\S]))/m)?.[1];
    if(pushBlock)assert.match(pushBlock,/branches:\s*(?:\[[^\]]*(?:fix|feat)\/|\n\s+-\s+(?:fix|feat)\/)/,file+' must push only feature branches');
    assert.doesNotMatch(yaml,/^\s*(?:pull_request_target|deployment|release|schedule):/m,file);
    // PRs targeting main run read-only verification and are not production
    // pushes. Only a main *push* can automatically deploy via Git integration;
    // preserve the existing push-block feature-branch restriction above.
    // Reject explicit main push targets in YAML block OR inline array forms,
    // while allowing read-only pull_request checks targeting main.
    if(pushBlock)assert.doesNotMatch(pushBlock,/^\s*(?:-\s*main\s*$|branches:\s*\[[^\]\r\n]*\bmain\b[^\]\r\n]*\])/m,file);
    assert.doesNotMatch(yaml,/\b(?:vercel\s+(?:deploy|promote|--prod)|gh\s+pr\s+merge|git\s+push\s+origin\s+main)\b/i,file);
    assert.doesNotMatch(yaml,/\b(?:secrets\.|environment:\s*production)/i,file);
  }
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
  assert.match(source,/runBrowserQa\('specialized',MANIFEST\.specialized(?:,mandatoryBrowserFailures)?\)/);
  assert.match(source,/if\(mandatoryBrowserFailures\.length\)/,'aggregated browser failures must still reject release');
  assert.match(source,/throw Error\('Mandatory browser QA failed/,'aggregated browser failures must remain fatal');
});


test('local verification retains safe branch QA and critical financial, AI and cloud contracts',async()=>{
  const source=await readFile(new URL('scripts/verify-local.mjs',root),'utf8');
  const check=source.slice(source.indexOf('function runLocalChecks()'),source.indexOf('async function main()'));
  assert.match(check,/assertSafeBranchQaWorkflows\(\)/,'safe workflow preflight must run');
  assert.doesNotMatch(source,/function assertNoActions\(/,'do not reject all legitimate GitHub Actions workflows');
  const block=source.match(/const CONTRACTS=\[([\s\S]*?)\];/)?.[1];
  assert.ok(block,'mandatory contract list must be present');
  for(const contract of [
    'tests/b07-sales-stock-issue.test.mjs',
    'tests/invoice-stock-ledger-20261015.test.mjs',
    'tests/invoice-void-stock-20261015.test.mjs',
    'tests/sales-return-stock-20261015.test.mjs',
    'tests/accounting-foundation-batch7.test.mjs',
    'tests/reports-v135.test.mjs',
    'tests/cloud-first-two-device.test.mjs',
    'tests/cloud-first-manifest-race.test.mjs',
    'tests/ai-operational-stock-posting.test.mjs',
    'tests/ai-account-cache-isolation.test.mjs'
  ])assert.ok(block.includes("'"+contract+"'"),contract+' must be release-gating');
});
