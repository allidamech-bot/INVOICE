import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('AI Chat: Safari scroll-follow respects the user reading prior turns',async()=>{
  const {aiChatNearBottom:near}=await import('../dist/src/lib/ai-chat-scroll.js');
  assert.equal(near(0,0,0),true);
  assert.equal(near(880,1000,120),true);
  assert.equal(near(760,1000,120),true,'up to 120 px from latest turn is sticky');
  assert.equal(near(700,1000,120),false,'reading old messages must not auto-jump');
  assert.equal(near(-15,1000,120),false,'Safari overscroll does not impersonate the bottom');
  assert.equal(near(Number.NaN,1000,120),false);
});

test('AI Chat: final compiled conversation owns one scoped scroll observer in both modes',async()=>{
  const [source,built,helper,compiledHelper,legacy]=await Promise.all([
    read('src/components/AiConversationWorkspace.tsx'),
    read('dist/src/components/AiConversationWorkspace.js'),
    read('src/lib/ai-chat-scroll.ts'),
    read('dist/src/lib/ai-chat-scroll.js'),
    read('dist/src/components/AiCopilot.js')
  ]);
  for(const content of [source,built]){
    assert.match(content,/ConversationScrollKeeper/);
    assert.match(content,/attachAiChatScrollFollower/);
    assert.match(content,/lastUserId/);
    assert.match(content,/attached\.disconnect\(\)/,'thread switch must remove stale scroll observers');
  }
  for(const content of [helper,compiledHelper]){
    assert.match(content,/MutationObserver/);
    assert.match(content,/ResizeObserver/,'follow Safari PDF and font layout reflows');
    assert.match(content,/resize\?\.disconnect\(\)/,'observer must clean up on conversation changes');
    assert.match(content,/aiChatNearBottom/);
  }
  assert.match(source,/normalizeAiConversationMode\(host\.__intelligenceKernel\?\.mode\)==='advisor'/);
  assert.match(source,/normalizeAiConversationMode\(host\.__intelligenceKernel\?\.mode\)==='controller'/);
  assert.doesNotMatch(legacy,/requestAnimationFrame\(\(\)=>\{const box=document\.querySelector\('#lourex-ai-panel \.lourex-ai-messages'\)/,
    'legacy unconditional scroll must not fight the scoped user-preserving observer');
  assert.match(source,/__workspaceSwitchMode=async/);
  assert.match(source,/__workspaceSwitching:true/);
  assert.match(source,/recentModeThread\.set\(keyFor\(target\),current\.scope\.threadId\)/);
  assert.match(source,/current\.scope\.accountId!==previous\.scope\.accountId/);
  assert.match(source,/host\.__businessThreads=\[\{/,
    'a newly persisted but initially unlisted conversation should remain selectable on immediate mode return');
  assert.match(source,/mode:target,hasArtifact:Boolean\(current\.artifact\)/);
  assert.match(source,/Opening conversation…/);
});

test('AI Chat: PDF remains real and downloadable but never renders blank embedded blob iframe',async()=>{
  const [source,styles]=await Promise.all([read('src/components/AiConversationWorkspace.tsx'),read('src/styles/ai-conversation-workspace.css')]);
  assert.match(source,/__LOUREX_BUILD_CHAT_PDF__/);
  assert.match(source,/URL\.createObjectURL\(file\)/);
  assert.match(source,/className="lxw-ai-pdf-file"/);
  assert.match(source,/className="lxw-pdf-preview"/);
  assert.match(source,/className="lxw-pdf-download"/);
  assert.match(source,/href=\{pdfResult\.url\} download=\{pdfResult\.name\}/);
  assert.doesNotMatch(source,/<iframe title=\{label\(ar,'LOUREX PDF file preview'/);
  assert.match(styles,/\.lxw-ai-pdf-file/);
  assert.match(styles,/\.lxw-pdf-file-meta/);
});

test('AI Chat: saving quotation requires existing reviewed action; PDF is preview-only',async()=>{
  const source=await read('src/components/AiConversationWorkspace.tsx');
  assert.match(source,/Save quotation/,'quotation-specific action must exist');
  assert.match(source,/حفظ عرض السعر/);
  assert.match(source,/حفظ المسودة/);
  assert.match(source,/onClick=\{\(\)=>void host\.ask\(ar\?'احفظ المسودة':'save this draft'\)\}/,
    'existing approval gateway remains owner of saving');
  assert.match(source,/Saving requires reviewing and approving the draft/);
  assert.match(source,/Generate PDF preview/);
  assert.match(source,/prepareAiPdfPreview\(kernel,vault/);
  assert.match(source,/saveReviewPending=doc\.status==='draft'/,'once a review is staged, saving must not be requested again');
  assert.match(source,/Boolean\(doc\.blockers\.length\)\|\|saveReviewPending/);
  assert.match(source,/Awaiting approval/);
  assert.match(source,/Confirm quotation save/);
  assert.match(source,/تأكيد حفظ عرض السعر/);
  assert.match(source,/Confirm draft save/);
  assert.match(source,/aria-busy=\{pdfBusy\}/);
  assert.match(source,/className="lxw-inline-spinner"/);
  assert.match(source,/dir:'auto'/,'RTL and LTR user input must auto-detect paragraph direction');
  assert.match(source,/chatContent=safeContent\.map/,'approval actions must be inside the scroll track');
  assert.match(source,/ConversationThinkingIndicator/);
  assert.match(source,/lxw-thinking-dots/);
  assert.doesNotMatch(source,/await host\.approveProposal\(/,'save button must not bypass explicit approval');
});
