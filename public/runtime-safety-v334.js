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

  /* Account switching is requested asynchronously by the Firebase auth watcher and
     can be deferred while an editor is open. A request is valid only while Firebase
     still exposes the same UID. If auth became null or changed meanwhile, release
     the watcher's in-flight flag and wait for a fresh auth callback/request instead
     of switching IndexedDB to a stale deferred account. This listener is registered
     before document-entry and the React application listeners. */
  window.addEventListener('lourex-account-transition-request',guardStaleAccountTransition,true);

  /* Capture before the update/cloud button handler. This is an independent last
     guard for Safari timing windows where React has accepted an inventory edit but
     the shared dirty marker has not reached the root element yet. */
  document.addEventListener('click',event=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest(UPDATE_BUTTON);
    if(!(button instanceof HTMLButtonElement)||!unsafeWorkspaceOpen())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    explainDeferred(button);
  },true);

  /* Account/Settings sign-out paths intentionally reload after Firebase confirms
     the sign-out. Never let those handlers start while a document editor or inline
     business draft owns unsaved state. The account modal itself is not considered
     unsafe; otherwise its own Sign Out button would be blocked permanently. */
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

  /* Safari/iOS can discard and recreate a tab process under memory pressure. The
     encrypted data survives, but React screen state used to return to Home because
     v217's restore code still targets the retired pre-TailAdmin navigation and did
     not include Purchasing/Operations. Keep only the current top-level workspace,
     never an editor or draft, and restore it for a short continuity window. */
  installWorkspaceContinuity();

  /* Expose read-only predicates for diagnostics and future runtime guards. */
  try{Object.defineProperty(window,'__LOUREX_UNSAFE_WORKSPACE_OPEN__',{value:unsafeWorkspaceOpen,writable:false,configurable:true});}catch{}
  try{Object.defineProperty(window,'__LOUREX_WORKSPACE_CONTINUITY_V340__',{value:{current:currentWorkspace,save:saveWorkspaceContinuity},writable:false,configurable:true});}catch{}
})();