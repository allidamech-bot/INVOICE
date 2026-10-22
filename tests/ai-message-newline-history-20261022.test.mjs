import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAssistantState,upsertAssistantThread,assistantProviderMemory} from '../dist/src/storage/assistant-store.js';
import {mergeAssistantCloudState} from '../dist/src/cloud/assistant-history.js';

const at='2026-10-22T12:00:00.000Z';
const uid='synthetic-uid',scope='business',workspaceId='company-test',branchId='branch-a';
function local(message){
  return normalizeAssistantState({version:1,threads:[{
    id:'thread-1',scope,workspaceId,branchId,title:'Example thread',summary:'',
    messages:[message],createdAt:at,updatedAt:at
  }]});
}
function cloud(message){
  return{format:'LOUREX_AI_THREAD_V1',ownerUid:uid,id:'thread-1',scope,workspaceId,branchId,
    title:'Example thread',summary:'',mode:'advisor',messages:[message],createdAt:at,updatedAt:at};
}
test('assistant encrypted local normalization retains Arabic and English paragraphs and bullets',()=>{
  const raw='First line\r\n\r\n- **Amount:** 1500 USD\n- **Received:** 400 USD\rRemaining: 1100 USD\n\nآخر السطر';
  const row={id:'message-1',role:'assistant',text:raw,createdAt:at};
  const saved=local(row).threads[0].messages[0];
  assert.equal(saved.text,'First line\n\n- **Amount:** 1500 USD\n- **Received:** 400 USD\nRemaining: 1100 USD\n\nآخر السطر');
  assert.equal(normalizeAssistantState(local(row)).threads[0].messages[0].text,saved.text);
});
test('new thread save preserves intentional newlines but keeps titles and provider memory compact',()=>{
  const body='Customer request\n\n- first item\n- second item';
  const result=upsertAssistantThread(normalizeAssistantState({version:1,threads:[]}),{
    threadId:'thread-1',scope,workspaceId,branchId,
    messages:[{id:'msg-1',role:'user',text:body,createdAt:at}]
  });
  assert.equal(result.thread.messages[0].text,body);
  assert.equal(result.thread.title.includes('\n'),false);
  assert.ok(result.thread.title.startsWith('Customer request'));
  assert.equal(assistantProviderMemory(result.thread.messages).includes('\n- first item'),false,
    'provider summary retains the existing bounded plain-text treatment');
});
test('unexpected control bytes cannot hide content and oversize text remains bounded',()=>{
  const row={id:'message-1',role:'assistant',text:'Hello\u0000\u0007\u001bWorld\n'+('X'.repeat(5000)),createdAt:at};
  const text=local(row).threads[0].messages[0].text;
  assert.equal(text.length,4000);
  assert.equal(text.includes('\u0000'),false);
  assert.equal(text.includes('\u001b'),false);
  assert.ok(text.includes('World\n'));
  const notString=local({...row,text:{body:'malformed'}});
  assert.equal(notString.threads[0].messages.length,0);
});
test('read-only cloud synchronization retains message paragraphs with exact same scope',()=>{
  const text='## Test report\n\n### Financial values\n- **Balance:** 750 USD';
  const message={id:'message-1',role:'assistant',text,createdAt:at};
  const localState=local(message);
  const merged=mergeAssistantCloudState(uid,localState,[cloud(message)]);
  assert.equal(merged.threads[0].messages[0].text,text);
  const fromOtherDevice=mergeAssistantCloudState(uid,normalizeAssistantState({version:1,threads:[]}),[cloud(message)]);
  assert.equal(fromOtherDevice.threads[0].messages[0].text,text);
  assert.equal(fromOtherDevice.threads[0].workspaceId,workspaceId);
  assert.equal(fromOtherDevice.threads[0].branchId,branchId);
});
