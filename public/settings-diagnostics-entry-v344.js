(()=>{
  'use strict';

  const LEGACY_NAV_BUTTON_ID='lourex-settings-diagnostics-v345';
  const OVERVIEW_ID='lourex-data-center-overview-v472';
  const CARD_ID='lourex-settings-diagnostics-card-v472';
  const STYLE_ID='lourex-settings-data-center-style-v472';
  const OBSERVER_ID='lourex-settings-data-center-observer-v472';
  const DIAG_LOG_KEY='lourex-runtime-diagnostics-v340';
  const VAULT_META_KEY='lourex-active-vault-meta-v341';

  const isArabic=()=>document.documentElement.dir==='rtl'||document.documentElement.lang==='ar';
  const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback;}catch{return fallback;}};
  const formatBytes=value=>{const bytes=Number(value)||0;if(bytes<=0)return '—';const units=['B','KB','MB','GB'];let size=bytes,index=0;while(size>=1024&&index<units.length-1){size/=1024;index+=1;}return `${size>=10||index===0?size.toFixed(index===0?0:1):size.toFixed(2)} ${units[index]}`;};
  const dataCenterPage=()=>document.querySelector('.ta-settings-shell.is-settings .ta-data-center-page');

  const diagnosticsUrl=()=>{
    try{return new URL('./health.html',window.location.href).href;}
    catch{return './health.html';}
  };

  const markOpen=()=>{try{window.__LOUREX_DIAGNOSTICS__?.mark?.('user-action','data-center-diagnostics-open');}catch{}};
  const openDiagnostics=()=>{
    markOpen();
    const url=diagnosticsUrl();
    try{const opened=window.open(url,'_blank','noopener,noreferrer');if(opened)return;}catch{}
    try{window.location.assign(url);}catch{}
  };

  const selectSettingsTab=id=>{
    const button=document.querySelector(`.ta-settings-shell.is-settings [data-settings-tab="${id}"]`);
    if(button instanceof HTMLButtonElement){button.click();button.focus({preventScroll:true});}
  };

  const ensureStyle=()=>{
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${OVERVIEW_ID},#${CARD_ID}{margin:0 0 16px!important;border:1px solid color-mix(in srgb,currentColor 13%,transparent)!important}
      #${OVERVIEW_ID} .lourex-data-center-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #${OVERVIEW_ID} .lourex-data-center-cell{min-width:0;padding:12px;border:1px solid color-mix(in srgb,currentColor 10%,transparent);border-radius:11px;background:color-mix(in srgb,currentColor 4%,transparent)}
      #${OVERVIEW_ID} .lourex-data-center-cell small{display:block;opacity:.66;font-size:11px;line-height:1.45;margin-bottom:4px}
      #${OVERVIEW_ID} .lourex-data-center-cell strong{display:block;font-size:13px;line-height:1.55;overflow-wrap:anywhere}
      #${OVERVIEW_ID} .lourex-data-center-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      #${OVERVIEW_ID} .lourex-data-center-action,#${CARD_ID} .lourex-diagnostics-action{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
      #${OVERVIEW_ID} .lourex-data-center-action.is-primary,#${CARD_ID} .lourex-diagnostics-action{border-color:transparent;background:var(--ft-accent,#465fff);color:var(--ft-on-accent,#fff)}
      #${CARD_ID} .lourex-diagnostics-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      #${CARD_ID} .lourex-diagnostics-stat{padding:11px 12px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent)}
      #${CARD_ID} .lourex-diagnostics-stat small{display:block;opacity:.65;font-size:11px;margin-bottom:4px}
      #${CARD_ID} .lourex-diagnostics-stat strong{display:block;font-size:14px;direction:ltr;text-align:start}
      #${CARD_ID} .lourex-diagnostics-scope{font-size:12px;line-height:1.65;opacity:.78;margin:0 0 14px}
      @media(max-width:720px){#${OVERVIEW_ID} .lourex-data-center-grid,#${CARD_ID} .lourex-diagnostics-summary{grid-template-columns:1fr}#${OVERVIEW_ID} .lourex-data-center-actions{display:grid;grid-template-columns:1fr}#${OVERVIEW_ID} .lourex-data-center-action,#${CARD_ID} .lourex-diagnostics-action{width:100%}}
    `;
    document.head.appendChild(style);
  };

  const updateOverview=card=>{
    const ar=isArabic();
    const vault=readJson(VAULT_META_KEY,null);
    const values={
      architecture:ar?'شركة → فرع → سجلات تشغيلية':'Company → branch → operational ledgers',
      protection:ar?'خزنة محلية مشفّرة':'Encrypted local vault',
      vault:vault?formatBytes(vault.encryptedBytes):'—',
      recovery:ar?'من الأمان والاستعادة':'Security & Recovery'
    };
    const labels=card.querySelectorAll('[data-data-center-label]');
    const stats=card.querySelectorAll('[data-data-center-value]');
    const labelText=ar?['عزل البيانات','الحماية المحلية','حجم الخزنة النشطة','الاستعادة والحماية']:['Data isolation','Local protection','Active vault size','Recovery & protection'];
    labels.forEach((node,index)=>{node.textContent=labelText[index]||'';});
    [values.architecture,values.protection,values.vault,values.recovery].forEach((value,index)=>{if(stats[index])stats[index].textContent=value;});
    const title=card.querySelector('[data-data-center-title]');
    const description=card.querySelector('[data-data-center-description]');
    if(title)title.textContent=ar?'مركز التحكم بالبيانات':'Data control center';
    if(description)description.textContent=ar?'نقطة واحدة لفهم مكان البيانات وعزلها والوصول إلى أدوات الإدارة الأصلية دون إنشاء نسخ مكررة من السجلات أو الإعدادات.':'One place to understand data scope and reach the canonical management tools without duplicating ledgers or settings.';
    const workspaces=card.querySelector('[data-data-center-workspaces]');
    const security=card.querySelector('[data-data-center-security]');
    if(workspaces)workspaces.textContent=ar?'الشركات والفروع':'Companies & Branches';
    if(security)security.textContent=ar?'الأمان والاستعادة':'Security & Recovery';
  };

  const updateDiagnostics=card=>{
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
    if(title)title.textContent=ar?'التشخيص وصحة النظام':'Diagnostics & system health';
    if(description)description.textContent=ar?'تم نقل أدوات التشخيص إلى مركز البيانات بدل إضافة قسم جانبي مستقل.':'Diagnostics now live inside Data Center instead of creating another Settings section.';
    if(eventsLabel)eventsLabel.textContent=ar?'أحداث التشغيل':'Runtime events';
    if(eventsValue)eventsValue.textContent=String(events);
    if(vaultLabel)vaultLabel.textContent=ar?'الخزنة النشطة':'Active vault';
    if(vaultValue)vaultValue.textContent=vault?formatBytes(vault.encryptedBytes):'—';
    if(scope)scope.textContent=ar?'يشمل دورة حياة الصفحة، أخطاء JavaScript وPromise، Auth/Firebase، التنقل والحفظ، Vault/Crypto، IndexedDB، التخزين، السحابة وService Worker. لا يسجل محتوى الأعمال أو PIN.':'Includes page lifecycle, JavaScript/Promise errors, Auth/Firebase, navigation/save state, Vault/Crypto, IndexedDB, storage, cloud and Service Worker. No business content or PIN is recorded.';
    if(action)action.textContent=ar?'فتح التشخيص الشامل':'Open full diagnostics';
  };

  const ensureDataCenterCards=()=>{
    const page=dataCenterPage();
    if(!(page instanceof HTMLElement)){
      document.getElementById(OVERVIEW_ID)?.remove();
      document.getElementById(CARD_ID)?.remove();
      return;
    }
    let overview=document.getElementById(OVERVIEW_ID);
    if(!(overview instanceof HTMLElement)){
      overview=document.createElement('section');
      overview.id=OVERVIEW_ID;
      overview.className='ta-settings-card lourex-data-center-overview';
      overview.innerHTML=`<header><div><h4 data-data-center-title></h4><p data-data-center-description></p></div></header><div class="ta-settings-card-body"><div class="lourex-data-center-grid">${Array.from({length:4},()=>'<div class="lourex-data-center-cell"><small data-data-center-label></small><strong data-data-center-value></strong></div>').join('')}</div><div class="lourex-data-center-actions"><button type="button" class="lourex-data-center-action is-primary" data-data-center-workspaces></button><button type="button" class="lourex-data-center-action" data-data-center-security></button></div></div>`;
      overview.querySelector('[data-data-center-workspaces]')?.addEventListener('click',()=>selectSettingsTab('workspaces'));
      overview.querySelector('[data-data-center-security]')?.addEventListener('click',()=>selectSettingsTab('security'));
    }
    let diagnostics=document.getElementById(CARD_ID);
    if(!(diagnostics instanceof HTMLElement)){
      diagnostics=document.createElement('section');
      diagnostics.id=CARD_ID;
      diagnostics.className='ta-settings-card lourex-settings-diagnostics-card';
      diagnostics.innerHTML=`<header><div><h4 data-diag-title></h4><p data-diag-description></p></div></header><div class="ta-settings-card-body"><div class="lourex-diagnostics-summary"><div class="lourex-diagnostics-stat"><small data-diag-events-label></small><strong data-diag-events-value>0</strong></div><div class="lourex-diagnostics-stat"><small data-diag-vault-label></small><strong data-diag-vault-value>—</strong></div></div><p class="lourex-diagnostics-scope" data-diag-scope></p><button type="button" class="lourex-diagnostics-action" data-diag-action></button></div>`;
      diagnostics.querySelector('[data-diag-action]')?.addEventListener('click',openDiagnostics);
    }
    const header=page.querySelector('.ta-settings-page-header');
    const activity=page.querySelector('.ta-settings-card');
    if(overview.parentElement!==page){overview.remove();if(header?.parentNode===page)header.insertAdjacentElement('afterend',overview);else page.prepend(overview);}
    if(diagnostics.parentElement!==page){diagnostics.remove();if(activity?.parentNode===page)activity.insertAdjacentElement('afterend',diagnostics);else page.append(diagnostics);}
    updateOverview(overview);
    updateDiagnostics(diagnostics);
  };

  const removeLegacyDiagnosticsNav=()=>document.getElementById(LEGACY_NAV_BUTTON_ID)?.remove();

  let scheduled=false;
  const refresh=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      ensureStyle();
      removeLegacyDiagnosticsNav();
      ensureDataCenterCards();
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

(()=>{
  'use strict';

  const STYLE_ID='lourex-cloud-refresh-data-center-style-v472';
  const NOTICE_ID='lourex-cloud-refresh-data-center-v472';
  const FLOATING_SELECTOR='[data-lourex-cloud-refresh]';
  const ROOT_FLAG='lourexCloudRefreshAvailable';
  let available=false;
  let scheduled=false;

  const isArabic=()=>document.documentElement.dir==='rtl'||document.documentElement.lang==='ar';
  const setAvailable=value=>{available=Boolean(value);try{if(available)document.documentElement.dataset[ROOT_FLAG]='true';else delete document.documentElement.dataset[ROOT_FLAG];}catch{}};
  const selectSecurity=()=>{const button=document.querySelector('.ta-settings-shell.is-settings [data-settings-tab="security"]');if(button instanceof HTMLButtonElement)button.click();};

  const ensureStyle=()=>{
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      ${FLOATING_SELECTOR}{display:none!important}
      #${NOTICE_ID}{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin:0 0 14px;padding:12px 13px;border:1px solid color-mix(in srgb,#7399E3 38%,transparent);border-radius:10px;background:color-mix(in srgb,#7399E3 9%,transparent)}
      #${NOTICE_ID} strong{display:block;font-size:13px;line-height:1.45}
      #${NOTICE_ID} small{display:block;font-size:11px;line-height:1.65;opacity:.78}
      #${NOTICE_ID} button{min-height:42px;padding:0 12px;border-radius:9px;border:0;background:var(--ft-accent,#465fff);color:var(--ft-on-accent,#fff);font:inherit;font-weight:700;cursor:pointer}
      @media(max-width:620px){#${NOTICE_ID}{grid-template-columns:1fr}#${NOTICE_ID} button{width:100%}}
    `;
    (document.head||document.documentElement).appendChild(style);
  };

  const removeFloating=()=>document.querySelectorAll(FLOATING_SELECTOR).forEach(node=>node.remove());

  const renderDataCenterNotice=()=>{
    const current=document.getElementById(NOTICE_ID);
    if(!available){current?.remove();return;}
    const page=document.querySelector('.ta-settings-shell.is-settings .ta-data-center-page');
    if(!(page instanceof HTMLElement)){current?.remove();return;}
    let notice=current;
    if(!(notice instanceof HTMLElement)){
      notice=document.createElement('div');
      notice.id=NOTICE_ID;
      notice.setAttribute('data-lourex-cloud-refresh-data-center','true');
      notice.setAttribute('role','status');
      notice.setAttribute('aria-live','polite');
      notice.innerHTML='<div><strong data-cloud-refresh-title></strong><small data-cloud-refresh-detail></small></div><button type="button" data-cloud-refresh-action></button>';
      notice.querySelector('[data-cloud-refresh-action]')?.addEventListener('click',selectSecurity);
    }
    const ar=isArabic();
    const title=notice.querySelector('[data-cloud-refresh-title]');
    const detail=notice.querySelector('[data-cloud-refresh-detail]');
    const action=notice.querySelector('[data-cloud-refresh-action]');
    if(title)title.textContent=ar?'توجد نسخة سحابية أحدث':'Newer cloud copy available';
    if(detail)detail.textContent=ar?'مركز البيانات هو نقطة التنبيه. تنفيذ الاستعادة الحساسة يبقى داخل الأمان والاستعادة حتى لا تتكرر منطقـة الاسترجاع.':'Data Center owns the notice. The sensitive restore action stays in Security & Recovery so restore logic is not duplicated.';
    if(action)action.textContent=ar?'فتح الأمان والاستعادة':'Open Security & Recovery';
    const header=page.querySelector('.ta-settings-page-header');
    if(notice.parentElement!==page){notice.remove();if(header?.parentNode===page)header.insertAdjacentElement('afterend',notice);else page.prepend(notice);}
  };

  const sync=()=>{ensureStyle();removeFloating();renderDataCenterNotice();};
  const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync();});};

  window.addEventListener('lourex-cloud-refresh-available',()=>{setAvailable(true);schedule();});
  window.addEventListener('lourex-cloud-applied',()=>{setAvailable(false);schedule();});

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['dir','lang','class']});
  ensureStyle();
  sync();
})();