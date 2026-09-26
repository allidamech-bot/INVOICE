;(function(){
  'use strict';

  const LEGACY_DB='lourex-invoice';
  const PUBLIC_DB='lourex-invoice-public';
  const ACCOUNT_PREFIX='lourex-invoice-account-';
  const STORE='records';
  const ACTIVE_META_KEY='lourex-active-storage-meta-v341';
  const DONE_PREFIX='lourex-storage-dedup-v347:';
  const SNAPSHOT_DONE_KEY='lourex-retired-snapshot-cleanup-v350';
  let running=false;

  function diag(type,detail=''){try{window.__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
  function fingerprint(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
  function activeMeta(){try{const value=JSON.parse(localStorage.getItem(ACTIVE_META_KEY)||'null');return value&&typeof value==='object'?value:null;}catch{return null;}}
  function doneKey(fp){return `${DONE_PREFIX}${fp}`;}
  function wasDone(fp){try{return localStorage.getItem(doneKey(fp))==='1';}catch{return false;}}
  function markDone(fp){try{localStorage.setItem(doneKey(fp),'1');}catch{}}
  function snapshotsDone(){try{return localStorage.getItem(SNAPSHOT_DONE_KEY)==='1';}catch{return false;}}
  function markSnapshotsDone(){try{localStorage.setItem(SNAPSHOT_DONE_KEY,'1');}catch{}}
  function timestamp(value){const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:0;}
  function sameOrOlder(candidate,active){
    const candidateAt=timestamp(candidate?.updatedAt),activeAt=timestamp(active?.updatedAt);
    if(candidateAt&&activeAt)return candidateAt<=activeAt;
    if(candidateAt&&!activeAt)return false;
    return true;
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
    return security&&vault&&owner&&typeof owner.uid==='string'?{uid:owner.uid,vault}:null;
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

  /* Deleting records from a large Safari IDB file does not guarantee physical
     space reclamation. When public contains a proven same-account duplicate,
     rebuild that non-business database and restore only public-preferences. */
  async function rebuildDuplicatePublic(db){
    const preferences=await readRecord(db,'public-preferences');
    db.close();
    if(!await deleteDatabase(PUBLIC_DB))return false;
    let fresh=null;
    try{
      fresh=await openFreshPublic();
      await putOnlyPublicPreferences(fresh,preferences);
      return true;
    }finally{try{fresh?.close();}catch{}}
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

  async function cleanupRetiredSnapshots(names){
    if(snapshotsDone())return {removed:0,blocked:0};
    let removed=0,blocked=0;
    const accountNames=names.filter(name=>name.startsWith(ACCOUNT_PREFIX));
    for(const name of accountNames){
      let db=null;
      try{
        db=await openExisting(name);
        const result=await deleteRetiredSafetySnapshot(db);
        if(result==='removed')removed+=1;
      }catch{blocked+=1;}
      finally{try{db?.close();}catch{}}
    }
    if(!blocked)markSnapshotsDone();
    return {removed,blocked};
  }

  async function cleanup(){
    if(running)return;
    running=true;
    try{
      const meta=activeMeta();
      if(!meta||meta.kind!=='account'||!meta.fingerprint)return;
      const fp=String(meta.fingerprint);
      const names=await databaseNames();
      if(!names.length)return;
      const snapshotResult=await cleanupRetiredSnapshots(names);
      if(snapshotResult.removed||snapshotResult.blocked)diag('storage-retired-snapshot-cleanup',`removed=${snapshotResult.removed} blocked=${snapshotResult.blocked}`);
      if(wasDone(fp))return;
      const activeName=names.find(name=>name.startsWith(ACCOUNT_PREFIX)&&fingerprint(name)===fp);
      if(!activeName)return;

      const activeDb=await openExisting(activeName);
      let active;
      try{active=await protectedWorkspace(activeDb);}finally{activeDb.close();}
      if(!active)return;

      let legacyState='none',publicState='none';
      if(names.includes(LEGACY_DB)){
        let legacyDb=null;
        try{
          legacyDb=await openExisting(LEGACY_DB);
          const duplicate=await protectedWorkspace(legacyDb);
          const eligible=duplicate&&duplicate.uid===active.uid&&sameOrOlder(duplicate.vault,active.vault);
          const newer=duplicate&&duplicate.uid===active.uid&&!sameOrOlder(duplicate.vault,active.vault);
          legacyDb.close();legacyDb=null;
          if(eligible)legacyState=await deleteDatabase(LEGACY_DB)?'removed':'blocked';
          else if(newer)legacyState='kept-newer';
        }catch{legacyState='blocked';}finally{try{legacyDb?.close();}catch{}}
      }

      if(names.includes(PUBLIC_DB)){
        let publicDb=null;
        try{
          publicDb=await openExisting(PUBLIC_DB);
          const duplicate=await protectedWorkspace(publicDb);
          const eligible=duplicate&&duplicate.uid===active.uid&&sameOrOlder(duplicate.vault,active.vault);
          const newer=duplicate&&duplicate.uid===active.uid&&!sameOrOlder(duplicate.vault,active.vault);
          if(eligible){
            const current=publicDb;publicDb=null;
            publicState=await rebuildDuplicatePublic(current)?'rebuilt':'blocked';
          }else if(newer)publicState='kept-newer';
        }catch{publicState='blocked';}finally{try{publicDb?.close();}catch{}}
      }

      const retryNeeded=legacyState==='blocked'||publicState==='blocked'||legacyState==='kept-newer'||publicState==='kept-newer';
      if(!retryNeeded)markDone(fp);
      let usage='';
      try{const estimate=await navigator.storage?.estimate?.();if(estimate?.usage)usage=` usageMb=${(estimate.usage/1048576).toFixed(1)}`;}catch{}
      diag('storage-duplicate-cleanup',`legacy=${legacyState} public=${publicState} retry=${retryNeeded?'yes':'no'} snapshotsRemoved=${snapshotResult.removed} snapshotsBlocked=${snapshotResult.blocked}${usage}`);
    }catch(error){
      diag('storage-duplicate-cleanup-error',`name=${String(error?.name||'Error')}`);
    }finally{running=false;}
  }

  window.setTimeout(()=>void cleanup(),15_000);
  window.setTimeout(()=>void cleanup(),45_000);
})();
