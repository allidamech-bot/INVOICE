import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=()=>readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');

test('a slow signed-in account records only the pending startup phase after twelve seconds',async()=>{
  const app=await source();
  const init=app.slice(app.indexOf('  private initialize=async()=>'),app.indexOf('  private activity='));
  assert.match(init,/let pendingPhase='begin'/);
  assert.match(init,/const startupPhase=\(phase:string\)=>\{\s*pendingPhase=phase;/);
  for(const phase of [
    'preferences-wait','firebase-auth-wait','account-storage-wait',
    'local-workspace-wait','cloud-reconcile-start','first-account-bootstrap-wait',
    'account-metadata-wait'
  ])assert.ok(init.includes("startupPhase('"+phase+"')"),'missing pending stage '+phase);
  const pending=init.slice(init.indexOf('const startupPendingTimer=window.setTimeout('),init.indexOf('    try{\n      startupPhase(\'preferences-wait\');'));
  assert.match(pending,/if\(!this\.state\.loading\)return/);
  assert.match(pending,/'startup-await-timeout'/);
  assert.match(pending,/'phase='\+pendingPhase/);
  assert.match(pending,/elapsedMs=/);
  assert.match(pending,/12_000\)/);
  assert.doesNotMatch(pending,/\buser\b|\.uid\b|\.email\b|\.payload\b|vault\.|customer\.|token|password|cipher/i);
  assert.match(init,/\}finally\{\s*window\.clearTimeout\(startupPendingTimer\)/);
});

test('startup timeout is observation-only: no cloud bypass, race, or data mutation',async()=>{
  const app=await source();
  const init=app.slice(app.indexOf('  private initialize=async()=>'),app.indexOf('  private activity='));
  assert.ok(init.indexOf("startupPhase('cloud-reconcile-start')") < init.indexOf('const result=await reconcilePlainCloudWorkspace(user.uid)'));
  assert.ok(init.indexOf('const result=await reconcilePlainCloudWorkspace(user.uid)') < init.indexOf('this.setState({loading:false,firstRun:false,unlocked:true,vault'));
  const pending=init.slice(init.indexOf('const startupPendingTimer=window.setTimeout('),init.indexOf('    try{\n      startupPhase(\'preferences-wait\');'));
  assert.doesNotMatch(pending,/Promise\.race|reconcilePlainCloudWorkspace\(|savePlainWorkspace\(|setState\(|\.reload\(|\.replace\(/);
  assert.match(init,/await putCloudAccount\(user.uid,user.email\)/);
});
