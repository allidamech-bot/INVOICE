;(function(){
  'use strict';

  var CHECK_MS=12000;
  var DIAG_LOG_KEY='lourex-runtime-diagnostics-v340';
  var DIAG_META_KEY='lourex-runtime-diagnostics-meta-v340';
  var DIAG_MAX_EVENTS=250;

  function currentScreen(){
    try{
      var shell=document.querySelector('.ta-shell,.workspace-shell');
      if(shell instanceof HTMLElement){
        var classes=Array.from(shell.classList);
        for(var i=0;i<classes.length;i++)if(classes[i].indexOf('screen-')===0)return classes[i].slice(7);
      }
      if(document.querySelector('.editor-screen'))return 'editor';
      if(document.querySelector('.auth-page,.ta-auth-page'))return 'auth';
      if(document.querySelector('.loading-screen,#lourex-boot'))return 'loading';
    }catch(_error){}
    return 'unknown';
  }

  function markNavigation(reason,detail){
    try{
      var helper=window.__LOUREX_DIAGNOSTICS__&&window.__LOUREX_DIAGNOSTICS__.mark;
      if(typeof helper==='function'){
        helper('navigation-request','reason='+String(reason||'unknown')+(detail?' '+String(detail):''));
        return;
      }
      var raw=localStorage.getItem(DIAG_LOG_KEY)||'[]';
      var log=JSON.parse(raw);
      if(!Array.isArray(log))log=[];
      var now=new Date().toISOString();
      var event={
        at:now,
        session:'startup-navigation-v347',
        type:'navigation-request',
        screen:currentScreen(),
        visibility:document.visibilityState||'unknown',
        online:navigator.onLine!==false,
        detail:'reason='+String(reason||'unknown').slice(0,80)+(detail?' '+String(detail).slice(0,96):'')
      };
      log.push(event);
      if(log.length>DIAG_MAX_EVENTS)log.splice(0,log.length-DIAG_MAX_EVENTS);
      localStorage.setItem(DIAG_LOG_KEY,JSON.stringify(log));
      localStorage.setItem(DIAG_META_KEY,JSON.stringify({
        sessionId:'startup-navigation-v347',startedAt:now,lastSeen:now,lastEvent:'navigation-request',
        lastScreen:event.screen,visibility:event.visibility,online:event.online
      }));
    }catch(_error){}
  }

  function markDiagnostic(type,detail){
    try{
      var helper=window.__LOUREX_DIAGNOSTICS__&&window.__LOUREX_DIAGNOSTICS__.mark;
      if(typeof helper==='function'){helper(type,detail||'');return;}
      var raw=localStorage.getItem(DIAG_LOG_KEY)||'[]';
      var log=JSON.parse(raw);if(!Array.isArray(log))log=[];
      var now=new Date().toISOString();
      log.push({at:now,session:'startup-v347',type:type,screen:currentScreen(),visibility:document.visibilityState||'unknown',online:navigator.onLine!==false,detail:String(detail||'').slice(0,180)});
      if(log.length>DIAG_MAX_EVENTS)log.splice(0,log.length-DIAG_MAX_EVENTS);
      localStorage.setItem(DIAG_LOG_KEY,JSON.stringify(log));
    }catch(_error){}
  }

  try{Object.defineProperty(window,'__LOUREX_MARK_NAVIGATION__',{value:markNavigation,writable:false,configurable:true});}
  catch(_error){try{window.__LOUREX_MARK_NAVIGATION__=markNavigation;}catch(_ignored){}}

  function startupSurface(){
    try{
      var root=document.getElementById('root');
      if(!root)return null;
      var direct=root.querySelector(':scope > .loading-screen');
      return direct instanceof HTMLElement?direct:null;
    }catch(_error){return null;}
  }

  function bootStillVisible(){
    return Boolean(startupSurface())&&!document.querySelector('.app-ui,.auth-page,.ta-auth-page,.app-recovery,.app-recovery-screen');
  }

  function editingWorkspaceOpen(){
    try{
      return document.documentElement.hasAttribute('data-lourex-document-editor')||
        document.documentElement.hasAttribute('data-lourex-workspace-dirty')||
        Boolean(document.querySelector('.editor-screen,.modal-backdrop,.ta-product-editor.is-open,.ta-operations-page .ta-ops-editor,.product-library-pro.editor-open,.operations-page .purchase-editor'));
    }catch(_error){return false;}
  }

  // Keep diagnostics private. If React never takes ownership, the static
  // splash itself offers a single explicit retry without touching storage.
  function recoverIfNeeded(){
    if(editingWorkspaceOpen()||!bootStillVisible())return;
    markDiagnostic('startup-watchdog-timeout','automaticReload=no customerOverlay=no');
  }

  function showStaticRetry(){
    var boot=document.getElementById('lourex-boot');
    if(!boot||editingWorkspaceOpen()||!bootStillVisible())return;
    var recovery=boot.querySelector('.launch-recovery');
    if(!recovery||!recovery.hidden)return;
    var retry=recovery.querySelector('button');
    retry.addEventListener('click',function(){window.location.reload();},{once:true});
    boot.removeAttribute('aria-label');
    boot.removeAttribute('role');
    boot.setAttribute('data-launch-recovery','');
    recovery.setAttribute('role','group');
    recovery.firstElementChild.setAttribute('role','alert');
    recovery.hidden=false;
  }

  window.addEventListener('lourex-startup-entry-failed',showStaticRetry);
  window.setTimeout(recoverIfNeeded,CHECK_MS);
  window.setTimeout(showStaticRetry,30000);
})();
