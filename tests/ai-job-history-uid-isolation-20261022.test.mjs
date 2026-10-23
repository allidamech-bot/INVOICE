import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';

// Only the Firebase account binding is replaced for the isolated test.
// The exact compiled production module and its sessionStorage logic execute.
const code=await readFile(new URL('../dist/src/lib/ai-job-history.js',import.meta.url),'utf8');
const binding=/import\s*\{\s*activeAccountStorageUid\s*\}\s*from\s*['"]\.\.\/storage\/db\.js['"];?/u;
assert.match(code,binding,'job history uses the real active Firebase storage identity');
const cloudBinding=/import\s*\{\s*currentCloudUser\s*\}\s*from\s*['"]\.\.\/cloud\/firebase\.js['"];?/u;
assert.match(code,cloudBinding,'job history must also match the authenticated Firebase identity');
const fixture=code.replace(binding,
  "let testUid=null;const activeAccountStorageUid=()=>testUid;export const setTestStorageUid=(value)=>{testUid=value;};")
  .replace(cloudBinding,
  "let authUid=null;const currentCloudUser=()=>authUid?{uid:authUid}:null;export const setTestAuthUid=(value)=>{authUid=value;};export const setTestUid=(value)=>{testUid=value;authUid=value;};");
const jobs=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(fixture));
const storage=new Map();
const oldSession=globalThis.sessionStorage;
globalThis.sessionStorage={
 getItem:key=>storage.has(key)?storage.get(key):null,
 setItem:(key,value)=>{storage.set(key,String(value));},
 removeItem:key=>storage.delete(key),
 key:index=>[...storage.keys()][index]??null,
 get length(){return storage.size;}
};

test('a second Firebase user cannot see the first user filename or job metadata',()=>{
 storage.clear();jobs.setTestUid('qa-account-a');
 const first=jobs.startAiJob('confidential-supplier-a.pdf');
 jobs.updateAiJob(first.id,{status:'completed',route:'supplier_purchase',note:'QA completed'});
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'confidential-supplier-a.pdf');
 jobs.setTestUid('qa-account-b');
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 const second=jobs.startAiJob('customer-b.xlsx');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'customer-b.xlsx');
 assert.equal(jobs.updateAiJob(first.id,{status:'failed'}),null,'cannot edit other-account jobs');
 jobs.setTestUid('qa-account-a');
 assert.equal(jobs.readAiJobHistory()[0].status,'completed');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'confidential-supplier-a.pdf');
 assert.ok(jobs.readAiJobHistory().every(j=>j.sourceName!=='customer-b.xlsx'));
});

test('signed-out state never exposes or persists account-bound job history',()=>{
 storage.clear();jobs.setTestUid('qa-account-a');
 const first=jobs.startAiJob('private-name.png');
 jobs.setTestUid(null);
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 const signedOut=jobs.startAiJob('anonymous-not-persisted.pdf');
 assert.equal(jobs.updateAiJob(signedOut.id,{status:'completed'}),null);
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.clearAiJobHistory();
 jobs.setTestUid('qa-account-a');
 assert.equal(jobs.readAiJobHistory().length,1);
 assert.equal(jobs.readAiJobHistory()[0].id,first.id);
 assert.ok(![...storage.values()].some(value=>value.includes('anonymous-not-persisted.pdf')));
});

test('old unscoped filename history is discarded, never claimed by a new account',()=>{
 storage.clear();storage.set('lourex-ai-job-history-v1',JSON.stringify([{id:'legacy',sourceName:'prior-user-private.pdf',status:'completed'}]));
 jobs.setTestUid('new-account');
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 assert.equal(storage.has('lourex-ai-job-history-v1'),false);
 assert.ok(![...storage.values()].some(value=>value.includes('prior-user-private.pdf')));
});

test('clearing one account does not clear another account or re-expose legacy history',()=>{
 storage.clear();jobs.setTestUid('a/1');jobs.startAiJob('a.jpg');
 jobs.setTestUid('b/2');jobs.startAiJob('b.jpg');
 assert.equal(storage.size,2);
 jobs.clearAiJobHistory();
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.setTestUid('a/1');assert.equal(jobs.readAiJobHistory()[0].sourceName,'a.jpg');
 jobs.setTestUid('b/2');assert.deepEqual(jobs.readAiJobHistory(),[]);
});

