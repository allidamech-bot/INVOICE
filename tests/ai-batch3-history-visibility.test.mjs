import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const component=read('src/components/AiConversationWorkspace.tsx');
const css=read('src/styles/ai-conversation-workspace.css');
const storage=read('src/storage/assistant-store.ts');
const runtime=read('src/lib/ai-intelligence-runtime.ts');

test('AI history is independently visible even while legacy conversation-context is excluded',()=>{
  assert.match(component,/function AiConversationHistory\(/);
  assert.match(component,/className="lxw-history-trigger"/);
  assert.match(component,/host\.state\.__workspaceHistoryOpen\?<AiConversationHistory host=\{host\} ar=\{ar\}\/>/);
  assert.match(component,/const legacyContext=children\.filter/);
  assert.match(component,/!header\.includes\(child\)&&!legacyContext\.includes\(child\)/);
  assert.match(component,/i===1\?\{onClick:/,'old overflow Conversations action must open the new pane');
  assert.match(component,/__workspaceHistoryOpen:true/);
});

test('History only lists hydrated, company-scoped conversation metadata and preserves both modes',()=>{
  assert.match(component,/Array\.isArray\(host\.__businessThreads\)/);
  assert.match(component,/host\.__lourexOpenThread\(id\)/);
  assert.match(component,/host\.__lourexAssistantThreadId!==id/);
  assert.match(component,/host\.__lourexNewConversation\(\)/);
  assert.match(component,/assignIntelligenceConversationMode\(host,'advisor'\)/);
  assert.match(component,/host\.__lourexAssistantThreadId===previousId/);
  assert.match(component,/normalizeAiConversationMode\(row\.mode\)/);
  assert.match(runtime,/threads\.threads\.filter\(t=>t\.scope==='business'&&t\.workspaceId===scope\.workspaceId&&t\.branchId===scope\.branchId/);
  assert.match(runtime,/t\.kernel\?\.scope\.accountId/);
  assert.match(storage,/AES-GCM/);
});

test('History list is scrollable, compact, keyboard accessible and independent of the site CSS',()=>{
  assert.match(css,/Batch 3 — visible scoped chat history/);
  assert.match(css,/\.lxw-history\-search\{/);
  assert.match(css,/\.lxw-history-list\{/);
  assert.match(css,/overflow-y:auto/);
  assert.match(css,/\.lxw-history-row\{/);
  assert.match(css,/min-height:58px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/focus-visible/);
  assert.match(component,/aria-current=\{row\.id===host\.__lourexAssistantThreadId/);
  assert.match(component,/type="search"/);
  assert.match(component,/role="alert" className="lxw-history-error"/);
});

test('History open state resets with account, workspace, thread or mode changes',()=>{
  assert.match(component,/for\(const name of \['__lourexSetScope','__lourexOpenThread','__lourexNewConversation','__lourexDeleteThread'\]\)/);
  assert.match(component,/__workspaceHistoryOpen:false,__workspaceHistoryBusy:false,__workspaceHistoryError:''/);
  assert.match(component,/host\.setState\(\{__workspaceHistoryOpen:false\}\)/);
});
