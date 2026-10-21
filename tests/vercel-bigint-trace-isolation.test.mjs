import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadCompiledFinance} from '../api/_accounting/compiled-finance-loader.js';

test('Vercel server can load the genuine compiled finance engine without duplicating algorithms',async()=>{
  const [{closedPeriodState,assertClosedPeriodUnchanged},{assertPostedStockRestoreContinuity},{APP_SCHEMA_VERSION},{isIsoDate}]=await Promise.all([
    loadCompiledFinance('period').then(mod=>({closedPeriodState:mod.closedPeriodState,assertClosedPeriodUnchanged:mod.assertClosedPeriodUnchanged})),
    loadCompiledFinance('backup'),
    loadCompiledFinance('defaults'),
    loadCompiledFinance('id')
  ]);
  assert.equal(typeof closedPeriodState,'function');
  assert.equal(typeof assertClosedPeriodUnchanged,'function');
  assert.equal(typeof assertPostedStockRestoreContinuity,'function');
  assert.ok(Number.isSafeInteger(APP_SCHEMA_VERSION)&&APP_SCHEMA_VERSION>0);
  assert.equal(isIsoDate('2026-10-21'),true);
});

test('finance module loader is allowlisted and cannot read arbitrary files',async()=>{
  for(const forbidden of ['../package.json','money','/etc/passwd','','../accounting','period.js'])
    await assert.rejects(()=>loadCompiledFinance(forbidden),/Unsupported server finance module/);
});

test('period server preserves exact validated commands and no Vercel static financial import graph',async()=>{
  const [store,format,handler,entry,config]=await Promise.all([
    readFile('api/_accounting/period-store.js','utf8'),
    readFile('api/_accounting/period-format.js','utf8'),
    readFile('api/_accounting/workspace-handler.js','utf8'),
    readFile('api/ai-core.js','utf8'),
    readFile('vercel.json','utf8')
  ]);
  for(const src of [store,format]){
    assert.match(src,/loadCompiledFinance\('/);
    assert.doesNotMatch(src,/from ['"]\.\.\/\.\.\/dist\/src\/lib\//);
  }
  assert.match(handler,/createWorkspaceCommitHandler/);
  assert.match(entry,/await import\('\.\/_accounting\/workspace-handler\.js'\)/);
  const parsed=JSON.parse(config);
  assert.equal(parsed.functions['api/ai-core.js'].includeFiles,'dist/src/**');
  assert.equal(parsed.rewrites.find(item=>item.source==='/api/workspace-commit')?.destination,'/api/ai-core?lourexPeriod=1');
});

test('production period handler and validators import with no credential or database initialization',async()=>{
  const [{validatePeriodCommand},{createPeriodService}]=await Promise.all([
    import('../api/_accounting/period-format.js'),
    import('../api/_accounting/period-store.js')
  ]);
  assert.equal(typeof createPeriodService,'function');
  const valid={operation:'inspect',opId:'0123456789abcdef0123456789abcdef',expectedRevision:'revision-20261021',expectedGeneration:0};
  assert.deepEqual(validatePeriodCommand(valid),valid);
  assert.throws(()=>validatePeriodCommand({...valid,expectedGeneration:-1}),/INVALID_COMMAND/);
});