test('history still bounds and sanitizes all fields within a single account',()=>{
 storage.clear();jobs.setTestUid('qa-size');
 for(let i=0;i<33;i++)jobs.startAiJob('File'+i+'\nprivate.txt');
 const rows=jobs.readAiJobHistory();
 assert.equal(rows.length,30);
 assert.ok(rows.every(row=>!row.sourceName.includes('\n')));
 const first=rows[0];
 jobs.updateAiJob(first.id,{note:'n'.repeat(1000)});
 assert.equal(jobs.readAiJobHistory()[0].note.length,220);
 assert.equal(jobs.readAiJobHistory()[0].status,'processing');
});

test('history UI must render current UID rows rather than stale React-state filenames',()=>{
 storage.clear();jobs.setTestUid('uid-a');
 jobs.startAiJob('private-a-invoice.pdf');
 const staleUiState=jobs.readAiJobHistory();
 assert.equal(staleUiState[0].sourceName,'private-a-invoice.pdf');
 jobs.setTestUid('uid-b');
 jobs.startAiJob('private-b-invoice.pdf');
 const currentRows=jobs.readAiJobHistory();
 assert.deepEqual(currentRows.map(row=>row.sourceName),['private-b-invoice.pdf']);
 assert.notDeepEqual(currentRows,staleUiState,'cached React rows are unsafe after account switch');
 const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
 const start=source.indexOf('private renderHistory=');
 const end=source.indexOf('private renderInbox=',start);
 assert.ok(start>0&&end>start,'history renderer must exist');
 const view=source.slice(start,end);
 assert.match(view,/const jobs=readAiJobHistory\(\)/,'read bound account at render time');
 assert.match(view,/jobs\.map\(job=>/,'render current-account rows');
 assert.match(view,/disabled=\{!jobs\.length\}/,'clear-current-account control uses current list');
 assert.doesNotMatch(view,/this\.state\.jobs/,'never render old account filenames from cached React state');
});

test('Firebase account transition denies stale local UID history, writes and clears',()=>{
 storage.clear();jobs.setTestUid('uid-a');
 const a=jobs.startAiJob('private-a.pdf');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'private-a.pdf');
 // Auth switches before the storage scope moves: neither account can read A.
 jobs.setTestAuthUid('uid-b');
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.startAiJob('must-not-save-during-transition.pdf');
 assert.equal(jobs.updateAiJob(a.id,{status:'failed'}),null);
 jobs.clearAiJobHistory();
 jobs.setTestStorageUid('uid-b');
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.startAiJob('private-b.pdf');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'private-b.pdf');
 // Firebase sign-out happens while the last local UID still exists.
 jobs.setTestAuthUid(null);
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.clearAiJobHistory();
 jobs.setTestAuthUid('uid-b');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'private-b.pdf');
 jobs.setTestStorageUid('uid-a');
 assert.deepEqual(jobs.readAiJobHistory(),[]);
 jobs.setTestAuthUid('uid-a');
 assert.equal(jobs.readAiJobHistory()[0].sourceName,'private-a.pdf');
 assert.equal(jobs.readAiJobHistory()[0].status,'processing');
 assert.ok(![...storage.values()].some(value=>value.includes('must-not-save-during-transition.pdf')));
});

