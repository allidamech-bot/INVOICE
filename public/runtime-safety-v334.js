(()=>{
  'use strict';

  const ROOT=document.documentElement;
  const UPDATE_BUTTON='[data-lourex-update] button,[data-lourex-cloud-refresh] button';
  const SIGNOUT_BUTTON='.settings-direct-signout-button,.settings-signout-button,.ta-cloud-account-actions button,.ta-sheet-signout';
  const WORKSPACE_CONTINUITY_KEY='lourex-workspace-continuity-v340';
  const WORKSPACE_CONTINUITY_MAX_AGE=2*60*60*1000;
  const WORKSPACE_ORDER=['home','documents','customers','items','operations','receivables','reports'];

  function manualInventoryDraftOpen(){
    const entry=document.querySelector('.operations-page .ta-inventory-entry,.operations-page .inventory-entry');
    if(!(entry instanceof HTMLElement))return false;
    const savedItem=entry.querySelector('select');
    if(savedItem&&String(savedItem.value||'').trim())return true;
    const decimals=Array.from(entry.querySelectorAll('input[inputmode="decimal"]'));
    if(decimals.some(input=>String(input.value||'').trim()))return true;
    const text=Array.from(entry.querySelectorAll('input:not([type="date"]):not([list])'));
    return text.some(input=>String(input.value||'').trim());
  }

  function unsafeWorkspaceOpen(){
    if(ROOT.hasAttribute('data-lourex-document-editor'))return true;
    if(ROOT.hasAttribute('data-lourex-workspace-dirty'))return true;
    if(document.querySelector('.editor-screen,.modal-backdrop,.product-library-pro.editor-open'))return true;
    return manualInventoryDraftOpen();
  }

  function signOutUnsafeWorkspaceOpen(){
    if(ROOT.hasAttribute('data-lourex-document-editor'))return true;
    if(ROOT.hasAttribute('data-lourex-workspace-dirty'))return true;
    if(document.querySelector('.editor-screen,.product-library-pro.editor-open'))return true;
    return manualInventoryDraftOpen();
  }

  function currentFirebaseUid(){try{return String(window.firebase?.auth?.().currentUser?.uid||'').trim();}catch{return '';}}
  function completeRejectedAccountTransition(uid){try{window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid,rejectedByRuntimeSafety:true}}));}catch{}}
  function guardStaleAccountTransition(event){
    if(!(event instanceof CustomEvent))return;
    const uid=String(event.detail?.uid||'').trim();
    if(!uid||currentFirebaseUid()===uid)return;
    event.stopImmediatePropagation();
    completeRejectedAccountTransition(uid);
  }

  function explainDeferred(button){
    const notice=button.closest('[data-lourex-update],[data-lourex-cloud-refresh]');
    const detail=notice?.querySelector('small');
    if(detail instanceof HTMLElement)detail.textContent=ROOT.lang==='ar'||ROOT.dir==='rtl'?'احفظ أو أغلق مساحة الإدخال الحالية أولًا حتى لا تضيع التعديلات غير المحفوظة.':'Save or close the current data-entry workspace first so unsaved changes are not lost.';
  }

  function explainBlockedSignOut(button){
    const account=button.closest('.ta-cloud-account');
    if(!(account instanceof HTMLElement))return;
    let note=account.querySelector('[data-lourex-signout-deferred]');
    if(!(note instanceof HTMLElement)){
      note=document.createElement('div');
      note.setAttribute('data-lourex-signout-deferred','true');
      note.className='ta-auth-feedback is-error';
      note.setAttribute('role','alert');
      const footer=button.closest('.ta-cloud-account-actions');
      if(footer?.parentElement===account)account.insertBefore(note,footer);else account.appendChild(note);
    }
    note.textContent=ROOT.lang==='ar'||ROOT.dir==='rtl'?'احفظ وأغلق المستند أو مساحة الإدخال الحالية قبل تسجيل الخروج.':'Save and close the current document or data-entry workspace before signing out.';
  }

  function currentWorkspace(){
    const shell=document.querySelector('.workspace-shell');
    if(!(shell instanceof HTMLElement))return '';
    for(const screen of WORKSPACE_ORDER)if(shell.classList.contains(`screen-${screen}`))return screen;
    return '';
  }
  function continuityPayload(screen){return JSON.stringify({screen,at:Date.now()});}
  function saveWorkspaceContinuity(){
    const screen=currentWorkspace();if(!screen)return;
    const payload=continuityPayload(screen);
    try{sessionStorage.setItem(WORKSPACE_CONTINUITY_KEY,payload);}catch{}
    try{localStorage.setItem(WORKSPACE_CONTINUITY_KEY,payload);}catch{}
  }
  function clearWorkspaceContinuity(){try{sessionStorage.removeItem(WORKSPACE_CONTINUITY_KEY);}catch{}try{localStorage.removeItem(WORKSPACE_CONTINUITY_KEY);}catch{}}
  function readWorkspaceContinuity(){
    let raw='';
    try{raw=sessionStorage.getItem(WORKSPACE_CONTINUITY_KEY)||'';}catch{}
    if(!raw){try{raw=localStorage.getItem(WORKSPACE_CONTINUITY_KEY)||'';}catch{}}
    if(!raw)return '';
    try{
      const value=JSON.parse(raw),screen=String(value?.screen||''),at=Number(value?.at||0);
      if(!WORKSPACE_ORDER.includes(screen)||!at||Date.now()-at>WORKSPACE_CONTINUITY_MAX_AGE){clearWorkspaceContinuity();return '';}
      return screen;
    }catch{clearWorkspaceContinuity();return '';}
  }
  function navigationButtonFor(screen){
    const index=WORKSPACE_ORDER.indexOf(screen);if(index<0)return null;
    const button=Array.from(document.querySelectorAll('.ta-sidebar-nav .ta-nav-item'))[index];
    return button instanceof HTMLButtonElement?button:null;
  }
  function installWorkspaceContinuity(){
    const wanted=readWorkspaceContinuity(),deadline=Date.now()+12000;
    const settle=()=>{
      const shell=document.querySelector('.workspace-shell');
      if(!(shell instanceof HTMLElement)){if(Date.now()<deadline)window.setTimeout(settle,60);return;}
      const active=currentWorkspace();
      if(wanted&&wanted!=='home'&&active==='home'&&!ROOT.hasAttribute('data-lourex-signing-out'))navigationButtonFor(wanted)?.click();
      window.setTimeout(()=>{
        const liveShell=document.querySelector('.workspace-shell');if(!(liveShell instanceof HTMLElement))return;
        saveWorkspaceContinuity();
        const observer=new MutationObserver(()=>saveWorkspaceContinuity());observer.observe(liveShell,{attributes:true,attributeFilter:['class']});
      },80);
    };
    settle();
    window.addEventListener('pagehide',saveWorkspaceContinuity,{capture:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveWorkspaceContinuity();});
  }

  window.addEventListener('lourex-account-transition-request',guardStaleAccountTransition,true);
  document.addEventListener('click',event=>{
    const target=event.target;if(!(target instanceof Element))return;
    const button=target.closest(UPDATE_BUTTON);if(!(button instanceof HTMLButtonElement)||!unsafeWorkspaceOpen())return;
    event.preventDefault();event.stopImmediatePropagation();explainDeferred(button);
  },true);
  document.addEventListener('click',event=>{
    const target=event.target;if(!(target instanceof Element))return;
    const button=target.closest(SIGNOUT_BUTTON);if(!(button instanceof HTMLButtonElement)||button.disabled)return;
    if(signOutUnsafeWorkspaceOpen()){event.preventDefault();event.stopImmediatePropagation();explainBlockedSignOut(button);return;}
    clearWorkspaceContinuity();
  },true);

  installWorkspaceContinuity();
  try{Object.defineProperty(window,'__LOUREX_UNSAFE_WORKSPACE_OPEN__',{value:unsafeWorkspaceOpen,writable:false,configurable:true});}catch{}
  try{Object.defineProperty(window,'__LOUREX_WORKSPACE_CONTINUITY_V340__',{value:{current:currentWorkspace,save:saveWorkspaceContinuity},writable:false,configurable:true});}catch{}
})();

