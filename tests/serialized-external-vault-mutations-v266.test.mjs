import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('V2 external AI mutations run through validated App write tail and Firebase UID CAS',async()=>{
  const [index,app,bridge]=await Promise.all([
    read('src/app/index.tsx'),read('src/app/App.tsx'),read('src/storage/vault-mutation-bridge.ts')
  ]);
  assert.match(index,/registerVaultMutationBridge\(async mutation=>\{/);
  assert.match(index,/await instance\.persistFullMutation\(/);
  assert.match(index,/const latest=scopeVaultForExternalMutation\(full\)/);
  assert.match(index,/const intended=applyWorkspaceScope\(latest,mutation\(latest\)\)/);
  assert.match(index,/const validated=mergeVaultIntent\(latest,intended,latest\)/);
  assert.match(index,/return mergeScopedVault\(full,appendAuditEventsForVaultDiff\(latest,validated\)\)/);
  const method=app.slice(app.indexOf('private persistFullMutation=async'),app.indexOf('private reserveDocument=async'));
  assert.match(method,/this\.vaultWriteTail\.catch\(\(\)=>null\)\.then\(async queued=>/);
  assert.match(method,/await this\.waitForProtectedDataOperation\(\)/);
  assert.match(method,/uid!==currentCloudUser\(\)\?\.uid\|\|uid!==activeAccountStorageUid\(\)/);
  assert.match(method,/synchronizeActiveWorkspaceOnSave\(mutation\(latest\)\)/);
  assert.match(method,/updatePlainWorkspaceIfUnchanged\(uid,local\.localRevision,next\)/);
  assert.match(method,/this\.vaultWriteTail=operation/);
  assert.match(method,/this\.scheduleCloudSync\(\)/);
  assert.doesNotMatch(index,/const encrypted=await saveVault\(|instance\.latestEncryptedVault=encrypted/);
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
