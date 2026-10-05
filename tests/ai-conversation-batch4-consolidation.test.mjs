import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Batch 4 keeps one ordered owner chain', async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const owners=[
    'ai-conversation-owner-stage4-tools.mjs',
    'ai-conversation-owner-stage4-tools-closeout.mjs',
    'ai-conversation-owner-stage4.mjs',
    'ai-conversation-owner-stage4-accessibility.mjs'
  ];
  let cursor=-1;
  for(const owner of owners){
    const next=build.indexOf(owner);
    assert.ok(next>cursor,`${owner} must appear once and in order after the prior Batch 4 owner`);
    assert.equal(build.indexOf(owner,next+1),-1,`${owner} must not be duplicated`);
    cursor=next;
  }
});

test('Batch 4 layers preserve bounded tools, approvals, executive UI and accessibility', async()=>{
  const [tools,closeout,executive,accessibility]=await Promise.all([
    read('scripts/ai-conversation-owner-stage4-tools.mjs'),
    read('scripts/ai-conversation-owner-stage4-tools-closeout.mjs'),
    read('scripts/ai-conversation-owner-stage4.mjs'),
    read('scripts/ai-conversation-owner-stage4-accessibility.mjs')
  ]);
  assert.match(tools,/__lourexNaturalLanguageOsBatch4/);
  assert.match(tools,/tool\.plan/);
  assert.match(tools,/applyApprovedToolExecution/);
  assert.match(closeout,/__lourexNaturalLanguageOsBatch4Closeout/);
  assert.match(executive,/__lourexExecutiveWorkspaceBatch4/);
  assert.match(accessibility,/__lourexConversationOwnerBatch4/);
  assert.match(accessibility,/ArrowDown/);
  assert.match(accessibility,/safe-area-inset-bottom/);
});
