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
      if(startupSurface())return;
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
