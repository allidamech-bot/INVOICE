(()=>{
  'use strict';
  const marker='data-lourex-v302-entry';
  const pendingKindKey='lourex:pending-document-kind';
  const isArabic=()=>document.documentElement.dir==='rtl'||String(document.documentElement.lang||'').toLowerCase().startsWith('ar');
  const copy=(en,ar)=>isArabic()?ar:en;

  function attachmentCount(){
    const section=document.getElementById('document-attachments');
    if(!section)return 0;
    const raw=Number(section.getAttribute('data-attachment-count')||'0');
    return Number.isFinite(raw)?raw:0;
  }

  function updateAttachmentButton(button){
    const count=attachmentCount();
    button.textContent=copy(`Add attachment${count?` (${count})`:''}`,`إضافة مرفق${count?` (${count})`:''}`);
    button.setAttribute('aria-label',copy(`Add image or PDF attachment. ${count} attached.`,`إضافة صورة أو PDF. عدد المرفقات الحالية ${count}.`));
  }

  function attachmentButton(){
    const button=document.createElement('button');
    button.type='button';
    button.className='btn v302-attachments-shortcut';
    button.setAttribute(marker,'attachments');
    updateAttachmentButton(button);
    button.addEventListener('click',()=>{
      const section=document.getElementById('document-attachments');
      if(!section)return;
      section.scrollIntoView({behavior:'smooth',block:'start'});
      const add=section.querySelector('.section-heading.with-action .btn');
      if(add instanceof HTMLButtonElement&&!add.disabled)add.click();
    });
    return button;
  }

  function ensureAttachmentShortcuts(){
    const section=document.getElementById('document-attachments');
    if(!section)return;
    const containers=[document.querySelector('.editor-actions'),document.querySelector('.mobile-action-buttons')];
    containers.forEach(container=>{
      if(!(container instanceof HTMLElement))return;
      let button=container.querySelector(`.v302-attachments-shortcut[${marker}]`);
      if(!(button instanceof HTMLButtonElement)){
        button=attachmentButton();
        container.insertBefore(button,container.firstChild);
      }
      updateAttachmentButton(button);
    });
  }

  function visibleCreateMenu(){
    return Array.from(document.querySelectorAll('.shell-new-menu[role="menu"]'))
      .find(node=>node instanceof HTMLElement&&node.getClientRects().length);
  }

  function selectCreateKind(index){
    const menu=visibleCreateMenu();
    const buttons=menu?Array.from(menu.querySelectorAll('button[role="menuitem"]')):[];
    const target=buttons[index];
    if(!(target instanceof HTMLButtonElement))return false;
    target.click();
    return true;
  }

  function openCreateKind(kind,index){
    try{window.sessionStorage.setItem(pendingKindKey,kind);}catch{}
    if(selectCreateKind(index))return;
    const opener=document.querySelector('.shell-create-button');
    if(!(opener instanceof HTMLButtonElement))return;
    opener.click();
    window.requestAnimationFrame(()=>{
      if(selectCreateKind(index))return;
      window.setTimeout(()=>selectCreateKind(index),0);
    });
  }

  function directAction(kind,index,en,ar,enHint,arHint){
    const button=document.createElement('button');
    const title=document.createElement('strong');
    const hint=document.createElement('small');
    button.type='button';
    button.className='v302-direct-document-action';
    button.dataset.kind=kind;
    title.textContent=copy(en,ar);
    hint.textContent=copy(enHint,arHint);
    button.append(title,hint);
    button.addEventListener('click',()=>openCreateKind(kind,index));
    return button;
  }

  function ensureDirectDocumentActions(){
    const host=document.querySelector('.dashboard-quick-actions');
    if(!(host instanceof HTMLElement)||host.querySelector(`.v302-direct-document-actions[${marker}]`))return;
    const strip=document.createElement('div');
    strip.className='v302-direct-document-actions';
    strip.setAttribute(marker,'documents');
    strip.setAttribute('aria-label',copy('Create document','إنشاء مستند'));
    strip.append(
      directAction('proforma',0,'New Quotation','عرض سعر جديد','Create a commercial quotation','إنشاء عرض تجاري'),
      directAction('invoice',1,'New Invoice','فاتورة جديدة','Create a customer invoice','إنشاء فاتورة عميل'),
      directAction('purchase-order',2,'Purchase Order','طلب شراء','Supplier order & delivery terms','طلب للمورد وشروط التسليم')
    );
    host.insertBefore(strip,host.firstChild);
  }

  function normalizeAuthControls(){
    document.querySelectorAll('.auth-utility-controls').forEach(host=>{
      if(!(host instanceof HTMLElement))return;
      const themes=Array.from(host.querySelectorAll('.mf-theme-control'));
      themes.forEach((node,index)=>{
        if(!(node instanceof HTMLElement))return;
        if(index===0){
          node.hidden=false;
          node.removeAttribute('aria-hidden');
        }else{
          node.hidden=true;
          node.setAttribute('aria-hidden','true');
        }
      });
    });
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

  let scheduled=false;
  function reconcile(){
    scheduled=false;
    normalizeAuthControls();
    ensureAttachmentShortcuts();
    ensureDirectDocumentActions();
    inferEditorKind();
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.requestAnimationFrame(reconcile);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-attachment-count','dir','lang']});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  schedule();
})();
