(()=>{
  'use strict';

  const BUTTON_ID='lourex-settings-diagnostics-v344';
  const OBSERVER_ID='lourex-settings-diagnostics-observer-v344';

  const isArabic=()=>document.documentElement.dir==='rtl'||document.documentElement.lang==='ar';

  const diagnosticsUrl=()=>{
    try{return new URL('./health.html',window.location.href).href;}
    catch{return './health.html';}
  };

  const markOpen=()=>{
    try{window.__LOUREX_DIAGNOSTICS__?.mark?.('user-action','settings-diagnostics-open');}catch{}
  };

  const openDiagnostics=()=>{
    markOpen();
    const url=diagnosticsUrl();
    try{
      const opened=window.open(url,'_blank','noopener,noreferrer');
      if(opened)return;
    }catch{}
    try{window.location.href=url;}catch{}
  };

  const iconMarkup=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M4 17.5h2.6l2.05-5.15 3.1 7.15 2.45-5.1 1.25 3.1H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4.75h14a1.25 1.25 0 0 1 1.25 1.25v12A1.25 1.25 0 0 1 19 19.25H5A1.25 1.25 0 0 1 3.75 18V6A1.25 1.25 0 0 1 5 4.75Z" stroke="currentColor" stroke-width="1.5"/></svg>`;

  const ensureButton=()=>{
    const nav=document.querySelector('.ta-settings-nav');
    if(!(nav instanceof HTMLElement))return;
    let button=document.getElementById(BUTTON_ID);
    const ar=isArabic();
    if(!(button instanceof HTMLButtonElement)){
      button=document.createElement('button');
      button.id=BUTTON_ID;
      button.type='button';
      button.className='lourex-settings-diagnostics-entry';
      button.innerHTML=`<span class="ta-settings-nav-icon">${iconMarkup}</span><span><strong></strong><small></small></span>`;
      button.addEventListener('click',openDiagnostics);
      nav.appendChild(button);
    }
    const strong=button.querySelector('strong');
    const small=button.querySelector('small');
    if(strong)strong.textContent=ar?'التشخيص':'Diagnostics';
    if(small)small.textContent=ar?'صحة النظام والتقرير الكامل':'System health & full report';
    button.setAttribute('aria-label',ar?'فتح التشخيص الشامل':'Open unified diagnostics');
  };

  const install=()=>{
    ensureButton();
    if(window[OBSERVER_ID])return;
    const observer=new MutationObserver(()=>ensureButton());
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['dir','lang']});
    try{Object.defineProperty(window,OBSERVER_ID,{value:observer,configurable:true});}catch{window[OBSERVER_ID]=observer;}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
