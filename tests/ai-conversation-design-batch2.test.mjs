import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('AI conversation design Batch 2 runs immediately after Batch 1',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=pkg.scripts.build;
  const one=build.indexOf('node scripts/ai-conversation-design-batch1.mjs');
  const two=build.indexOf('node scripts/ai-conversation-design-batch2.mjs');
  const closeout=build.indexOf('node scripts/ai-conversation-design-batch2-closeout.mjs');
  const pdf=build.indexOf('node scripts/v580-safari-pdf-single-page.mjs');
  assert.ok(one>=0&&two>one&&closeout>two&&pdf>closeout,'Batch 2 closeout must stabilize the final interaction owner before unrelated PDF finalization');
});

test('Batch 2 consolidates scope tabs without removing scope capability',async()=>{
  const source=await read('scripts/ai-conversation-design-batch2.mjs');
  assert.match(source,/lourex-ai-scope-trigger/);
  assert.match(source,/lourex-ai-scope-menu/);
  assert.match(source,/lourex-ai-scope-option/);
  assert.match(source,/current\.click\(\)/,'custom selector delegates to the native React-owned scope action');
  assert.match(source,/data-lourex-native-scope/,'native scope buttons remain in the DOM as the capability owner');
  assert.match(source,/menuitemradio/,'scope choices expose menu radio semantics');
  assert.match(source,/min-height:44px!important/,'mobile scope selector remains touch safe');
});

test('Batch 2 makes tool-plan trust detail disclosure-first rather than removing evidence',async()=>{
  const source=await read('scripts/ai-conversation-design-batch2.mjs');
  assert.match(source,/decorateToolActivity/);
  assert.match(source,/aria-expanded/);
  assert.match(source,/\.lourex-ai-tool-activity\[data-lourex-design2='true'\]:not\(\.is-expanded\) \.lourex-ai-tool-steps/);
  assert.match(source,/\.lourex-ai-tool-activity\[data-lourex-design2='true'\]\.is-expanded \.lourex-ai-tool-steps/);
  assert.doesNotMatch(source,/remove\(.*lourex-ai-tool|innerHTML\s*=\s*['"]{2}/,'trust evidence is collapsed, never deleted');
});

test('Batch 2 softens report chrome and preserves history and approval surfaces',async()=>{
  const source=await read('scripts/ai-conversation-design-batch2.mjs');
  assert.match(source,/\.lourex-ai-answer-block\.is-summary \.lourex-ai-answer-heading-row/);
  assert.match(source,/\.lourex-ai-thread-picker\[data-lourex-design2='true'\]/);
  assert.match(source,/\.lourex-ai-tool-approval\{/);
  assert.doesNotMatch(source,/assistantCapabilityAllowed|document\.createDraft|payment\.record|inventory\.adjust|accounting\.post/,'presentation owner cannot change AI authority');
});


test('Batch 2 closeout prevents mutation-observer feedback while keeping scope delegation intact',async()=>{
  const source=await read('scripts/ai-conversation-design-batch2-closeout.mjs');
  assert.match(source,/textContent!==nextTriggerLabel/);
  assert.match(source,/option\.textContent!==nextLabel/);
  assert.match(source,/__lourexConversationDesignBatch2Closeout/);
  assert.doesNotMatch(source,/assistantCapabilityAllowed|document\.createDraft|payment\.record|inventory\.adjust/);
});
