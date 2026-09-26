;(function(){
  'use strict';

  const LEGACY_DB='lourex-invoice';
  const PUBLIC_DB='lourex-invoice-public';
  const ACCOUNT_PREFIX='lourex-invoice-account-';
  const STORE='records';
  const ACTIVE_META_KEY='lourex-active-storage-meta-v341';
  const DONE_PREFIX='lourex-storage-dedup-v347:';
  const SNAPSHOT_DONE_PREFIX='lourex-retired-snapshot-cleanup-v351:';
  const PUBLIC_PREF_BACKUP_KEY='lourex-public-preferences-rebuild-v351';
  let running=false;

  function diag(type,detail=''){try{window.__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
  function fingerprint(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
  function activeMeta(){try{const value=JSON.parse(localStorage.getItem(ACTIVE_META_KEY)||'null');return value&&typeof value==='object'?value:null;}catch{return null;}}
  function doneKey(fp){return `${DONE_PREFIX}${fp}`;}
  function wasDone(fp){try{return localStorage.getItem(doneKey(fp))==='1';}catch{return false;}}
  function markDone(fp){try{localStorage.setItem(doneKey(fp),'1');}catch{}}
  function snapshotDoneKey(fp){return `${SNAPSHOT_DONE_PREFIX}${fp}`;}
  function snapshotsDone(fp){try{return localStorage.getItem(snapshotDoneKey(fp))==='1';}catch{return false;}}
  function markSnapshotsDone(fp){try{localStorage.setItem(snapshotDoneKey(fp),'1');}catch{}}
  function timestamp(value){const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:0;}
  function sameEncryptedVault(candidate,active){
    if(!candidate||!active)return false;
    return Number(candidate.schemaVersion)===Number(active.schemaVersion)&&
      String(candidate.iv||'')!==''&&String(candidate.iv||'')===String(active.iv||'')&&
      String(candidate.cipher||'')!==''&&String(candidate.cipher||'')===String(active.cipher||'');
  }
  function sameSecurity(candidate,active){
    if(!candidate||!active)return false;
    return Number(candidate.version)===Number(active.version)&&
      Number(candidate.iterations)===Number(active.iterations)&&
      String(candidate.salt||'')!==''&&String(candidate.salt||'')===String(active.salt||'')&&
      String(candidate.verifierIv||'')!==''&&String(candidate.verifierIv||'')===String(active.verifierIv||'')&&
      String(candidate.verifierCipher||'')!==''&&String(candidate.verifierCipher||'')===String(active.verifierCipher||'');
  }
  function duplicateRelation(candidate,active){
    if(sameEncryptedVault(candidate,active))return 'same';
    const candidateAt=timestamp(candidate?.updatedAt),activeAt=timestamp(active?.updatedAt);
    if(candidateAt&&activeAt)return candidateAt<=activeAt?'older':'newer';
    return 'unknown';
  }
  function activeWorkspaceVerified(){
    try{
      if(document.querySelector('.auth-page,.ta-auth-page,.app-recovery,.app-recovery-screen,.loading-screen'))return false;
      return Boolean(document.querySelector('.app-root .app-ui .ta-shell,.app-root .app-ui .editor-screen'));
    }catch{return false;}
  }
  function cleanupDecision(candidate,active){
    if(!candidate||!active||candidate.uid!==active.uid)return 'foreign';
    const relation=duplicateRelation(candidate.vault,active.vault);
    // Byte-identical encrypted data plus byte-identical verifier metadata is a
    // true duplicate even before unlock. Anything merely older/different is only
    // disposable after the active encrypted workspace has actually mounted.
    if(relation==='same'&&sameSecurity(candidate.security,active.security))return 'remove-exact';
    if((relation==='same'||relation==='older')&&activeWorkspaceVerified())return 'remove-verified';
    if(relation==='same'||relation==='older')return 'deferred-unverified';
    if(relation==='newer')return 'kept-newer';
    return 'kept-unknown';
  }

  async function databaseNames(){
    try{
      if(typeof indexedDB.databases!=='function')return [];
      const entries=await indexedDB.databases();
      return entries.map(entry=>String(entry.name||'')).filter(Boolean);
    }catch{return [];}
  }

  function openExisting(name){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(name);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('IndexedDB open failed.'));
      request.onupgradeneeded=()=>{
        try{request.transaction?.abort();}catch{}
        reject(new Error('Database did not already exist.'));
      };
    });
  }

  function openFreshPublic(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(PUBLIC_DB,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Public database rebuild failed.'));
    });
  }

  function readRecord(db,id){
    return new Promise((resolve,reject)=>{
      if(!db.objectStoreNames.contains(STORE)){resolve(null);return;}
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(id);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error||new Error('IndexedDB read failed.'));
    });
  }

  async function protectedWorkspace(db){
    const [security,vault,owner]=await Promise.all([readRecord(db,'security'),readRecord(db,'vault'),readRecord(db,'cloud-account')]);
    return security&&vault&&owner&&typeof owner.uid==='string'?{uid:owner.uid,security,vault}:null;
  }

  function deleteDatabase(name){
    return new Promise(resolve=>{
      const request=indexedDB.deleteDatabase(name);
      request.onsuccess=()=>resolve(true);
      request.onerror=()=>resolve(false);
      request.onblocked=()=>resolve(false);
    });
  }

  function putOnlyPublicPreferences(db,preferences){
    if(!preferences)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(preferences);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Public preferences restore failed.'));
      tx.onabort=()=>reject(tx.error||new Error('Public preferences restore aborted.'));
    });
  }

  function stagePublicPreferences(preferences){
    if(!preferences)return true;
    try{localStorage.setItem(PUBLIC_PREF_BACKUP_KEY,JSON.stringify(preferences));return true;}catch{return false;}
  }
  function stagedPublicPreferences(){
    try{const value=JSON.parse(localStorage.getItem(PUBLIC_PREF_BACKUP_KEY)||'null');return value&&value.id==='public-preferences'?value:null;}catch{return null;}
  }
  function clearStagedPublicPreferences(){try{localStorage.removeItem(PUBLIC_PREF_BACKUP_KEY);}catch{}}
  async function recoverStagedPublicPreferences(){
    const preferences=stagedPublicPreferences();
    if(!preferences)return 'none';
    let db=null;
    try{
      db=await openFreshPublic();
      await putOnlyPublicPreferences(db,preferences);
      clearStagedPublicPreferences();
      return 'restored';
    }catch{return 'blocked';}
    finally{try{db?.close();}catch{}}
  }

  /* Deleting records from a large Safari IDB file does not guarantee physical
     space reclamation. When public contains a proven same-account duplicate,
     rebuild that non-business database and restore only public-preferences. The
     preference record is staged outside IDB first so an interrupted rebuild can
     restore it on the next cleanup pass. */
  async function rebuildDuplicatePublic(db){
    const preferences=await readRecord(db,'public-preferences');
    if(!stagePublicPreferences(preferences)){db.close();return false;}
    db.close();
    if(!await deleteDatabase(PUBLIC_DB)){clearStagedPublicPreferences();return false;}
    let fresh=null;
    try{
      fresh=await openFreshPublic();
      await putOnlyPublicPreferences(fresh,preferences);
      clearStagedPublicPreferences();
      return true;
    }catch{return false;}
    finally{try{fresh?.close();}catch{}}
  }

  function deleteRetiredSafetySnapshot(db){
    return new Promise((resolve,reject)=>{
      if(!db.objectStoreNames.contains(STORE)){resolve('none');return;}
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      const get=store.get('safety-snapshot');
      let present=false;
      get.onsuccess=()=>{
        present=Boolean(get.result);
        if(present)store.delete('safety-snapshot');
      };
      get.onerror=()=>{try{tx.abort();}catch{}};
      tx.oncomplete=()=>resolve(present?'removed':'none');
      tx.onerror=()=>reject(tx.error||new Error('Retired snapshot cleanup failed.'));
      tx.onabort=()=>reject(tx.error||new Error('Retired snapshot cleanup aborted.'));
    });
  }

  async function cleanupActiveRetiredSnapshot(activeName,fp){
    if(snapshotsDone(fp))return {removed:0,blocked:0};
    let db=null;
    try{
      db=await openExisting(activeName);
      const result=await deleteRetiredSafetySnapshot(db);
      markSnapshotsDone(fp);
      return {removed:result==='removed'?1:0,blocked:0};
    }catch{return {removed:0,blocked:1};}
    finally{try{db?.close();}catch{}}
  }

  async function cleanup(){
    if(running)return;
    running=true;
    try{
      // Preference restoration is safe and independent of account ownership. Do it
      // before requiring active-scope metadata so a Safari crash immediately after
      // deleting the public DB cannot strand the staged preference record.
      const stagedResult=await recoverStagedPublicPreferences();
      if(stagedResult!=='none')diag('storage-public-preferences-recovery',`result=${stagedResult}`);
      if(stagedResult==='blocked')return;

      const meta=activeMeta();
      if(!meta||meta.kind!=='account'||!meta.fingerprint)return;
      const fp=String(meta.fingerprint);
      const names=await databaseNames();
      if(!names.length)return;

      const activeName=names.find(name=>name.startsWith(ACCOUNT_PREFIX)&&fingerprint(name)===fp);
      if(!activeName)return;

      const activeDb=await openExisting(activeName);
      let active;
      try{active=await protectedWorkspace(activeDb);}finally{activeDb.close();}
      if(!active)return;

      const snapshotResult=await cleanupActiveRetiredSnapshot(activeName,fp);
      if(snapshotResult.removed||snapshotResult.blocked)diag('storage-retired-snapshot-cleanup',`removed=${snapshotResult.removed} blocked=${snapshotResult.blocked}`);
      if(wasDone(fp))return;

      let legacyState='none',publicState='none';
      if(names.includes(LEGACY_DB)){
        let legacyDb=null;
        try{
          legacyDb=await openExisting(LEGACY_DB);
          const duplicate=await protectedWorkspace(legacyDb);
          const decision=cleanupDecision(duplicate,active);
          legacyDb.close();legacyDb=null;
          if(decision==='remove-exact'||decision==='remove-verified')legacyState=await deleteDatabase(LEGACY_DB)?'removed':'blocked';
          else legacyState=decision;
        }catch{legacyState='blocked';}finally{try{legacyDb?.close();}catch{}}
      }

      if(names.includes(PUBLIC_DB)){
        let publicDb=null;
        try{
          publicDb=await openExisting(PUBLIC_DB);
          const duplicate=await protectedWorkspace(publicDb);
          const decision=cleanupDecision(duplicate,active);
          if(decision==='remove-exact'||decision==='remove-verified'){
            const current=publicDb;publicDb=null;
            publicState=await rebuildDuplicatePublic(current)?'rebuilt':'blocked';
          }else publicState=decision;
        }catch{publicState='blocked';}finally{try{publicDb?.close();}catch{}}
      }

      const retryStates=['blocked','kept-newer','kept-unknown','deferred-unverified'];
      const retryNeeded=retryStates.includes(legacyState)||retryStates.includes(publicState);
      if(!retryNeeded)markDone(fp);
      let usage='';
      try{const estimate=await navigator.storage?.estimate?.();if(estimate?.usage)usage=` usageMb=${(estimate.usage/1048576).toFixed(1)}`;}catch{}
      diag('storage-duplicate-cleanup',`legacy=${legacyState} public=${publicState} retry=${retryNeeded?'yes':'no'} verified=${activeWorkspaceVerified()?'yes':'no'} snapshotsRemoved=${snapshotResult.removed} snapshotsBlocked=${snapshotResult.blocked}${usage}`);
    }catch(error){
      diag('storage-duplicate-cleanup-error',`name=${String(error?.name||'Error')}`);
    }finally{running=false;}
  }

  window.setTimeout(()=>void cleanup(),15_000);
  window.setTimeout(()=>void cleanup(),45_000);
})();
