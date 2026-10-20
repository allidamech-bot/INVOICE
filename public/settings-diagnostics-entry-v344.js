(()=>{
  'use strict';
  const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};

  const LEGACY_NAV_BUTTON_ID='lourex-settings-diagnostics-v345';
  const OVERVIEW_ID='lourex-data-center-overview-v472';
  const CARD_ID='lourex-settings-diagnostics-card-v472';
  const PROVIDER_CARD_ID='lourex-owner-ai-provider-tests-v1';
  const PROVIDERS=[['groq','Groq'],['cloudflare','Cloudflare'],['gemini','Gemini'],['kilo','Kilo Gateway']];
  const probeResults=Object.create(null);
  let probeBusy=false;
  const STYLE_ID='lourex-settings-data-center-style-v472';
  const OBSERVER_ID='lourex-settings-data-center-observer-v472';
  const DIAG_LOG_KEY='lourex-runtime-diagnostics-v340';
  let ownerDiagnosticsAllowed=false,ownerAuthWatcherInstalled=false,ownerAccessEpoch=0;
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
      #${OVERVIEW_ID} .lourex-data-center-action,#${CARD_ID} .lourex-diagnostics-action,#${PROVIDER_CARD_ID} .lourex-diagnostics-action{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
      #${OVERVIEW_ID} .lourex-data-center-action.is-primary,#${CARD_ID} .lourex-diagnostics-action{border-color:transparent;background:var(--ft-accent,#465fff);color:var(--ft-on-accent,#fff)}
      #${CARD_ID} .lourex-diagnostics-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      #${CARD_ID} .lourex-diagnostics-stat{padding:11px 12px;border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent)}
      #${CARD_ID} .lourex-diagnostics-stat small{display:block;opacity:.65;font-size:11px;margin-bottom:4px}
      #${CARD_ID} .lourex-diagnostics-stat strong{display:block;font-size:14px;direction:ltr;text-align:start}
      #${CARD_ID} .lourex-diagnostics-scope{font-size:12px;line-height:1.65;opacity:.78;margin:0 0 14px}
      @media(max-width:720px){#${OVERVIEW_ID} .lourex-data-center-grid,#${CARD_ID} .lourex-diagnostics-summary{grid-template-columns:1fr}#${OVERVIEW_ID} .lourex-data-center-actions{display:grid;grid-template-columns:1fr}#${OVERVIEW_ID} .lourex-data-center-action,#${CARD_ID} .lourex-diagnostics-action,#${PROVIDER_CARD_ID} .lourex-diagnostics-action{width:100%}}
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
    labels.forEach((node,index)=>{setText(node,labelText[index]||'');});
    [values.architecture,values.protection,values.vault,values.recovery].forEach((value,index)=>{setText(stats[index],value);});
    const title=card.querySelector('[data-data-center-title]');
    const description=card.querySelector('[data-data-center-description]');
    setText(title,ar?'مركز التحكم بالبيانات':'Data control center');
    setText(description,ar?'نقطة واحدة لفهم مكان البيانات وعزلها والوصول إلى أدوات الإدارة الأصلية دون إنشاء نسخ مكررة من السجلات أو الإعدادات.':'One place to understand data scope and reach the canonical management tools without duplicating ledgers or settings.');
    const workspaces=card.querySelector('[data-data-center-workspaces]');
    const security=card.querySelector('[data-data-center-security]');
    setText(workspaces,ar?'الشركات والفروع':'Companies & Branches');
    setText(security,ar?'الأمان والاستعادة':'Security & Recovery');
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
    setText(title,ar?'التشخيص وصحة النظام':'Diagnostics & system health');
    setText(description,ar?'تم نقل أدوات التشخيص إلى مركز البيانات بدل إضافة قسم جانبي مستقل.':'Diagnostics now live inside Data Center instead of creating another Settings section.');
    setText(eventsLabel,ar?'أحداث التشغيل':'Runtime events');
    setText(eventsValue,String(events));
    setText(vaultLabel,ar?'التخزين المشفر القديم':'Legacy encrypted cache');
    setText(vaultValue,vault?formatBytes(vault.encryptedBytes):'—');
    setText(scope,ar?'يشمل دورة حياة الصفحة، أخطاء JavaScript وPromise، Auth/Firebase، التنقل والحفظ، Vault/Crypto، IndexedDB، التخزين، السحابة وService Worker. لا يسجل محتوى الأعمال أو كلمات المرور أو رموز تسجيل الدخول.':'Includes page lifecycle, JavaScript/Promise errors, Auth/Firebase, navigation/save state, Vault/Crypto, IndexedDB, storage, cloud and Service Worker. No business content, passwords or account tokens are recorded.');
    setText(action,ar?'فتح التشخيص الشامل':'Open full diagnostics');
  };

  const statusCopy=(status,ar)=>({
    running:ar?'جارٍ الفحص':'Testing',
    passed:ar?'نجح الاتصال والحساب':'Connection and calculation passed',
    incorrect_answer:ar?'اتصل، لكن نتيجة الحساب غير صحيحة':'Connected, incorrect arithmetic answer',
    not_configured:ar?'المفتاح غير مضبوط':'Key not configured',
    unauthorized:ar?'المفتاح مرفوض':'Credential rejected',
    payment_required:ar?'يتطلب رصيدًا مدفوعًا — لم نتابع':'Paid balance required — stopped',
    model_unavailable:ar?'النموذج غير متاح':'Model unavailable',
    rate_limited:ar?'حد الطلبات مستنفد':'Rate limit reached',
    timeout:ar?'انتهت المهلة':'Timed out',
    request_failed:ar?'رفض الطلب':'Request rejected',
    invalid_provider:ar?'مزوّد غير معروف':'Unknown provider',
    connection_failed:ar?'فشل الاتصال':'Connection failed'
  }[status]||(ar?'لم يُختبر':'Not tested'));
  const refreshProbeCard=()=>{
    const card=document.getElementById(PROVIDER_CARD_ID);
    if(!(card instanceof HTMLElement))return;
    const ar=isArabic();
    setText(card.querySelector('[data-ai-title]'),ar?'اختبار مزوّدي الذكاء الاصطناعي':'AI provider connectivity tests');
    setText(card.querySelector('[data-ai-desc]'),ar?'اختبارات يدوية منفصلة باستخدام بيانات حسابية وهمية فقط، دون بيانات العملاء أو تبديل المزوّد تلقائيًا.':'Manual, isolated tests using synthetic arithmetic only. No customer data and no automatic provider fallback.');
    setText(card.querySelector('[data-ai-warning]'),ar?'تنبيه: قد يحتفظ مزوّدو Kilo المجانيون بمحتوى الطلبات؛ لا ترسل معلومات سرية.':'Warning: Free Kilo backends may retain prompt content; never submit private information.');
    for(const [id] of PROVIDERS){
      const row=card.querySelector('[data-ai-provider="'+id+'"]');
      if(!row)continue;
      const result=probeResults[id];
      setText(row.querySelector('[data-ai-result]'),statusCopy(result?.status,ar)+(result?.latencyMs?' · '+result.latencyMs+' ms':''));
      const button=row.querySelector('button');
      if(button){button.disabled=probeBusy;setText(button,ar?'اختبار':'Test');}
    }
  };
  const runProbe=async provider=>{
    if(!ownerDiagnosticsAllowed||probeBusy||!PROVIDERS.some(p=>p[0]===provider))return;
    probeBusy=true;
    probeResults[provider]={status:'running'};
    refreshProbeCard();
    try{
      const user=window.firebase?.auth?.().currentUser;
      if(!user)throw Error('No authenticated account');
      const uid=user.uid,token=await user.getIdToken();
      const response=await fetch('/api/ai-core',{
        method:'POST',cache:'no-store',
        headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','X-Requested-With':'LOUREX-Invoice','X-Lourex-Admin-Diagnostics':'provider-probe'},
        body:JSON.stringify({provider}),signal:AbortSignal.timeout(11000)
      });
      if(window.firebase?.auth?.().currentUser?.uid!==uid)return;
      const result=await response.json();
      if(response.status===403){ownerDiagnosticsAllowed=false;probeResults[provider]={status:'connection_failed'};refresh();return;}
      probeResults[provider]=response.ok&&typeof result.status==='string'?
        {status:result.status,latencyMs:Number(result.latencyMs)||0}:{status:response.status===429?'rate_limited':'request_failed'};
    }catch{probeResults[provider]={status:'connection_failed'};}
    finally{probeBusy=false;refreshProbeCard();}
  };
  const ensureProbeCard=page=>{
    let card=document.getElementById(PROVIDER_CARD_ID);
    if(!(card instanceof HTMLElement)){
      card=document.createElement('section');
      card.id=PROVIDER_CARD_ID;card.className='ta-settings-card lourex-ai-provider-diagnostics';
      card.innerHTML='<header><div><h4 data-ai-title></h4><p data-ai-desc></p></div></header><div class="ta-settings-card-body"><div data-ai-rows></div><p class="lourex-diagnostics-scope" data-ai-warning></p></div>';
      const rows=card.querySelector('[data-ai-rows]');
      for(const [id,name] of PROVIDERS){
        const row=document.createElement('div');row.dataset.aiProvider=id;row.className='lourex-diagnostics-stat';
        row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:9px;padding:12px;border:1px solid var(--ft-line,#303030);border-radius:10px';
        const label=document.createElement('strong');label.textContent=name;label.style.cssText='flex:1;min-width:90px';
        const result=document.createElement('small');result.dataset.aiResult='';result.style.cssText='flex:2;min-width:135px';
        const button=document.createElement('button');button.type='button';button.className='lourex-diagnostics-action';button.addEventListener('click',()=>void runProbe(id));
        row.append(label,result,button);rows.append(row);
      }
    }
    if(card.parentElement!==page){card.remove();page.append(card);}
    refreshProbeCard();
  };
  const ensureDataCenterCards=()=>{
    const page=dataCenterPage();
    if(!(page instanceof HTMLElement)){
      document.getElementById(OVERVIEW_ID)?.remove();
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(PROVIDER_CARD_ID)?.remove();
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
    if(!ownerDiagnosticsAllowed){
      document.getElementById(CARD_ID)?.remove();
      document.getElementById(PROVIDER_CARD_ID)?.remove();
      updateOverview(overview);
      return;
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
    ensureProbeCard(page);
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

  const installOwnerWatcher=()=>{
    if(ownerAuthWatcherInstalled)return;
    const fb=window.firebase;
    if(!fb?.apps?.length||typeof fb.auth!=='function')return;
    try{
      ownerAuthWatcherInstalled=true;
      fb.auth().onAuthStateChanged(async user=>{
        const epoch=++ownerAccessEpoch;
        ownerDiagnosticsAllowed=false;
        refresh();
        if(!user||typeof user.getIdToken!=='function')return;
        try{
          const token=await user.getIdToken();
          const response=await fetch('/api/ai-core',{
            method:'POST',cache:'no-store',
            headers:{'Authorization':'Bearer '+token,'X-Requested-With':'LOUREX-Invoice','X-Lourex-Admin-Diagnostics':'access-check'},
            signal:AbortSignal.timeout(7000)
          });
          const data=response.ok?await response.json():null;
          if(epoch!==ownerAccessEpoch||fb.auth().currentUser?.uid!==user.uid)return;
          ownerDiagnosticsAllowed=response.ok&&data?.allowed===true;
        }catch{ownerDiagnosticsAllowed=false;}
        refresh();
      },()=>{ownerDiagnosticsAllowed=false;ownerAccessEpoch+=1;refresh();});
    }catch{ownerAuthWatcherInstalled=false;}
  };
  const install=()=>{
    refresh();
    installOwnerWatcher();
    if(window[OBSERVER_ID])return;
    const observer=new MutationObserver(refresh);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['dir','lang','class']});
    window.setInterval(()=>{
      installOwnerWatcher();
      if(document.querySelector('.ta-settings-shell.is-settings'))refresh();
    },3000);
    try{Object.defineProperty(window,OBSERVER_ID,{value:observer,configurable:true});}catch{window[OBSERVER_ID]=observer;}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(()=>{
  'use strict';
  const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};

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
    setText(title,ar?'توجد نسخة سحابية أحدث':'Newer cloud copy available');
    setText(detail,ar?'مركز البيانات هو نقطة التنبيه. تنفيذ الاستعادة الحساسة يبقى داخل الأمان والاستعادة حتى لا تتكرر منطقـة الاسترجاع.':'Data Center owns the notice. The sensitive restore action stays in Security & Recovery so restore logic is not duplicated.');
    setText(action,ar?'فتح الأمان والاستعادة':'Open Security & Recovery');
    const header=page.querySelector('.ta-settings-page-header');
    if(notice.parentElement!==page){notice.remove();if(header?.parentNode===page)header.insertAdjacentElement('afterend',notice);else page.prepend(notice);}
  };

  const sync=()=>{ensureStyle();removeFloating();renderDataCenterNotice();};
  const schedule=()=>{if(scheduled)return;scheduled=true;window.requestAnimationFrame(()=>{scheduled=false;sync();});};

  window.addEventListener('lourex-cloud-refresh-available',()=>{setAvailable(true);schedule();});
  window.addEventListener('lourex-cloud-applied',()=>{setAvailable(false);schedule();});

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['dir','lang','class']});
  ensureStyle();
  sync();
})();