test('terminal AI jobs reject late status resurrection and retries use a new identity',()=>{
  storage.clear();jobs.setTestUid('qa-terminal-states');
  const cancelled=jobs.startAiJob('cancelled-source.pdf');
  jobs.updateAiJob(cancelled.id,{status:'cancelled',note:'User cancelled'});
  const cancelledAt=jobs.readAiJobHistory().find(row=>row.id===cancelled.id).updatedAt;
  jobs.updateAiJob(cancelled.id,{status:'completed',note:'Stale provider returned after cancellation'});
  let entry=jobs.readAiJobHistory().find(row=>row.id===cancelled.id);
  assert.equal(entry.status,'cancelled');
  assert.equal(entry.note,'User cancelled');
  assert.equal(entry.updatedAt,cancelledAt,'rejected callback may not silently alter terminal timestamp');
  const reviewed=jobs.startAiJob('review-source.xlsx');
  jobs.updateAiJob(reviewed.id,{status:'needs-review'});
  jobs.updateAiJob(reviewed.id,{status:'processing'});
  jobs.updateAiJob(reviewed.id,{status:'completed',note:'Saved once'});
  jobs.updateAiJob(reviewed.id,{status:'failed',note:'Late error after save'});
  entry=jobs.readAiJobHistory().find(row=>row.id===reviewed.id);
  assert.equal(entry.status,'completed');
  assert.equal(entry.note,'Saved once');
  const failed=jobs.startAiJob('failed-source.png');
  jobs.updateAiJob(failed.id,{status:'failed',note:'Provider failed'});
  jobs.updateAiJob(failed.id,{status:'needs-review',note:'Outdated retry callback'});
  entry=jobs.readAiJobHistory().find(row=>row.id===failed.id);
  assert.equal(entry.status,'failed');
  assert.equal(entry.note,'Provider failed');
  const retry=jobs.startAiJob('failed-source.png');
  assert.notEqual(retry.id,failed.id,'retry needs its own job identity');
  assert.equal(retry.status,'processing');
  assert.equal(jobs.readAiJobHistory().find(row=>row.id===failed.id).status,'failed');
});

