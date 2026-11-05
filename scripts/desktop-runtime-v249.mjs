import {readFile,writeFile} from 'node:fs/promises';

const runtimeConfigPath='dist/runtime-config.js';
const appEntryPath='dist/src/app/index.js';
const swPath='dist/sw.js';
const APP_RUNTIME_MARKER='window.__LOUREX_BOOT_RUNTIME_LOADED__=true;';
const RELEASE_MARKER='// lourex-invoice-v249: desktop startup recovery refresh.';
const LAUNCH_RELEASE_MARKER='// lourex-invoice-v250: ledger pulse launch experience refresh.';
const LOGO_RELEASE_MARKER='// lourex-invoice-v251: Safari-safe brand asset refresh.';
const AUTH_GATEWAY_RELEASE_MARKER='// lourex-invoice-v253: authenticated gateway transition refresh.';

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

// v253 — authenticated account-gateway transition recovery.
// A successful Firebase sign-in can make the user current while the already-
// mounted React tree is still showing the public account gateway. Follow the
// Firebase auth state itself and reload only that public gateway once the UID is
// observable. Startup then selects the UID-scoped IndexedDB before reading any
// encrypted vault/session data.
const authGatewayTransition=`
;(function(){
  var TRANSITION_KEY='lourex-auth-gateway-transition-v253';
  var attached=false;
  var retryTimer=0;
  function gatewayOpen(){return Boolean(document.querySelector('.auth-account-page'));}
  function marker(){try{return sessionStorage.getItem(TRANSITION_KEY)||'';}catch(_error){return '';}}
  function setMarker(uid){try{sessionStorage.setItem(TRANSITION_KEY,uid);}catch(_error){}}
  function clearMarker(){try{sessionStorage.removeItem(TRANSITION_KEY);}catch(_error){}}
  function transition(user){
    if(!user){clearMarker();return;}
    if(!gatewayOpen())return;
    var uid=String(user.uid||'');
    if(!uid||marker()===uid)return;
    setMarker(uid);
    window.setTimeout(function(){
      try{
        if(typeof firebase==='undefined'||!firebase.auth)return;
        var current=firebase.auth().currentUser;
        if(!current||String(current.uid||'')!==uid||!gatewayOpen())return;
      }catch(_error){return;}
      window.location.replace(window.location.href);
    },80);
  }
  function attach(){
    if(attached)return true;
    try{
      if(typeof firebase==='undefined'||!firebase.apps||!firebase.apps.length||!firebase.auth)return false;
      var instance=firebase.auth();
      attached=true;
      instance.onAuthStateChanged(function(user){transition(user);},function(){});
      var observer=new MutationObserver(function(){if(instance.currentUser)transition(instance.currentUser);});
      observer.observe(document.documentElement,{childList:true,subtree:true});
      if(instance.currentUser)transition(instance.currentUser);
      return true;
    }catch(_error){return false;}
  }
  function tryAttach(){
    if(!attach())return;
    if(retryTimer){window.clearInterval(retryTimer);retryTimer=0;}
  }
  retryTimer=window.setInterval(tryAttach,50);
  window.setTimeout(function(){if(retryTimer){window.clearInterval(retryTimer);retryTimer=0;}},10000);
  window.addEventListener('load',tryAttach,{once:true});
  tryAttach();
})();
`;

if(!runtimeConfig.includes('lourex-auth-gateway-transition-v253'))runtimeConfig+=authGatewayTransition;
if(!sw.includes(RELEASE_MARKER))sw=`${RELEASE_MARKER}\n${sw}`;
if(!sw.includes(LAUNCH_RELEASE_MARKER))sw=`${LAUNCH_RELEASE_MARKER}\n${sw}`;
if(!sw.includes(LOGO_RELEASE_MARKER))sw=`${LOGO_RELEASE_MARKER}\n${sw}`;
if(!sw.includes(AUTH_GATEWAY_RELEASE_MARKER))sw=`${AUTH_GATEWAY_RELEASE_MARKER}\n${sw}`;

if(runtimeConfig.includes('indexedDB.deleteDatabase'))throw new Error('Desktop recovery must never delete encrypted IndexedDB account data.');
if(!runtimeConfig.includes('lourex-auth-gateway-transition-v253'))throw new Error('Authenticated gateway transition guard was not injected.');
if(!runtimeConfig.includes("document.querySelector('.auth-account-page')"))throw new Error('Authenticated gateway transition must stay scoped to the public account gateway.');
if(!runtimeConfig.includes('onAuthStateChanged'))throw new Error('Authenticated gateway transition must follow Firebase auth state.');
if(!appEntry.includes('__LOUREX_BOOT_RUNTIME_LOADED__'))throw new Error('Desktop recovery app-runtime marker was not injected.');
if(!sw.includes(RELEASE_MARKER))throw new Error('Desktop recovery service-worker release marker was not injected.');
if(!sw.includes(LAUNCH_RELEASE_MARKER))throw new Error('Ledger Pulse service-worker release marker was not injected.');
if(!sw.includes(LOGO_RELEASE_MARKER))throw new Error('Safari-safe logo service-worker release marker was not injected.');
if(!sw.includes(AUTH_GATEWAY_RELEASE_MARKER))throw new Error('Authenticated gateway transition service-worker release marker was not injected.');

await Promise.all([
  writeFile(runtimeConfigPath,runtimeConfig),
  writeFile(appEntryPath,appEntry),
  writeFile(swPath,sw)
]);
