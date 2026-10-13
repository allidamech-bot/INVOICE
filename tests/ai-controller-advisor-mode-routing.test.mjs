import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const endpoint="const advisorEndpoint = context.conversationMode === 'controller' ? '/api/ai-core' : (__lourexConversationSources.length ? '/api/ai-conversation-v3' : '/api/ai-advisor-v2');";

test('active conversation mode owns provider routing, regardless of intent or attachments',async()=>{
  const [installer,compiled,workspace,runtime]=await Promise.all([
    read('scripts/ai-intelligence-foundation.mjs'),
    read('dist/src/components/AiCopilot.js'),
    read('src/components/AiConversationWorkspace.tsx'),
    read('src/lib/ai-intelligence-runtime.ts'),
  ]);
  assert.ok(installer.includes(JSON.stringify(endpoint)),'the final build owner must replace stale capability/file-based routing');
  assert.ok(compiled.includes(endpoint),'production-bound compiled runtime must contain the actual mode-first route');
  assert.match(runtime,/context\.conversationMode=currentConversationMode\(host\)/,'the active authenticated thread must supply the mode');
  assert.match(workspace,/__workspaceSwitchMode=async\(target:AiConversationMode\)/,'mode tabs must update the thread rather than relabel a message');
  const expression=endpoint.replace(/^const advisorEndpoint = /,'').replace(/;$/,'');
  const route=new Function('context','__lourexConversationSources','return '+expression+';');
  for(const files of [[],[{name:'source.xlsx'}]]){
    assert.equal(route({conversationMode:'controller'},files),'/api/ai-core','Controller must never land on an Advisor endpoint');
    assert.equal(route({conversationMode:'advisor'},files),
      files.length?'/api/ai-conversation-v3':'/api/ai-advisor-v2','Advisor must remain read-only');
    assert.equal(route({},files),
      files.length?'/api/ai-conversation-v3':'/api/ai-advisor-v2','missing or stale mode must fail closed');
    assert.equal(route({conversationMode:'legacy'},files),
      files.length?'/api/ai-conversation-v3':'/api/ai-advisor-v2','unknown modes must not gain Controller privileges');
  }
});
