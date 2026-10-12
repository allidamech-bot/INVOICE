import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const composerOwner=read('scripts/ai-voice-ios-release-owner.mjs');
const workflow=read('src/components/AiWorkflowTools.tsx');
const visual=read('tests/visual/run-ai-voice-reliability-batch5.cjs');

test('composer hands off native microphone ownership to workflow, without concurrently starting',()=>{
  assert.match(composerOwner,/lourex-ai-workflow-voice-request/);
  assert.match(composerOwner,/if\(active\)\{abortVoice\(\);const handoffPanel=document\.querySelector\(PANEL\);/);
  assert.match(composerOwner,/composerStatus\(handoffPanel,'',''\);detail\.active=true/);
  assert.match(composerOwner,/detail\.readyAt=Math\.max\(Number\(detail\.readyAt\)\|\|0,nativeReleaseUntil\)/);
  assert.match(composerOwner,/lourex-ai-composer-voice-request/);
  assert.match(composerOwner,/nativeReleaseUntil=Math\.max\(nativeReleaseUntil,Number\(handoff\.readyAt\)\|\|0\)/);
  assert.match(composerOwner,/NATIVE_RELEASE_RETRY_LIMIT=__lourexWebKitVoice\?6:4/);
});

test('workflow releases microphone when composer claims ownership and cancels delayed retries',()=>{
  assert.match(workflow,/window\.addEventListener\('lourex-ai-composer-voice-request',this\.onComposerVoiceRequest\)/);
  assert.match(workflow,/window\.removeEventListener\('lourex-ai-composer-voice-request',this\.onComposerVoiceRequest\)/);
  assert.match(workflow,/const holdingLease=Boolean\(this\.recognition\|\|this\.voiceRetryTimer\|\|this\.voiceReleaseUntil>Date\.now\(\)\)/);
  assert.match(workflow,/this\.voiceReleaseUntil=Math\.max\(this\.voiceReleaseUntil,Date\.now\(\)\+1600\)/);
  assert.match(workflow,/if\(this\.voiceRetryTimer\)\{clearTimeout\(this\.voiceRetryTimer\)/);
  assert.match(workflow,/window\.dispatchEvent\(new CustomEvent\('lourex-ai-workflow-voice-request',\{detail:handoff\}\)\)/);
  assert.match(workflow,/generation!==this\.voiceGeneration/);
  assert.match(workflow,/voiceStarting:boolean/);
  assert.match(workflow,/voiceStarting:true,error:''/);
  assert.match(workflow,/Starting…/);
});

test('workflow provides bounded native restart and preserves explicit editable submission',()=>{
  assert.match(workflow,/if\(transient&&attempt<6\)/);
  assert.match(workflow,/code==='not-allowed'\|\|code==='service-not-allowed'/);
  assert.match(workflow,/code==='audio-capture'/);
  assert.match(workflow,/advisorInput\(transcript,false\)/);
  assert.doesNotMatch(workflow,/recognition\.onresult=[\s\S]*?requestSubmit\(/);
  assert.match(visual,/lourex-ai-workflow-voice-request/);
  assert.match(visual,/workflowHandoff\.active,true/);
  assert.match(visual,/overlappingStarts\),0/);
});
