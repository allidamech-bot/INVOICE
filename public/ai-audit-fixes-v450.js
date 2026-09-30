(()=>{
  'use strict';

  const PANEL='#lourex-ai-panel';
  const MIC='.lourex-ai-composer-mic';
  const MENU='.lourex-ai-plus-menu';
  const BRAND_ICON='./brand/lourex-app-icon.svg';
  let recognition=null;
  let recognitionPanel=null;
  let manualStop=false;
  let latestTranscript='';
  let baseInputValue='';
  let stopWatchdog=0;
  let session=0;
  let raf=0;

  const toneByLabel=new Map([
    ['AI Inbox','blue'],['صندوق AI','blue'],
    ['File → Quotation','violet'],['ملف ← عرض سعر','violet'],
    ['Product AI','emerald'],['ذكاء المنتجات','emerald'],
    ['Supplier AI','amber'],['ذكاء الموردين','amber'],
    ['Supplier Document','orange'],['مستند مورد','orange'],
    ['Ask Anything','sky'],['اسأل عن أي شيء','sky'],
    ['Collections','teal'],['التحصيل','teal'],
    ['Compare Supplier Offers','indigo'],['مقارنة عروض الموردين','indigo'],
    ['CFO','gold'],
    ['What matters today','rose'],['ما المهم اليوم','rose'],
    ['Business Memory','purple'],['ذاكرة الأعمال','purple'],
    ['Accounting Guardian','red'],['حارس المحاسبة','red'],
    ['AI Job History','slate'],['سجل مهام AI','slate'],
    ['Advisor Activity','blue'],['نشاط المستشار','blue']
  ]);

  function isArabic(panel){return panel?.getAttribute('dir')==='rtl'||document.documentElement.dir==='rtl';}
  function copy(panel,en,ar){return isArabic(panel)?ar:en;}
  function activePanel(){const panel=document.querySelector(PANEL);return panel instanceof HTMLElement?panel:null;}
  function inputFor(panel){const input=panel?.querySelector('.lourex-ai-compose form>input');return input instanceof HTMLInputElement?input:null;}
  function micFor(panel){const mic=panel?.querySelector(MIC);return mic instanceof HTMLButtonElement?mic:null;}
  function statusFor(panel){const status=panel?.querySelector('.lourex-ai-voice-status');return status instanceof HTMLElement?status:null;}
  function speechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
  function clearWatchdog(){if(stopWatchdog){window.clearTimeout(stopWatchdog);stopWatchdog=0;}}

  function nativeSetInput(input,value){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(setter)setter.call(input,value);else input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function status(panel,state,message,hideAfter=0){
    const node=statusFor(panel);const mic=micFor(panel);if(!node)return;
    node.dataset.state=state||'';
    node.classList.toggle('is-visible',Boolean(message));
    node.classList.toggle('is-error',state==='error');
    const label=node.querySelector('span:last-child');if(label)label.textContent=message;
    if(mic){const listening=state==='listening'||state==='starting';mic.classList.toggle('is-listening',listening);mic.setAttribute('aria-pressed',String(listening));mic.dataset.voiceState=state||'';}
    if(hideAfter&&message){const expected=message;window.setTimeout(()=>{const current=statusFor(panel);if(current&&current.querySelector('span:last-child')?.textContent===expected){current.classList.remove('is-visible','is-error');current.dataset.state='';if(micFor(panel))micFor(panel).dataset.voiceState='';}},hideAfter);}
  }

  function closeMenu(panel){const menu=panel?.querySelector(MENU);if(menu instanceof HTMLElement)menu.hidden=true;const plus=panel?.querySelector('.lourex-ai-composer-plus');if(plus instanceof HTMLButtonElement)plus.setAttribute('aria-expanded','false');}

  function renderTranscript(panel){
    const input=inputFor(panel);if(!input||!latestTranscript)return;
    const separator=baseInputValue.trim()?' ':'';
    const value=`${baseInputValue.trim()}${separator}${latestTranscript}`.replace(/\s+/g,' ').trimStart();
    const max=input.maxLength>0?input.maxLength:1000;
    nativeSetInput(input,value.slice(0,max));
  }

  function collectTranscript(event){
    const results=event?.results;if(!results)return'';
    const parts=[];
    for(let i=0;i<Number(results.length||0);i+=1){const value=String(results[i]?.[0]?.transcript||'').trim();if(value)parts.push(value);}
    return parts.join(' ').replace(/\s+/g,' ').trim();
  }

  function release(instance){
    clearWatchdog();
    if(recognition===instance){recognition=null;recognitionPanel=null;manualStop=false;latestTranscript='';baseInputValue='';}
  }

  function finish(instance,panel,mode){
    if(recognition!==instance)return;
    const hadText=Boolean(latestTranscript.trim());
    if(hadText){renderTranscript(panel);status(panel,'done',copy(panel,'Voice added to your message','تمت إضافة الكلام إلى رسالتك'),1500);}
    else if(mode==='manual'){status(panel,'',copy(panel,'Voice stopped','تم إيقاف التسجيل'),900);}
    else if(mode==='no-speech'){status(panel,'error',copy(panel,'No speech was detected. Try again and speak after the microphone starts.','لم يتم التقاط كلام. حاول مجددًا وتحدث بعد بدء الميكروفون.'),3600);}
    release(instance);
  }

  function stopVoice(panel){
    const instance=recognition;if(!instance)return;
    manualStop=true;clearWatchdog();
    status(panel,'stopping',copy(panel,'Finishing voice input…','جارٍ إنهاء الإدخال الصوتي…'));
    try{instance.stop();}catch{try{instance.abort?.();}catch{}finish(instance,panel,'manual');return;}
    stopWatchdog=window.setTimeout(()=>{if(recognition===instance){try{instance.abort?.();}catch{}finish(instance,panel,'manual');}},1500);
  }

  function startVoice(panel){
    const Ctor=speechCtor();if(!Ctor){status(panel,'error',copy(panel,'Voice input is not available in this browser.','الإدخال الصوتي غير متاح في هذا المتصفح.'),3600);return;}
    const input=inputFor(panel);if(!input){status(panel,'error',copy(panel,'Voice input could not connect to the message field.','تعذر ربط الإدخال الصوتي بحقل الرسالة.'),3200);return;}
    let instance;try{instance=new Ctor();}catch{status(panel,'error',copy(panel,'Voice input could not start. Try again.','تعذر بدء الإدخال الصوتي. حاول مرة أخرى.'),3200);return;}
    const id=++session;
    recognition=instance;recognitionPanel=panel;manualStop=false;latestTranscript='';baseInputValue=input.value;
    instance.lang=isArabic(panel)?'ar-SA':'en-US';
    instance.continuous=false;
    instance.interimResults=true;
    instance.maxAlternatives=1;
    instance.onstart=()=>{if(recognition===instance&&session===id)status(panel,'listening',copy(panel,'Listening… speak now, then tap the microphone to stop','جارٍ الاستماع… تحدث الآن ثم اضغط الميكروفون للإيقاف'));};
    instance.onspeechstart=()=>{if(recognition===instance&&session===id)status(panel,'listening',copy(panel,'Listening…','جارٍ الاستماع…'));};
    instance.onresult=event=>{
      if(recognition!==instance||session!==id)return;
      const transcript=collectTranscript(event);if(!transcript)return;
      latestTranscript=transcript;renderTranscript(panel);
      status(panel,'listening',copy(panel,'Listening… tap the microphone when finished','جارٍ الاستماع… اضغط الميكروفون عند الانتهاء'));
    };
    instance.onerror=event=>{
      if(recognition!==instance||session!==id)return;
      const code=String(event?.error||'').toLowerCase();
      if(manualStop&&(code==='aborted'||code==='no-speech')){finish(instance,panel,'manual');return;}
      if(code==='aborted'){finish(instance,panel,'manual');return;}
      if(code==='no-speech'){finish(instance,panel,'no-speech');return;}
      if(code==='not-allowed'||code==='service-not-allowed'){
        status(panel,'error',copy(panel,'Microphone or speech permission was denied. Allow it in Safari settings and try again.','تم رفض إذن الميكروفون أو التعرّف على الكلام. اسمح به من إعدادات Safari ثم حاول مجددًا.'),4800);release(instance);return;
      }
      if(code==='audio-capture'){
        status(panel,'error',copy(panel,'No usable microphone was found.','لم يتم العثور على ميكروفون قابل للاستخدام.'),4200);release(instance);return;
      }
      if(code==='network'){
        status(panel,'error',copy(panel,'Safari could not reach the speech-recognition service. Check the connection and try again.','تعذر على Safari الوصول إلى خدمة التعرّف على الكلام. تحقق من الاتصال وحاول مجددًا.'),4600);release(instance);return;
      }
      status(panel,'error',copy(panel,'Voice input stopped unexpectedly. Try again.','توقف الإدخال الصوتي بشكل غير متوقع. حاول مرة أخرى.'),4200);release(instance);
    };
    instance.onend=()=>{
      if(recognition!==instance||session!==id)return;
      finish(instance,panel,manualStop?'manual':latestTranscript?'result':'no-speech');
    };
    status(panel,'starting',copy(panel,'Starting microphone…','جارٍ تشغيل الميكروفون…'));
    try{instance.start();}catch{status(panel,'error',copy(panel,'Voice input could not start. Try again.','تعذر بدء الإدخال الصوتي. حاول مرة أخرى.'),3400);release(instance);}
  }

  function handleMicClick(event){
    const target=event.target;if(!(target instanceof Element))return;
    const mic=target.closest(MIC);if(!(mic instanceof HTMLButtonElement))return;
    const panel=mic.closest(PANEL);if(!(panel instanceof HTMLElement))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();closeMenu(panel);
    if(recognition){if(recognitionPanel===panel)stopVoice(panel);else{try{recognition.abort?.();}catch{}release(recognition);startVoice(panel);}}
    else startVoice(panel);
  }

  function decorateBrand(panel){
    const mark=panel.querySelector('.lourex-ai-mark');
    if(mark instanceof HTMLElement&&!mark.dataset.lourexBrandV450){mark.dataset.lourexBrandV450='true';mark.classList.add('lourex-ai-brand-mark-v450');mark.replaceChildren(Object.assign(document.createElement('img'),{src:BRAND_ICON,alt:'',className:'lourex-ai-brand-icon-v450'}));}
    const launcher=document.querySelector('.lourex-ai-launcher');
    if(launcher instanceof HTMLButtonElement&&!launcher.dataset.lourexBrandV450){launcher.dataset.lourexBrandV450='true';launcher.classList.add('lourex-ai-brand-launcher-v450');launcher.replaceChildren(Object.assign(document.createElement('img'),{src:BRAND_ICON,alt:'',className:'lourex-ai-brand-icon-v450'}));}
  }

  function decorateMenu(panel){
    const menu=panel.querySelector(MENU);if(!(menu instanceof HTMLElement))return;
    for(const button of menu.querySelectorAll('.lourex-ai-plus-item')){
      if(!(button instanceof HTMLButtonElement))continue;
      const label=button.querySelector('strong')?.textContent?.trim()||'';
      const tone=toneByLabel.get(label)||'blue';button.dataset.aiTone=tone;
    }
  }

  function sync(){
    raf=0;const panel=activePanel();
    if(!panel){if(recognition){try{recognition.abort?.();}catch{}release(recognition);}return;}
    decorateBrand(panel);decorateMenu(panel);
    if(recognition&&recognitionPanel!==panel){try{recognition.abort?.();}catch{}release(recognition);}
  }
  function schedule(){if(!raf)raf=window.requestAnimationFrame(sync);}

  document.addEventListener('click',handleMicClick,true);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('lourex-language-change',schedule);
  schedule();
})();
