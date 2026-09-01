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

test('cloud account cannot sign out while an encrypted sync is active',async()=>{
  const source=await read('src/components/CloudAccountModal.tsx');
  const matches=source.match(/disabled=\{this\.state\.busy\|\|this\.props\.syncState==='syncing'\}/g)??[];
  assert.ok(matches.length>=2,'both Sync Now and Sign Out should be protected during sync');
});
