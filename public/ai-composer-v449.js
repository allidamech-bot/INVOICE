(()=>{
  'use strict';

  const PANEL='#lourex-ai-panel';
  const COMPOSE='.lourex-ai-compose';
  const WORKFLOW_MOUNT='[data-lourex-ai-workflow-mount]';
  const MENU_ID='lourex-ai-plus-menu-v449';
  let raf=0;
  let recognition=null;
  let recognitionPanel=null;
  let recognitionStopTimer=0;
  let recognitionCaptureTimer=0;
  let recognitionFinishing=false;
  let voiceCompletion=null;
  let voiceRestartPanel=null;
  let voiceHadResult=false;
  let voiceManualStop=false;
  let voiceBaseInput='';
  let statusSequence=0;

  const svg={
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    mic:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/></svg>',
    camera:'<svg viewBox="0 0 24 24"><path d="M7 7.5 8.5 5h7L17 7.5h2.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5H7z"/><circle cx="12" cy="13" r="3.2"/></svg>',
    files:'<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7zM14 3v5h5"/><path d="M10 13h5M10 17h5"/></svg>',
    tools:'<svg viewBox="0 0 24 24"><path d="M12 3l1.3 3.4L17 7.7l-3.1 2.1.1 3.8-2-1.4-2 1.4.1-3.8L7 7.7l3.7-1.3L12 3z"/><path d="M18.5 13.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/></svg>',
    back:'<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
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
  const tone={camera:'slate',files:'slate',tools:'blue',back:'slate',inbox:'blue',quote:'indigo',product:'cyan',supplier:'amber',search:'violet',money:'emerald',compare:'orange',today:'rose',memory:'purple',shield:'red',history:'slate'};

  function ar(panel){return panel?.getAttribute('dir')==='rtl'||document.documentElement.dir==='rtl';}
  function text(panel,en,arText){return ar(panel)?arText:en;}
  function workflowButtons(panel){return Array.from(panel?.querySelectorAll(`${WORKFLOW_MOUNT}>.lourex-ai-tools button`)||[]);}
  function setExpanded(button,open){button?.setAttribute('aria-expanded',String(open));}
  function normalizeLabel(value){return String(value||'').replace(/\s+/g,' ').trim();}
  function buttonByLabels(buttons,candidates){const wanted=new Set(candidates.map(normalizeLabel));return buttons.find(button=>button instanceof HTMLButtonElement&&wanted.has(normalizeLabel(button.textContent)))||null;}

  function labels(panel){return {
    create:text(panel,'Create from source','إنشاء من مصدر'),business:text(panel,'Business tools','أدوات الأعمال'),records:text(panel,'Activity & records','النشاط والسجلات'),tools:text(panel,'AI Tools','أدوات AI'),
    camera:[text(panel,'Camera','الكاميرا'),text(panel,'Take a photo of a document or product','التقط صورة لمستند أو منتج')],files:[text(panel,'Photos & files','الصور والملفات'),text(panel,'Choose images, PDF, Excel, CSV or text','اختر صورًا أو PDF أو Excel أو CSV أو نصًا')],toolbox:[text(panel,'AI Tools','أدوات AI'),text(panel,'Quotations, finance, products, suppliers and more','عروض الأسعار والمالية والمنتجات والموردون والمزيد')],back:[text(panel,'Back','رجوع'),text(panel,'Return to attachments and tools','العودة إلى المرفقات والأدوات')],
    inbox:[text(panel,'AI Inbox','صندوق AI'),text(panel,'Upload any business file and route it safely','ارفع أي ملف أعمال ووجّهه بأمان')],quote:[text(panel,'File → Quotation','ملف ← عرض سعر'),text(panel,'Turn an RFQ or image into a quotation draft','حوّل RFQ أو صورة إلى مسودة عرض سعر')],product:[text(panel,'Product AI','ذكاء المنتجات'),text(panel,'Read catalogs and price lists with review','اقرأ الكتالوجات وقوائم الأسعار مع المراجعة')],supplier:[text(panel,'Supplier AI','ذكاء الموردين'),text(panel,'Extract supplier identity and review duplicates','استخرج بيانات المورد وراجع التكرار')],supplierDoc:[text(panel,'Supplier Document','مستند مورد'),text(panel,'Import a supplier quote or purchase source','استورد عرض مورد أو مصدر شراء')],
    search:[text(panel,'Ask Anything','اسأل عن أي شيء'),text(panel,'Search LOUREX business records','ابحث في سجلات أعمال LOUREX')],collections:[text(panel,'Collections','التحصيل'),text(panel,'Receivables, aging and follow-up','المستحقات وأعمار الديون والمتابعة')],cfo:['CFO',text(panel,'Financial scenarios and business analysis','سيناريوهات مالية وتحليل الأعمال')],procurement:[text(panel,'Compare Supplier Offers','مقارنة عروض الموردين'),text(panel,'Compare 2–8 offers without guessing missing costs','قارن 2–8 عروض دون اختراع التكاليف الناقصة')],daily:[text(panel,'What matters today','ما المهم اليوم'),text(panel,'Highest-value actions from current records','أهم الإجراءات من السجلات الحالية')],memory:[text(panel,'Business Memory','ذاكرة الأعمال'),text(panel,'Derived patterns from approved records','أنماط مشتقة من السجلات المعتمدة')],guardian:[text(panel,'Accounting Guardian','حارس المحاسبة'),text(panel,'Review risks before final actions','راجع المخاطر قبل الإجراءات النهائية')],history:[text(panel,'AI Job History','سجل مهام AI'),text(panel,'Session-only processing history','سجل المعالجة لهذه الجلسة')],advisorActivity:[text(panel,'Advisor Activity','نشاط المستشار'),text(panel,'Review actions proposed in this chat','راجع الإجراءات المقترحة في هذه المحادثة')],
    plus:text(panel,'Add or use AI tools','إضافة أو استخدام أدوات AI'),mic:text(panel,'Voice input','إدخال صوتي'),listening:text(panel,'Listening… tap the microphone to stop','جارٍ الاستماع… اضغط الميكروفون للإيقاف'),starting:text(panel,'Starting microphone…','جارٍ تشغيل الميكروفون…'),voiceAdded:text(panel,'Voice added to your message','تمت إضافة الصوت إلى الرسالة'),voiceStopped:text(panel,'Voice stopped','تم إيقاف الصوت'),voiceUnavailable:text(panel,'Voice input is not available in this browser','الإدخال الصوتي غير متاح في هذا المتصفح'),voiceDenied:text(panel,'Microphone access was denied. Allow microphone access and try again.','تم رفض إذن الميكروفون. اسمح بالوصول إلى الميكروفون ثم حاول مجددًا.'),noSpeech:text(panel,'No speech was detected. Try again.','لم يتم اكتشاف كلام. حاول مرة أخرى.'),micUnavailable:text(panel,'No microphone is available.','لا يوجد ميكروفون متاح.'),voiceFailed:text(panel,'Voice input could not start. Try again.','تعذر بدء الإدخال الصوتي. حاول مرة أخرى.'),loadingTools:text(panel,'AI tools are still loading. Try again in a moment.','أدوات AI ما زالت قيد التحميل. حاول بعد لحظة.'),actionUnavailable:text(panel,'This AI tool could not open. Try again.','تعذر فتح أداة AI. حاول مرة أخرى.'),message:text(panel,'Message LOUREX…','راسل LOUREX…')
  };}
  function messageFor(panel,key){if(!key)return'';const value=labels(panel)[key];return typeof value==='string'?value:'';}
  function workflowLauncher(panel,kind){const candidates=kind==='inbox'?['AI Inbox','صندوق AI']:['AI Tools','أدوات AI'];return buttonByLabels(workflowButtons(panel),candidates);}
  function workflowActionLabels(action){if(action==='quote')return['File → Quote','ملف ← عرض سعر'];if(action==='history')return['Job History','سجل المهام'];if(action==='guardian')return['Accounting Guardian','حارس المحاسبة'];if(action==='product')return['Product AI','ذكاء المنتجات'];if(action==='supplier')return['Supplier AI','ذكاء الموردين'];return[];}

  function composerStatus(panel,state,messageKey='',autoHide=0){
    const status=panel?.querySelector('.lourex-ai-voice-status');const mic=panel?.querySelector('.lourex-ai-composer-mic');if(!(status instanceof HTMLElement))return;
    const message=messageFor(panel,messageKey);const sequence=String(++statusSequence);status.dataset.state=state||'';status.dataset.messageKey=messageKey||'';status.dataset.messageSequence=sequence;status.classList.toggle('is-visible',Boolean(message));status.classList.toggle('is-error',state==='error');const copy=status.querySelector('span:last-child');if(copy&&copy.textContent!==message)copy.textContent=message;
    if(mic instanceof HTMLButtonElement){const listening=state==='listening';mic.classList.toggle('is-listening',listening);mic.setAttribute('aria-pressed',String(listening));}
    if(autoHide>0&&message)window.setTimeout(()=>{if(status.dataset.messageSequence===sequence){status.classList.remove('is-visible','is-error');status.dataset.state='';status.dataset.messageKey='';}},autoHide);
  }

  function withWorkflowReady(callback,attempt=0,originPanel=null){const panel=document.querySelector(PANEL);if(!(panel instanceof HTMLElement))return;const origin=originPanel||panel;if(panel!==origin||!origin.isConnected)return;const buttons=workflowButtons(panel);if(buttons.length>=3){callback(panel,buttons);return;}if(attempt<40){window.setTimeout(()=>withWorkflowReady(callback,attempt+1,origin),75);return;}composerStatus(panel,'error','loadingTools',3200);}
  function closeMenu(focusPlus=false){const menu=document.querySelector(`${PANEL} .lourex-ai-plus-menu`);if(!(menu instanceof HTMLElement))return;menu.hidden=true;const plus=document.querySelector(`${PANEL} .lourex-ai-composer-plus`);setExpanded(plus,false);if(focusPlus&&plus instanceof HTMLButtonElement)plus.focus({preventScroll:true});}
  function directEvent(name){withWorkflowReady(panel=>{closeMenu();window.dispatchEvent(new Event(name));composerStatus(panel,'','');});}
  function clickInternalAction(panel,action,attempt=0){if(!panel.isConnected||document.querySelector(PANEL)!==panel){delete document.documentElement.dataset.lourexAiInternalRoute;return;}const candidates=workflowActionLabels(action);const modals=Array.from(document.querySelectorAll('.modal-backdrop')).reverse();let target=null;for(const modal of modals){const buttons=Array.from(modal.querySelectorAll('.ta-customer-modal-actions button'));target=buttonByLabels(buttons,candidates);if(target)break;}if(target instanceof HTMLButtonElement){target.click();delete document.documentElement.dataset.lourexAiInternalRoute;return;}if(attempt<40){window.setTimeout(()=>clickInternalAction(panel,action,attempt+1),25);return;}delete document.documentElement.dataset.lourexAiInternalRoute;composerStatus(panel,'error','actionUnavailable',3200);}
  function routeThroughWorkflowMenu(action){withWorkflowReady(panel=>{const tools=workflowLauncher(panel,'tools');if(!(tools instanceof HTMLButtonElement)){composerStatus(panel,'error','actionUnavailable',3200);return;}closeMenu();document.documentElement.dataset.lourexAiInternalRoute='true';tools.click();window.requestAnimationFrame(()=>clickInternalAction(panel,action));window.setTimeout(()=>{delete document.documentElement.dataset.lourexAiInternalRoute;},1800);});}
  function openInbox(){withWorkflowReady(panel=>{closeMenu();const button=workflowLauncher(panel,'inbox');if(button instanceof HTMLButtonElement)button.click();else composerStatus(panel,'error','actionUnavailable',3200);});}
  function openSupplierDocument(){const panel=document.querySelector(PANEL);if(!(panel instanceof HTMLElement))return;const compose=panel.querySelector(COMPOSE);const button=compose?.querySelector(':scope>.lourex-ai-tools button');closeMenu();if(button instanceof HTMLButtonElement)button.click();else composerStatus(panel,'error','actionUnavailable',3200);}
  function openAdvisorActivity(){const panel=document.querySelector(PANEL);if(!(panel instanceof HTMLElement))return;const button=panel.querySelector(`${COMPOSE}>.lourex-ai-meta button`);closeMenu();if(button instanceof HTMLButtonElement)button.click();else composerStatus(panel,'error','actionUnavailable',3200);}
  function sourceInput(panel,camera=false){const inputs=Array.from(panel?.querySelectorAll(`${COMPOSE} input[type="file"]`)||[]);return inputs.find(input=>input instanceof HTMLInputElement&&(camera?input.hasAttribute('capture'):!input.hasAttribute('capture')))||null;}
  function openSource(camera=false){const panel=document.querySelector(PANEL);if(!(panel instanceof HTMLElement))return;const input=sourceInput(panel,camera);closeMenu();if(input instanceof HTMLInputElement){input.click();composerStatus(panel,'','');}else composerStatus(panel,'error','actionUnavailable',3200);}

  function item(iconName,copy,onClick){const button=document.createElement('button');button.type='button';button.className=`lourex-ai-plus-item tone-${tone[iconName]||'blue'}`;button.setAttribute('role','menuitem');button.innerHTML=`<span class="lourex-ai-plus-icon">${svg[iconName]||svg.quote}</span><span class="lourex-ai-plus-copy"><strong></strong><small></small></span>`;const [title,desc]=copy;button.querySelector('strong').textContent=title;button.querySelector('small').textContent=desc;button.addEventListener('click',onClick);return button;}
  function section(title,items){const wrap=document.createElement('div');wrap.className='lourex-ai-plus-section';const heading=document.createElement('span');heading.className='lourex-ai-plus-heading';heading.textContent=title;wrap.appendChild(heading);items.forEach(node=>wrap.appendChild(node));return wrap;}
  function buildToolsMenu(panel,menu){const l=labels(panel);menu.replaceChildren();menu.dataset.view='tools';menu.setAttribute('role','menu');menu.setAttribute('aria-label',l.tools);const back=item('back',l.back,()=>{buildMenu(panel,menu);window.setTimeout(()=>menu.querySelector('button')?.focus(),0);});back.classList.add('is-back');const createItems=[item('inbox',l.inbox,openInbox),item('quote',l.quote,()=>routeThroughWorkflowMenu('quote')),item('product',l.product,()=>routeThroughWorkflowMenu('product')),item('supplier',l.supplier,()=>routeThroughWorkflowMenu('supplier'))];const compose=panel.querySelector(COMPOSE);if(compose?.querySelector(':scope>.lourex-ai-tools button'))createItems.push(item('supplier',l.supplierDoc,openSupplierDocument));const businessItems=[item('search',l.search,()=>directEvent('lourex-ai-open-business-search')),item('money',l.collections,()=>directEvent('lourex-ai-open-collections')),item('compare',l.procurement,()=>directEvent('lourex-ai-open-procurement')),item('money',l.cfo,()=>directEvent('lourex-ai-open-cfo')),item('today',l.daily,()=>directEvent('lourex-ai-open-daily')),item('memory',l.memory,()=>directEvent('lourex-ai-open-memory')),item('shield',l.guardian,()=>routeThroughWorkflowMenu('guardian'))];const recordItems=[item('history',l.history,()=>routeThroughWorkflowMenu('history')),item('history',l.advisorActivity,openAdvisorActivity)];menu.append(back,section(l.create,createItems),section(l.business,businessItems),section(l.records,recordItems));}
  function buildMenu(panel,menu){const l=labels(panel);menu.replaceChildren();menu.dataset.view='root';menu.setAttribute('role','menu');menu.setAttribute('aria-label',l.plus);menu.append(item('camera',l.camera,()=>openSource(true)),item('files',l.files,()=>openSource(false)),item('tools',l.toolbox,()=>{buildToolsMenu(panel,menu);window.setTimeout(()=>menu.querySelector('button')?.focus(),0);}));}
  function toggleMenu(panel,menu,plus){const next=menu.hidden;menu.hidden=!next;setExpanded(plus,next);if(next){buildMenu(panel,menu);composerStatus(panel,'','');window.setTimeout(()=>{if(!menu.hidden)menu.querySelector('button')?.focus();},0);}}
  function menuKeydown(event){const menu=event.currentTarget;if(!(menu instanceof HTMLElement))return;const buttons=Array.from(menu.querySelectorAll('button:not([disabled])'));if(!buttons.length)return;const current=buttons.indexOf(document.activeElement);let next=-1;if(event.key==='ArrowDown')next=current<0?0:(current+1)%buttons.length;else if(event.key==='ArrowUp')next=current<0?buttons.length-1:(current-1+buttons.length)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;if(next>=0){event.preventDefault();buttons[next].focus();}}

  function recognitionCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
  function nativeSetInput(input,value){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,value);else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
  function clearRecognitionStopTimer(){if(recognitionStopTimer){window.clearTimeout(recognitionStopTimer);recognitionStopTimer=0;}}
  function clearCaptureTimer(){if(recognitionCaptureTimer){window.clearTimeout(recognitionCaptureTimer);recognitionCaptureTimer=0;}}
  function resetVoiceState(){voiceHadResult=false;voiceManualStop=false;voiceBaseInput='';recognitionFinishing=false;voiceCompletion=null;}
  function finishRecognition(instance,panel,state,messageKey,hideAfter=0){
    if(recognition!==instance)return;
    clearRecognitionStopTimer();clearCaptureTimer();
    instance.onstart=null;instance.onresult=null;instance.onerror=null;instance.onend=null;
    recognition=null;recognitionPanel=null;
    const restart=voiceRestartPanel;voiceRestartPanel=null;
    composerStatus(panel,state,messageKey,hideAfter);resetVoiceState();
    if(restart?.isConnected)window.setTimeout(()=>{if(document.querySelector(PANEL)===restart&&!recognition)toggleVoice(restart);},0);
  }
  function stopRecognition(instance,panel,state,messageKey,hideAfter=0,abort=false){
    if(recognition!==instance)return;
    recognitionFinishing=true;voiceCompletion={state,messageKey,hideAfter};clearCaptureTimer();clearRecognitionStopTimer();
    composerStatus(panel,state,messageKey,hideAfter);
    // Safari may deliver a final result before releasing its native microphone.
    // Keep ownership until onend; starting a second instance sooner can fail.
    recognitionStopTimer=window.setTimeout(()=>{if(recognition!==instance)return;try{instance.abort?.();}catch{}finishRecognition(instance,panel,state,messageKey,hideAfter);},1200);
    try{if(abort)instance.abort();else instance.stop();}catch{try{instance.abort?.();}catch{}}
  }
  function voiceTranscript(event){const finalParts=[];const interimParts=[];for(const result of Array.from(event?.results||[])){const value=String(result?.[0]?.transcript||'').replace(/\s+/g,' ').trim();if(!value)continue;(result?.isFinal?finalParts:interimParts).push(value);}return[...finalParts,...interimParts].join(' ').replace(/\s+/g,' ').trim();}
  function applyVoiceTranscript(panel,transcript){if(!transcript)return;voiceHadResult=true;const input=panel.querySelector(`${COMPOSE} form>input`);if(input instanceof HTMLInputElement){const value=`${voiceBaseInput}${voiceBaseInput?' ':''}${transcript}`.trim();nativeSetInput(input,value.slice(0,input.maxLength>0?input.maxLength:1000));}}

  function toggleVoice(panel){
    closeMenu();
    if(recognition){
      if(recognitionFinishing){voiceRestartPanel=panel;composerStatus(panel,'starting','starting');return;}
      voiceManualStop=true;stopRecognition(recognition,panel,'','voiceStopped',1400);return;
    }
    const Ctor=recognitionCtor();if(!Ctor){composerStatus(panel,'error','voiceUnavailable',3600);return;}
    let instance;try{instance=new Ctor();}catch{composerStatus(panel,'error','voiceFailed',3200);return;}
    clearRecognitionStopTimer();clearCaptureTimer();resetVoiceState();recognition=instance;recognitionPanel=panel;
    const input=panel.querySelector(`${COMPOSE} form>input`);voiceBaseInput=input instanceof HTMLInputElement?input.value.trim():'';
    instance.lang=ar(panel)?'ar-SA':'en-US';instance.interimResults=true;instance.continuous=false;instance.maxAlternatives=1;
    instance.onstart=()=>{if(recognition===instance&&!recognitionFinishing)composerStatus(panel,'listening','listening');};
    instance.onresult=event=>{if(recognition!==instance||(recognitionFinishing&&!voiceManualStop))return;const transcript=voiceTranscript(event);if(!transcript)return;applyVoiceTranscript(panel,transcript);if(recognitionFinishing)return;composerStatus(panel,'listening','listening');if(Array.from(event.results||[]).every(result=>result.isFinal))stopRecognition(instance,panel,'done','voiceAdded',1200);};
    instance.onerror=event=>{
      if(recognition!==instance||recognitionFinishing)return;const code=String(event?.error||'');
      const key=code==='not-allowed'||code==='service-not-allowed'?'voiceDenied':code==='no-speech'?'noSpeech':code==='audio-capture'?'micUnavailable':'voiceFailed';
      stopRecognition(instance,panel,'error',key,4200,true);
    };
    instance.onend=()=>{if(recognition!==instance)return;const end=voiceCompletion||{state:voiceHadResult?'done':voiceManualStop?'':'error',messageKey:voiceHadResult?'voiceAdded':voiceManualStop?'voiceStopped':'noSpeech',hideAfter:voiceHadResult?1200:2400};finishRecognition(instance,panel,end.state,end.messageKey,end.hideAfter);};
    composerStatus(panel,'starting','starting');
    recognitionCaptureTimer=window.setTimeout(()=>{if(recognition===instance)stopRecognition(instance,panel,voiceHadResult?'done':'error',voiceHadResult?'voiceAdded':'noSpeech',2400);},30000);
    try{instance.start();}catch{stopRecognition(instance,panel,'error','voiceFailed',3200,true);}
  }

  function abortVoice(){
    voiceRestartPanel=null;clearRecognitionStopTimer();clearCaptureTimer();const current=recognition;
    recognition=null;recognitionPanel=null;resetVoiceState();
    if(current){current.onstart=null;current.onresult=null;current.onerror=null;current.onend=null;try{current.abort?.();}catch{try{current.stop?.();}catch{}}}
  }
  function refreshComposer(panel,form,input){const l=labels(panel);const language=ar(panel)?'ar':'en';input.placeholder=l.message;const plus=form.querySelector('.lourex-ai-composer-plus');const mic=form.querySelector('.lourex-ai-composer-mic');const menu=panel.querySelector('.lourex-ai-plus-menu');const status=panel.querySelector('.lourex-ai-voice-status');if(plus instanceof HTMLButtonElement)plus.setAttribute('aria-label',l.plus);if(mic instanceof HTMLButtonElement)mic.setAttribute('aria-label',l.mic);if(status instanceof HTMLElement&&status.classList.contains('is-visible')){const copy=status.querySelector('span:last-child');if(copy){const next=messageFor(panel,status.dataset.messageKey||'');if(copy.textContent!==next)copy.textContent=next;}}if(form.dataset.lourexAiComposerLang!==language&&menu instanceof HTMLElement){const wasOpen=!menu.hidden;const currentButtons=Array.from(menu.querySelectorAll('button'));const focusIndex=currentButtons.indexOf(document.activeElement);buildMenu(panel,menu);menu.hidden=!wasOpen;setExpanded(plus,wasOpen);if(wasOpen&&focusIndex>=0)window.setTimeout(()=>{if(!menu.hidden)menu.querySelectorAll('button')[focusIndex]?.focus();},0);}else if(menu instanceof HTMLElement)menu.setAttribute('aria-label',l.plus);form.dataset.lourexAiComposerLang=language;}
  function enhance(panel){const compose=panel.querySelector(COMPOSE);const form=compose?.querySelector('form');const input=form?.querySelector('input');const send=form?.querySelector('.lourex-ai-send');if(!(compose instanceof HTMLElement)||!(form instanceof HTMLFormElement)||!(input instanceof HTMLInputElement)||!(send instanceof HTMLButtonElement))return;const plus=form.querySelector('.lourex-ai-composer-plus');const mic=form.querySelector('.lourex-ai-composer-mic');const status=compose.querySelector(':scope>.lourex-ai-voice-status');const menu=compose.querySelector(':scope>.lourex-ai-plus-menu');const complete=form.dataset.lourexAiComposerV449==='true'&&plus instanceof HTMLButtonElement&&mic instanceof HTMLButtonElement&&status instanceof HTMLElement&&menu instanceof HTMLElement;if(complete){refreshComposer(panel,form,input);return;}if(recognition&&recognitionPanel===panel)abortVoice();plus?.remove();mic?.remove();status?.remove();menu?.remove();form.dataset.lourexAiComposerV449='true';const nextPlus=document.createElement('button');nextPlus.type='button';nextPlus.className='lourex-ai-composer-plus';nextPlus.innerHTML=svg.plus;nextPlus.setAttribute('aria-expanded','false');nextPlus.setAttribute('aria-haspopup','menu');nextPlus.setAttribute('aria-controls',MENU_ID);const nextMic=document.createElement('button');nextMic.type='button';nextMic.className='lourex-ai-composer-mic';nextMic.innerHTML=svg.mic;nextMic.setAttribute('aria-pressed','false');form.insertBefore(nextPlus,input);form.insertBefore(nextMic,send);const nextStatus=document.createElement('div');nextStatus.className='lourex-ai-voice-status';nextStatus.setAttribute('role','status');nextStatus.setAttribute('aria-live','polite');nextStatus.innerHTML='<span class="lourex-ai-voice-dot" aria-hidden="true"></span><span></span>';compose.insertBefore(nextStatus,form);const nextMenu=document.createElement('div');nextMenu.id=MENU_ID;nextMenu.className='lourex-ai-plus-menu';nextMenu.hidden=true;compose.appendChild(nextMenu);buildMenu(panel,nextMenu);nextMenu.addEventListener('keydown',menuKeydown);nextPlus.addEventListener('click',event=>{event.stopPropagation();toggleMenu(panel,nextMenu,nextPlus);});nextMic.addEventListener('click',()=>toggleVoice(panel));refreshComposer(panel,form,input);}
  function sync(){raf=0;const panel=document.querySelector(PANEL);if(panel instanceof HTMLElement){if(recognition&&recognitionPanel&&recognitionPanel!==panel)abortVoice();enhance(panel);}else if(recognition)abortVoice();}
  function schedule(){if(raf)return;raf=window.requestAnimationFrame(sync);}

  document.addEventListener('pointerdown',event=>{const target=event.target;if(!(target instanceof Node))return;const menu=document.querySelector(`${PANEL} .lourex-ai-plus-menu`);const plus=document.querySelector(`${PANEL} .lourex-ai-composer-plus`);if(menu instanceof Node&&!menu.contains(target)&&plus instanceof Node&&!plus.contains(target))closeMenu();},true);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=document.querySelector(`${PANEL} .lourex-ai-plus-menu`);if(menu instanceof HTMLElement&&!menu.hidden){event.preventDefault();event.stopImmediatePropagation();closeMenu(true);}},true);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('lourex-language-change',schedule);schedule();
})();
