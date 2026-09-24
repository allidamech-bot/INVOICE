(()=>{
  'use strict';

  const pendingKindKey='lourex:pending-document-kind';
  const styleMarker='data-lourex-v303-coherence';
  const attachmentStyleMarker='data-lourex-v304-attachments';
  const mobileCloseoutStyleMarker='data-lourex-v305-mobile-closeout';
  const releaseHardeningStyleMarker='data-lourex-v306-release-hardening';
  const settingsMoreStyleMarker='data-lourex-v307-loading-more-settings';
  const auditStyleMarker='data-lourex-v311-release-audit';
  const sessionMarkerKey='lourex-invoice-session-v1';
  const accountScopeRecoveryKey='lourex-account-scope-recovery-v311';
  const cloudApplyReloadKey='lourex-cloud-apply-reload-v314';
  const documentLaunchKey='lourex-document-launch-v315';
  const documentLaunchAttr='data-lourex-document-launching';
  const mobileSafeAttr='data-lourex-mobile-editor-safe';
  const mobileSafeStyleMarker='data-lourex-mobile-editor-safe-style';
  const documentLaunchTimeoutMs=12_000;

  function ensureStylesheet(marker,href){
    if(document.querySelector(`link[${marker}]`))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.setAttribute(marker,'true');
    document.head.appendChild(link);
  }

  function isMobileWebKit(){
    try{
      const ua=String(navigator.userAgent||'');
      const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
      return ios&&window.matchMedia('(max-width:1180px)').matches;
    }catch{return false;}
  }

  function ensureMobileEditorSafeMode(){
    if(!isMobileWebKit())return;
    const root=document.documentElement;
    root.setAttribute(mobileSafeAttr,'true');
    if(document.querySelector(`style[${mobileSafeStyleMarker}]`))return;
    const style=document.createElement('style');
    style.setAttribute(mobileSafeStyleMarker,'true');
    style.textContent=`
      @media (max-width:1180px){
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .editor-screen,
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .editor-screen *,
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .mobile-preview-overlay,
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .mobile-preview-overlay *{
          -webkit-backdrop-filter:none!important;
          backdrop-filter:none!important;
        }
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .draft-studio-preview,
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .preview-pane{
          display:none!important;
        }
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .editor-screen,
        html[${mobileSafeAttr}='true'][data-lourex-document-editor] .draft-studio{
          transform:none!important;
          filter:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureVisualCoherence(){
    ensureStylesheet(styleMarker,'./visual-coherence-v303.css?v=303');
    ensureStylesheet(attachmentStyleMarker,'./attachment-gallery-v304.css?v=304');
    ensureStylesheet(mobileCloseoutStyleMarker,'./mobile-layout-closeout-v305.css?v=305');
    ensureStylesheet(releaseHardeningStyleMarker,'./release-hardening-v306.css?v=306');
    ensureStylesheet(settingsMoreStyleMarker,'./loading-more-settings-v307.css?v=307');
    ensureStylesheet(auditStyleMarker,'./release-audit-v311.css?v=311');
    ensureMobileEditorSafeMode();

    const root=document.documentElement;
    if(root.dataset.lourexBooting==='true'){
      root.style.backgroundColor='#061820';
      if(document.body)document.body.style.backgroundColor='#061820';
      const theme=document.querySelector('meta[name="theme-color"]');
      if(theme)theme.setAttribute('content','#061820');
    }
  }

  function normalizeAuthControls(){
    document.querySelectorAll('.auth-utility-controls').forEach(host=>{
      if(!(host instanceof HTMLElement))return;
      const themes=Array.from(host.querySelectorAll('.mf-theme-control'));
      themes.forEach((node,index)=>{
        if(!(node instanceof HTMLElement))return;
        node.hidden=index>0;
        if(index>0)node.setAttribute('aria-hidden','true');
        else node.removeAttribute('aria-hidden');
      });
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

  function writeLaunchState(kind){
    try{window.sessionStorage.setItem(documentLaunchKey,JSON.stringify({kind,at:Date.now()}));}catch{}
  }

  function readLaunchState(){
    try{
      const raw=window.sessionStorage.getItem(documentLaunchKey);
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed.kind!=='string'||!Number.isFinite(parsed.at))return null;
      return parsed;
    }catch{return null;}
  }

  function clearLaunchState(){
    const root=document.documentElement;
    root.removeAttribute(documentLaunchAttr);
    try{window.sessionStorage.removeItem(documentLaunchKey);}catch{}
  }

  function armDocumentLaunch(kind){
    const root=document.documentElement;
    if(root.hasAttribute(documentLaunchAttr))return false;
    root.setAttribute(documentLaunchAttr,kind);
    // Arm the editor reload guard in the same click turn, before React closes the
    // menu and before any cloud/PWA callback can run between frames on Safari.
    if(!root.hasAttribute('data-lourex-document-editor'))root.setAttribute('data-lourex-document-editor','opening');
    writeLaunchState(kind);
    ensureMobileEditorSafeMode();
    window.setTimeout(()=>{
      const state=readLaunchState();
      if(!state||Date.now()-state.at<documentLaunchTimeoutMs)return;
      if(document.querySelector('.editor-screen'))return;
      if(root.getAttribute('data-lourex-document-editor')==='opening')root.removeAttribute('data-lourex-document-editor');
      clearLaunchState();
    },documentLaunchTimeoutMs+80);
    return true;
  }

  function settleDocumentLaunch(){
    const root=document.documentElement;
    const editor=document.querySelector('.editor-screen');
    if(editor){
      root.removeAttribute(documentLaunchAttr);
      try{window.sessionStorage.removeItem(documentLaunchKey);}catch{}
      return;
    }
    const state=readLaunchState();
    if(!state)return;
    if(Date.now()-state.at<=documentLaunchTimeoutMs)return;
    if(root.getAttribute('data-lourex-document-editor')==='opening')root.removeAttribute('data-lourex-document-editor');
    clearLaunchState();
  }

  function protectedWorkspaceActive(){
    const root=document.documentElement;
    return root.hasAttribute(documentLaunchAttr)||root.hasAttribute('data-lourex-document-editor')||root.hasAttribute('data-lourex-workspace-dirty')||Boolean(document.querySelector('.editor-screen'));
  }

  function rememberNativeDocumentKind(event){
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest('.shell-new-menu button[role="menuitem"]');
    if(!(button instanceof HTMLButtonElement))return;
    const menu=button.closest('.shell-new-menu');
    if(!(menu instanceof HTMLElement))return;
    const buttons=Array.from(menu.querySelectorAll('button[role="menuitem"]'));
    const index=buttons.indexOf(button);
    const explicit=button.dataset.kind||'';
    const fallbackKinds=['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','credit-note','statement-account'];
    const kind=explicit||fallbackKinds[index]||'';
    const creatableKinds=new Set(['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt']);
    if(!kind||!creatableKinds.has(kind)){try{window.sessionStorage.removeItem(pendingKindKey);}catch{}return;}
    const root=document.documentElement;
    if(root.hasAttribute(documentLaunchAttr)){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}
    armDocumentLaunch(kind);
  }

  function inferEditorKind(){
    const editor=document.querySelector('.editor-screen');
    if(!(editor instanceof HTMLElement))return;
    settleDocumentLaunch();
    if(editor.dataset.documentKind)return;

    let kind='';
    try{kind=window.sessionStorage.getItem(pendingKindKey)||'';}catch{}

    if(!kind){
      const text=String(editor.textContent||'').toLowerCase();
      if(text.includes('company document studio')||text.includes('استديو مستندات الشركة')||text.includes('مسودة حرة'))kind='draft';
      else if(text.includes('request for quotation')||text.includes('طلب عرض سعر')||text.includes('rfq'))kind='rfq';
      else if(text.includes('proforma invoice')||text.includes('فاتورة مبدئية'))kind='proforma-invoice';
      else if(text.includes('purchase order')||text.includes('طلب شراء'))kind='purchase-order';
      else if(text.includes('delivery note')||text.includes('سند تسليم'))kind='delivery-note';
      else if(text.includes('payment receipt')||text.includes('إيصال دفع'))kind='payment-receipt';
      else if(text.includes('statement of account')||text.includes('كشف حساب'))kind='statement-account';
      else if(text.includes('commercial invoice')||text.includes('فاتورة تجارية'))kind='invoice';
      else if(text.includes('quotation')||text.includes('عرض سعر'))kind='proforma';
      else if(text.includes('invoice')||text.includes('فاتورة'))kind='invoice';
    }

    if(!kind)return;
    editor.dataset.documentKind=kind;
    try{window.sessionStorage.removeItem(pendingKindKey);}catch{}
  }

  function removeLegacyInjectedControls(){
    document.querySelectorAll('.v302-direct-document-actions,.v302-attachments-shortcut').forEach(node=>node.remove());
  }

  function enforceSignOutBoundary(event){
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest('.settings-direct-signout-button,.settings-signout-button');
    if(!(button instanceof HTMLButtonElement)||button.disabled)return;

    const root=document.documentElement;
    root.dataset.lourexSigningOut='true';
    try{window.localStorage.removeItem(sessionMarkerKey);}catch{}
    try{window.sessionStorage.removeItem(sessionMarkerKey);}catch{}

    let attempts=0;
    const finish=()=>{
      let signedOut=false;
      try{
        const firebaseApi=window.firebase;
        signedOut=Boolean(firebaseApi&&firebaseApi.auth&&!firebaseApi.auth().currentUser);
      }catch{}
      if(signedOut||attempts>=14){
        window.location.replace(window.location.href);
        return;
      }
      attempts+=1;
      window.setTimeout(finish,100);
    };
    window.setTimeout(finish,80);
  }

  // Safari/WebKit can restore Firebase after the public setup screen has already
  // mounted. index.tsx switches IndexedDB to the UID scope before emitting this
  // event. If setup is still visible, reload exactly once at this safe pre-work
  // boundary so React rehydrates from the account database instead of letting a
  // second PIN be created in stale public state. Never reload an active editor.
  function recoverLateAuthenticatedAccount(){
    const setup=document.querySelector('.account-managed-setup');
    if(!setup)return;
    if(protectedWorkspaceActive())return;
    let uid='';
    try{uid=String(window.firebase?.auth?.().currentUser?.uid||'');}catch{}
    if(!uid)return;
    const now=Date.now();
    try{
      const raw=window.sessionStorage.getItem(accountScopeRecoveryKey);
      if(raw){
        const parsed=JSON.parse(raw);
        if(parsed&&parsed.uid===uid&&Number.isFinite(parsed.at)&&now-parsed.at<15_000)return;
      }
      window.sessionStorage.setItem(accountScopeRecoveryKey,JSON.stringify({uid,at:now}));
    }catch{}
    window.location.replace(window.location.href);
  }

  // A cloud vault replacement updates both encrypted data and its PIN-derived
  // security metadata. The currently mounted React tree may still hold the old
  // key/vault in memory, so a clean workspace must rehydrate from IndexedDB after
  // the replacement. Never interrupt an editor or unsaved inline workspace.
  function rehydrateAppliedCloudVault(){
    if(protectedWorkspaceActive())return;
    const now=Date.now();
    try{
      const previous=Number(window.sessionStorage.getItem(cloudApplyReloadKey)||'0');
      if(Number.isFinite(previous)&&now-previous<8_000)return;
      window.sessionStorage.setItem(cloudApplyReloadKey,String(now));
    }catch{}
    window.location.replace(window.location.href);
  }

  let scheduled=false;
  function reconcile(){
    scheduled=false;
    ensureVisualCoherence();
    normalizeAuthControls();
    normalizeSecurityCopy();
    removeLegacyInjectedControls();
    inferEditorKind();
    settleDocumentLaunch();
    observeAppUiSurfaces();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.requestAnimationFrame(reconcile);
  }

  function nodeContainsRelevantUi(node){
    if(!(node instanceof Element))return false;
    if(node.matches('.editor-screen,.auth-account-page,.auth-page,.settings-layout,.modal-backdrop,.v302-direct-document-actions,.v302-attachments-shortcut'))return true;
    return Boolean(node.querySelector('.editor-screen,.auth-account-page,.auth-page,.settings-layout,.modal-backdrop,.v302-direct-document-actions,.v302-attachments-shortcut'));
  }

  let appUiObserver=null;
  let observedAppUi=null;
  function observeAppUiSurfaces(){
    const appUi=document.querySelector('.app-ui');
    if(!(appUi instanceof HTMLElement)||appUi===observedAppUi)return;
    appUiObserver?.disconnect();
    observedAppUi=appUi;
    appUiObserver=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(Array.from(mutation.addedNodes).some(nodeContainsRelevantUi)||Array.from(mutation.removedNodes).some(nodeContainsRelevantUi)){schedule();return;}
      }
    });
    // App-level modals are direct children of .app-ui. Watching only this level
    // catches Settings/Cloud/Auth surface changes without observing editor churn.
    appUiObserver.observe(appUi,{childList:true,subtree:false});
  }

  ensureVisualCoherence();
  document.addEventListener('click',rememberNativeDocumentKind,true);
  document.addEventListener('click',enforceSignOutBoundary,true);
  window.addEventListener('lourex-cloud-refresh-available',recoverLateAuthenticatedAccount);
  window.addEventListener('lourex-cloud-applied',rehydrateAppliedCloudVault);

  // v315: editor launch state joins the durable editor attribute. This closes the
  // Safari gap between a catalog tap and React mounting the editor, and keeps
  // cloud/PWA recovery callbacks from reloading during that transition.
  const stateObserver=new MutationObserver(schedule);
  stateObserver.observe(document.documentElement,{attributes:true,attributeFilter:['dir','lang','data-ui-theme','data-lourex-booting','data-lourex-document-editor',documentLaunchAttr]});

  const root=document.getElementById('root');
  if(root){
    const surfaceObserver=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(Array.from(mutation.addedNodes).some(nodeContainsRelevantUi)||Array.from(mutation.removedNodes).some(nodeContainsRelevantUi)){schedule();return;}
      }
    });
    surfaceObserver.observe(root,{childList:true,subtree:false});
  }

  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  schedule();
})();