import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));

test('build owners deliver the unified AI shell and the iOS microphone lease in order',()=>{
  const build=pkg.scripts.build;
  for(const name of ['ai-batch1-unified-assistant.mjs','ai-conversation-owner.mjs','ai-voice-ios-release-owner.mjs','ai-conversation-workspace.mjs'])
    assert.ok(build.includes(name),'missing '+name);
  assert.ok(build.indexOf('ai-conversation-owner.mjs')<build.indexOf('ai-voice-ios-release-owner.mjs'));
  assert.ok(build.indexOf('ai-voice-ios-release-owner.mjs')<build.indexOf('ai-conversation-workspace.mjs'));
  assert.match(read('scripts/ai-voice-ios-release-owner.mjs'),/ios-release-v3-cross-owner/);
});

test('Advisor cannot gain Controller tools from malformed mode or a generated tool plan',()=>{
  const policy=read('src/lib/ai-conversation-mode.ts');
  const orchestrator=read('src/lib/ai-tool-orchestrator.ts');
  const client=read('src/lib/ai-tool-client.ts');
  const api=read('api/ai-core.js');
  assert.match(policy,/normalizeAiConversationMode\(mode\) === 'advisor'/);
  assert.match(orchestrator,/normalizeAiConversationMode\(runtime\.conversationMode\)/);
  assert.match(client,/runtime\.conversationMode==='advisor'&&explicitAiActionRequest/);
  assert.match(api,/conversationMode=body\?\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
  assert.match(api,/ALLOWED_CAPABILITIES\.filter\(capability=>!ACTION_CAPABILITIES\.includes\(capability\)\)/);
});

test('AI history UI, content and delete state remain company-scoped and thread-specific',()=>{
  const ui=read('src/components/AiConversationWorkspace.tsx');
  const runtime=read('src/lib/ai-intelligence-runtime.ts');
  const store=read('src/storage/assistant-store.ts');
  assert.match(ui,/function AiConversationHistory\(/);
  assert.match(ui,/host\.state\.__workspaceHistoryOpen\?<AiConversationHistory/);
  assert.match(ui,/confirmDelete===row\.id/);
  assert.match(ui,/deletedThreads\?\.\[id\]/);
  assert.match(runtime,/t\.workspaceId===scope\.workspaceId&&t\.branchId===scope\.branchId/);
  assert.match(store,/deletedThreads\?:Record<string,string>/);
});

test('Firebase chat sync transports inert messages, not executable proposals',()=>{
  const cloud=read('src/cloud/assistant-history.ts');
  const outgoing=cloud.slice(cloud.indexOf('function toCloud('),cloud.indexOf('function deletion('));
  assert.match(cloud,/\.collection\('users'\)\.doc\(uid\)\.collection\('assistantHistory'\)/);
  assert.match(cloud,/db\(\)\.runTransaction/);
  assert.match(cloud,/if\(options\.installRemote===false&&options\.changedThreadId\)/);
  assert.match(cloud,/No conversation message was silently dropped/);
  assert.match(cloud,/Conflicting message identity from two devices/);
  assert.doesNotMatch(outgoing,/foundationReceipts\s*:/);
  assert.doesNotMatch(outgoing,/artifact\s*:/);
  assert.doesNotMatch(outgoing,/cipher\s*:/);
  assert.doesNotMatch(outgoing,/kernel\s*:/);
});

test('mobile products and suppliers retain source, currency and guarded approval entry points',()=>{
  const supplier=read('src/components/AiCommercialWorkspace.tsx');
  const importer=read('src/components/ProductAiSourceReview.tsx');
  const workspace=read('src/components/AiConversationWorkspace.tsx');
  assert.match(supplier,/lxw-supplier-mobile/);
  assert.match(supplier,/r\.currency\|\|''/);
  assert.match(importer,/className="product-import-table-wrap lxw-ai-product-review"/);
  assert.match(importer,/review\.diff\.map\(diff=>/);
  assert.match(importer,/mutateVaultSafely\(vault=>applyDraft/);
  assert.match(workspace,/className="lxw-mobile-pricing"/);
  assert.match(workspace,/artifactId:doc\.id,revision:doc\.revision,lineId:row\.id/);
});

test('the text formatter reports omitted supplier evidence instead of hiding it',()=>{
  const owner=read('scripts/ai-conversation-owner-stage4-tools.mjs');
  assert.match(owner,/additional rows not shown/);
  assert.match(owner,/additional fields not shown/);
  assert.match(owner,/summary is incomplete/);
  assert.match(owner,/المشتريات الأخيرة/);
});

test('combined release candidate does not reintroduce a PIN requirement',()=>{
  const cloud=read('src/cloud/assistant-history.ts');
  assert.match(cloud,/currentCloudUser\(\)\?\.uid!==uid/);
  assert.match(read('src/cloud/plain-workspace.ts'),/PIN-free Firebase format/);
  assert.doesNotMatch(cloud,/getAccountVaultSecret|derivePin|unlockWithPin/);
});
