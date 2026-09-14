import {readFile,writeFile} from 'node:fs/promises';

const runtimeConfigPath='dist/runtime-config.js';
const appEntryPath='dist/src/app/index.js';
const swPath='dist/sw.js';
const APP_RUNTIME_MARKER='window.__LOUREX_BOOT_RUNTIME_LOADED__=true;';
const RELEASE_MARKER='// lourex-invoice-v249: desktop startup recovery refresh.';

let [runtimeConfig,appEntry,sw]=await Promise.all([
  readFile(runtimeConfigPath,'utf8'),
  readFile(appEntryPath,'utf8'),
  readFile(swPath,'utf8')
]);

// This marker executes only after the browser has successfully resolved and
// evaluated the application module graph. The boot guard can therefore tell a
// genuinely broken/stale desktop runtime from a valid app that is simply still
// reconciling an authenticated cloud vault before React mounts.
if(!appEntry.includes('__LOUREX_BOOT_RUNTIME_LOADED__'))appEntry=`${APP_RUNTIME_MARKER}\n${appEntry}`;

const desktopRecovery=`
;(function(){
  var RECOVERY_KEY='lourex-desktop-boot-recovery-v249';
  var reloading=false;
  function bootOnly(){
    return Boolean(document.getElementById('lourex-boot'))&&!document.querySelector('.app-ui,.auth-page');
  }
  function desktopLike(){
    try{
      if(window.innerWidth<=960)return false;
      if(navigator.userAgentData&&navigator.userAgentData.mobile===true)return false;
      if(!window.matchMedia)return true;
      return window.matchMedia('(pointer:fine)').matches||window.matchMedia('(hover:hover)').matches;
    }catch(_error){return window.innerWidth>960;}
  }
  function recoveryUsed(){try{return sessionStorage.getItem(RECOVERY_KEY)==='1';}catch(_error){return false;}}
  function markRecovery(){try{sessionStorage.setItem(RECOVERY_KEY,'1');}catch(_error){}}
  async function clearLourexRuntimeCaches(){
    if(!('caches' in window))return;
    try{
      var keys=await caches.keys();
      await Promise.all(keys.filter(function(key){return /^lourex-invoice-v/i.test(key);}).map(function(key){return caches.delete(key);}));
    }catch(_error){}
  }
  async function repairDesktopRuntime(){
    if(reloading||!bootOnly()||!desktopLike()||!navigator.onLine||window.__LOUREX_BOOT_RUNTIME_LOADED__||recoveryUsed())return;
    markRecovery();
    try{
      var registration=await navigator.serviceWorker.getRegistration();
      if(registration)try{await registration.unregister();}catch(_error){}
    }catch(_error){}
    await clearLourexRuntimeCaches();
    if(!bootOnly())return;
    reloading=true;
    window.location.replace(window.location.href);
  }
  function showDesktopRecoveryHelp(){
    if(!bootOnly()||!desktopLike())return;
    var boot=document.getElementById('lourex-boot');
    if(!boot||boot.querySelector('[data-lourex-desktop-recovery]'))return;
    var panel=document.createElement('div');
    panel.setAttribute('data-lourex-desktop-recovery','true');
    panel.style.cssText='position:relative;z-index:2;width:min(430px,calc(100vw - 40px));box-sizing:border-box;padding:16px;border:1px solid rgba(184,160,113,.42);border-radius:14px;background:#101010;text-align:center;color:#f8f4ea;font:500 13px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    var title=document.createElement('strong');
    title.style.cssText='display:block;margin-bottom:5px;font-size:14px';
    title.textContent=window.__LOUREX_BOOT_RUNTIME_LOADED__?'LOUREX startup is taking longer than expected':'LOUREX desktop runtime could not finish loading';
    var detail=document.createElement('span');
    detail.style.cssText='display:block;color:#bdb7aa';
    detail.textContent=window.__LOUREX_BOOT_RUNTIME_LOADED__?'You can reload safely or open diagnostics. / يمكنك إعادة التحميل بأمان أو فتح التشخيص.':'A stale desktop cache was repaired when possible. Reload or open diagnostics. / تمت محاولة إصلاح ذاكرة التشغيل القديمة. أعد التحميل أو افتح التشخيص.';
    var actions=document.createElement('div');
    actions.style.cssText='display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px';
    var reload=document.createElement('button');
    reload.type='button';
    reload.textContent='Reload / إعادة التحميل';
    reload.style.cssText='min-height:42px;padding:0 13px;border:1px solid #b8a071;border-radius:9px;background:#b8a071;color:#11110f;font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer';
    reload.addEventListener('click',function(){window.location.reload();});
    var diagnostics=document.createElement('a');
    diagnostics.href='./health.html';
    diagnostics.textContent='Diagnostics / التشخيص';
    diagnostics.style.cssText='min-height:42px;display:inline-flex;align-items:center;padding:0 13px;border:1px solid rgba(255,255,255,.18);border-radius:9px;background:#171717;color:#f8f4ea;text-decoration:none;font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    actions.append(reload,diagnostics);
    panel.append(title,detail,actions);
    boot.appendChild(panel);
  }
  window.setTimeout(function(){void repairDesktopRuntime();},9000);
  window.setTimeout(showDesktopRecoveryHelp,20000);
})();
`;

if(!runtimeConfig.includes('lourex-desktop-boot-recovery-v249'))runtimeConfig+=desktopRecovery;
if(!sw.includes(RELEASE_MARKER))sw=`${RELEASE_MARKER}\n${sw}`;

if(!runtimeConfig.includes('registration.unregister()'))throw new Error('Desktop recovery must unregister a broken service worker before retrying.');
if(!runtimeConfig.includes("/^lourex-invoice-v/i"))throw new Error('Desktop recovery must stay scoped to LOUREX CacheStorage generations.');
if(runtimeConfig.includes('indexedDB.deleteDatabase'))throw new Error('Desktop recovery must never delete encrypted IndexedDB account data.');
if(!appEntry.includes('__LOUREX_BOOT_RUNTIME_LOADED__'))throw new Error('Desktop recovery app-runtime marker was not injected.');
if(!sw.includes(RELEASE_MARKER))throw new Error('Desktop recovery service-worker release marker was not injected.');

await Promise.all([
  writeFile(runtimeConfigPath,runtimeConfig),
  writeFile(appEntryPath,appEntry),
  writeFile(swPath,sw)
]);
