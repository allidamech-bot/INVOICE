(()=>{
  'use strict';
  const marker='data-lourex-v302-entry';
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

  function openCreateKind(index){
    const opener=document.querySelector('.dashboard-quick-actions .quick-action-primary')||document.querySelector('.shell-create-button');
    if(!(opener instanceof HTMLButtonElement))return;
    opener.click();
    window.setTimeout(()=>{
      const menus=Array.from(document.querySelectorAll('.shell-new-menu[role="menu"]'));
      const menu=menus.find(node=>node instanceof HTMLElement&&node.getClientRects().length)||menus[0];
      const buttons=menu?Array.from(menu.querySelectorAll('button[role="menuitem"]')):[];
      const target=buttons[index];
      if(target instanceof HTMLButtonElement)target.click();
    },0);
  }

  function directAction(kind,index,en,ar,enHint,arHint){
    const button=document.createElement('button');
    button.type='button';
    button.className='v302-direct-document-action';
    button.dataset.kind=kind;
    button.innerHTML=`<strong>${copy(en,ar)}</strong><small>${copy(enHint,arHint)}</small>`;
    button.addEventListener('click',()=>openCreateKind(index));
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

  let scheduled=false;
  function reconcile(){
    scheduled=false;
    ensureAttachmentShortcuts();
    ensureDirectDocumentActions();
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
