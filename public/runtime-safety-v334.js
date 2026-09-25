(()=>{
  'use strict';

  const ROOT=document.documentElement;
  const UPDATE_BUTTON='[data-lourex-update] button,[data-lourex-cloud-refresh] button';
  const SIGNOUT_BUTTON='.settings-direct-signout-button,.settings-signout-button,.ta-cloud-account-actions button,.ta-sheet-signout';
  const WORKSPACE_CONTINUITY_KEY='lourex-workspace-continuity-v340';
  const WORKSPACE_CONTINUITY_MAX_AGE=2*60*60*1000;
  const WORKSPACE_ORDER=['home','documents','customers','items','operations','receivables','reports'];

  function manualInventoryDraftOpen(){
    const entry=document.querySelector('.operations-page .ta-inventory-entry,.operations-page .inventory-entry');
    if(!(entry instanceof HTMLElement))return false;
    const savedItem=entry.querySelector('select');
    if(savedItem&&String(savedItem.value||'').trim())return true;
    const decimals=Array.from(entry.querySelectorAll('input[inputmode="decimal"]'));
    if(decimals.some(input=>String(input.value||'').trim()))return true;
    const text=Array.from(entry.querySelectorAll('input:not([type="date"]):not([list])'));
    return text.some(input=>String(input.value||'').trim());
  }

  function unsafeWorkspaceOpen(){
    if(ROOT.hasAttribute('data-lourex-document-editor'))return true;
    if(ROOT.hasAttribute('data-lourex-workspace-dirty'))return true;
    if(document.querySelector('.editor-screen,.modal-backdrop,.product-library-pro.editor-open'))return true;
    return manualInventoryDraftOpen();
  }

  function signOutUnsafeWorkspaceOpen(){
    if(ROOT.hasAttribute('data-lourex-document-editor'))return true;
    if(ROOT.hasAttribute('data-lourex-workspace-dirty'))return true;
    if(document.querySelector('.editor-screen,.product-library-pro.editor-open'))return true;
    return manualInventoryDraftOpen();
  }

  function currentFirebaseUid(){
    try{return String(window.firebase?.auth?.().currentUser?.uid||'').trim();}catch{return '';}
  }

  function completeRejectedAccountTransition(uid){
    try{window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid,rejectedByRuntimeSafety:true}}));}catch{}
  }

  function guardStaleAccountTransition(event){
    if(!(event instanceof CustomEvent))return;
    const uid=String(event.detail?.uid||'').trim();
    if(!uid)return;
    const currentUid=currentFirebaseUid();
    if(currentUid===uid)return;
    event.stopImmediatePropagation();
    completeRejectedAccountTransition(uid);
  }

  function explainDeferred(button){
    const notice=button.closest('[data-lourex-update],[data-lourex-cloud-refresh]');
    const detail=notice?.querySelector('small');
    if(detail instanceof HTMLElement){
      detail.textContent=ROOT.lang==='ar'||ROOT.dir==='rtl'
        ?'احفظ أو أغلق مساحة الإدخال الحالية أولًا حتى لا تضيع التعديلات غير المحفوظة.'
        :'Save or close the current data-entry workspace first so unsaved changes are not lost.';
    }
  }

  function explainBlockedSignOut(button){
    const account=button.closest('.ta-cloud-account');
    if(!(account instanceof HTMLElement))return;
    let note=account.querySelector('[data-lourex-signout-deferred]');
    if(!(note instanceof HTMLElement)){
      note=document.createElement('div');
      note.setAttribute('data-lourex-signout-deferred','true');
      note.className='ta-auth-feedback is-error';
      note.setAttribute('role','alert');
      const footer=button.closest('.ta-cloud-account-actions');
      if(footer?.parentElement===account)account.insertBefore(note,footer);else account.appendChild(note);
    }
    note.textContent=ROOT.lang==='ar'||ROOT.dir==='rtl'
      ?'احفظ وأغلق المستند أو مساحة الإدخال الحالية قبل تسجيل الخروج.'
      :'Save and close the current document or data-entry workspace before signing out.';
  }

  function currentWorkspace(){
    const shell=document.querySelector('.workspace-shell');
    if(!(shell instanceof HTMLElement))return '';
    for(const screen of WORKSPACE_ORDER)if(shell.classList.contains(`screen-${screen}`))return screen;
    return '';
  }

  function continuityPayload(screen){return JSON.stringify({screen,at:Date.now()});}

  function saveWorkspaceContinuity(){
    const screen=currentWorkspace();
    if(!screen)return;
    const payload=continuityPayload(screen);
    try{sessionStorage.setItem(WORKSPACE_CONTINUITY_KEY,payload);}catch{}
    try{localStorage.setItem(WORKSPACE_CONTINUITY_KEY,payload);}catch{}
  }

  function clearWorkspaceContinuity(){
    try{sessionStorage.removeItem(WORKSPACE_CONTINUITY_KEY);}catch{}
    try{localStorage.removeItem(WORKSPACE_CONTINUITY_KEY);}catch{}
  }

  function readWorkspaceContinuity(){
    let raw='';
    try{raw=sessionStorage.getItem(WORKSPACE_CONTINUITY_KEY)||'';}catch{}
    if(!raw){try{raw=localStorage.getItem(WORKSPACE_CONTINUITY_KEY)||'';}catch{}}
    if(!raw)return '';
    try{
      const value=JSON.parse(raw);
      const screen=String(value?.screen||'');
      const at=Number(value?.at||0);
      if(!WORKSPACE_ORDER.includes(screen)||!at||Date.now()-at>WORKSPACE_CONTINUITY_MAX_AGE){clearWorkspaceContinuity();return '';}
      return screen;
    }catch{clearWorkspaceContinuity();return '';}
  }

  function navigationButtonFor(screen){
    const index=WORKSPACE_ORDER.indexOf(screen);
    if(index<0)return null;
    const items=Array.from(document.querySelectorAll('.ta-sidebar-nav .ta-nav-item'));
    const button=items[index];
    return button instanceof HTMLButtonElement?button:null;
  }

  function installWorkspaceContinuity(){
    const wanted=readWorkspaceContinuity();
    const deadline=Date.now()+12000;
    const settle=()=>{
      const shell=document.querySelector('.workspace-shell');
      if(!(shell instanceof HTMLElement)){
        if(Date.now()<deadline)window.setTimeout(settle,60);
        return;
      }

      const active=currentWorkspace();
      if(wanted&&wanted!=='home'&&active==='home'&&!ROOT.hasAttribute('data-lourex-signing-out')){
        const button=navigationButtonFor(wanted);
        if(button){button.click();}
      }

      const observeShell=()=>{
        const liveShell=document.querySelector('.workspace-shell');
        if(!(liveShell instanceof HTMLElement))return;
        saveWorkspaceContinuity();
        const observer=new MutationObserver(()=>saveWorkspaceContinuity());
        observer.observe(liveShell,{attributes:true,attributeFilter:['class']});
      };
      window.setTimeout(observeShell,80);
    };
    settle();

    window.addEventListener('pagehide',saveWorkspaceContinuity,{capture:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveWorkspaceContinuity();});
  }

  window.addEventListener('lourex-account-transition-request',guardStaleAccountTransition,true);

  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest(UPDATE_BUTTON);
    if(!(button instanceof HTMLButtonElement)||!unsafeWorkspaceOpen())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    explainDeferred(button);
  },true);

  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest(SIGNOUT_BUTTON);
    if(!(button instanceof HTMLButtonElement)||button.disabled)return;
    if(signOutUnsafeWorkspaceOpen()){
      event.preventDefault();
      event.stopImmediatePropagation();
      explainBlockedSignOut(button);
      return;
    }
    clearWorkspaceContinuity();
  },true);

  installWorkspaceContinuity();

  try{Object.defineProperty(window,'__LOUREX_UNSAFE_WORKSPACE_OPEN__',{value:unsafeWorkspaceOpen,writable:false,configurable:true});}catch{}
  try{Object.defineProperty(window,'__LOUREX_WORKSPACE_CONTINUITY_V340__',{value:{current:currentWorkspace,save:saveWorkspaceContinuity},writable:false,configurable:true});}catch{}
})();

