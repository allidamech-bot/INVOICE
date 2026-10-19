import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('startup telemetry measures account scoping and cloud reconciliation without private data',async()=>{
  const [entry,app]=await Promise.all([
    readFile('src/app/index.tsx','utf8'),
    readFile('src/app/App.tsx','utf8')
  ]);
  const init=app.slice(app.indexOf('  private initialize=async()=>'),app.indexOf('  private activity='));
  const start=entry.slice(entry.indexOf('async function start():Promise<void>'),entry.indexOf('void start();'));
  for(const phase of ['entry-begin','account-storage-scoped','react-mounted'])
    assert.ok(start.includes("startupStage('"+phase+"')"),'missing '+phase);
  for(const phase of ['begin','preferences-ready','firebase-auth-ready','local-workspace-read','cloud-reconcile-start','cloud-reconcile-finished','cloud-reconcile-error','vault-normalized','ui-committed','boot-error'])
    assert.ok(init.includes("startupPhase('"+phase+"')"),'missing '+phase);
  assert.ok(start.indexOf("startupStage('account-storage-scoped')")>start.indexOf('await resolveRequiredAccountSession()'));
  assert.ok(init.indexOf("startupPhase('cloud-reconcile-start')")<init.indexOf('await reconcilePlainCloudWorkspace(user.uid)'));
  assert.ok(init.indexOf("startupPhase('cloud-reconcile-finished')")>init.indexOf('await reconcilePlainCloudWorkspace(user.uid)'));
  for(const segment of [start,init]){
    assert.match(segment,/elapsedMs=/);
    assert.match(segment,/__LOUREX_DIAGNOSTICS__\?\.mark\?/);
    assert.doesNotMatch(segment,/startup(?:Phase|Stage)\([^)]*(?:user\.uid|vault\.documents|cipher|password|token|PIN)/);
  }
});

test('startup cloud authority and encrypted storage behavior remain unchanged',async()=>{
  const app=await readFile('src/app/App.tsx','utf8');
  const init=app.slice(app.indexOf('  private initialize=async()=>'),app.indexOf('  private activity='));
  assert.match(init,/await reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.ok(init.indexOf('const result=await reconcilePlainCloudWorkspace(user.uid)')<init.indexOf('this.setState({loading:false,firstRun:false,unlocked:true,vault'));
  assert.doesNotMatch(init,/localStorage\.clear|indexedDB\.deleteDatabase/);
  assert.match(init,/await replacePlainWorkspaceIfUnchanged\(user\.uid,null/,'first-account CAS bootstrap stays protected');
});
