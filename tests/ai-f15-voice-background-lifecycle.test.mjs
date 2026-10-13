import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('F15 canonical iOS composer terminates native microphone on page hide without discarding editable input',async()=>{
 const owner=await read('scripts/ai-voice-ios-release-owner.mjs');
 assert.match(owner,/function __lourexSuspendVoiceOnBackground\(\)/);
 assert.match(owner,/window\.addEventListener\('pagehide',__lourexSuspendVoiceOnBackground\)/);
 assert.match(owner,/document\.addEventListener\('visibilitychange'/);
 assert.match(owner,/if\(document\.hidden\)__lourexSuspendVoiceOnBackground\(\)/);
 assert.match(owner,/abortVoice\(\)/);
 assert.match(owner,/composerStatus\(panel,'',''\)/);
 assert.doesNotMatch(owner,/__lourexSuspendVoiceOnBackground[\s\S]{0,160}setInput\(/);
});
test('F15 quick-mic cancels native sessions and retries when page is hidden, preserving transcript ownership',async()=>{
 const tools=await read('src/components/AiWorkflowTools.tsx');
 assert.match(tools,/window\.addEventListener\('pagehide',this\.onVoicePageHide\)/);
 assert.match(tools,/document\.addEventListener\('visibilitychange',this\.onVoiceVisibilityChange\)/);
 assert.match(tools,/window\.removeEventListener\('pagehide',this\.onVoicePageHide\)/);
 assert.match(tools,/document\.removeEventListener\('visibilitychange',this\.onVoiceVisibilityChange\)/);
 assert.match(tools,/private onVoicePageHide=\(\)=>\{[\s\S]*?this\.stopVoice\(\)/);
 assert.match(tools,/private onVoiceVisibilityChange=\(\)=>\{if\(document\.hidden\)this\.onVoicePageHide\(\);\}/);
 assert.match(tools,/private stopVoice=\(\)=>\{[\s\S]*?this\.voiceGeneration\+\+/);
 assert.match(tools,/this\.voiceRetryTimer=null/);
});
test('F15 browser exercises a seventeenth real mocked SpeechRecognition session after pagehide',async()=>{
 const visual=await read('tests/visual/run-ai-voice-reliability-batch5.cjs');
 assert.match(visual,/new Event\('pagehide'\)/);
 assert.match(visual,/window\.speechInstances\[15\]\.abortCalled===true/);
 assert.match(visual,/recording restarts after Safari background suspension/);
 assert.match(visual,/sessions:17/);
 assert.match(visual,/backgroundSuspension:'PASS'/);
});