/* v340 — privacy-safe client runtime recorder. It stores only browser/app lifecycle
   metadata in this device's localStorage. It never opens document, customer,
   supplier, invoice or encrypted-vault contents. */
(()=>{
  'use strict';

  const LOG_KEY='lourex-runtime-diagnostics-v340';
  const META_KEY='lourex-runtime-diagnostics-meta-v340';
  const MAX_EVENTS=120;
  const HEARTBEAT_MS=5000;
  const sessionId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const startedAt=new Date().toISOString();
  let lastScreen='boot';
  let authHooked=false;

  const clean=(value,max=120)=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').slice(0,max);

  const navigationType=()=>{
    try{
      const entry=performance.getEntriesByType?.('navigation')?.[0];
      return clean(entry?.type||'unknown',40);
    }catch{return 'unknown';}
  };

  const currentScreen=()=>{
    try{
      const shell=document.querySelector('.ta-shell,.workspace-shell');
      if(shell instanceof HTMLElement){
        const match=Array.from(shell.classList).find(name=>name.startsWith('screen-'));
        if(match)return clean(match.slice(7),48);
      }
      if(document.querySelector('.auth-page,.ta-auth-page'))return 'auth';
      if(document.querySelector('.loading-screen,#lourex-boot'))return 'loading';
      if(document.querySelector('.app-recovery,.app-recovery-screen'))return 'recovery';
    }catch{}
    return 'unknown';
  };

  const standalone=()=>{
    try{return Boolean(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone);}catch{return false;}
  };

  const readLog=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');
      return Array.isArray(parsed)?parsed:[];
    }catch{return [];}
  };

  const readMeta=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(META_KEY)||'null');
      return parsed&&typeof parsed==='object'?parsed:null;
    }catch{return null;}
  };

  const writeMeta=(eventType)=>{
    try{
      localStorage.setItem(META_KEY,JSON.stringify({
        sessionId,
        startedAt,
        lastSeen:new Date().toISOString(),
        lastEvent:clean(eventType,64),
        lastScreen:currentScreen(),
        visibility:document.visibilityState,
        online:navigator.onLine!==false
      }));
    }catch{}
  };

  const mark=(type,detail='')=>{
    const event={
      at:new Date().toISOString(),
      session:sessionId,
      type:clean(type,64),
      screen:currentScreen(),
      visibility:clean(document.visibilityState||'unknown',24),
      online:navigator.onLine!==false,
      detail:clean(detail,180)
    };
    try{
      const log=readLog();
      log.push(event);
      if(log.length>MAX_EVENTS)log.splice(0,log.length-MAX_EVENTS);
      localStorage.setItem(LOG_KEY,JSON.stringify(log));
    }catch{}
    writeMeta(type);
    return event;
  };

  const clear=()=>{
    try{localStorage.removeItem(LOG_KEY);localStorage.removeItem(META_KEY);}catch{}
  };

  const previous=readMeta();
  if(previous&&previous.sessionId&&previous.sessionId!==sessionId){
    const parsedAt=previous.lastSeen?Date.parse(previous.lastSeen):NaN;
    const age=Number.isFinite(parsedAt)?Math.max(0,Date.now()-parsedAt):NaN;
    mark('previous-session',`last=${clean(previous.lastEvent,48)} screen=${clean(previous.lastScreen,32)} visibility=${clean(previous.visibility,16)} ageMs=${Number.isFinite(age)?age:'n/a'}`);
  }

  try{
    Object.defineProperty(window,'__LOUREX_DIAGNOSTICS__',{
      configurable:true,
      value:{version:'v340',sessionId,mark,read:()=>readLog().slice(),meta:()=>readMeta(),clear}
    });
  }catch{}

  mark('runtime-init',`nav=${navigationType()} standalone=${standalone()?'yes':'no'} ios=${/iP(?:hone|ad|od)/i.test(navigator.userAgent||'')?'yes':'no'}`);

  document.addEventListener('DOMContentLoaded',()=>mark('dom-content-loaded'),{once:true});
  window.addEventListener('load',()=>mark('window-load'),{once:true});
  window.addEventListener('pageshow',event=>mark('pageshow',`persisted=${event.persisted?'yes':'no'} nav=${navigationType()}`));
  window.addEventListener('pagehide',event=>mark('pagehide',`persisted=${event.persisted?'yes':'no'}`));
  window.addEventListener('beforeunload',()=>mark('beforeunload'));
  document.addEventListener('visibilitychange',()=>mark('visibilitychange',document.visibilityState));
  window.addEventListener('online',()=>mark('network-online'));
  window.addEventListener('offline',()=>mark('network-offline'));
  window.addEventListener('error',event=>{
    const file=(()=>{try{return clean(String(event.filename||'').split('/').pop()||'',72);}catch{return '';}})();
    mark('javascript-error',`source=${file||'unknown'} line=${Number(event.lineno)||0}:${Number(event.colno)||0} name=${clean(event.error?.name||'Error',48)}`);
  },true);
  window.addEventListener('unhandledrejection',event=>mark('unhandled-rejection',`name=${clean(event.reason?.name||typeof event.reason,64)}`));

  for(const name of ['lourex-cloud-refresh-available','lourex-cloud-applied','lourex-cloud-remote-newer','lourex-cloud-conflict','lourex-account-transition-request','lourex-account-transition-complete']){
    window.addEventListener(name,()=>mark(name));
  }

  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    if(target.closest('[data-lourex-cloud-refresh] button'))mark('user-cloud-refresh-apply');
    else if(target.closest('[data-lourex-update] button'))mark('user-pwa-update-apply');
    else if(target.closest('.settings-direct-signout-button,.settings-signout-button,.ta-cloud-account-actions button,.ta-sheet-signout'))mark('user-signout-action');
  },true);

  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=>mark('service-worker-controllerchange'));
      void navigator.serviceWorker.getRegistration?.().then(reg=>{
        mark('service-worker-state',reg?(reg.waiting?'waiting':navigator.serviceWorker.controller?'controlled':'registered'):'none');
      }).catch(()=>mark('service-worker-state','check-failed'));
    }
  }catch{}

  const hookFirebaseAuth=()=>{
    if(authHooked)return true;
    try{
      const firebase=window.firebase;
      if(!firebase?.auth)return false;
      const auth=firebase.auth();
      if(!auth?.onAuthStateChanged)return false;
      authHooked=true;
      auth.onAuthStateChanged(user=>mark('firebase-auth-state',user?'signed-in':'signed-out'),()=>mark('firebase-auth-state','observer-error'));
      return true;
    }catch{return false;}
  };
  if(!hookFirebaseAuth()){
    let attempts=0;
    const authTimer=window.setInterval(()=>{
      attempts+=1;
      if(hookFirebaseAuth()||attempts>=20)window.clearInterval(authTimer);
    },250);
  }

  lastScreen=currentScreen();
  window.setInterval(()=>{
    const screen=currentScreen();
    if(screen!==lastScreen){mark('screen-change',`${lastScreen}->${screen}`);lastScreen=screen;}
    else writeMeta('heartbeat');
  },HEARTBEAT_MS);
})();