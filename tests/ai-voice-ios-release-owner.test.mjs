import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const owner=read('scripts/ai-voice-ios-release-owner.mjs');
const visual=read('tests/visual/run-ai-voice-reliability-batch5.cjs');

test('iOS voice release owner runs after the canonical conversation owner and before composer stage 3',()=>{
  const build=String(pkg.scripts?.build||'');
  const conversation=build.indexOf('node scripts/ai-conversation-owner.mjs');
  const iosRelease=build.indexOf('node scripts/ai-voice-ios-release-owner.mjs');
  const stage3=build.indexOf('node scripts/ai-conversation-owner-stage3.mjs');
  assert.ok(conversation>=0&&iosRelease>conversation&&stage3>iosRelease,'iOS voice release owner must patch the canonical runtime before Batch 3 composer transforms');
});

test('WebKit voice restart uses an extended native lease and bounded transient start retry',()=>{
  assert.match(owner,/__lourexWebKitVoice/);
  assert.match(owner,/NATIVE_RELEASE_GRACE_MS=__lourexWebKitVoice\?1600:420/);
  assert.match(owner,/NATIVE_RELEASE_RETRY_MS=__lourexWebKitVoice\?320:220/);
  assert.match(owner,/NATIVE_RELEASE_RETRY_LIMIT=__lourexWebKitVoice\?6:4/);
  assert.match(owner,/__lourexTransientVoiceStartError/);
  assert.match(owner,/native microphone\|microphone\.\*owned\|already\.\*start\|busy\|in use/);
  assert.match(owner,/__lourexStartVoice\(instance,panel,attempt\+1\)/);
  assert.match(owner,/name==='notallowederror'\|\|name==='securityerror'/);
  assert.match(owner,/source\.replace\(startToken,'    __lourexStartVoice\(instance,panel\);'\)/);
  assert.match(owner,/__LOUREX_VOICE_RUNTIME_OWNER__/);
  assert.match(owner,/ios-release-v2/);
});

test('WebKit browser QA reproduces a native release delay that exceeds the previous 1100ms grace and repeats twelve sessions',()=>{
  assert.match(visual,/releaseDelay:engine\.name\(\)==='webkit'\?1450:260/);
  assert.match(visual,/native microphone is still owned/);
  assert.match(visual,/overlappingStarts\),0/);
  assert.match(visual,/sessions:12/);
  assert.match(visual,/repeat session/);
});
