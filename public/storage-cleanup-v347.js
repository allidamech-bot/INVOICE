;(function(){
  'use strict';

  const LEGACY_DB='lourex-invoice';
  const PUBLIC_DB='lourex-invoice-public';
  const ACCOUNT_PREFIX='lourex-invoice-account-';
  const STORE='records';
  const ACTIVE_META_KEY='lourex-active-storage-meta-v341';
  const DONE_PREFIX='lourex-storage-dedup-v347:';
  let running=false;

  function diag(type,detail=''){try{window.__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
  function fingerprint(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
  function activeMeta(){try{const value=JSON.parse(localStorage.getItem(ACTIVE_META_KEY)||'null');return value&&typeof value==='object'?value:null;}catch{return null;}}
  function doneKey(fp){return `${DONE_PREFIX}${fp}`;}
  function wasDone(fp){try{return localStorage.getItem(doneKey(fp))==='1';}catch{return false;}}
  function markDone(fp){try{localStorage.setItem(doneKey(fp),'1');}catch{}}

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
    return security&&vault&&owner&&typeof owner.uid==='string'?{uid:owner.uid}:null;
  }

  function deleteDatabase(name){
    return new Promise(resolve=>{
      const request=indexedDB.deleteDatabase(name);
      request.onsuccess=()=>resolve(true);
      request.onerror=()=>resolve(false);
      request.onblocked=()=>resolve(false);
    });
  }

  function deletePublicProtectedRecords(db){
    return new Promise((resolve,reject)=>{
      if(!db.objectStoreNames.contains(STORE)){resolve(false);return;}
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      for(const id of ['security','vault','session-key','cloud-account','safety-snapshot'])store.delete(id);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('IndexedDB cleanup failed.'));
      tx.onabort=()=>reject(tx.error||new Error('IndexedDB cleanup aborted.'));
    });
  }

  async function cleanup(){
    if(running)return;
    running=true;
    try{
      const meta=activeMeta();
      if(!meta||meta.kind!=='account'||!meta.fingerprint)return;
      const fp=String(meta.fingerprint);
      if(wasDone(fp))return;
      const names=await databaseNames();
      if(!names.length)return;
      const activeName=names.find(name=>name.startsWith(ACCOUNT_PREFIX)&&fingerprint(name)===fp);
      if(!activeName)return;

      const activeDb=await openExisting(activeName);
      let active;
      try{active=await protectedWorkspace(activeDb);}finally{activeDb.close();}
      if(!active)return;

      let legacyRemoved=false,publicDuplicateCleared=false;
      if(names.includes(LEGACY_DB)){
        let legacyDb=null;
        try{
          legacyDb=await openExisting(LEGACY_DB);
          const owner=await readRecord(legacyDb,'cloud-account');
          const owned=owner&&owner.uid===active.uid;
          legacyDb.close();legacyDb=null;
          if(owned)legacyRemoved=await deleteDatabase(LEGACY_DB);
        }catch{}finally{try{legacyDb?.close();}catch{}}
      }

      if(names.includes(PUBLIC_DB)){
        let publicDb=null;
        try{
          publicDb=await openExisting(PUBLIC_DB);
          const duplicate=await protectedWorkspace(publicDb);
          if(duplicate&&duplicate.uid===active.uid)publicDuplicateCleared=await deletePublicProtectedRecords(publicDb);
        }catch{}finally{try{publicDb?.close();}catch{}}
      }

      markDone(fp);
      let usage='';
      try{const estimate=await navigator.storage?.estimate?.();if(estimate?.usage)usage=` usageMb=${(estimate.usage/1048576).toFixed(1)}`;}catch{}
      diag('storage-duplicate-cleanup',`legacy=${legacyRemoved?'removed':'none'} public=${publicDuplicateCleared?'cleared':'none'}${usage}`);
    }catch(error){
      diag('storage-duplicate-cleanup-error',`name=${String(error?.name||'Error')}`);
    }finally{running=false;}
  }

  window.setTimeout(()=>void cleanup(),15_000);
  window.setTimeout(()=>void cleanup(),45_000);
})();
