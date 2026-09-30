(()=>{
  'use strict';

  const PANEL='#lourex-ai-panel';
  const COMPOSE='.lourex-ai-compose';
  const WORKFLOW_MOUNT='[data-lourex-ai-workflow-mount]';
  let raf=0;

  const svg={
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    mic:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/></svg>',
    inbox:'<svg viewBox="0 0 24 24"><path d="M4 4h16v13H4zM4 13h4l2 3h4l2-3h4"/></svg>',
    quote:'<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></svg>',
    history:'<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5V4"/><path d="M12 8v5l3 2"/></svg>',
    shield:'<svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 4.5-2.6 7.7-7 10-4.4-2.3-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    money:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 15h5"/></svg>',
    compare:'<svg viewBox="0 0 24 24"><path d="M7 4v14M7 18l-3-3m3 3 3-3M17 20V6M17 6l-3 3m3-3 3 3"/></svg>',
    today:'<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14"/><path d="m9 14 2 2 4-4"/></svg>',
    memory:'<svg viewBox="0 0 24 24"><path d="M8 5a4 4 0 0 1 8 0v1a4 4 0 0 1 2 7.5A4.5 4.5 0 0 1 13.5 20H10a4 4 0 0 1-3.8-5.2A4.5 4.5 0 0 1 8 6z"/><path d="M12 6v12M9 9h3M12 14h3"/></svg>',
    product:'<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    supplier:'<svg viewBox="0 0 24 24"><path d="M3 8h11v10H3zM14 11h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>'
  };

  function ar(panel){return panel?.getAttribute('dir')==='rtl'||document.documentElement.dir==='rtl';}
  function text(panel,en,arText){return ar(panel)?arText:en;}
  function workflowButtons(panel){return Array.from(panel?.querySelectorAll(`${WORKFLOW_MOUNT}>.lourex-ai-tools button`)||[]);}
  function setExpanded(button,open){button?.setAttribute('aria-expanded',String(open));}

  function directEvent(name){
    closeMenu();
    window.dispatchEvent(new Event(name));
  }

  function routeThroughWorkflowMenu(index){
    const panel=document.querySelector(PANEL);
    const launchers=workflowButtons(panel);
    const tools=launchers[1];
    if(!(tools instanceof HTMLButtonElement))return;
    closeMenu();
    document.documentElement.dataset.lourexAiInternalRoute='true';
    tools.click();
    window.requestAnimationFrame(()=>{
      const modals=Array.from(document.querySelectorAll('.modal-backdrop'));
      const modal=modals.at(-1);
      const buttons=Array.from(modal?.querySelectorAll('.ta-customer-modal-actions button')||[]);
      const target=buttons[index];
      if(target instanceof HTMLButtonElement)target.click();
      window.requestAnimationFrame(()=>{delete document.documentElement.dataset.lourexAiInternalRoute;});
    });
    window.setTimeout(()=>{delete document.documentElement.dataset.lourexAiInternalRoute;},300);
  }

  function openInbox(){
    const panel=document.querySelector(PANEL);
    const button=workflowButtons(panel)[0];
    closeMenu();
    if(button instanceof HTMLButtonElement)button.click();
  }

  function openSupplierDocument(){
    const panel=document.querySelector(PANEL);
    const compose=panel?.querySelector(COMPOSE);
    const button=compose?.querySelector(':scope>.lourex-ai-tools button');
    closeMenu();
    if(button instanceof HTMLButtonElement)button.click();
  }

  function labels(panel){return {
    create:text(panel,'Create from source','إنشاء من مصدر'),
    business:text(panel,'Business tools','أدوات الأعمال'),
    inbox:[text(panel,'AI Inbox','صندوق AI'),text(panel,'Upload any business file and route it safely','ارفع أي ملف أعمال ووجّهه بأمان')],
    quote:[text(panel,'File → Quotation','ملف ← عرض سعر'),text(panel,'Turn an RFQ or image into a quotation draft','حوّل RFQ أو صورة إلى مسودة عرض سعر')],
    product:[text(panel,'Product AI','ذكاء المنتجات'),text(panel,'Read catalogs and price lists with review','اقرأ الكتالوجات وقوائم الأسعار مع المراجعة')],
    supplier:[text(panel,'Supplier AI','ذكاء الموردين'),text(panel,'Extract supplier identity and review duplicates','استخرج بيانات المورد وراجع التكرار')],
    supplierDoc:[text(panel,'Supplier Document','مستند مورد'),text(panel,'Import a supplier quote or purchase source','استورد عرض مورد أو مصدر شراء')],
    search:[text(panel,'Ask Anything','اسأل عن أي شيء'),text(panel,'Search LOUREX business records','ابحث في سجلات أعمال LOUREX')],
    collections:[text(panel,'Collections','التحصيل'),text(panel,'Receivables, aging and follow-up','المستحقات وأعمار الديون والمتابعة')],
    cfo:['CFO',text(panel,'Financial scenarios and business analysis','سيناريوهات مالية وتحليل الأعمال')],
    procurement:[text(panel,'Compare Supplier Offers','مقارنة عروض الموردين'),text(panel,'Compare 2–8 offers without guessing missing costs','قارن 2–8 عروض دون اختراع التكاليف الناقصة')],
    daily:[text(panel,'What matters today','ما المهم اليوم'),text(panel,'Highest-value actions from current records','أهم الإجراءات من السجلات الحالية')],
    memory:[text(panel,'Business Memory','ذاكرة الأعمال'),text(panel,'Derived patterns from approved records','أنماط مشتقة من السجلات المعتمدة')],
    guardian:[text(panel,'Accounting Guardian','حارس المحاسبة'),text(panel,'Review risks before final actions','راجع المخاطر قبل الإجراءات النهائية')],
    history:[text(panel,'AI Job History','سجل مهام AI'),text(panel,'Session-only processing history','سجل المعالجة لهذه الجلسة')],
    plus:text(panel,'Open AI tools','فتح أدوات AI'),
    mic:text(panel,'Voice input','إدخال صوتي'),
    listening:text(panel,'Listening… tap the microphone to stop','جارٍ الاستماع… اضغط الميكروفون للإيقاف'),
    message:text(panel,'Message LOUREX…','راسل LOUREX…')
  };}

  function item(iconName,copy,onClick){
    const button=document.createElement('button');button.type='button';button.className='lourex-ai-plus-item';button.setAttribute('role','menuitem');
    button.innerHTML=`<span class="lourex-ai-plus-icon">${svg[iconName]||svg.quote}</span><span class="lourex-ai-plus-copy"><strong></strong><small></small></span>`;
    const [title,desc]=copy;button.querySelector('strong').textContent=title;button.querySelector('small').textContent=desc;button.addEventListener('click',onClick);return button;
  }

  function section(title,items){
    const wrap=document.createElement('div');wrap.className='lourex-ai-plus-section';
    const heading=document.createElement('span');heading.className='lourex-ai-plus-heading';heading.textContent=title;wrap.appendChild(heading);items.forEach(node=>wrap.appendChild(node));return wrap;
  }

  function buildMenu(panel,menu){
    const l=labels(panel);menu.replaceChildren();menu.setAttribute('role','menu');menu.setAttribute('aria-label',l.plus);
    const createItems=[
      item('inbox',l.inbox,openInbox),item('quote',l.quote,()=>routeThroughWorkflowMenu(1)),item('product',l.product,()=>routeThroughWorkflowMenu(10)),item('supplier',l.supplier,()=>routeThroughWorkflowMenu(11))
    ];
    const compose=panel.querySelector(COMPOSE);if(compose?.querySelector(':scope>.lourex-ai-tools button'))createItems.push(item('supplier',l.supplierDoc,openSupplierDocument));
    const businessItems=[
      item('search',l.search,()=>directEvent('lourex-ai-open-business-search')),
      item('money',l.collections,()=>directEvent('lourex-ai-open-collections')),
      item('compare',l.procurement,()=>directEvent('lourex-ai-open-procurement')),
      item('money',l.cfo,()=>directEvent('lourex-ai-open-cfo')),
      item('today',l.daily,()=>directEvent('lourex-ai-open-daily')),
      item('memory',l.memory,()=>directEvent('lourex-ai-open-memory')),
      item('shield',l.guardian,()=>routeThroughWorkflowMenu(4)),
      item('history',l.history,()=>routeThroughWorkflowMenu(3))
    ];
    menu.append(section(l.create,createItems),section(l.business,businessItems));
  }

  function closeMenu(){
    const menu=document.querySelector(`${PANEL} .lourex-ai-plus-menu`);if(!(menu instanceof HTMLElement))return;menu.hidden=true;const plus=document.querySelector(`${PANEL} .lourex-ai-composer-plus`);setExpanded(plus,false);
  }

  function toggleMenu(panel,menu,plus){
    const next=menu.hidden;menu.hidden=!next;setExpanded(plus,next);if(next){buildMenu(panel,menu);window.setTimeout(()=>menu.querySelector('button')?.focus(),0);}
  }

  function syncVoice(panel){
    const mic=panel.querySelector('.lourex-ai-composer-mic');const status=panel.querySelector('.lourex-ai-voice-status');const input=panel.querySelector(`${COMPOSE} form>input`);if(!(mic instanceof HTMLButtonElement)||!(status instanceof HTMLElement))return;
    const hiddenVoice=workflowButtons(panel)[2];const hiddenText=(hiddenVoice?.textContent||'').replace(/\s+/g,' ').trim();const listening=/\bStop\b|إيقاف/.test(hiddenText);
    mic.classList.toggle('is-listening',listening);mic.setAttribute('aria-pressed',String(listening));status.classList.toggle('is-visible',listening);const l=labels(panel);status.querySelector('span:last-child').textContent=l.listening;if(input instanceof HTMLInputElement)input.placeholder=listening?l.listening:l.message;
  }

  function toggleVoice(panel){
    const voice=workflowButtons(panel)[2];if(!(voice instanceof HTMLButtonElement))return;
    voice.click();window.setTimeout(()=>syncVoice(panel),0);window.setTimeout(()=>syncVoice(panel),120);
  }

  function enhance(panel){
    const compose=panel.querySelector(COMPOSE);const form=compose?.querySelector('form');const input=form?.querySelector('input');const send=form?.querySelector('.lourex-ai-send');if(!(compose instanceof HTMLElement)||!(form instanceof HTMLFormElement)||!(input instanceof HTMLInputElement)||!(send instanceof HTMLButtonElement))return;
    if(form.dataset.lourexAiComposerV449==='true'){syncVoice(panel);return;}
    form.dataset.lourexAiComposerV449='true';input.placeholder=labels(panel).message;

    const plus=document.createElement('button');plus.type='button';plus.className='lourex-ai-composer-plus';plus.innerHTML=svg.plus;plus.setAttribute('aria-label',labels(panel).plus);plus.setAttribute('aria-expanded','false');plus.setAttribute('aria-haspopup','menu');
    const mic=document.createElement('button');mic.type='button';mic.className='lourex-ai-composer-mic';mic.innerHTML=svg.mic;mic.setAttribute('aria-label',labels(panel).mic);mic.setAttribute('aria-pressed','false');
    form.insertBefore(plus,input);form.insertBefore(mic,send);

    const status=document.createElement('div');status.className='lourex-ai-voice-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.innerHTML='<span class="lourex-ai-voice-dot" aria-hidden="true"></span><span></span>';compose.insertBefore(status,form);
    const menu=document.createElement('div');menu.className='lourex-ai-plus-menu';menu.hidden=true;compose.appendChild(menu);buildMenu(panel,menu);
    plus.addEventListener('click',event=>{event.stopPropagation();toggleMenu(panel,menu,plus);});mic.addEventListener('click',()=>toggleVoice(panel));syncVoice(panel);
  }

  function sync(){
    raf=0;const panel=document.querySelector(PANEL);if(panel instanceof HTMLElement)enhance(panel);
  }
  function schedule(){if(raf)return;raf=window.requestAnimationFrame(sync);}

  document.addEventListener('pointerdown',event=>{const target=event.target;if(!(target instanceof Node))return;const menu=document.querySelector(`${PANEL} .lourex-ai-plus-menu`);const plus=document.querySelector(`${PANEL} .lourex-ai-composer-plus`);if(menu instanceof Node&&!menu.contains(target)&&plus instanceof Node&&!plus.contains(target))closeMenu();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('lourex-language-change',schedule);schedule();
})();
