(()=>{
  'use strict';

  let recoveryInFlight=false;
  let recoveryTimer=0;

  const currentFirebaseUid=()=>{
    try{return String(window.firebase?.auth?.().currentUser?.uid||'').trim();}
    catch{return '';}
  };

  const accountSetupOpen=()=>Boolean(document.querySelector('.account-managed-setup'));

  const mark=(detail)=>{
    try{window.__LOUREX_DIAGNOSTICS__?.mark?.('late-auth-recovery',detail);}catch{}
  };

  const finish=(uid)=>{
    recoveryInFlight=false;
    if(recoveryTimer){window.clearTimeout(recoveryTimer);recoveryTimer=0;}
    mark(`uid=${uid?'present':'missing'} mode=transition complete=true automaticReload=no`);
  };

  const recoverWithoutReload=(event)=>{
    if(!accountSetupOpen())return;
    const uid=currentFirebaseUid();
    if(!uid)return;

    /* A legacy document-entry listener used a hard page navigation when a late
       authenticated account appeared. Capture the same cloud-refresh event first
       and convert recovery into the in-app account transition protocol. This
       preserves Vault write draining/cloud-idle guards while preventing Safari
       from entering a visible refresh loop from More / Account / Settings. */
    event.stopImmediatePropagation();
    mark('mode=transition automaticReload=no source=cloud-refresh');
    if(recoveryInFlight)return;
    recoveryInFlight=true;

    const complete=(completedEvent)=>{
      const completedUid=String(completedEvent instanceof CustomEvent?completedEvent.detail?.uid||'':'').trim();
      if(completedUid&&completedUid!==uid)return;
      window.removeEventListener('lourex-account-transition-complete',complete);
      finish(uid);
    };
    window.addEventListener('lourex-account-transition-complete',complete);
    recoveryTimer=window.setTimeout(()=>{
      window.removeEventListener('lourex-account-transition-complete',complete);
      finish(uid);
    },15000);

    try{
      window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid,lateAuthRecovery:true,automaticReload:false}}));
    }catch{
      window.removeEventListener('lourex-account-transition-complete',complete);
      finish(uid);
    }
  };

  window.addEventListener('lourex-cloud-refresh-available',recoverWithoutReload,true);
})();
