(()=>{
  'use strict';

  const pendingKindKey='lourex:pending-document-kind';
  const attachmentStyleMarker='data-lourex-v304-attachments';
  const mobileCloseoutStyleMarker='data-lourex-v305-mobile-closeout';
  const releaseHardeningStyleMarker='data-lourex-v306-release-hardening';
  const draftScrollRecoveryStyleMarker='data-lourex-v331-draft-recovery';
  const criticalDocumentsStyleMarker='data-lourex-v332-critical-documents';
  const sessionMarkerKey='lourex-invoice-session-v1';
  const accountScopeRecoveryKey='lourex-account-scope-recovery-v317';
  const iosRuntimeRepairKey='lourex-ios-runtime-repair-v317';
  let deferredAccountUid='';
  let deferredAccountTimer=0;

  const menuKinds=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','credit-note','statement-account'];
  const menuLabelKinds=new Map([
    ['draft','draft'],['مسودة','draft'],
    ['rfq','rfq'],['طلب عرض سعر','rfq'],
    ['quotation','proforma'],['عرض سعر','proforma'],
    ['proforma invoice','proforma-invoice'],['فاتورة مبدئية','proforma-invoice'],
    ['purchase order','purchase-order'],['طلب شراء','purchase-order'],
    ['commercial invoice','invoice'],['فاتورة تجارية','invoice'],
    ['delivery note','delivery-note'],['سند تسليم','delivery-note'],
    ['payment receipt','payment-receipt'],['إيصال دفع','payment-receipt'],
    ['credit note','credit-note'],['إشعار دائن','credit-note'],
    ['statement of account','statement-account'],['كشف حساب','statement-account']
  ]);

  function isIosWebKit(){try{return /iP(?:hone|ad|od)/i.test(navigator.userAgent||'');}catch{return false;}}

  function retireStaleIosRuntime(){
    if(!isIosWebKit())return;
    try{if(window.sessionStorage.getItem(iosRuntimeRepairKey)==='1')return;window.sessionStorage.setItem(iosRuntimeRepairKey,'1');}catch{}
    try{if('serviceWorker' in navigator){void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister()))).catch(()=>undefined);}}catch{}
    try{if('caches' in window){void caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lourex-invoice-')).map(key=>caches.delete(key)))).catch(()=>undefined);}}catch{}
  }

  function ensureStylesheet(marker,href){if(document.querySelector(`link[${marker}]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.setAttribute(marker,'true');document.head.appendChild(link);}

  function promoteTailAdminOwners(){
    const head=document.head;if(!head)return;
    Array.from(head.querySelectorAll('link[rel="stylesheet"]')).forEach(link=>{
      if(link.getAttributeNames().some(name=>name.startsWith('data-lourex-tailadmin')))head.appendChild(link);
    });
  }

  function promoteDraftRecovery(){
    const head=document.head;if(!head)return;
    const link=head.querySelector(`link[${draftScrollRecoveryStyleMarker}]`);
    if(link)head.appendChild(link);
  }

  function promoteCriticalDocuments(){
    const head=document.head;if(!head)return;
    const link=head.querySelector(`link[${criticalDocumentsStyleMarker}]`);
    if(link)head.appendChild(link);
  }

  /* v320 feature/reliability layers remain runtime-injected. TailAdmin owners are
     re-promoted afterwards; v331 then restores Draft geometry and v332 owns only
     document-type semantics/presentation. */
  function ensureRuntimeReliability(){
    ensureStylesheet(attachmentStyleMarker,'./attachment-gallery-v304.css?v=304');
    ensureStylesheet(mobileCloseoutStyleMarker,'./mobile-layout-closeout-v305.css?v=305');
    ensureStylesheet(releaseHardeningStyleMarker,'./release-hardening-v306.css?v=306');
    ensureStylesheet(draftScrollRecoveryStyleMarker,'./styles/v331-draft-scroll-recovery.css?v=331-1');
    ensureStylesheet(criticalDocumentsStyleMarker,'./styles/v332-critical-documents-deep-closeout.css?v=332-1');
    promoteTailAdminOwners();
    promoteDraftRecovery();
    promoteCriticalDocuments();

    const root=document.documentElement;
    if(root.dataset.lourexBooting==='true'){
      const dark=root.dataset.uiTheme==='dark';
      const bootBackground=dark?'#0c111d':'#f9fafb';
      root.style.backgroundColor=bootBackground;
      root.style.setProperty('--boot-bg',bootBackground);
      if(document.body)document.body.style.backgroundColor=bootBackground;
      const theme=document.querySelector('meta[name="theme-color"]');
      if(theme)theme.setAttribute('content',bootBackground);
    }
  }

  function editorOrUnsafeWorkspaceOpen(){
    return document.documentElement.hasAttribute('data-lourex-document-editor')||
      document.documentElement.hasAttribute('data-lourex-workspace-dirty')||
      Boolean(document.querySelector('.editor-screen,.modal-backdrop,.product-library-pro.editor-open'));
  }

  function completeDeferredAccount(uid){
    try{window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));}catch{}
  }

  function retryDeferredAccountTransition(){
    deferredAccountTimer=0;
    const uid=deferredAccountUid;
    if(!uid)return;
    let currentUid='';
    try{currentUid=String(window.firebase?.auth?.().currentUser?.uid||'');}catch{}
    if(currentUid&&currentUid!==uid){deferredAccountUid='';completeDeferredAccount(uid);return;}
    if(editorOrUnsafeWorkspaceOpen()){
      deferredAccountTimer=window.setTimeout(retryDeferredAccountTransition,400);
      return;
    }
    deferredAccountUid='';
    try{window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid,deferredByEditorGuard:true}}));}
    catch{completeDeferredAccount(uid);}
  }

  function guardAutomaticAccountTransition(event){
    const detail=event instanceof CustomEvent?event.detail:null;
    if(detail?.deferredByEditorGuard)return;
    const uid=String(detail?.uid||'').trim();
    if(!uid||!editorOrUnsafeWorkspaceOpen())return;
    event.stopImmediatePropagation();
    deferredAccountUid=uid;
    if(deferredAccountTimer)window.clearTimeout(deferredAccountTimer);
    deferredAccountTimer=window.setTimeout(retryDeferredAccountTransition,400);
  }

  function normalizeAuthControls(){
    document.querySelectorAll('.auth-utility-controls').forEach(host=>{
      if(!(host instanceof HTMLElement))return;
      const themes=Array.from(host.querySelectorAll('.mf-theme-control'));
      themes.forEach((node,index)=>{if(!(node instanceof HTMLElement))return;node.hidden=index>0;if(index>0)node.setAttribute('aria-hidden','true');else node.removeAttribute('aria-hidden');});
    });
  }

  function normalizeSecurityCopy(){
    const copy=document.querySelector('.device-security-section .settings-section-heading p');
    if(!(copy instanceof HTMLElement))return;
    const text=String(copy.textContent||'');
    const stale=text.includes('Every account sign-in and every new page start or reload requires the PIN')||text.includes('يتطلب كل تسجيل دخول للحساب وكل تشغيل جديد للصفحة أو إعادة تحميل إدخال PIN');
    if(!stale)return;
    const arabic=document.documentElement.dir==='rtl'||String(document.documentElement.lang||'').toLowerCase().startsWith('ar');
    copy.textContent=arabic
      ?'يحمي رمز PIN الخزنة المشفّرة على هذا الجهاز. لا تتطلب إعادة التحميل العادية إدخال PIN ما دامت الجلسة المحمية النشطة صالحة. يُطلب PIN مجددًا بعد القفل اليدوي، أو تسجيل الخروج ثم الدخول لاحقًا، أو انتهاء مهلة القفل التلقائي، أو عندما تصبح الجلسة المحمية غير صالحة.'
      :'The PIN protects the encrypted vault on this device. A normal refresh keeps a valid active protected session open. The PIN is required again after manual lock, sign-out and later sign-in, auto-lock timeout, or when the protected session is no longer valid.';
  }

  function kindFromMenuButton(button,index=-1){
    const explicit=button?.dataset?.kind||'';
    if(explicit)return explicit;
    const strong=button?.querySelector?.('strong');
    const label=String(strong?.textContent||'').trim().toLowerCase();
    if(menuLabelKinds.has(label))return menuLabelKinds.get(label)||'';
    return index>=0?(menuKinds[index]||''):'';
  }

  function normalizeCreateMenuKinds(){
    document.querySelectorAll('.ta-create-menu,.shell-new-menu').forEach(menu=>{
      const buttons=Array.from(menu.querySelectorAll('button[role="menuitem"]'));
      buttons.forEach((button,index)=>{
        if(!(button instanceof HTMLButtonElement)||button.dataset.kind)return;
        const kind=kindFromMenuButton(button,index);
        if(kind)button.dataset.kind=kind;
      });
    });
  }

  function rememberNativeDocumentKind(event){
    const target=event.target;if(!(target instanceof Element))return;
    const button=target.closest('.ta-create-menu button[role="menuitem"],.shell-new-menu button[role="menuitem"]');if(!(button instanceof HTMLButtonElement))return;
    const menu=button.closest('.ta-create-menu,.shell-new-menu');if(!(menu instanceof HTMLElement))return;
    const buttons=Array.from(menu.querySelectorAll('button[role="menuitem"]'));const index=buttons.indexOf(button);
    const kind=kindFromMenuButton(button,index);const creatableKinds=new Set(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);
    if(!kind||!creatableKinds.has(kind)){try{window.sessionStorage.removeItem(pendingKindKey);}catch{}return;}
    button.dataset.kind=kind;
    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}
  }

  function inferEditorKind(){
    const editor=document.querySelector('.editor-screen');if(!(editor instanceof HTMLElement))return;
    let kind=editor.dataset.documentKind||'';
    let role=editor.dataset.documentRole||'';
    let pending='';try{pending=window.sessionStorage.getItem(pendingKindKey)||'';}catch{}
    const text=String(editor.textContent||'').toLowerCase();
    if(!kind)kind=pending;
    if(!kind){
      if(text.includes('company document studio')||text.includes('استديو مستندات الشركة')||text.includes('مسودة حرة'))kind='draft';
      else if(text.includes('request for quotation')||text.includes('طلب عرض سعر')||text.includes('rfq'))kind='rfq';
      else if(text.includes('proforma invoice')||text.includes('فاتورة مبدئية'))kind='proforma-invoice';
      else if(text.includes('purchase order')||text.includes('طلب شراء'))kind='purchase-order';
      else if(text.includes('delivery note')||text.includes('سند تسليم'))kind='delivery-note';
      else if(text.includes('payment receipt')||text.includes('إيصال دفع'))kind='payment-receipt';
      else if(text.includes('commercial invoice')||text.includes('فاتورة تجارية'))kind='invoice';
      else if(text.includes('quotation')||text.includes('عرض سعر'))kind='proforma';
      else if(text.includes('credit note')||text.includes('إشعار دائن'))kind='invoice';
      else if(text.includes('invoice')||text.includes('فاتورة'))kind='invoice';
    }
    if(!role&&(text.includes('credit note')||text.includes('إشعار دائن')))role='credit-note';
    if(kind)editor.dataset.documentKind=kind;
    editor.dataset.documentRole=role||'standard';
    if(kind&&pending){try{window.sessionStorage.removeItem(pendingKindKey);}catch{}}
  }

  function normalizeDetailDocumentKind(){
    const detail=document.querySelector('.ta-doc-detail-page');
    if(!(detail instanceof HTMLElement)||detail.dataset.documentKind)return;
    const icon=detail.querySelector('.ta-doc-detail-icon');
    if(icon instanceof HTMLElement){
      const token=Array.from(icon.classList).find(name=>name.startsWith('kind-'));
      if(token){detail.dataset.documentKind=token.slice(5);}
    }
    const label=String(detail.querySelector('.ta-doc-detail-title small')?.textContent||'').trim().toLowerCase();
    if(label==='credit note'||label==='إشعار دائن')detail.dataset.documentRole='credit-note';
    else detail.dataset.documentRole='standard';
  }

  function removeLegacyInjectedControls(){document.querySelectorAll('.v302-direct-document-actions,.v302-attachments-shortcut').forEach(node=>node.remove());}

  function enforceSignOutBoundary(event){
    const target=event.target;if(!(target instanceof Element))return;
    const button=target.closest('.settings-direct-signout-button,.settings-signout-button');if(!(button instanceof HTMLButtonElement)||button.disabled)return;
    const root=document.documentElement;root.dataset.lourexSigningOut='true';
    try{window.localStorage.removeItem(sessionMarkerKey);}catch{}try{window.sessionStorage.removeItem(sessionMarkerKey);}catch{}
    let attempts=0;const finish=()=>{let signedOut=false;try{const firebaseApi=window.firebase;signedOut=Boolean(firebaseApi&&firebaseApi.auth&&!firebaseApi.auth().currentUser);}catch{}if(signedOut||attempts>=14){window.location.replace(window.location.href);return;}attempts+=1;window.setTimeout(finish,100);};window.setTimeout(finish,80);
  }

  function recoverLateAuthenticatedAccount(){
    const setup=document.querySelector('.account-managed-setup');if(!setup)return;
    if(editorOrUnsafeWorkspaceOpen())return;
    let uid='';try{uid=String(window.firebase?.auth?.().currentUser?.uid||'');}catch{}if(!uid)return;
    try{if(window.sessionStorage.getItem(accountScopeRecoveryKey)===uid)return;window.sessionStorage.setItem(accountScopeRecoveryKey,uid);}catch{}
    window.location.replace(window.location.href);
  }

  function noteAppliedCloudVault(){try{document.documentElement.dataset.lourexCloudApplied='true';}catch{}}

  let scheduled=false;
  function reconcile(){scheduled=false;ensureRuntimeReliability();normalizeAuthControls();normalizeSecurityCopy();normalizeCreateMenuKinds();removeLegacyInjectedControls();inferEditorKind();normalizeDetailDocumentKind();observeAppUiSurfaces();}
  function schedule(){if(scheduled)return;scheduled=true;window.requestAnimationFrame(reconcile);}
  function nodeContainsRelevantUi(node){if(!(node instanceof Element))return false;if(node.matches('.editor-screen,.ta-doc-detail-page,.ta-create-menu,.shell-new-menu,.auth-account-page,.auth-page,.settings-layout,.modal-backdrop,.v302-direct-document-actions,.v302-attachments-shortcut'))return true;return Boolean(node.querySelector('.editor-screen,.ta-doc-detail-page,.ta-create-menu,.shell-new-menu,.auth-account-page,.auth-page,.settings-layout,.modal-backdrop,.v302-direct-document-actions,.v302-attachments-shortcut'));}

  let appUiObserver=null;let observedAppUi=null;
  function observeAppUiSurfaces(){
    const appUi=document.querySelector('.app-ui');if(!(appUi instanceof HTMLElement)||appUi===observedAppUi)return;
    appUiObserver?.disconnect();observedAppUi=appUi;appUiObserver=new MutationObserver(mutations=>{for(const mutation of mutations){if(Array.from(mutation.addedNodes).some(nodeContainsRelevantUi)||Array.from(mutation.removedNodes).some(nodeContainsRelevantUi)){schedule();return;}}});appUiObserver.observe(appUi,{childList:true,subtree:false});
  }

  window.addEventListener('lourex-account-transition-request',guardAutomaticAccountTransition,true);
  retireStaleIosRuntime();ensureRuntimeReliability();
  document.addEventListener('click',rememberNativeDocumentKind,true);document.addEventListener('click',enforceSignOutBoundary,true);
  window.addEventListener('lourex-cloud-refresh-available',recoverLateAuthenticatedAccount);window.addEventListener('lourex-cloud-applied',noteAppliedCloudVault);
  const stateObserver=new MutationObserver(schedule);stateObserver.observe(document.documentElement,{attributes:true,attributeFilter:['dir','lang','data-ui-theme','data-lourex-booting','data-lourex-document-editor','data-lourex-workspace-dirty']});
  const root=document.getElementById('root');if(root){const surfaceObserver=new MutationObserver(mutations=>{for(const mutation of mutations){if(Array.from(mutation.addedNodes).some(nodeContainsRelevantUi)||Array.from(mutation.removedNodes).some(nodeContainsRelevantUi)){schedule();return;}}});surfaceObserver.observe(root,{childList:true,subtree:false});}
  document.addEventListener('DOMContentLoaded',schedule,{once:true});schedule();
})();