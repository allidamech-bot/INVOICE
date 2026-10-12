import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const voice=source('scripts/ai-voice-ios-release-owner.mjs');
const tools=source('src/components/AiWorkflowTools.tsx');
const client=source('src/lib/ai-tool-client.ts');
const mode=source('src/lib/ai-conversation-mode.ts');
const api=source('api/ai-core.js');
const advisorApi=source('api/ai-advisor-v2.js');
const ui=source('src/components/AiConversationWorkspace.tsx');
const products=source('src/components/ProductAiSourceReview.tsx');
const suppliers=source('src/components/SupplierAiProposalReview.tsx');
const commerce=source('src/components/AiCommercialWorkspace.tsx');
const css=source('src/styles/ai-conversation-workspace.css');
const answer=source('scripts/ai-conversation-owner-stage4-tools.mjs');
const cloud=source('src/cloud/assistant-history.ts');
const runtime=source('src/lib/ai-intelligence-runtime.ts');
const store=source('src/storage/assistant-store.ts');
const rules=source('firestore.rules');

test('Batch 1 voice owners cannot simultaneously control one native microphone',()=>{
  assert.match(voice,/ios-release-v3-cross-owner/);
  assert.match(voice,/lourex-ai-workflow-voice-request/);
  assert.match(voice,/lourex-ai-composer-voice-request/);
  assert.match(tools,/voiceReleaseUntil/);
  assert.match(tools,/clearVoiceCaptureTimer/);
  assert.match(tools,/Microphone did not become ready/);
});
test('Batch 2 Advisor can discuss but cannot execute, including malformed incoming mode',()=>{
  assert.match(client,/if\(runtime\.conversationMode==='advisor'&&explicitAiActionRequest\(input\.message\)\)return null/);
  assert.match(mode,/normalizeAiConversationMode\(mode\) === 'advisor'/);
  assert.match(api,/conversationMode=body\?\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
  assert.match(advisorApi,/conversationMode=body\?\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
});
test('Batch 3 saved history is visible independently of legacy context',()=>{
  assert.match(ui,/function AiConversationHistory\(/);
  assert.match(ui,/__workspaceHistoryOpen\?<AiConversationHistory/);
  assert.match(ui,/className="lxw-history-trigger"/);
  assert.match(ui,/role="status"/);
});
test('Batch 4 commercial rows and editable line items preserve reference identifiers',()=>{
  assert.match(commerce,/lxw-supplier-mobile/);
  assert.match(commerce,/r\.unitCost/);
  assert.match(ui,/lxw-mobile-pricing/);
  assert.match(ui,/artifactId:doc\.id,revision:doc\.revision,lineId:row\.id/);
  assert.match(css,/@media\(max-width:720px\)/);
});
test('Batch 5 chat supplier summaries explicitly identify omitted source fields',()=>{
  assert.match(answer,/function __lourexCompactObject/);
  assert.match(answer,/summary is incomplete/);
  assert.match(answer,/additional rows not shown/);
  assert.match(answer,/Additional information is not shown here/);
});
test('Batch 6 supplier/product import review reveals all differences and source metadata',()=>{
  assert.match(products,/review\.diff\.map\(diff=>/);
  assert.doesNotMatch(products,/review\.diff\.slice\(0,8\)/);
  assert.match(products,/lxw-ai-product-review/);
  assert.match(suppliers,/lxw-ai-supplier-review/);
  assert.match(suppliers,/sourceExcerpt/);
});
test('Batch 7 cloud history only publishes inert scoped conversation content',()=>{
  assert.match(cloud,/\.collection\('users'\)\.doc\(uid\)\.collection\('assistantHistory'\)/);
  assert.match(cloud,/mergeAssistantCloudThread/);
  assert.match(cloud,/runTransaction/);
  assert.match(cloud,/checkAccount\(uid\)/);
  const serialized=cloud.slice(cloud.indexOf('function toCloud('),cloud.indexOf('function deletion('));
  assert.doesNotMatch(serialized,/foundationReceipts:/);
  assert.doesNotMatch(serialized,/kernel:/);
  assert.doesNotMatch(serialized,/cipher:/);
  assert.match(runtime,/queueHistorySync/);
  assert.match(store,/deletedThreads\?:Record<string,string>/);
});
test('Cross-batch cloud imports do not restore stale executable approval state',()=>{
  assert.match(cloud,/local\.mode===remote\.mode\?newest\.mode:'advisor'/);
  assert.match(cloud,/sameMessages/);
  assert.match(runtime,/host\.__intelligenceKernel=undefined;host\.__foundationReceipts=\[\];needsReopen=true/);
  assert.match(ui,/Conversation deletion was not confirmed/);
});
test('Account firewall remains UID-restricted with no open assistant-history rule',()=>{
  assert.match(rules,/match \/users\/\{userId\}\/\{document=\*\*\}/);
  assert.match(rules,/request\.auth\.uid == userId/);
  assert.doesNotMatch(rules,/match \/assistantHistory\/\{.*?allow read, write: if true/);
});
