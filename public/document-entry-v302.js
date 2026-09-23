(()=>{
  'use strict';

  const pendingKindKey='lourex:pending-document-kind';
  const styleMarker='data-lourex-v303-coherence';
  const attachmentStyleMarker='data-lourex-v304-attachments';
  const mobileCloseoutStyleMarker='data-lourex-v305-mobile-closeout';
  const releaseHardeningStyleMarker='data-lourex-v306-release-hardening';
  const settingsMoreStyleMarker='data-lourex-v307-loading-more-settings';
  const sessionMarkerKey='lourex-invoice-session-v1';

  function ensureStylesheet(marker,href){
    if(document.querySelector(`link[${marker}]`))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.setAttribute(marker,'true');
    document.head.appendChild(link);
  }

  function ensureVisualCoherence(){
    ensureStylesheet(styleMarker,'./visual-coherence-v303.css?v=303');
    ensureStylesheet(attachmentStyleMarker,'./attachment-gallery-v304.css?v=304');
    ensureStylesheet(mobileCloseoutStyleMarker,'./mobile-layout-closeout-v305.css?v=305');
    ensureStylesheet(releaseHardeningStyleMarker,'./release-hardening-v306.css?v=306');
    ensureStylesheet(settingsMoreStyleMarker,'./loading-more-settings-v307.css?v=307');

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

  function rememberNativeDocumentKind(event){
    const target=event.target;
    if(!(target instanceof Element))return;
    const button=target.closest('.shell-new-menu button[role="menuitem"]');
    if(!(button instanceof HTMLButtonElement))return;
    const menu=button.closest('.shell-new-menu');
    if(!(menu instanceof HTMLElement))return;
    const buttons=Array.from(menu.querySelectorAll('button[role="menuitem"]'));
    const index=buttons.indexOf(button);
    const kind=index===0?'proforma':index===1?'invoice':index===2?'purchase-order':'';
    if(!kind)return;
    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}
  }

  function inferEditorKind(){
    const editor=document.querySelector('.editor-screen');
    if(!(editor instanceof HTMLElement))return;

    let kind='';
    try{kind=window.sessionStorage.getItem(pendingKindKey)||'';}catch{}

    if(!kind){
      const text=String(editor.textContent||'').toLowerCase();
      if(text.includes('purchase order')||text.includes('طلب شراء'))kind='purchase-order';
      else if(text.includes('quotation')||text.includes('عرض سعر')||text.includes('proforma'))kind='proforma';
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

  let scheduled=false;
  function reconcile(){
    scheduled=false;
    ensureVisualCoherence();
    normalizeAuthControls();
    removeLegacyInjectedControls();
    inferEditorKind();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.requestAnimationFrame(reconcile);
  }

  ensureVisualCoherence();
  document.addEventListener('click',rememberNativeDocumentKind,true);
  document.addEventListener('click',enforceSignOutBoundary,true);
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['dir','lang','data-ui-theme','data-lourex-booting']});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  schedule();
})();
