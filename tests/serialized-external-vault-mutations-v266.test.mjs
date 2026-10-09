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
  assert.match(index,/await instance\.waitForProtectedDataOperation\(\)/);
  assert.match(index,/const latestFull=queued\?\?instance\.state\.vault/);
  assert.match(index,/const latest=scopeVaultForExternalMutation\(latestFull\)/);
  assert.match(index,/const intended=applyWorkspaceScope\(latest,mutation\(latest\)\)/);
  assert.match(index,/const validated=mergeVaultIntent\(latest,intended,latest\)/);
  assert.match(index,/const next=mergeScopedVault\(latestFull,appendAuditEventsForVaultDiff\(latest,validated\)\)/);
  const mutationPath=index.slice(index.indexOf('const latestFull=queued??instance.state.vault'),index.indexOf('const encrypted=await saveVault(key,next)'));
  assert.ok(mutationPath.indexOf('scopeVaultForExternalMutation')<mutationPath.indexOf('mergeVaultIntent'));
  assert.ok(mutationPath.indexOf('mergeVaultIntent')<mutationPath.indexOf('mergeScopedVault'));
  assert.ok(mutationPath.indexOf('appendAuditEventsForVaultDiff')>mutationPath.indexOf('mergeVaultIntent'));
  assert.doesNotMatch(mutationPath,/const next=mutation\(latest\)/,'external tools must not write unvalidated vault mutations');
  assert.match(index,/const encrypted=await saveVault\(key,next\)/);
  assert.match(index,/instance\.latestEncryptedVault=encrypted/);
  assert.match(index,/if\(instance\.state\.unlocked&&instance\.state\.key===key\)\{/);
  assert.match(index,/instance\.setState\(refreshedEditor\?\{vault:next,editorDoc:\{\.\.\.refreshedEditor\}\}:\{vault:next\},resolve\)/);
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
