import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';

// Only the Firebase account binding is replaced for the isolated test.
// The exact compiled production module and its sessionStorage logic execute.
const code=await readFile(new URL('../dist/src/lib/ai-job-history.js',import.meta.url),'utf8');
const binding=/import\s*\{\s*activeAccountStorageUid\s*\}\s*from\s*['"]\.\.\/storage\/db\.js['"];?/u;
assert.match(code,binding,'job history uses the real active Firebase storage identity');
const fixture=code.replace(binding,
  "let testUid=null;const activeAccountStorageUid=()=>testUid;export const setTestUid=(value)=>{testUid=value;};");
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

test('cleanup restores the real JS session global',()=>{
 if(oldSession===undefined)delete globalThis.sessionStorage;
 else globalThis.sessionStorage=oldSession;
});
