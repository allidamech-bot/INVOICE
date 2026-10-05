import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const owner=read('scripts/ai-conversation-owner.mjs');

test('Batch 1 conversation owner runs after legacy AI patches',()=>{
  const build=String(pkg.scripts?.build||'');
  assert.match(build,/ai-batch7-proactive-voice\.mjs[\s\S]*ai-batch7-placement-repair\.mjs[\s\S]*ai-conversation-owner\.mjs/);
});

test('Batch 1 serializes Safari voice restart across delayed native microphone release',()=>{
  assert.match(owner,/NATIVE_RELEASE_GRACE_MS=420/);
  assert.match(owner,/queueVoiceAfterNativeRelease/);
  assert.match(owner,/nativeReleaseUntil=Date\.now\(\)\+NATIVE_RELEASE_GRACE_MS/);
  assert.match(owner,/recognitionReleaseTimer/);
  assert.match(owner,/releaseWait=nativeReleaseUntil-Date\.now\(\)/);
  assert.match(owner,/composerStatus\(panel,'starting','starting'\);queueVoiceAfterNativeRelease\(panel\);return/);
  assert.match(owner,/instance\.abort\?\.\(\);\}catch\{\}nativeReleaseUntil/);
  assert.match(owner,/if\(recognition===instance\)finishRecognition/);
  assert.match(owner,/clearRecognitionReleaseTimer\(\)/);
  assert.match(owner,/__lourexConversationOwnerBatch1/);
});
