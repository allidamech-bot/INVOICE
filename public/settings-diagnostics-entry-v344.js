(()=>{
  'use strict';

  const NAV_BUTTON_ID='lourex-settings-diagnostics-v345';
  const CARD_ID='lourex-settings-diagnostics-card-v345';
  const STYLE_ID='lourex-settings-diagnostics-style-v345';
  const OBSERVER_ID='lourex-settings-diagnostics-observer-v345';
  const DIAG_LOG_KEY='lourex-runtime-diagnostics-v340';
  const VAULT_META_KEY='lourex-active-vault-meta-v341';

  const isArabic=()=>document.documentElement.dir==='rtl'||document.documentElement.lang==='ar';
  const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}};
  const formatBytes=value=>{const bytes=Number(value)||0;if(bytes<=0)return '—';const units=['B','KB','MB','GB'];let size=bytes,index=0;while(size>=1024&&index<units.length-1){size/=1024;index+=1;}return `${size>=10||index===0?size.toFixed(index===0?0:1):size.toFixed(2)} ${units[index]}`;};

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
    try{window.location.assign(url);}catch{}
  };

  const iconMarkup=`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M4 17.5h2.6l2.05-5.15 3.1 7.15 2.45-5.1 1.25 3.1H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4.75h14a1.25 1.25 0 0 1 1.25 1.25v12A1.25 1.25 0 0 1 19 19.25H5A1.25 1.25 0 0 1 3.75 18V6A1.25 1.25 0 0 1 5 4.75Z" stroke="currentColor" stroke-width="1.5"/></svg>`;

  const ensureStyle=()=>{
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${CARD_ID}{margin:0 0 16px!important;border:1px solid color-mix(in srgb,currentColor 13%,transparent)!important}
      #${CARD_ID} .lourex-diagnostics-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      #${CARD_ID} .lourex-diagnostics-stat{padding:11px 12px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent)}
      #${CARD_ID} .lourex-diagnostics-stat small{display:block;opacity:.65;font-size:11px;margin-bottom:4px}
      #${CARD_ID} .lourex-diagnostics-stat strong{display:block;font-size:14px;direction:ltr;text-align:start}
      #${CARD_ID} .lourex-diagnostics-scope{font-size:12px;line-height:1.65;opacity:.78;margin:0 0 14px}
      #${CARD_ID} .lourex-diagnostics-action{min-height:44px;padding:0 16px;border-radius:9px;border:0;background:#465fff;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      #${NAV_BUTTON_ID}{scroll-margin-inline:12px}
      @media(max-width:720px){#${CARD_ID} .lourex-diagnostics-summary{grid-template-columns:1fr 1fr}#${CARD_ID}{margin-top:0!important}}
    `;
    document.head.appendChild(style);
  };

  const updateCardText=card=>{
    const ar=isArabic();
    const log=readJson(DIAG_LOG_KEY,[]);
    const vault=readJson(VAULT_META_KEY,null);
    const events=Array.isArray(log)?log.reduce((sum,event)=>sum+Math.max(1,Number(event?.repeat)||1),0):0;
    const title=card.querySelector('[data-diag-title]');
    const description=card.querySelector('[data-diag-description]');
    const eventsLabel=card.querySelector('[data-diag-events-label]');
    const eventsValue=card.querySelector('[data-diag-events-value]');
    const vaultLabel=card.querySelector('[data-diag-vault-label]');
    const vaultValue=card.querySelector('[data-diag-vault-value]');
    const scope=card.querySelector('[data-diag-scope]');
    const action=card.querySelector('[data-diag-action]');
    if(title)title.textContent=ar?'التشخيص والفحص الشامل':'Diagnostics & system health';
    if(description)description.textContent=ar?'كل أدوات الفحص التي أضفناها مجمعة هنا في تقرير واحد.':'All diagnostic tools are collected here in one report.';
    if(eventsLabel)eventsLabel.textContent=ar?'أحداث التشغيل':'Runtime events';
    if(eventsValue)eventsValue.textContent=String(events);
    if(vaultLabel)vaultLabel.textContent=ar?'الخزنة النشطة':'Active vault';
    if(vaultValue)vaultValue.textContent=vault?formatBytes(vault.encryptedBytes):'—';
    if(scope)scope.textContent=ar?'يشمل Safari ودورة حياة الصفحة، JavaScript وPromise، Auth/Firebase، التنقل وإعادة التحميل، المحرر والحفظ، Vault/Crypto، IndexedDB، التخزين، السحابة وService Worker. لا يسجل محتوى أعمالك أو PIN.':'Includes Safari lifecycle, JavaScript/Promise errors, Auth/Firebase, navigation/reloads, editor/save state, Vault/Crypto, IndexedDB, storage, cloud and Service Worker. No business content or PIN is recorded.';
    if(action)action.textContent=ar?'فتح التشخيص الشامل ونسخ التقرير':'Open full diagnostics & copy report';
  };

  const ensureCard=()=>{
    const shell=document.querySelector('.ta-settings-shell.is-settings');
    if(!(shell instanceof HTMLElement))return;
    const page=shell.querySelector('.ta-settings-content > .ta-settings-page');
    if(!(page instanceof HTMLElement))return;
    let card=document.getElementById(CARD_ID);
    if(!(card instanceof HTMLElement)){
      card=document.createElement('section');
      card.id=CARD_ID;
      card.className='ta-settings-card lourex-settings-diagnostics-card';
      card.innerHTML=`<header><div><h4 data-diag-title></h4><p data-diag-description></p></div></header><div class="ta-settings-card-body"><div class="lourex-diagnostics-summary"><div class="lourex-diagnostics-stat"><small data-diag-events-label></small><strong data-diag-events-value>0</strong></div><div class="lourex-diagnostics-stat"><small data-diag-vault-label></small><strong data-diag-vault-value>—</strong></div></div><p class="lourex-diagnostics-scope" data-diag-scope></p><button type="button" class="lourex-diagnostics-action" data-diag-action></button></div>`;
      card.querySelector('[data-diag-action]')?.addEventListener('click',openDiagnostics);
      const header=page.querySelector('.ta-settings-page-header');
      if(header?.parentNode===page)header.insertAdjacentElement('afterend',card);
      else page.prepend(card);
    }else if(card.parentElement!==page){
      card.remove();
      const header=page.querySelector('.ta-settings-page-header');
      if(header?.parentNode===page)header.insertAdjacentElement('afterend',card);
      else page.prepend(card);
    }
    updateCardText(card);
  };

  const ensureNavButton=()=>{
    const nav=document.querySelector('.ta-settings-shell.is-settings .ta-settings-nav');
    if(!(nav instanceof HTMLElement))return;
    let button=document.getElementById(NAV_BUTTON_ID);
    const ar=isArabic();
    if(!(button instanceof HTMLButtonElement)){
      button=document.createElement('button');
      button.id=NAV_BUTTON_ID;
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

  let scheduled=false;
  const refresh=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      ensureStyle();
      ensureNavButton();
      ensureCard();
    });
  };

  const install=()=>{
    refresh();
    if(window[OBSERVER_ID])return;
    const observer=new MutationObserver(refresh);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['dir','lang','class']});
    window.setInterval(()=>{if(document.querySelector('.ta-settings-shell.is-settings'))refresh();},3000);
    try{Object.defineProperty(window,OBSERVER_ID,{value:observer,configurable:true});}catch{window[OBSERVER_ID]=observer;}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();