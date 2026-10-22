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
      // React replaces the static #lourex-boot node during mount. Treat its
      // direct .loading-screen successor as the same startup owner so the theme
      // bootstrap cannot release the page background between those two paints.
      // Between React removing the static boot node and mounting the first
      // app/auth/recovery surface, #root can briefly be empty on Safari.
      // Do not unlock scrolling or disconnect in that gap.
      if(startupSurface()||!mount.querySelector(
        ':scope > .workspace-shell, :scope > .ta-shell, :scope > .ta-auth-page, '+
        ':scope > .auth-page, :scope > .auth-recovery-state, :scope > .app-recovery, '+
        ':scope > .app-recovery-screen, :scope > .app-ui'
      ))return;
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
    // React can reuse the original #root child and update its className from
    // loading-screen to the application shell without replacing a child node.
    // Observe class transitions as well as child insertion/removal; otherwise
    // data-lourex-booting remains true on live documents, forcing overflow:hidden.
    // This observer disconnects as soon as the genuine loading screen leaves.
    observer.observe(mount,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    restore();
  },{once:true});
})();
