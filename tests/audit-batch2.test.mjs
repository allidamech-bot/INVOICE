import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('first-run setup normalizes each company artwork with its correct cleanup profile',async()=>{
  const source=await read('src/components/AuthScreens.tsx');
  assert.match(source,/field==='logoDataUrl'\?'logo':field==='signatureDataUrl'\?'signature':'stamp'/);
  assert.match(source,/fileToDataUrl\(file,4\*1024\*1024,kind\)/);
});

test('cloud account cannot sign out while an encrypted sync is active',async()=>{
  const source=await read('src/components/CloudAccountModal.tsx');
  const matches=source.match(/disabled=\{this\.state\.busy\|\|this\.props\.syncState==='syncing'\}/g)??[];
  assert.ok(matches.length>=2,'both Sync Now and Sign Out should be protected during sync');
});
