import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('logo signature and stamp use only original or explicit AI background removal',async()=>{
  const settings=await readFile('src/components/SettingsModal.tsx','utf8');

  assert.match(settings,/signatureOriginalDataUrl:string/);
  assert.match(settings,/signatureRebuiltDataUrl:string/);
  assert.match(settings,/stampOriginalDataUrl:string/);
  assert.match(settings,/stampRebuiltDataUrl:string/);
  assert.match(settings,/private rebuildSignature=async/);
  assert.match(settings,/private rebuildStamp=async/);
  assert.match(settings,/this\.rebuildAsset\('signatureDataUrl'\)/);
  assert.match(settings,/this\.rebuildAsset\('stampDataUrl'\)/);
  assert.match(settings,/AI Remove Background/);
  assert.match(settings,/AI transparent/);
  assert.match(settings,/Original/);
  assert.match(settings,/fileToRawDataUrl\(file\)/);

  assert.doesNotMatch(settings,/cleanImageDataUrl/);
  assert.doesNotMatch(settings,/fileToDataUrl\(file/);
  assert.doesNotMatch(settings,/Background cleaned automatically/);
  assert.doesNotMatch(settings,/Signature and stamp backgrounds cleaned/);
  assert.match(settings,/No automatic color-threshold cleanup is applied/);
});
