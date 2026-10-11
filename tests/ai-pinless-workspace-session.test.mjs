import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeVaultSession} from '../dist/src/storage/vault.js';
import {registerWorkspaceSessionReader,mutateVaultSafely,registerVaultMutationBridge} from '../dist/src/storage/vault-mutation-bridge.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

test('AI and notifications obtain the authenticated cloud workspace without a PIN or legacy vault',async()=>{
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),vault=emptyVault();vault.company.nameEn='Cloud-only test';let reads=0;
 registerWorkspaceSessionReader(async()=>{reads++;return{key,vault};});
 const result=await resumeVaultSession();assert.equal(result.key,key);assert.equal(result.vault.company.nameEn,'Cloud-only test');assert.equal(reads,1);
 registerWorkspaceSessionReader(async()=>null);assert.equal(await resumeVaultSession(),null,'signed-out authoritative null must not fall back to a retained legacy session');
});
test('the read adapter does not replace the serialized mutation bridge',async()=>{
 let writes=0;registerWorkspaceSessionReader(async()=>null);registerVaultMutationBridge(async mutation=>{writes++;return mutation(emptyVault());});
 const result=await mutateVaultSafely(v=>({...v,company:{...v.company,nameEn:'Reviewed mutation'}}));assert.equal(writes,1);assert.equal(result.company.nameEn,'Reviewed mutation');assert.equal(await resumeVaultSession(),null);
});
