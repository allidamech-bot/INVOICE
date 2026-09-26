;(function(){
  'use strict';

  var CHECK_MS=12000;
  var CACHE_PREFIX='lourex-invoice-';
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
        Boolean(document.querySelector('.editor-screen,.modal-backdrop,.product-library-pro.editor-open'));
    }catch(_error){return false;}
  }

  async function refreshStaticRuntime(){
    try{
      if('serviceWorker' in navigator){
        var registrations=await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(function(registration){
          try{return registration.unregister();}catch(_error){return false;}
        }));
      }
    }catch(_error){}
    try{
      if('caches' in window){
        var names=await caches.keys();
        await Promise.all(names.filter(function(name){return name.indexOf(CACHE_PREFIX)===0;}).map(function(name){return caches.delete(name);}));
      }
    }catch(_error){}
  }

  function retryUrl(){
    try{
      var url=new URL(window.location.href);
      url.searchParams.set('lourex-recover',String(Date.now()));
      return url.toString();
    }catch(_error){return window.location.href;}
  }

  function buildButton(label,handler,secondary){
    var button=document.createElement('button');
    button.type='button';button.textContent=label;
    button.style.minHeight='44px';button.style.padding='0 16px';button.style.borderRadius='10px';
    button.style.border=secondary?'1px solid rgba(152,162,179,.45)':'1px solid #129da1';
    button.style.background=secondary?'transparent':'#129da1';button.style.color=secondary?'inherit':'#fff';
    button.style.font='700 14px Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    button.addEventListener('click',handler);
    return button;
  }

  function showRecovery(){
    if(!bootStillVisible()||editingWorkspaceOpen())return;
    var screen=startupSurface();if(!screen)return;
    if(screen.dataset.lourexStartupRecovery==='true')return;
    screen.dataset.lourexStartupRecovery='true';
    screen.setAttribute('role','alert');
    screen.setAttribute('aria-live','assertive');

    var card=document.createElement('section');
    card.style.width='min(100%,460px)';card.style.padding='22px';card.style.boxSizing='border-box';
    card.style.border='1px solid rgba(152,162,179,.28)';card.style.borderRadius='16px';
    card.style.background=document.documentElement.dataset.uiTheme==='light'?'#ffffff':'#0f1c2d';
    card.style.color=document.documentElement.dataset.uiTheme==='light'?'#102235':'#f7fbff';
    card.style.boxShadow='0 18px 46px rgba(6,14,25,.18)';

    var title=document.createElement('h1');
    title.textContent='LOUREX needs your action / يحتاج LOUREX إلى إجراء منك';
    title.style.margin='0 0 8px';title.style.fontSize='19px';title.style.lineHeight='1.4';

    var message=document.createElement('p');
    message.textContent='Startup is taking longer than expected. LOUREX will not reload itself. You can retry safely or open diagnostics. / استغرق التشغيل وقتًا أطول من المتوقع. لن يعيد LOUREX تحميل نفسه تلقائيًا. يمكنك إعادة المحاولة بأمان أو فتح التشخيص.';
    message.style.margin='0 0 18px';message.style.fontSize='14px';message.style.lineHeight='1.7';message.style.opacity='.82';

    var actions=document.createElement('div');actions.style.display='flex';actions.style.flexWrap='wrap';actions.style.gap='10px';
    var retry=buildButton('Retry safely / إعادة المحاولة بأمان',function(){
      if(editingWorkspaceOpen()||retry.disabled)return;
      retry.disabled=true;
      markDiagnostic('startup-recovery-user-retry','manual=yes');
      void refreshStaticRuntime().finally(function(){
        markNavigation('startup-recovery-user-retry','mode=replace source=startup-watchdog-v347');
        window.location.replace(retryUrl());
      });
    },false);
    actions.appendChild(retry);

    var diagnostics=document.createElement('a');
    diagnostics.href='./health.html';diagnostics.textContent='Diagnostics / التشخيص';
    diagnostics.style.minHeight='44px';diagnostics.style.display='inline-flex';diagnostics.style.alignItems='center';diagnostics.style.justifyContent='center';
    diagnostics.style.padding='0 16px';diagnostics.style.border='1px solid rgba(152,162,179,.45)';diagnostics.style.borderRadius='10px';
    diagnostics.style.color='inherit';diagnostics.style.textDecoration='none';diagnostics.style.fontWeight='700';
    diagnostics.addEventListener('click',function(){markNavigation('startup-recovery-health-open','mode=href');});
    actions.appendChild(diagnostics);

    card.append(title,message,actions);
    screen.replaceChildren(card);
  }

  function recoverIfNeeded(){
    if(editingWorkspaceOpen()||!bootStillVisible())return;
    markDiagnostic('startup-watchdog-timeout','automaticReload=no');
    showRecovery();
  }

  window.setTimeout(recoverIfNeeded,CHECK_MS);
})();
