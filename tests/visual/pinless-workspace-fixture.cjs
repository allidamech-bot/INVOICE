'use strict';

// Test-only setup for AppShell fixtures. The real app now reads UID-scoped
// workspace-v2 and the account-bound assistant cache, not the retired PIN vault.
// No Firebase credentials or provider calls are needed in these isolated pages.
async function installPinlessWorkspace(page, {uid, companyName, theme}) {
  if (!/^qa(?:-[a-z0-9-]+)?$/.test(uid)) throw new Error('Synthetic QA UID required');
  await page.evaluate(async ({uid,companyName,theme})=>{
    const [{activateAccountStorage,activeAccountStorageUid,getPlainWorkspace,savePlainWorkspace,getAccountAssistantCacheKey,updatePlainWorkspaceIfUnchanged},
      {emptyVault},{registerWorkspaceSessionReader,registerVaultMutationBridge},
      {scopeVaultForExternalMutation,applyWorkspaceScope,mergeScopedVault},{mergeVaultIntent},
      {appendAuditEventsForVaultDiff},{setUiThemePreference}]=await Promise.all([
      import('/dist/src/storage/db.js'),import('/dist/src/lib/defaults.js'),
      import('/dist/src/storage/vault-mutation-bridge.js'),import('/dist/src/lib/workspaces.js'),
      import('/dist/src/storage/vault-merge.js'),import('/dist/src/lib/audit-diff.js'),
      import('/dist/src/lib/ui-theme.js')
    ]);
    await activateAccountStorage(uid);
    if(!await getPlainWorkspace()){
      const initial=emptyVault();initial.company.nameEn=companyName;
      await savePlainWorkspace(uid,initial,null,null);
    }
    registerWorkspaceSessionReader(async()=>{
      if(activeAccountStorageUid()!==uid)return null;
      const record=await getPlainWorkspace();
      if(!record||record.uid!==uid)return null;
      const key=await getAccountAssistantCacheKey(uid);
      return activeAccountStorageUid()===uid?{key,vault:structuredClone(record.payload)}:null;
    });
    let queue=Promise.resolve();
    registerVaultMutationBridge(mutation=>{
      const job=queue.then(async()=>{
        if(activeAccountStorageUid()!==uid)throw new Error('QA account scope changed');
        const record=await getPlainWorkspace();
        if(!record||record.uid!==uid)throw new Error('QA account workspace unavailable');
        const scoped=scopeVaultForExternalMutation(record.payload);
        const intended=applyWorkspaceScope(scoped,mutation(scoped));
        const validated=mergeVaultIntent(scoped,intended,scoped);
        const next=mergeScopedVault(record.payload,appendAuditEventsForVaultDiff(scoped,validated));
        const committed=await updatePlainWorkspaceIfUnchanged(uid,record.localRevision,next);
        if(!committed)throw new Error('QA workspace revision changed');
        return committed.payload;
      });
      queue=job.then(()=>undefined,()=>undefined);
      return job;
    });
    setUiThemePreference(theme);
    window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));
  },{uid,companyName,theme});
}

module.exports={installPinlessWorkspace};
