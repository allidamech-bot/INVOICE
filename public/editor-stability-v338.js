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
  const WORKSPACES=['home','documents','customers','items','operations','receivables','reports'];
  const WORKSPACE_NAV_INDEX={home:0,documents:1,customers:2,items:3,operations:4,receivables:5,reports:6};
  let lastEditorInputAt=0;
  let workspaceFrame=0;
  let workspaceRestoreTarget=readWorkspace(WORKSPACE_RESUME_KEY)||readWorkspace(WORKSPACE_LAST_KEY);
  let workspaceRestoreArmed=Boolean(workspaceRestoreTarget&&workspaceRestoreTarget!=='home');
  let workspaceRestoreAttempts=0;
  let sawInteractiveShell=false;

  function editorOpen(){
    return root.hasAttribute('data-lourex-document-editor')||Boolean(document.querySelector('.editor-screen'));
  }

  function editorInputTarget(target){
    if(!(target instanceof Element))return false;
    if(!target.closest(editableSelector))return false;
    return Boolean(target.closest('.editor-screen'))||root.hasAttribute('data-lourex-document-editor');
  }

  function signalEditorActivity(event){
    if(!editorInputTarget(event.target))return;
    lastEditorInputAt=Date.now();
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
    const index=WORKSPACE_NAV_INDEX[screen];
    if(typeof index!=='number')return null;
    const buttons=Array.from(document.querySelectorAll('.ta-sidebar-nav .ta-nav-item'));
    const button=buttons[index];
    return button instanceof HTMLButtonElement?button:null;
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
  }

  function processWorkspaceContinuity(){
    workspaceFrame=0;

    if(root.dataset.lourexSigningOut==='true'){
      clearWorkspaceContinuityForSignOut();
      return;
    }

    const current=currentWorkspace();
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
  // so mirror actual editor text mutations into that existing activity channel.
  for(const type of ['beforeinput','input','compositionupdate','compositionend','paste','change']){
    document.addEventListener(type,signalEditorActivity,true);
  }

  // Keep a lightweight checkpoint of every stable TailAdmin workspace. The old
  // reload-restoration code still points at pre-TailAdmin .shell-nav-* selectors;
  // this runtime guard uses the live .ta-shell/.ta-nav-item contract and includes
  // Purchasing/Operations from the mobile More sheet.
  const workspaceObserver=new MutationObserver(scheduleWorkspaceContinuity);
  workspaceObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('pageshow',scheduleWorkspaceContinuity);
  window.addEventListener('pagehide',()=>{
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
        workspaceRestoreArmed:()=>workspaceRestoreArmed
      }
    });
  }catch{}
})();