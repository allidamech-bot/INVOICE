import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v266 external mutations run inside the App vault write tail',async()=>{
  const [index,bridge]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/storage/vault-mutation-bridge.ts')
  ]);

  assert.match(index,/registerVaultMutationBridge\(async mutation=>\{/);
  assert.match(index,/instance\.vaultWriteTail\.catch\(\(\)=>null\)\.then\(async \(queued:any\)=>\{/);
  assert.match(index,/const latest=queued\?\?instance\.state\.vault/);
  assert.match(index,/const next=mutation\(latest\)/);
  assert.match(index,/const encrypted=await saveVault\(key,next\)/);
  assert.match(index,/instance\.latestEncryptedVault=encrypted/);
  assert.match(index,/instance\.setState\(\{vault:next\}/);
  assert.match(index,/instance\.scheduleCloudSync\(\)/);
  assert.match(index,/instance\.vaultWriteTail=operation/);

  assert.match(bridge,/export function registerVaultMutationBridge/);
  assert.match(bridge,/export async function mutateVaultSafely/);
});

test('v266 AI and supplier-import writes cannot bypass the serialized mutation bridge',async()=>{
  const [ai,supplier]=await Promise.all([
    read('src/components/AiCopilot.tsx'),
    read('src/components/SupplierDocumentImport.tsx')
  ]);

  assert.match(ai,/import \{ mutateVaultSafely \} from '\.\.\/storage\/vault-mutation-bridge\.js'/);
  assert.match(supplier,/import \{ mutateVaultSafely \} from '\.\.\/storage\/vault-mutation-bridge\.js'/);
  assert.ok((ai.match(/mutateVaultSafely\(/g)||[]).length>=3,'all AI mutation families must use the bridge');
  assert.match(supplier,/await mutateVaultSafely\(vault=>/);
  assert.doesNotMatch(ai,/\bsaveVault\s*\(/);
  assert.doesNotMatch(supplier,/\bsaveVault\s*\(/);
  assert.doesNotMatch(supplier,/resumeVaultSession\s*\(/);
});