/* v344 — unified privacy-safe client recorder. This intentionally stores only
   lifecycle/runtime metadata. It never reads invoice/customer/supplier text,
   decrypted document fields, passwords, PINs or attachment contents. */
(()=>{
  'use strict';

  const LOG_KEY='lourex-runtime-diagnostics-v340';
  const META_KEY='lourex-runtime-diagnostics-meta-v340';
  const SNAPSHOT_KEY='lourex-runtime-diagnostics-snapshot-v344';
  const MAX_EVENTS=250;
  const SCREEN_POLL_MS=1000;
  const META_HEARTBEAT_MS=5000;
  const STORAGE_SAMPLE_MS=60000;
  const sessionId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const startedAt=new Date().toISOString();
  let lastScreen='boot';
  let lastMetaHeartbeat=0;
  let lastStorageUsage=-1;
  let authHooked=false;

  const clean=(value,max=220)=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim().slice(0,max);
  const scrub=(value,max=220)=>clean(value,max*2)
    .replace(/data:[^\s)]+/gi,'[data-url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/https?:\/\/[^\s)]+/gi,'[url]')
    .replace(/\b\d{6,}\b/g,'[number]')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g,'[token]')
    .slice(0,max);
  const fileOnly=value=>{try{return clean(String(value||'').split('?')[0].split('#')[0].split('/').pop()||'',90);}catch{return '';}};
  const navigationType=()=>{try{return clean(performance.getEntriesByType?.('navigation')?.[0]?.type||'unknown',32);}catch{return 'unknown';}};
  const standalone=()=>{try{return Boolean(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone);}catch{return false;}};
  const isIos=()=>/iP(?:hone|ad|od)/i.test(navigator.userAgent||'')||(/MacIntel/i.test(navigator.platform||'')&&(navigator.maxTouchPoints||0)>1);

  const currentScreen=()=>{
    try{
      if(document.documentElement.hasAttribute('data-lourex-document-editor')||document.querySelector('.editor-screen'))return 'editor';
      const shell=document.querySelector('.ta-shell,.workspace-shell');
      if(shell instanceof HTMLElement){const match=Array.from(shell.classList).find(name=>name.startsWith('screen-'));if(match)return clean(match.slice(7),48);}
      if(document.querySelector('.auth-page,.ta-auth-page'))return 'auth';
      if(document.querySelector('.loading-screen,#lourex-boot'))return 'loading';
      if(document.querySelector('.app-recovery,.app-recovery-screen'))return 'recovery';
    }catch{}
    return 'unknown';
  };
  const rootState=()=>{
    const root=document.documentElement;
    return {
      editor:root.hasAttribute('data-lourex-document-editor'),
      dirty:root.hasAttribute('data-lourex-workspace-dirty'),
      signingOut:root.hasAttribute('data-lourex-signing-out'),
      booting:root.dataset.lourexBooting==='true',
      iosWebkit:root.dataset.lourexIosWebkit==='true'
    };
  };
  const viewportState=()=>({
    width:Math.round(window.innerWidth||0),height:Math.round(window.innerHeight||0),dpr:Number(window.devicePixelRatio||1),
    visualWidth:Math.round(window.visualViewport?.width||0),visualHeight:Math.round(window.visualViewport?.height||0),scale:Number(window.visualViewport?.scale||1)
  });
  const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}};
  const readLog=()=>{const parsed=readJson(LOG_KEY,[]);return Array.isArray(parsed)?parsed:[];};
  const readMeta=()=>{const parsed=readJson(META_KEY,null);return parsed&&typeof parsed==='object'?parsed:null;};
  const writeMeta=(eventType)=>{
    const state=rootState();
    try{localStorage.setItem(META_KEY,JSON.stringify({sessionId,startedAt,lastSeen:new Date().toISOString(),lastEvent:clean(eventType,64),lastScreen:currentScreen(),visibility:document.visibilityState,online:navigator.onLine!==false,editor:state.editor,dirty:state.dirty,signingOut:state.signingOut}));}catch{}
  };
  const snapshot=()=>{
    const vault=readJson('lourex-active-vault-meta-v341',null),breakdown=readJson('lourex-vault-payload-breakdown-v342',null),runtime=window.__LOUREX_RUNTIME__||{},connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
    return {
      at:new Date().toISOString(),session:sessionId,screen:currentScreen(),visibility:document.visibilityState,online:navigator.onLine!==false,
      nav:navigationType(),standalone:standalone(),ios:isIos(),wasDiscarded:Boolean(document.wasDiscarded),historyLength:Number(history.length)||0,
      path:clean(location.pathname,100),root:rootState(),viewport:viewportState(),hardwareConcurrency:Number(navigator.hardwareConcurrency)||0,deviceMemory:Number(navigator.deviceMemory)||0,
      connection:connection?{effectiveType:clean(connection.effectiveType||'',24),downlink:Number(connection.downlink)||0,rtt:Number(connection.rtt)||0,saveData:Boolean(connection.saveData)}:null,
      runtime:{environment:clean(runtime.environment||'',30),commit:clean(runtime.commitSha||'',40),buildTime:clean(runtime.buildTime||'',50)},
      vault:vault&&typeof vault==='object'?{cipherChars:Number(vault.cipherChars)||0,encryptedBytes:Number(vault.encryptedBytes)||0,measuredAt:clean(vault.measuredAt||'',50)}:null,
      payload:breakdown&&typeof breakdown==='object'?{dataUrlChars:Number(breakdown.strings?.dataUrlChars)||0,dataUrlCount:Number(breakdown.strings?.dataUrlCount)||0,documents:Number(breakdown.collections?.documents)||0,revisions:Number(breakdown.collections?.revisions)||0,measuredAt:clean(breakdown.measuredAt||'',50)}:null
    };
  };
  const writeSnapshot=()=>{try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snapshot()));}catch{}};
  const errorDetail=(error,fallbackName='Error')=>{
    const name=clean(error?.name||fallbackName,48),message=scrub(error?.message||'',160);
    let frames='';
    try{frames=String(error?.stack||'').split('\n').slice(1,4).map(line=>scrub(line.replace(/https?:\/\/[^\s)]+\/([^/\s)]+)/g,'$1'),120)).filter(Boolean).join(' > ');}catch{}
    return `name=${name}${message?` message=${message}`:''}${frames?` stack=${frames}`:''}`;
  };
  const mark=(type,detail='')=>{
    const nowIso=new Date().toISOString(),screen=currentScreen(),safeType=clean(type,64),safeDetail=scrub(detail,280);
    const event={at:nowIso,session:sessionId,type:safeType,screen,visibility:clean(document.visibilityState||'unknown',24),online:navigator.onLine!==false,detail:safeDetail,repeat:1};
    try{
      const log=readLog(),last=log[log.length-1],lastAt=last?.at?Date.parse(last.at):NaN;
      if(last&&last.session===sessionId&&last.type===event.type&&last.screen===event.screen&&last.detail===event.detail&&Number.isFinite(lastAt)&&Date.now()-lastAt<1800){last.at=nowIso;last.repeat=Math.max(1,Number(last.repeat)||1)+1;last.visibility=event.visibility;last.online=event.online;}
      else log.push(event);
      if(log.length>MAX_EVENTS)log.splice(0,log.length-MAX_EVENTS);
      localStorage.setItem(LOG_KEY,JSON.stringify(log));
    }catch{}
    writeMeta(safeType);
    if(['javascript-error','resource-error','unhandled-rejection','navigation-request','pagehide','beforeunload','security-policy-violation'].includes(safeType))writeSnapshot();
    return event;
  };
  const clear=()=>{try{localStorage.removeItem(LOG_KEY);localStorage.removeItem(META_KEY);localStorage.removeItem(SNAPSHOT_KEY);}catch{}};
  const counts=()=>{
    const out={};
    for(const event of readLog())out[event.type]=(out[event.type]||0)+Math.max(1,Number(event.repeat)||1);
    return out;
  };
  const formatEvent=event=>`${event.at||'n/a'} | ${event.type||'unknown'} | screen=${event.screen||'unknown'} | ${event.visibility||'unknown'} | ${event.online===false?'offline':'online'}${Number(event.repeat)>1?` | repeat=${event.repeat}`:''}${event.detail?` | ${event.detail}`:''}`;
  const exportText=()=>[
    'LOUREX v344 unified runtime diagnostics',
    `events=${readLog().length}`,
    `counts=${JSON.stringify(counts())}`,
    `currentMeta=${JSON.stringify(readMeta())}`,
    `snapshot=${JSON.stringify(readJson(SNAPSHOT_KEY,snapshot()))}`,
    'privacy=Runtime/lifecycle metadata only. No invoice/customer/supplier content, passwords, PINs, amounts, attachment contents or decrypted business fields are collected.',
    '',...readLog().map(formatEvent)
  ].join('\n');

  const previous=readMeta();
  if(previous&&previous.sessionId&&previous.sessionId!==sessionId){
    const parsedAt=previous.lastSeen?Date.parse(previous.lastSeen):NaN,age=Number.isFinite(parsedAt)?Math.max(0,Date.now()-parsedAt):NaN;
    mark('previous-session',`last=${clean(previous.lastEvent,48)} screen=${clean(previous.lastScreen,32)} visibility=${clean(previous.visibility,16)} editor=${previous.editor?'yes':'no'} dirty=${previous.dirty?'yes':'no'} ageMs=${Number.isFinite(age)?age:'n/a'}`);
  }

  try{Object.defineProperty(window,'__LOUREX_DIAGNOSTICS__',{configurable:true,value:{version:'v344',sessionId,mark,read:()=>readLog().slice(),meta:()=>readMeta(),snapshot,counts,exportText,clear}});}catch{}
  const markNavigation=(reason,detail='')=>mark('navigation-request',`reason=${clean(reason||'unknown',90)}${detail?` ${scrub(detail,150)}`:''}`);
  try{Object.defineProperty(window,'__LOUREX_MARK_NAVIGATION__',{configurable:true,writable:false,value:markNavigation});}catch{try{window.__LOUREX_MARK_NAVIGATION__=markNavigation;}catch{}}

  const initRuntime=window.__LOUREX_RUNTIME__||{};
  mark('runtime-init',`nav=${navigationType()} standalone=${standalone()?'yes':'no'} ios=${isIos()?'yes':'no'} discarded=${document.wasDiscarded?'yes':'no'} viewport=${window.innerWidth||0}x${window.innerHeight||0} dpr=${window.devicePixelRatio||1} commit=${clean(initRuntime.commitSha||'n/a',16)}`);
  writeSnapshot();

  document.addEventListener('DOMContentLoaded',()=>mark('dom-content-loaded'),{once:true});
  window.addEventListener('load',()=>mark('window-load'),{once:true});
  window.addEventListener('pageshow',event=>mark('pageshow',`persisted=${event.persisted?'yes':'no'} nav=${navigationType()}`));
  window.addEventListener('pagehide',event=>mark('pagehide',`persisted=${event.persisted?'yes':'no'}`));
  window.addEventListener('beforeunload',()=>mark('beforeunload'));
  document.addEventListener('visibilitychange',()=>mark('visibilitychange',document.visibilityState));
  window.addEventListener('focus',()=>mark('window-focus'));
  window.addEventListener('blur',()=>mark('window-blur'));
  window.addEventListener('online',()=>mark('network-online'));
  window.addEventListener('offline',()=>mark('network-offline'));
  window.addEventListener('orientationchange',()=>window.setTimeout(()=>mark('orientation-change',`viewport=${window.innerWidth||0}x${window.innerHeight||0}`),80));
  for(const lifecycle of ['freeze','resume','pageswap','pagereveal'])try{window.addEventListener(lifecycle,event=>mark(`page-${lifecycle}`,event?.persisted!==undefined?`persisted=${event.persisted?'yes':'no'}`:''));}catch{}

  window.addEventListener('error',event=>{
    const target=event.target;
    if(target instanceof HTMLElement&&target!==document.documentElement&&target!==document.body){
      const tag=clean(target.tagName||'resource',24),source=fileOnly(target.getAttribute?.('src')||target.getAttribute?.('href')||'');
      if(source){mark('resource-error',`tag=${tag} source=${source}`);return;}
    }
    mark('javascript-error',`source=${fileOnly(event.filename)||'unknown'} line=${Number(event.lineno)||0}:${Number(event.colno)||0} ${errorDetail(event.error,'Error')}`);
  },true);
  window.addEventListener('unhandledrejection',event=>mark('unhandled-rejection',errorDetail(event.reason,typeof event.reason)));
  document.addEventListener('securitypolicyviolation',event=>mark('security-policy-violation',`directive=${clean(event.violatedDirective||'',60)} blocked=${fileOnly(event.blockedURI)||'unknown'} source=${fileOnly(event.sourceFile)||'unknown'} line=${Number(event.lineNumber)||0}:${Number(event.columnNumber)||0}`));

  try{
    for(const method of ['pushState','replaceState']){
      const original=history[method];
      if(typeof original!=='function')continue;
      history[method]=function(...args){mark(`history-${method}`,args[2]?`target=${scrub(String(args[2]),100)}`:'');return original.apply(this,args);};
    }
  }catch{}
  window.addEventListener('popstate',()=>mark('history-popstate'));
  window.addEventListener('hashchange',()=>mark('history-hashchange'));

  for(const name of ['lourex-cloud-refresh-available','lourex-cloud-applied','lourex-cloud-remote-newer','lourex-cloud-conflict','lourex-account-transition-request','lourex-account-transition-complete','lourex-save-start','lourex-save-success','lourex-save-error','lourex-autosave-start','lourex-autosave-success','lourex-autosave-error'])window.addEventListener(name,event=>mark(name,event instanceof CustomEvent&&event.detail?.stage?`stage=${scrub(event.detail.stage,60)}`:''));

  document.addEventListener('click',event=>{
    const target=event.target;if(!(target instanceof Element))return;
    if(target.closest('[data-lourex-cloud-refresh] button'))mark('user-action','cloud-refresh');
    else if(target.closest('[data-lourex-update] button'))mark('user-action','pwa-update');
    else if(target.closest('.settings-direct-signout-button,.settings-signout-button,.ta-cloud-account-actions button,.ta-sheet-signout'))mark('user-action','signout');
    else if(target.closest('.ta-sidebar-nav .ta-nav-item,.ta-mobile-bottom-nav button'))mark('user-action','workspace-navigation');
  },true);

  try{
    const root=document.documentElement,last={editor:rootState().editor,dirty:rootState().dirty,signingOut:rootState().signingOut,booting:rootState().booting};
    const observer=new MutationObserver(()=>{
      const next=rootState(),changes=[];
      for(const key of ['editor','dirty','signingOut','booting'])if(next[key]!==last[key]){changes.push(`${key}=${next[key]?'on':'off'}`);last[key]=next[key];}
      if(changes.length)mark('workspace-state',changes.join(' '));
    });
    observer.observe(root,{attributes:true,attributeFilter:['data-lourex-document-editor','data-lourex-workspace-dirty','data-lourex-signing-out','data-lourex-booting']});
  }catch{}

  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=>mark('service-worker-controllerchange'));
      void navigator.serviceWorker.getRegistration?.().then(reg=>mark('service-worker-state',reg?(reg.waiting?'waiting':navigator.serviceWorker.controller?'controlled':'registered'):'none')).catch(error=>mark('service-worker-state',`check-failed ${errorDetail(error)}`));
    }
  }catch{}

  const hookFirebaseAuth=()=>{
    if(authHooked)return true;
    try{
      const firebase=window.firebase;if(!firebase?.auth)return false;
      const auth=firebase.auth();if(!auth?.onAuthStateChanged)return false;
      authHooked=true;
      auth.onAuthStateChanged(user=>mark('firebase-auth-state',user?'signed-in':'signed-out'),error=>mark('firebase-auth-state',`observer-error ${errorDetail(error)}`));
      return true;
    }catch{return false;}
  };
  if(!hookFirebaseAuth()){
    let attempts=0;const authTimer=window.setInterval(()=>{attempts+=1;if(hookFirebaseAuth()||attempts>=24)window.clearInterval(authTimer);},250);
  }

  try{
    if(window.PerformanceObserver&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.duration>=120)mark('long-task',`durationMs=${Math.round(entry.duration)}`);});
      observer.observe({entryTypes:['longtask']});
    }
  }catch{}

  const sampleStorage=async()=>{
    if(!navigator.storage?.estimate)return;
    try{
      const estimate=await navigator.storage.estimate(),usage=Math.max(0,Number(estimate.usage)||0),quota=Math.max(0,Number(estimate.quota)||0);
      if(lastStorageUsage<0||Math.abs(usage-lastStorageUsage)>=1024*1024){lastStorageUsage=usage;mark('storage-estimate',`usedMb=${Math.round(usage/104857.6)/10} quotaMb=${Math.round(quota/1048576)}`);}
    }catch(error){mark('storage-estimate',`failed ${errorDetail(error)}`);}
  };
  void sampleStorage();window.setInterval(()=>void sampleStorage(),STORAGE_SAMPLE_MS);

  lastScreen=currentScreen();
  window.setInterval(()=>{
    const screen=currentScreen();
    if(screen!==lastScreen){mark('screen-change',`${lastScreen}->${screen}`);lastScreen=screen;}
    const now=Date.now();
    if(now-lastMetaHeartbeat>=META_HEARTBEAT_MS){lastMetaHeartbeat=now;writeMeta('heartbeat');writeSnapshot();}
  },SCREEN_POLL_MS);
})();
