import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('local recovery is discoverable only when a safety snapshot exists',async()=>{
  const [entry,recovery]=await Promise.all([read('src/app/index.tsx'),read('src/app/local-recovery.ts')]);
  assert.match(entry,/startLocalRecoveryAssistant/);
  assert.match(recovery,/getSafetySnapshot/);
  assert.match(recovery,/data-lourex-recovery/);
  assert.match(recovery,/if\(!snapshot\)return/);
});

test('recovery verifies and previews encrypted snapshot before restore',async()=>{
  const recovery=await read('src/app/local-recovery.ts');
  assert.match(recovery,/verifyPin\(pin,snapshot\.security\)/);
  assert.match(recovery,/decryptVault\(key,snapshot\.vault\)/);
  assert.match(recovery,/Quotations \/ عروض أسعار/);
  assert.match(recovery,/Latest document \/ آخر مستند/);
});

test('restore signs out cloud and swaps snapshots reversibly',async()=>{
  const [recovery,db]=await Promise.all([read('src/app/local-recovery.ts'),read('src/storage/db.ts')]);
  const signOut=recovery.indexOf('await signOutCloudUser()');
  const swap=recovery.indexOf('await swapSafetySnapshotIntoCurrent()');
  assert.ok(signOut>=0&&swap>signOut);
  assert.match(db,/const reverse:SafetySnapshotRecord/);
  assert.match(db,/store\.put\(snapshot\.security\)/);
  assert.match(db,/store\.put\(snapshot\.vault\)/);
  assert.match(db,/store\.put\(reverse\)/);
});
