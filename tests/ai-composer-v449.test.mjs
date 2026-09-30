import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const index=read('index.html');
const css=read('public/ai-composer-v449.css');
const js=read('public/ai-composer-v449.js');
const vercel=read('vercel.json');

test('v449 loads the chat-style composer after AI workflow bridge',()=>{
  assert.match(index,/ai-composer-v449\.css\?v=449-1/);
  assert.match(index,/lourex-ai-workflows\.js\?v=1[\s\S]*ai-composer-v449\.js\?v=449-1/);
  assert.match(css,/\.lourex-ai-composer-plus/);
  assert.match(css,/\.lourex-ai-composer-mic/);
  assert.match(css,/\.lourex-ai-plus-menu/);
  assert.match(css,/\[data-lourex-ai-workflow-mount\]>\.lourex-ai-tools/);
  assert.match(css,/\.lourex-ai-compose>\.lourex-ai-meta\{display:none!important\}/);
});

test('v449 plus menu contains the major LOUREX AI workflows without a launcher grid',()=>{
  for(const token of ['AI Inbox','File → Quotation','Product AI','Supplier AI','Ask Anything','Collections','CFO','Compare Supplier Offers','What matters today','Business Memory','Accounting Guardian','AI Job History','Advisor Activity'])assert.ok(js.includes(token),`missing ${token}`);
  for(const action of ['quote','product','supplier','guardian','history'])assert.match(js,new RegExp(`routeThroughWorkflowMenu\\('${action}'\\)`));
  assert.doesNotMatch(js,/routeThroughWorkflowMenu\(\d+\)/);
  assert.match(js,/lourex-ai-open-business-search/);
  assert.match(js,/lourex-ai-open-procurement/);
  assert.match(js,/aria-controls',MENU_ID/);
  assert.match(js,/ArrowDown/);
  assert.match(js,/stopImmediatePropagation\(\)/);
  assert.match(css,/\.lourex-ai-plus-menu\{[^}]*background:var\(--ft-surface,#111\)!important;[^}]*opacity:1!important/);
  assert.match(css,/\.lourex-ai-compose\{[^}]*z-index:20/);
});

test('v449 internal workflow routing is semantic and cannot silently drift with button order',()=>{
  assert.match(js,/function workflowActionLabel/);
  assert.match(js,/File → Quote/);
  assert.match(js,/Job History/);
  assert.match(js,/normalizeLabel\(button\.textContent\)===expected/);
  assert.match(js,/Array\.from\(document\.querySelectorAll\('\.modal-backdrop'\)\)\.reverse\(\)/);
  assert.doesNotMatch(js,/const target=buttons\[index\]/);
});

test('v449 waits long enough for first-load workflow chunks and modal rendering',()=>{
  assert.match(js,/function withWorkflowReady/);
  assert.match(js,/attempt<40/);
  assert.match(js,/withWorkflowReady\(callback,attempt\+1\),75/);
  assert.match(js,/function clickInternalAction/);
  assert.match(js,/clickInternalAction\(panel,action,attempt\+1\),25/);
  assert.match(js,/AI tools are still loading/);
  assert.match(js,/This AI tool could not open/);
});

test('v449 refreshes language labels and repairs partial composer remounts',()=>{
  assert.match(js,/function refreshComposer/);
  assert.match(js,/lourexAiComposerLang/);
  assert.match(js,/input\.placeholder=l\.message/);
  assert.match(js,/plus\.setAttribute\('aria-label',l\.plus\)/);
  assert.match(js,/mic\.setAttribute\('aria-label',l\.mic\)/);
  assert.match(js,/status\.dataset\.messageKey/);
  assert.match(js,/buildMenu\(panel,menu\)/);
  assert.match(js,/if\(complete\)\{refreshComposer\(panel,form,input\);return;\}/);
  assert.match(js,/plus\?\.remove\(\);mic\?\.remove\(\);status\?\.remove\(\);menu\?\.remove\(\)/);
  assert.match(js,/recognitionPanel!==panel\)abortVoice\(\)/);
  assert.match(js,/window\.addEventListener\('lourex-language-change',schedule\)/);
});

test('v449 mobile controls are visibly drawn and meet the 44px touch contract',()=>{
  assert.match(css,/\.lourex-ai-composer-plus svg,[\s\S]*\.lourex-ai-composer-mic svg\{[^}]*fill:none;stroke:currentColor/);
  assert.match(css,/\.lourex-ai-composer-plus svg\{[^}]*width:27px;[^}]*height:27px;[^}]*stroke-width:1\.8/);
  assert.match(css,/\.lourex-ai-composer-mic svg\{[^}]*width:24px;[^}]*height:24px;[^}]*stroke-width:1\.9/);
  assert.match(css,/flex:0 0 44px!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*flex-basis:44px!important;width:44px!important;height:44px!important/);
  assert.doesNotMatch(css,/43px/);
  assert.match(css,/\.lourex-ai-plus-item\{[^}]*min-height:48px/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
});

test('v449 narrow-phone header can shrink without clipping the advisor title',()=>{
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.lourex-ai-title\{[^}]*min-width:0!important;[^}]*overflow:hidden!important/);
  assert.match(css,/\.lourex-ai-head-actions\{[^}]*max-width:62%/);
  assert.match(css,/\.lourex-ai-new-conversation\{[^}]*max-width:128px!important/);
  assert.match(css,/@media\(max-width:360px\)[\s\S]*\.lourex-ai-title small\{display:none!important\}/);
  assert.match(css,/@media\(max-width:360px\)[\s\S]*\.lourex-ai-new-conversation\{[^}]*max-width:118px!important/);
});

test('v449 voice is explicit, permission-aware and transcribes without auto-sending',()=>{
  assert.match(js,/recognitionCtor\(\)/);
  assert.match(js,/instance\.onstart/);
  assert.match(js,/instance\.onresult/);
  assert.match(js,/instance\.onerror/);
  assert.match(js,/Listening… tap the microphone to stop/);
  assert.match(js,/جارٍ الاستماع… اضغط الميكروفون للإيقاف/);
  assert.match(js,/Microphone access was denied/);
  assert.match(js,/تم رفض إذن الميكروفون/);
  assert.match(js,/nativeSetInput\(input/);
  assert.doesNotMatch(js,/requestSubmit\(/);
  assert.match(css,/\.lourex-ai-composer-mic\.is-listening/);
  assert.match(css,/lourexAiListenPulse/);
  assert.match(vercel,/microphone=\(self\)/);
  assert.doesNotMatch(vercel,/microphone=\(\)/);
  assert.doesNotMatch(vercel,/camera=\(self\)/);
});
