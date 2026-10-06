import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const owner=read('scripts/ai-remediation-batch3-conversation-ux.mjs');
const closeout=read('scripts/ai-remediation-batch3-conversation-ux-closeout.mjs');

test('remediation Batch 3 runs after final conversation composition and before final voice hash',()=>{
  const build=String(pkg.scripts?.build||'');
  const finalConversation=build.indexOf('node scripts/ai-conversation-final-batch5.mjs');
  const remediation=build.indexOf('node scripts/ai-remediation-batch3-conversation-ux.mjs');
  const containment=build.indexOf('node scripts/ai-remediation-batch3-conversation-ux-closeout.mjs');
  const voiceHash=build.indexOf('node scripts/ai-voice-final-runtime-hash.mjs');
  assert.ok(finalConversation>=0&&remediation>finalConversation&&containment>remediation&&voiceHash>containment,'Batch 3 UX and closeout must be the final conversation presentation owners without moving the voice delivery hash');
});

test('remediation Batch 3 preserves conversation capabilities while flattening controls',()=>{
  assert.match(owner,/__lourexNewConversation\?\.\(\)/,'New Conversation remains wired');
  assert.match(owner,/instance\.ask\(clean\)/,'Re-ask remains wired');
  assert.match(owner,/__lourexRetryLast/,'Retry remains wired');
  assert.match(owner,/assistantEvidence:\{list:/,'Evidence remains wired');
  assert.match(owner,/__lourexCopy\(text\)/,'Copy remains wired');
  assert.match(owner,/lourex-ai-message-action/,'message actions use the compact icon row');
  assert.match(owner,/lourex-ai-overflow-trigger/,'header exposes one compact overflow trigger');
  assert.match(owner,/className\.includes\('lourex-ai-new-conversation'\)\)return null/,'legacy oversized New Conversation control is removed from the final tree');
});

test('remediation Batch 3 owns one thread scroll region and safe-area composer',()=>{
  assert.match(owner,/grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(owner,/\.lourex-ai-messages\{min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important/);
  assert.match(owner,/padding:8px 10px max\(9px,env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(owner,/@media\(max-width:720px\)[\s\S]*height:100dvh!important/);
  assert.match(owner,/\.lourex-ai-message\.assistant\{align-self:stretch!important;max-width:none!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important/);
  assert.match(owner,/\.lourex-ai-context-shell\{[\s\S]*background:var\(--lx-chat-bg\)!important/);
});

test('remediation Batch 3 owns a conversation-local light and dark hierarchy',()=>{
  assert.match(owner,/--lx-chat-bg:#0b0c0e/,'dark chat canvas is charcoal instead of inheriting the navy workspace');
  assert.match(owner,/html\[data-ui-theme='light'\][\s\S]*--lx-chat-bg:#ffffff/,'light chat canvas has its own neutral surface');
  assert.match(owner,/\.lourex-ai-message\.user\{[\s\S]*background:var\(--lx-chat-accent\)!important;color:#fff!important/,'user bubble is the primary accent');
  assert.match(owner,/\[dir='rtl'\] \.lourex-ai-message\.user\{align-self:flex-end!important/,'outgoing RTL messages stay on the sender side');
  assert.match(owner,/\.lourex-ai-plus-menu\[data-view='root'\]/,'the compact root + menu has final visual ownership');
  assert.match(owner,/\.lourex-ai-context-line\{display:none!important/,'mobile context copy collapses instead of consuming a full extra row');
});

test('remediation Batch 3 closeout keeps functional content contained and removes the giant welcome card',()=>{
  assert.match(closeout,/\.lourex-ai-tool-activity\{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;align-self:stretch!important;flex:0 0 auto!important;width:auto!important;max-width:100%!important;min-width:0!important/,'tool activity uses stretch geometry instead of a transient 100% width box');
  assert.match(closeout,/transform:none!important;translate:none!important;animation:none!important;transition:none!important;overflow:hidden!important/,'tool activity cannot inherit mount motion that temporarily escapes the conversation panel');
  assert.match(closeout,/\.lourex-ai-empty\{align-self:center!important;width:100%!important;max-width:440px!important[\s\S]*border:0!important[\s\S]*background:transparent!important[\s\S]*box-shadow:none!important/,'welcome state is flat instead of another card');
  assert.match(closeout,/\.lourex-ai-starters button\{min-height:44px!important/,'starter suggestions remain touch-safe');
  assert.match(closeout,/--lx-chat-text/,'welcome copy resolves through the conversation palette when available');
});
