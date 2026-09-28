import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('PIN migration stops on cloud divergence and exposes explicit local/cloud choices',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/baseline==='diverged'\)\{this\.setState\(\{busy:false,migrationConflict:true/);
  assert.match(auth,/resolveCloudConflictWithLocal\(user\.uid\)/);
  assert.match(auth,/resolveCloudConflictWithCloud\(user\.uid\)/);
  assert.match(auth,/Keep This Device Copy/);
  assert.match(auth,/Use Cloud Copy/);
  assert.match(auth,/Confirm choice/);
  assert.match(auth,/this\.state\.busy\|\|this\.state\.migrationConflict/);
  assert.match(auth,/if\(result==='remote-changed'\)\{cloudChangedDuringUpgrade=true/);
  assert.match(auth,/if\(cloudChangedDuringUpgrade\)\{this\.setState\(\{busy:false,migrationConflict:true/);
  assert.match(auth,/const cloudConflict=\/data changed on another device\/i\.test\(message\)/);
});

test('PIN migration never chooses a divergent account copy automatically',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(auth,/if\(baseline==='diverged'\)\{this\.setState\([\s\S]*?migrationConflict:true[\s\S]*?return;\}/);
  assert.match(cloud,/resolveCloudConflictWithLocal[\s\S]*?await publishVault\(uid,security,local,remote\)/);
  assert.match(cloud,/resolveCloudConflictWithCloud[\s\S]*?await installCloudVault\(uid,true\)/);
});

test('cloud accepts wrapped-key recovery metadata but never stores the recovery key itself',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const crypto=await read('src/crypto/crypto.ts');
  assert.match(cloud,/value\.version===1\|\|value\.version===2/);
  assert.match(cloud,/validBase64Bytes\(value\.recoveryWrapCipher,48,128\)/);
  assert.match(crypto,/recoveryWrapIv:recoveryWrap\.iv,recoveryWrapCipher:recoveryWrap\.cipher/);
  assert.match(crypto,/normalizeRecoveryCode\(code\)/);
});
