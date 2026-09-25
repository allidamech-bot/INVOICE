(()=>{
  'use strict';

  const root=document.documentElement;
  const ua=String(navigator.userAgent||'');
  const platform=String(navigator.platform||'');
  const touchPoints=Number(navigator.maxTouchPoints||0);
  const appleMobile=/iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);
  const editorSelector='.editor-screen,[data-lourex-document-editor]';
  const editableSelector='input,textarea,select,[contenteditable="true"],[contenteditable=""]';
  let lastEditorInputAt=0;

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

  // iOS/iPadOS software keyboards do not reliably emit keydown for every text
  // mutation. BaseApp's inactivity timer listens to keydown/touchstart/pointerdown,
  // so mirror actual editor text mutations into that existing activity channel.
  for(const type of ['beforeinput','input','compositionupdate','compositionend','paste','change']){
    document.addEventListener(type,signalEditorActivity,true);
  }

  // iPadOS can report itself as Macintosh when Desktop Website mode is enabled.
  // Treat a touch-capable MacIntel navigator as iPadOS so the same Safari stability
  // policy used for ordinary iPad/iPhone UA strings is applied consistently.
  if(appleMobile){
    root.dataset.lourexIosWebkit='true';
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

    void retireServiceWorkers();
    window.addEventListener('pageshow',()=>void retireServiceWorkers());
    window.addEventListener('load',()=>void retireServiceWorkers(),{once:true});

    // Block a late re-registration attempt from code paths that only inspected the
    // legacy UA string. LOUREX is local-first; IndexedDB/PIN/business data are not
    // touched by this guard.
    try{
      if('serviceWorker' in navigator){
        const container=navigator.serviceWorker;
        const register=container.register.bind(container);
        Object.defineProperty(container,'register',{
          configurable:true,
          value:(...args)=>{
            if(appleMobile)return Promise.reject(new DOMException('Service worker disabled for iPadOS editor stability.','NotSupportedError'));
            return register(...args);
          }
        });
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
        lastInputAt:()=>lastEditorInputAt
      }
    });
  }catch{}
})();