test('AI Inbox does not advertise a reviewable result until extraction finishes',()=>{
  const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  const classify=source.slice(source.indexOf('private classify=async()=>'),source.indexOf('private extractForRoute=async('));
  assert.match(classify,/const needsExtraction=\['quote_request','supplier_purchase','supplier'\]\.includes\(classification\.route\)/);
  assert.match(classify,/stage:needsExtraction\?'extracting':'review'/,
    'quote and supplier extraction must not expose review UI early');
  const extract=classify.indexOf('await this.extractForRoute(');
  const completed=classify.indexOf("updateAiJob(job.id,{status:'needs-review'})",extract);
  assert.ok(extract>=0&&completed>extract,'job becomes reviewable only after extraction resolves');
  assert.match(classify.slice(extract,completed),/if\(!this\.current\(generation,controller\)\)return/,
    'cancelled or stale provider completion cannot mark reviewable');
  assert.match(classify,/if\(jobId\)updateAiJob\(jobId,\{status:'failed'/,
    'extraction failures must remain failed rather than ready');
  const manual=source.slice(source.indexOf('private forceRoute=async('),source.indexOf('private handoff=()=>'));
  assert.match(manual,/status:needsExtraction\?'processing':'needs-review'/,
    'manual re-routing must restore processing for routes that extract');
  assert.ok(manual.indexOf("updateAiJob(job.id,{status:'needs-review'})")>
    manual.indexOf('await this.extractForRoute('),
    'manual route must not claim review until its extraction completes');
  storage.clear();jobs.setTestUid('qa-pending-review');
  const job=jobs.startAiJob('slow-supplier-quote.pdf');
  jobs.updateAiJob(job.id,{route:'quote_request',documentType:'quotation'});
  assert.equal(jobs.readAiJobHistory()[0].status,'processing');
  jobs.updateAiJob(job.id,{status:'needs-review'});
  assert.equal(jobs.readAiJobHistory()[0].status,'needs-review');
});

test('manual AI Inbox retry gets a new job ID after failure or cancellation, without altering history',()=>{
  storage.clear();jobs.setTestUid('qa-manual-retry');
  const failed=jobs.startAiJob('source.pdf');
  jobs.updateAiJob(failed.id,{status:'failed',note:'Provider 429'});
  const retry=jobs.activeOrFreshAiJob(failed.id,'source.pdf');
  assert.notEqual(retry.id,failed.id,'failed job may never be reactivated');
  assert.equal(retry.status,'processing');
  jobs.updateAiJob(retry.id,{route:'quote_request',status:'needs-review'});
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===failed.id).note,'Provider 429');
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===failed.id).status,'failed');
  assert.equal(jobs.activeOrFreshAiJob(retry.id,'source.pdf').id,retry.id,
    'switching a still-active review route must not spawn duplicate jobs');
  jobs.updateAiJob(retry.id,{status:'cancelled',note:'Cancelled by user'});
  const next=jobs.activeOrFreshAiJob(retry.id,'source.pdf');
  assert.notEqual(next.id,retry.id,'cancelled job must stay cancelled after retry');
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===retry.id).status,'cancelled');
  jobs.updateAiJob(next.id,{status:'completed',note:'Reviewed draft saved'});
  const afterSaved=jobs.activeOrFreshAiJob(next.id,'source.pdf');
  assert.notEqual(afterSaved.id,next.id,'completed job must not be reopened');
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===next.id).note,'Reviewed draft saved');
  jobs.setTestUid('qa-other-user');
  const other=jobs.activeOrFreshAiJob(failed.id,'other.xlsx');
  assert.notEqual(other.id,failed.id);
  assert.deepEqual(jobs.readAiJobHistory().map(x=>x.sourceName),['other.xlsx'],
    'manual retry cannot reuse or reveal a previous Firebase users source');
  const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  const manual=source.slice(source.indexOf('private forceRoute=async('),source.indexOf('private handoff=()=>'));
  assert.match(manual,/activeOrFreshAiJob\(this\.state\.currentJobId/,
    'manual route must select current-UID live job or allocate a new one');
  assert.match(manual,/updateAiJob\(job\.id,\{route,status:/,
    'manual retry updates the newly selected ID, not a stale React state field');
  assert.doesNotMatch(manual,/this\.markJob\(/,
    'manual async success and failure must never use a potentially stale job ID');
});

test('unmount and close cancel only the captured in-flight AI Inbox identity',()=>{
  const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  const teardown=source.slice(source.indexOf('componentWillUnmount():void'),source.indexOf('private current='));
  assert.match(teardown,/componentWillUnmount\(\):void\{[^\n]*this\.cancelAnalysis\(\)/,
    'unmount must invoke the same cancellation path as closing the modal');
  assert.match(teardown,/if\(this\.inFlightJobId\)updateAiJob\(this\.inFlightJobId,\{/,
    'cancel the captured real attempt, not an old React state ID');
  assert.match(teardown,/status:'cancelled'/,
    'unmount must not leave a processing row forever');
  assert.ok(teardown.indexOf("this.inFlightJobId=''")<
    teardown.indexOf('this.generation++'),
    'clear the ownership before invalidating callbacks');
  const classify=source.slice(source.indexOf('private classify=async()=>'),source.indexOf('private extractForRoute=async('));
  const manual=source.slice(source.indexOf('private forceRoute=async('),source.indexOf('private handoff=()=>'));
  assert.match(classify,/jobId=job\.id;this\.inFlightJobId=job\.id/,
    'automatic classifier captures the active ID synchronously');
  assert.match(manual,/this\.inFlightJobId=job\.id/,
    'manual retry must also capture its new ID');
  for(const [label,path] of [['classify',classify],['manual',manual]]){
    assert.match(path,/finally\{if\(generation===this\.generation\)\{this\.inFlightJobId='';this\.pending=false/,
      label+' must release ownership only for its own generation');
  }
  storage.clear();jobs.setTestUid('qa-unmount');
  const old=jobs.startAiJob('old-finished.pdf');
  jobs.updateAiJob(old.id,{status:'completed',note:'Already saved'});
  const active=jobs.startAiJob('new-running.pdf');
  jobs.updateAiJob(active.id,{status:'cancelled',note:'Analysis cancelled'});
  jobs.updateAiJob(active.id,{status:'completed',note:'Late network response'});
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===active.id).status,'cancelled');
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===old.id).status,'completed',
    'cancel affects only the captured in-flight job, never previous saves');
  assert.equal(jobs.readAiJobHistory().find(x=>x.id===old.id).note,'Already saved');
});

test('cleanup restores the real JS session global',()=>{
 if(oldSession===undefined)delete globalThis.sessionStorage;
 else globalThis.sessionStorage=oldSession;
});
