(()=>{
  'use strict';

  const root=document.documentElement;
  const ua=String(navigator.userAgent||'');
  const platform=String(navigator.platform||'');
  const touchPoints=Number(navigator.maxTouchPoints||0);
  const appleMobile=/iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);
  const editableSelector='input,textarea,select,[contenteditable="true"],[contenteditable=""]';
  const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen';
  const WORKSPACE_LAST_KEY='lourex-last-stable-workspace-v340';
  const EDITOR_RESUME_KEY='lourex-active-editor-v486';
  const ACTIVE_ACCOUNT_UID_KEY='lourex-invoice-active-account-v1';
  const EDITOR_RESUME_MAX_AGE=6*60*60*1000;
  const EDITOR_RESTORE_TIMEOUT=12_000;
  const WORKSPACES=['home','documents','customers','items','operations','receivables','reports'];
  let lastEditorInputAt=0;
  let workspaceFrame=0;
  let workspaceRestoreTarget=readWorkspace(WORKSPACE_RESUME_KEY)||readWorkspace(WORKSPACE_LAST_KEY);
  let workspaceRestoreArmed=Boolean(workspaceRestoreTarget&&workspaceRestoreTarget!=='home');
  let workspaceRestoreAttempts=0;
  let sawInteractiveShell=false;
  let pageExiting=false;
  let editorRestoreTarget=readEditorResume();
  let editorRestoreArmed=Boolean(editorRestoreTarget);
  let editorRestoreStartedAt=0;
  let editorRestoreLastClickAt=0;

  function editorOpen(){
    return root.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));
  }

  function editorInputTarget(target){
    if(!(target instanceof Element))return false;
    if(!target.closest(editableSelector))return false;
    // The inactivity timer lives at the App level, not only inside Document
    // Studio. iOS keyboards can miss keydown in Purchasing, Products, Finance,
    // Settings and other More workspaces too, so every editable app surface must
    // feed the same existing activity channel.
    return Boolean(target.closest('.app-ui'))||Boolean(target.closest('.editor-screen'))||root.hasAttribute('data-lourex-document-editor');
  }

  function currentAccountUid(){
    try{return String(localStorage.getItem(ACTIVE_ACCOUNT_UID_KEY)||'').trim();}catch{return '';}
  }

  function currentEditorIdentity(){
    const id=String(root.getAttribute('data-lourex-document-editor')||'').trim();
    if(!id||id==='opening'||!editorOpen())return null;
    const numberNode=document.querySelector('.editor-screen .editor-top-left strong,.draft-studio .draft-studio-identity strong');
    const number=String(numberNode?.textContent||'').trim();
    if(!number)return null;
    return {id,number,accountUid:currentAccountUid(),savedAt:Date.now()};
  }

  function validEditorResume(value){
    if(!value||typeof value!=='object')return null;
    const id=String(value.id||'').trim();
    const number=String(value.number||'').trim();
    const accountUid=String(value.accountUid||'').trim();
    const savedAt=Number(value.savedAt||0);
    if(!id||!number||!Number.isFinite(savedAt)||savedAt<=0)return null;
    if(accountUid!==currentAccountUid())return null;
    if(Date.now()-savedAt>EDITOR_RESUME_MAX_AGE)return null;
    return {id,number,accountUid,savedAt};
  }

  function readEditorResume(){
    try{
      const raw=sessionStorage.getItem(EDITOR_RESUME_KEY);
      if(!raw)return null;
      const parsed=validEditorResume(JSON.parse(raw));
      if(parsed)return parsed;
      sessionStorage.removeItem(EDITOR_RESUME_KEY);
    }catch{try{sessionStorage.removeItem(EDITOR_RESUME_KEY);}catch{}}
    return null;
  }

  function writeEditorResume(identity){
    const valid=validEditorResume(identity);
    if(!valid)return;
    try{sessionStorage.setItem(EDITOR_RESUME_KEY,JSON.stringify(valid));}catch{}
    editorRestoreTarget=valid;
  }

  function clearEditorResume(){
    try{sessionStorage.removeItem(EDITOR_RESUME_KEY);}catch{}
    editorRestoreTarget=null;
    editorRestoreArmed=false;
    editorRestoreStartedAt=0;
    editorRestoreLastClickAt=0;
  }

  function checkpointEditor(){
    const identity=currentEditorIdentity();
    if(!identity)return false;
    writeEditorResume(identity);
    editorRestoreArmed=false;
    editorRestoreStartedAt=0;
    editorRestoreLastClickAt=0;
    return true;
  }

  function armEditorRestore(){
    const target=readEditorResume();
    if(!target)return false;
    editorRestoreTarget=target;
    editorRestoreArmed=true;
    editorRestoreStartedAt=0;
    editorRestoreLastClickAt=0;
    return true;
  }

  function signalEditorActivity(event){
    if(!editorInputTarget(event.target))return;
    lastEditorInputAt=Date.now();
    checkpointEditor();
    try{
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'',code:'',bubbles:false,cancelable:false}));
    }catch{
      try{window.dispatchEvent(new Event('keydown'));}catch{}
    }
  }

  function validWorkspace(value){
    return typeof value==='string'&&WORKSPACES.includes(value)?value:null;
  }

  function readWorkspace(key){
    try{return validWorkspace(sessionStorage.getItem(key));}catch{return null;}
  }

  function writeWorkspace(key,screen){
    try{sessionStorage.setItem(key,screen);}catch{}
  }

  function removeWorkspace(key){
    try{sessionStorage.removeItem(key);}catch{}
  }

  function currentWorkspace(){
    const shell=document.querySelector('.ta-shell');
    if(!(shell instanceof HTMLElement))return null;
    for(const screen of WORKSPACES)if(shell.classList.contains(`screen-${screen}`))return screen;
    return null;
  }

  function workspaceNavigationButton(screen){
    if(!validWorkspace(screen))return null;
    const button=document.querySelector(`.ta-sidebar-nav .ta-nav-item[data-lourex-workspace="${screen}"]`);
    return button instanceof HTMLButtonElement&&!button.disabled?button:null;
  }

  function rememberStableWorkspace(screen){
    if(!validWorkspace(screen))return;
    writeWorkspace(WORKSPACE_LAST_KEY,screen);
  }

  function armWorkspaceRestore(){
    const target=readWorkspace(WORKSPACE_RESUME_KEY)||readWorkspace(WORKSPACE_LAST_KEY);
    if(!target||target==='home')return;
    workspaceRestoreTarget=target;
    workspaceRestoreArmed=true;
    workspaceRestoreAttempts=0;
  }

  function clearWorkspaceContinuityForSignOut(){
    workspaceRestoreTarget='home';
    workspaceRestoreArmed=false;
    workspaceRestoreAttempts=0;
    removeWorkspace(WORKSPACE_RESUME_KEY);
    removeWorkspace(WORKSPACE_LAST_KEY);
    clearEditorResume();
  }

  function exactText(node,value){
    return Boolean(node&&String(node.textContent||'').trim()===value);
  }

  function clickEditorRestoreTarget(){
    const target=validEditorResume(editorRestoreTarget);
    if(!target){clearEditorResume();return false;}
    const now=Date.now();
    const elapsed=now-editorRestoreLastClickAt;
    if(elapsed<180){
      window.setTimeout(scheduleWorkspaceContinuity,Math.max(16,190-elapsed));
      return true;
    }

    const detailTitle=document.querySelector('.ta-doc-detail-hero h1');
    if(exactText(detailTitle,target.number)){
      const open=document.querySelector('.ta-doc-detail-toolbar-actions button');
      if(open instanceof HTMLButtonElement){editorRestoreLastClickAt=now;open.click();return true;}
    }

    const resume=document.querySelector('.ta-doc-resume');
    if(resume instanceof HTMLButtonElement&&exactText(resume.querySelector('strong'),target.number)){
      editorRestoreLastClickAt=now;resume.click();return true;
    }

    const rows=Array.from(document.querySelectorAll('.ta-doc-row'));
    const row=rows.find(item=>exactText(item.querySelector('.ta-doc-row-identity strong bdi,.ta-doc-row-identity strong'),target.number));
    const open=row?.querySelector('.ta-doc-row-open');
    if(open instanceof HTMLButtonElement){editorRestoreLastClickAt=now;open.click();return true;}
    return false;
  }

  function processEditorContinuity(current){
    if(editorRestoreArmed&&!validEditorResume(editorRestoreTarget))clearEditorResume();
    if(checkpointEditor())return true;
    if(editorOpen())return true;

    if(!editorRestoreArmed||!editorRestoreTarget){
      // A normal Back action replaces the editor with Documents. Clear the
      // recovery marker only after a stable in-app workspace exists. During an
      // automatic PIN lock or WebKit process teardown there is no workspace, so
      // the marker survives and the same saved document can be reopened.
      if(!pageExiting&&current)clearEditorResume();
      else if(!pageExiting&&(document.querySelector('.auth-page')||document.querySelector('.loading-screen,.app-recovery-screen')))armEditorRestore();
      return false;
    }

    if(!current)return true;
    if(!editorRestoreStartedAt)editorRestoreStartedAt=Date.now();
    if(Date.now()-editorRestoreStartedAt>EDITOR_RESTORE_TIMEOUT){
      clearEditorResume();
      return false;
    }

    if(current!=='documents'){
      const button=workspaceNavigationButton('documents');
      if(button){button.click();scheduleWorkspaceContinuity();}
      return true;
    }

    if(!clickEditorRestoreTarget())window.setTimeout(scheduleWorkspaceContinuity,120);
    return true;
  }

  function processWorkspaceContinuity(){
    workspaceFrame=0;

    if(root.dataset.lourexSigningOut==='true'){
      clearWorkspaceContinuityForSignOut();
      return;
    }

    const current=currentWorkspace();
    if(processEditorContinuity(current))return;

    if(!current){
      // A PIN lock, account re-initialization or Safari process recovery can
      // temporarily replace the interactive shell with auth/loading UI. Preserve
      // the last stable business workspace so returning to LOUREX does not eject
      // the user to Home.
      if(sawInteractiveShell&&(document.querySelector('.auth-page')||document.querySelector('.loading-screen,.app-recovery-screen')))armWorkspaceRestore();
      return;
    }

    sawInteractiveShell=true;

    if(workspaceRestoreArmed&&workspaceRestoreTarget){
      if(current===workspaceRestoreTarget){
        rememberStableWorkspace(current);
        removeWorkspace(WORKSPACE_RESUME_KEY);
        workspaceRestoreArmed=false;
        workspaceRestoreAttempts=0;
        return;
      }

      const button=workspaceNavigationButton(workspaceRestoreTarget);
      if(button&&workspaceRestoreAttempts<30){
        workspaceRestoreAttempts+=1;
        try{button.click();}catch{}
        scheduleWorkspaceContinuity();
      }
      return;
    }

    // Normal navigation continuously checkpoints the active workspace. This is
    // intentionally session-scoped: a Safari/WebKit tab reload, PIN lock/unlock or
    // React shell re-initialization can recover the exact section without storing
    // business data or editor contents outside the encrypted vault.
    rememberStableWorkspace(current);
    workspaceRestoreTarget=current;
    workspaceRestoreAttempts=0;
  }

  function scheduleWorkspaceContinuity(){
    if(workspaceFrame)return;
    workspaceFrame=requestAnimationFrame(processWorkspaceContinuity);
  }

  // iOS/iPadOS software keyboards do not reliably emit keydown for every text
  // mutation. BaseApp's inactivity timer listens to keydown/touchstart/pointerdown,
  // so mirror actual text mutations from every unlocked app workspace into that
  // existing activity channel, not only the document editor. Checkpoint only the
  // active document identity/account; document contents remain solely in the encrypted Vault.
  for(const type of ['beforeinput','input','compositionupdate','compositionend','paste','change']){
    document.addEventListener(type,signalEditorActivity,true);
  }

  // Keep a lightweight checkpoint of every stable TailAdmin workspace and the
  // active document editor. The editor checkpoint closes the gap left by ordinary
  // workspace recovery: a genuine Safari/WebKit process reload can now reopen the
  // same encrypted draft instead of ejecting the user to Home/Documents.
  const workspaceObserver=new MutationObserver(scheduleWorkspaceContinuity);
  workspaceObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-lourex-document-editor']});
  window.addEventListener('pageshow',()=>{pageExiting=false;if(!editorOpen())armEditorRestore();scheduleWorkspaceContinuity();});
  window.addEventListener('beforeunload',()=>{pageExiting=true;checkpointEditor();});
  window.addEventListener('pagehide',()=>{
    pageExiting=true;
    checkpointEditor();
    if(root.dataset.lourexSigningOut==='true'){clearWorkspaceContinuityForSignOut();return;}
    const current=currentWorkspace();
    if(current)rememberStableWorkspace(current);
  });
  scheduleWorkspaceContinuity();

  // iPadOS can report itself as Macintosh when Desktop Website mode is enabled.
  // Treat a touch-capable MacIntel navigator as iPadOS so the same Safari stability
  // policy used for ordinary iPad/iPhone UA strings is applied consistently.
  if(appleMobile){
    root.dataset.lourexIosWebkit='true';
    // Native/app-level pull refresh is deliberately unavailable on Apple mobile.
    // Safari already owns the edge gesture and a second reload gesture creates an
    // avoidable path back through startup while the user is browsing More pages.
    root.removeAttribute('data-lourex-enable-pull-refresh');
    try{window.__LOUREX_IOS_WEBKIT__=true;}catch{}

    const retireServiceWorkers=async()=>{
      try{
        if('serviceWorker' in navigator){
          const registrations=await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration=>registration.unregister().catch(()=>false)));
        }
      }catch{}
      try{
        if('caches' in window){
          const keys=await caches.keys();
          await Promise.all(keys.filter(key=>key.startsWith('lourex-invoice-')).map(key=>caches.delete(key)));
        }
      }catch{}
    };

    const retireAfterLoad=()=>{
      void retireServiceWorkers();
      // The app runtime installs its own load callback. Run again after that callback
      // and once more after Safari has settled any asynchronous registration work.
      window.setTimeout(()=>void retireServiceWorkers(),0);
      window.setTimeout(()=>void retireServiceWorkers(),750);
      window.setTimeout(()=>void retireServiceWorkers(),2500);
    };

    void retireServiceWorkers();
    window.addEventListener('pageshow',()=>void retireServiceWorkers());
    window.addEventListener('load',retireAfterLoad,{once:true});

    // Block a late re-registration attempt from code paths that only inspected the
    // legacy UA string. Scheduled retirement above remains a second guard if Safari
    // refuses to shadow the instance method.
    try{
      if('serviceWorker' in navigator){
        const container=navigator.serviceWorker;
        const nativeRegister=container.register.bind(container);
        const blockedRegister=(...args)=>{
          if(appleMobile)return Promise.reject(new DOMException('Service worker disabled for iPadOS editor stability.','NotSupportedError'));
          return nativeRegister(...args);
        };
        let installed=false;
        try{
          Object.defineProperty(container,'register',{configurable:true,value:blockedRegister});
          installed=container.register!==nativeRegister;
        }catch{}
        if(!installed){
          try{
            const proto=Object.getPrototypeOf(container);
            Object.defineProperty(proto,'register',{configurable:true,value:blockedRegister});
          }catch{}
        }
      }
    }catch{}
  }

  // Diagnostic only. This lets browser QA prove that the guard is present without
  // changing application state or exposing business data.
  try{
    Object.defineProperty(window,'__LOUREX_EDITOR_STABILITY_V338__',{
      configurable:true,
      value:{
        appleMobile,
        editorOpen,
        lastInputAt:()=>lastEditorInputAt,
        currentWorkspace,
        workspaceRestoreTarget:()=>workspaceRestoreTarget,
        workspaceRestoreArmed:()=>workspaceRestoreArmed,
        editorResumeTarget:()=>editorRestoreTarget,
        editorRestoreArmed:()=>editorRestoreArmed
      }
    });
  }catch{}
})();