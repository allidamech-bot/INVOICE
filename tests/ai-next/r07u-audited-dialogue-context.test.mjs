import test from 'node:test';
import assert from 'node:assert/strict';
import {R07PTrustedHistoryContext}
  from '../../dist/src/ai-next/conversation-state/trusted-history-context.js';
import {exactScopeKey}from '../../dist/src/ai-next/domain/turn-journal.js';

const scope={
  ownerUid:'offline-owner',actorId:'offline-owner',
  accountId:'offline-account',companyId:'offline-company',
  branchId:'offline-branch',threadId:'offline-thread',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const current={userMessageId:'msg-current',idempotencyKey:'key-current',
  message:'١٧'};
const turn=(id,message,scopeOverride={})=>({
  turnId:id,scope:{...scope,...scopeOverride},mode:'controller',
  userMessageId:id==='current'?'msg-current':'msg-'+id,
  idempotencyKey:id==='current'?'key-current':'key-'+id,
  userMessage:{text:message,attachedSourceIds:[]},
});
const snapshot=()=>({
  schemaVersion:1,scopeKey:exactScopeKey(scope),revision:4,
  turns:[turn('previous','عدل السعر'),turn('current',current.message)],
  tasks:[{turnId:'previous',state:'completed',taskType:'unsaved_review_edit'},
    {turnId:'current',state:'processing',taskType:'unsaved_review_edit'}],
  messages:[{messageId:'assistant-prev',turnId:'previous',role:'assistant',
    text:'ما السعر الجديد المطلوب؟',sourceIds:[]}],
  checkpointRefs:[],
});
const reader=data=>new R07PTrustedHistoryContext({
  auditFullHistory:async()=>structuredClone(data),
},{read:async()=>null});

test('authenticated current turn receives only completed audited prior dialogue',async()=>{
  const ctx=await reader(snapshot()).load(scope,current);
  assert.equal(ctx.historyComplete,true);
  assert.deepEqual(ctx.dialogueHistory,[
    {role:'user',text:'عدل السعر'},
    {role:'assistant',text:'ما السعر الجديد المطلوب؟'},
  ]);
  assert.equal(ctx.activeDraft,null);
  assert.deepEqual(ctx.references,[]);
  assert.ok(!JSON.stringify(ctx.dialogueHistory).includes('offline-company'));
});

test('R07U never lets an unrelated new request borrow audited context',async()=>{
  const ctx=await reader(snapshot()).load(scope,{
    ...current,userMessageId:'another-current',
  });
  assert.equal(ctx.dialogueHistory,undefined);
});

test('foreign actor, viewer role, source attachment, failed task or double assistant answer break continuity',async()=>{
  const invalids=[
    d=>{d.turns[0].scope.actorId='other-actor';},
    d=>{d.turns[0].scope.role='viewer';},
    d=>{d.turns[0].userMessage.attachedSourceIds=['doc-source'];},
    d=>{d.tasks[0].state='failed';},
    d=>{d.messages[0].sourceIds=['secret-file'];},
    d=>{d.messages.push({...d.messages[0],messageId:'reply-2'});},
    d=>{d.turns[0].userMessage.text='a'.repeat(321);},
    d=>{d.messages[0].text='a'.repeat(321);},
  ];
  for(const corrupt of invalids){
    const d=snapshot();corrupt(d);
    const ctx=await reader(d).load(scope,current);
    assert.equal(ctx.dialogueHistory,undefined);
  }
});

test('R07U never infers current user content as a preceding instruction',async()=>{
  const data=snapshot();
  data.turns[1].userMessage.text='do not approve';
  const ctx=await reader(data).load(scope,current);
  assert.equal(ctx.dialogueHistory,undefined);
});

test('R07U no previous turn and local context-only loads remain empty',async()=>{
  const data=snapshot();
  const noCurrent=await reader(data).load(scope);
  assert.equal(noCurrent.dialogueHistory,undefined);
  data.turns=data.turns.slice(1);
  data.tasks=data.tasks.slice(1);
  data.messages=[];
  const empty=await reader(data).load(scope,current);
  assert.equal(empty.dialogueHistory,undefined);
});
