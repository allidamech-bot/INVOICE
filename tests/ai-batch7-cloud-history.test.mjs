import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeAssistantCloudState,mergeAssistantCloudThread} from '../dist/src/cloud/assistant-history.js';
import {normalizeAssistantState,upsertAssistantThread} from '../dist/src/storage/assistant-store.js';
const origin=readFileSync(new URL('../src/cloud/assistant-history.ts',import.meta.url),'utf8');
const storage=readFileSync(new URL('../src/storage/assistant-store.ts',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/ai-batch1-unified-assistant.mjs',import.meta.url),'utf8');

const uid='account-one',at='2026-10-12T12:00:00.000Z';
function msg(id,text,minute=0){return{id,role:'user',text,createdAt:new Date(Date.parse(at)+minute*60000).toISOString()};}
function cloud(id,messages=[],options={}){
  return{format:'LOUREX_AI_THREAD_V1',ownerUid:uid,id,scope:'business',workspaceId:'company-a',branchId:'main',title:'Buying discussion',summary:'',
    mode:'advisor',messages,createdAt:at,updatedAt:at,...options};
}
function local(rows=[],deletedThreads={}){
  return{version:1,threads:rows,currentBusinessThreadId:'',currentPersonalThreadId:'',deletedThreads,updatedAt:at};
}
function thread(id,messages=[],mode='advisor'){
  return{id,scope:'business',workspaceId:'company-a',branchId:'main',title:'Buying discussion',summary:'',
    messages,createdAt:at,updatedAt:at,
    kernel:{version:1,scope:{scope:'business',workspaceId:'company-a',branchId:'main',threadId:id,accountId:uid},
      turn:messages.length,mode,focus:mode==='advisor'?'advisor':'operator'}};
}

test('independent devices merge distinct message IDs with exact text and no lost messages',()=>{
  const older=cloud('t-1',[msg('a','First quote')]);
  const newer=cloud('t-1',[msg('b','Second quote',1)],{updatedAt:new Date(Date.parse(at)+60000).toISOString()});
  const merged=mergeAssistantCloudThread(older,newer);
  assert.deepEqual(merged.messages.map(row=>row.id),['a','b']);
  assert.deepEqual(merged.messages.map(row=>row.text),['First quote','Second quote']);
  assert.equal(merged.mode,'advisor');
  assert.equal(merged.ownerUid,uid);
});

test('deletion tombstones win on every device and prevent resurrection',()=>{
  const tombstone=cloud('t-2',[],{deletedAt:'2026-10-12T14:00:00.000Z',updatedAt:'2026-10-12T14:00:00.000Z'});
  const merged=mergeAssistantCloudState(uid,local([thread('t-2',[msg('c','Should stay deleted')])]),[tombstone]);
  assert.equal(merged.threads.some(t=>t.id==='t-2'),false);
  assert.equal(merged.deletedThreads['t-2'],tombstone.deletedAt);
  const localDelete=mergeAssistantCloudState(uid,local([],{['t-2']:tombstone.deletedAt}),[cloud('t-2',[msg('c','Old copy')])]);
  assert.equal(localDelete.threads.length,0);
  assert.equal(localDelete.deletedThreads['t-2'],tombstone.deletedAt);
});

test('remote-only conversations import readable messages and mode without executable plans',()=>{
  const remote=cloud('t-3',[msg('d','Discuss supplier'),msg('e','Compare costs',1)],{mode:'controller'});
  const merged=mergeAssistantCloudState(uid,local(),[remote]);
  const saved=merged.threads.find(t=>t.id==='t-3');
  assert.ok(saved);
  assert.deepEqual(saved.messages.map(m=>m.id),['d','e']);
  assert.equal(saved.kernel?.mode,'controller');
  assert.equal(saved.kernel?.artifact,undefined);
  assert.equal(saved.kernel?.missions,undefined);
  assert.deepEqual(saved.foundationReceipts,[]);
  assert.equal(saved.kernel?.scope.accountId,uid);
});

test('cross-mode conflicting copies become Advisor and shed stale execution artifacts',()=>{
  const older=thread('t-4',[msg('x','Old controller')],'controller');
  const remote=cloud('t-4',[msg('x','Old controller'),msg('y','Advisor response',1)],{mode:'advisor',
    updatedAt:'2026-10-12T13:00:00.000Z'});
  const merged=mergeAssistantCloudState(uid,local([older]),[remote]).threads[0];
  assert.equal(merged.kernel?.mode,'advisor');
  assert.equal(merged.kernel?.artifact,undefined);
  assert.deepEqual(merged.foundationReceipts,[]);
});

test('rejects incorrect account or company identity instead of mixing conversation data',()=>{
  assert.throws(()=>mergeAssistantCloudState(uid,local(),[cloud('t-5',[],{ownerUid:'another-user'})]),/Invalid cloud conversation/);
  assert.throws(()=>mergeAssistantCloudThread(cloud('t-5'),cloud('t-5',[],{workspaceId:'company-b'})),/scope changed/i);
  assert.throws(()=>mergeAssistantCloudThread(cloud('t-5'),cloud('t-6')),/identity mismatch/i);
});

test('source never uploads draft proposals, approval receipts, or local device ciphertext',()=>{
  const writer=origin.slice(origin.indexOf('function toCloud('),origin.indexOf('function deletion('));
  assert.doesNotMatch(writer,/foundationReceipts\s*:/);
  assert.doesNotMatch(writer,/artifact\s*:/);
  assert.doesNotMatch(writer,/cipher\s*:/);
  assert.doesNotMatch(writer,/kernel\s*:/);
  assert.match(writer,/thread\.kernel\?\.scope\.accountId!==uid/);
  assert.match(origin,/\.collection\('users'\)\.doc\(uid\)\.collection\('assistantHistory'\)/);
  assert.match(origin,/get\(\{source:'server'\}\)/);
  assert.match(origin,/db\(\)\.runTransaction/);
  assert.match(origin,/checkAccount\(uid\);tx\.set/);
  assert.match(origin,/if\(options\.installRemote===false\)return/);
  assert.match(storage,/deletedThreads\?:Record<string,string>/);
  assert.match(runtime,/queueHistorySync\(host,uid,resumed\.key,scope,generation,true\)/);
  assert.match(build,/store\.deletedThreads=\{/);
});

test('cloud transport respects an explicit doc size and limited collection reads',()=>{
  assert.match(origin,/MAX_CLOUD_THREADS=200/);
  assert.match(origin,/MAX_DOCUMENT_BYTES=700_000/);
  assert.match(origin,/\.limit\(MAX_CLOUD_THREADS\)/);
  assert.match(origin,/if\(bytes\(candidate\)>MAX_DOCUMENT_BYTES\)throw/);
  assert.match(origin,/No truncated upload was made|no truncated upload was made/);
});

test('repeated local saves preserve original message timestamps and reject a tombstoned ID',()=>{
  const first=upsertAssistantThread(normalizeAssistantState(local()),{threadId:'t-8',scope:'business',workspaceId:'company-a',branchId:'main',
    messages:[{id:'m1',role:'user',text:'Quote'}]}).state;
  const originalTime=first.threads[0].messages[0].createdAt;
  const second=upsertAssistantThread(first,{threadId:'t-8',scope:'business',workspaceId:'company-a',branchId:'main',
    messages:[{id:'m1',role:'user',text:'Quote'},{id:'m2',role:'assistant',text:'Analyzed'}]}).state;
  assert.equal(second.threads[0].messages[0].createdAt,originalTime);
  const deleted=normalizeAssistantState({...second,threads:[],deletedThreads:{'t-8':'2026-10-12T15:00:00.000Z'}});
  assert.throws(()=>upsertAssistantThread(deleted,{threadId:'t-8',scope:'business',workspaceId:'company-a',branchId:'main',messages:[]}),/deleted/i);
});
test('new cloud messages drop stale local controller approvals even without a mode switch',()=>{
  const previous=thread('t-9',[msg('m1','Original')],'controller');
  previous.kernel.artifact={id:'draft-stale',revision:1,proposal:{},lineIds:[],undo:[],redo:[]};
  previous.foundationReceipts=[{id:'receipt',state:'applying',at}];
  const merged=mergeAssistantCloudState(uid,local([previous]),[cloud('t-9',[msg('m1','Original'),msg('m2','New from second device',1)],{mode:'controller'})]).threads[0];
  assert.equal(merged.kernel?.artifact,undefined);
  assert.deepEqual(merged.foundationReceipts,[]);
});