;(function(){
  'use strict';
  var key='lourex-ui-theme',pref='system';
  try{var saved=localStorage.getItem(key);if(saved==='light'||saved==='dark'||saved==='system')pref=saved;}catch(e){}
  var resolved=pref;
  if(pref==='system'){
    try{resolved=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    catch(e){resolved='dark';}
  }
  var root=document.documentElement,meta=document.querySelector('meta[name="theme-color"]');
  var dark='#0a1826',light='#f3f7fc',bg=resolved==='light'?light:dark;
  root.dataset.uiTheme=resolved;
  root.dataset.uiThemePreference=pref;
  root.dataset.lourexBooting='true';
  root.style.colorScheme=resolved;
  root.style.backgroundColor=bg;
  root.style.setProperty('--boot-bg',bg);
  if(meta)meta.setAttribute('content',bg);

  // Defer only the third-party font stylesheet. The app keeps its exact font
  // families/weights; first paint and login are not gated on Google Fonts.
  (function armDeferredFonts(){
    var observer;
    var arm=function(){
      var link=document.querySelector('link[data-lourex-deferred-fonts="true"]');
      if(!link)return false;
      var enable=function(){link.media='all';};
      link.addEventListener('load',enable,{once:true});
      if(link.sheet)enable();
      if(observer)observer.disconnect();
      return true;
    };
    if(arm())return;
    observer=new MutationObserver(function(){arm();});
    observer.observe(document.head,{childList:true});
  })();

  document.addEventListener('DOMContentLoaded',function(){
    var mount=document.getElementById('root');
    if(!mount)return;
    var observer;
    var startupSurface=function(){
      try{return mount.querySelector(':scope > .loading-screen');}catch(e){return document.getElementById('lourex-boot');}
    };
    var restore=function(){
      // The static boot node and React's temporary .loading-screen can disappear
      // briefly between DOM commits. Never disconnect the observer in that gap:
      // iOS can otherwise leave data-lourex-booting=true over a fully mounted
      // document workspace, forcing fixed positioning and disabled scrolling.
      // Release only after React has displayed a real authenticated, account
      // entry, or recovery surface (not merely an empty #root).
      var ready=mount.querySelector('.app-ui,.auth-page,.ta-auth-page,.auth-recovery-state,.app-recovery,.app-recovery-screen');
      if(!ready)return;
      delete root.dataset.lourexBooting;
      root.style.removeProperty('--boot-bg');
      // A theme change may occur while auth is loading. Do not restore the
      // preference captured before React mounted over the current selection.
      var current=root.dataset.uiTheme==='light'?'light':'dark';
      var currentBg=current==='light'?light:dark;
      root.style.colorScheme=current;
      root.style.backgroundColor=currentBg;
      if(meta)meta.setAttribute('content',currentBg);
      if(observer)observer.disconnect();
    };
    observer=new MutationObserver(restore);
    observer.observe(mount,{childList:true});
    restore();
  },{once:true});
})();
