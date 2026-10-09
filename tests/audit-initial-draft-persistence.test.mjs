import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

async function createDraftHarness(){
  const editor=await read('src/components/EditorPage.tsx');
  const start=editor.indexOf('private ensureInitialDraftPersisted=');
  const end=editor.indexOf('componentDidMount():void',start);
  assert.ok(start>=0&&end>start,'exercise the actual production initial-draft persistence method');
  const source='class DraftHarness {\n'+editor.slice(start,end)+'\n}';
  const compiled=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const context={exports:{},structuredClone,t:(en)=>en};
  vm.runInNewContext(compiled+'\nexports.DraftHarness=DraftHarness;',context);
  const harness=new context.exports.DraftHarness();
  harness.initialDraftPersistIds=new Set();
  harness.mounted=true;
  harness.state={persistenceError:''};
  harness.setState=patch=>Object.assign(harness.state,patch);
  return {harness,editor};
}

test('new local invoice draft persists once, even if mount and updates happen before vault rehydration',async()=>{
  const {harness,editor}=await createDraftHarness();
  const saved=[];
  const draft={id:'new-invoice',kind:'invoice',status:'draft',amount:'100'};
  harness.props={document:draft,documents:[]};
  harness.saveWithProtectedRetry=async(copy,auto)=>{
    saved.push({copy,auto});
  };
  harness.ensureInitialDraftPersisted();
  harness.ensureInitialDraftPersisted();
  await Promise.resolve();
  assert.equal(saved.length,1,'one new draft must not be posted twice');
  assert.notStrictEqual(saved[0].copy,draft,'the pending save must own a snapshot');
  assert.equal(saved[0].copy.id,draft.id);
  assert.equal(saved[0].auto,true);

  harness.props={document:{...draft,id:'persisted-invoice'},documents:[{...draft,id:'persisted-invoice'}]};
  harness.ensureInitialDraftPersisted();
  harness.props={document:{...draft,id:'final-invoice',status:'final'},documents:[]};
  harness.ensureInitialDraftPersisted();
  assert.equal(saved.length,1,'existing or issued documents must never be recreated by initial save');

  const mount=editor.slice(editor.indexOf('componentDidMount():void'),editor.indexOf('componentDidUpdate('));
  const update=editor.slice(editor.indexOf('componentDidUpdate('),editor.indexOf('componentWillUnmount()'));
  assert.match(mount,/this\.ensureInitialDraftPersisted\(\)/);
  assert.match(update,/prevProps\.document\.id!==this\.props\.document\.id[\s\S]*this\.ensureInitialDraftPersisted\(\)/);
});

test('failed initial draft save stays visible and can be retried without orphaning a number',async()=>{
  const {harness}=await createDraftHarness();
  const doc={id:'draft-retry',kind:'proforma',status:'draft',company:'sample'};
  harness.props={document:doc,documents:[]};
  let attempts=0;
  harness.saveWithProtectedRetry=async()=>{
    attempts++;
    if(attempts===1)throw new Error('storage unavailable');
  };
  harness.ensureInitialDraftPersisted();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(attempts,1);
  assert.match(harness.state.persistenceError,/Unable to save the new draft locally/);
  assert.equal(harness.initialDraftPersistIds.has(doc.id),false,'failed drafts are retryable');
  harness.ensureInitialDraftPersisted();
  await Promise.resolve();
  assert.equal(attempts,2);
  assert.equal(harness.initialDraftPersistIds.has(doc.id),true);
});
