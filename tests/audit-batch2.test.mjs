import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('first-run setup prepares the optional logo while Settings retains dedicated company artwork cleanup profiles',async()=>{
  const [auth,settings]=await Promise.all([
    read('src/components/AuthScreens.tsx'),
    read('src/components/SettingsModal.tsx')
  ]);
  assert.match(auth,/fileToDataUrl\(file,4\*1024\*1024,'logo'\)/);
  assert.match(settings,/field==='logoDataUrl'\?'logo':field==='signatureDataUrl'\?'signature':'stamp'/);
  assert.match(settings,/fileToDataUrl\(file,4\*1024\*1024,this\.assetKind\(field\)\)/);
});

test('cloud account protects sign out while automatic encrypted synchronization is active',async()=>{
  const source=await read('src/components/CloudAccountModal.tsx');
  assert.match(source,/disabled=\{this\.state\.busy\|\|this\.props\.syncState==='syncing'\}/);
  assert.match(source,/Sign Out/);
  assert.doesNotMatch(source,/Sync Now|مزامنة الآن/);
});
