;(function(){
  'use strict';

  var ATTEMPT_KEY='lourex-startup-recovery-v321';
  var CHECK_MS=9000;
  var CACHE_PREFIX='lourex-invoice-';

  function bootStillVisible(){
    return Boolean(document.getElementById('lourex-boot'))&&!document.querySelector('.app-ui,.auth-page,.app-recovery-screen');
  }

  function currentAttempt(){
    try{return Number(sessionStorage.getItem(ATTEMPT_KEY)||'0')||0;}catch(_error){return 0;}
  }

  function markAttempt(value){
    try{sessionStorage.setItem(ATTEMPT_KEY,String(value));}catch(_error){}
  }

  function clearAttempt(){
    try{sessionStorage.removeItem(ATTEMPT_KEY);}catch(_error){}
  }

  function themedBackground(){
    try{return document.documentElement.dataset.uiTheme==='light'?'#f9fafb':'#0c111d';}catch(_error){return '#0c111d';}
  }

  function themedText(){
    try{return document.documentElement.dataset.uiTheme==='light'?'#101828':'#f9fafb';}catch(_error){return '#f9fafb';}
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

  function buildButton(label,handler){
    var button=document.createElement('button');
    button.type='button';
    button.textContent=label;
    button.style.minHeight='44px';
    button.style.padding='0 16px';
    button.style.borderRadius='10px';
    button.style.border='1px solid #465fff';
    button.style.background='#465fff';
    button.style.color='#fff';
    button.style.font='600 14px Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    button.addEventListener('click',handler);
    return button;
  }

  function showRecovery(){
    if(!bootStillVisible())return;
    var root=document.getElementById('root');
    if(!root)return;

    var screen=document.createElement('div');
    screen.className='app-recovery-screen';
    screen.setAttribute('role','alert');
    screen.style.position='fixed';
    screen.style.inset='0';
    screen.style.zIndex='2147483001';
    screen.style.display='flex';
    screen.style.alignItems='center';
    screen.style.justifyContent='center';
    screen.style.padding='24px';
    screen.style.boxSizing='border-box';
    screen.style.background=themedBackground();
    screen.style.color=themedText();
    screen.style.fontFamily='Outfit,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

    var card=document.createElement('div');
    card.style.width='min(100%,460px)';
    card.style.padding='24px';
    card.style.border='1px solid rgba(152,162,179,.28)';
    card.style.borderRadius='16px';
    card.style.background=document.documentElement.dataset.uiTheme==='light'?'#ffffff':'#161b26';
    card.style.boxShadow='0 12px 32px rgba(16,24,40,.18)';

    var title=document.createElement('h1');
    title.textContent='LOUREX startup did not finish';
    title.style.margin='0 0 8px';
    title.style.fontSize='20px';
    title.style.lineHeight='1.35';

    var message=document.createElement('p');
    message.textContent='The application startup is taking too long. Your encrypted local data was not deleted or reset. / استغرق تشغيل LOUREX وقتاً أطول من المتوقع. لم يتم حذف أو تصفير بياناتك المحلية المشفّرة.';
    message.style.margin='0 0 18px';
    message.style.fontSize='14px';
    message.style.lineHeight='1.7';
    message.style.opacity='.8';

    var actions=document.createElement('div');
    actions.style.display='flex';
    actions.style.flexWrap='wrap';
    actions.style.gap='10px';

    actions.appendChild(buildButton('Retry / إعادة المحاولة',function(){
      clearAttempt();
      window.location.replace(retryUrl());
    }));

    var diagnostics=document.createElement('a');
    diagnostics.href='./health.html';
    diagnostics.textContent='Diagnostics / التشخيص';
    diagnostics.style.minHeight='44px';
    diagnostics.style.display='inline-flex';
    diagnostics.style.alignItems='center';
    diagnostics.style.justifyContent='center';
    diagnostics.style.padding='0 16px';
    diagnostics.style.border='1px solid rgba(152,162,179,.45)';
    diagnostics.style.borderRadius='10px';
    diagnostics.style.color='inherit';
    diagnostics.style.textDecoration='none';
    diagnostics.style.fontWeight='600';

    actions.appendChild(diagnostics);
    card.append(title,message,actions);
    screen.appendChild(card);
    root.replaceChildren(screen);
    try{delete document.documentElement.dataset.lourexBooting;document.documentElement.style.removeProperty('--boot-bg');}catch(_error){}
  }

  async function recoverIfNeeded(){
    if(!bootStillVisible()){clearAttempt();return;}
    var attempt=currentAttempt();
    if(attempt<1){
      markAttempt(1);
      await refreshStaticRuntime();
      if(!bootStillVisible()){clearAttempt();return;}
      window.location.replace(retryUrl());
      return;
    }
    showRecovery();
  }

  window.setTimeout(function(){void recoverIfNeeded();},CHECK_MS);
})();
