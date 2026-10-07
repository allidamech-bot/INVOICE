const {webkit}=require('playwright');
const assert=require('node:assert/strict');

const PROD='https://invoice-three-puce.vercel.app/';
const IPHONE_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const report={url:PROD,engine:'webkit',iphone:{viewport:[390,844],checks:[]},ipad:{viewport:[820,1180],checks:[]}};
const check=async(bucket,name,fn)=>{
  try{const detail=await fn();bucket.checks.push({name,status:'PASS',detail:detail??null});console.log('PASS',name,JSON.stringify(detail??{}));}
  catch(error){const message=error instanceof Error?error.stack||error.message:String(error);bucket.checks.push({name,status:'FAIL',error:message});console.error('FAIL',name,message);}
};

async function installVoiceStub(context){
  await context.addInitScript(()=>{
    const instances=[];
    Object.defineProperty(window,'__LOUREX_QA_SPEECH_INSTANCES__',{configurable:true,value:instances});
    class Recognition{
      constructor(){this.continuous=false;this.interimResults=true;this.lang='en-US';this.onstart=null;this.onresult=null;this.onerror=null;this.onend=null;instances.push(this);}
      start(){this.started=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.stopped=true;}
      abort(){this.aborted=true;queueMicrotask(()=>this.onend?.());}
      __result(text){this.onresult?.({results:[[{transcript:text}]],resultIndex:0});}
      __end(){this.onend?.();}
    }
    window.SpeechRecognition=Recognition;
    window.webkitSpeechRecognition=Recognition;
  });
}

async function createQaWorkspace(page,label){
  await page.goto(PROD,{waitUntil:'networkidle',timeout:90000});
  const stamp=Date.now()+Math.floor(Math.random()*10000);
  const email=`lourex.mobile.${label}.${stamp}@example.com`;
  const password=`MobileQa!${stamp}Aa`;
  const pin='2468';

  await page.locator('#account-tab-create').click();
  await page.locator('input[type="email"]').fill(email);
  const pw=page.locator('.ta-auth-card input[type="password"]');
  await pw.nth(0).fill(password);
  await pw.nth(1).fill(password);
  await page.locator('.ta-auth-primary').click();

  await page.locator('.ta-setup-card').waitFor({state:'visible',timeout:90000});
  await page.getByLabel('Company Name English').fill(`LOUREX Mobile QA ${label}`);
  await page.getByLabel('Create PIN · 4–12 digits').fill(pin);
  await page.getByLabel('Confirm PIN').fill(pin);
  await page.locator('.ta-pin-recovery-setup input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Create protected workspace'}).click();
  await page.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:90000});
  return {email,password,pin};
}

async function shellUnlocked(page){
  return await page.evaluate(()=>({
    bodyOverflow:getComputedStyle(document.body).overflow,
    htmlOverlay:document.documentElement.getAttribute('data-lourex-shell-overlay'),
    bodyOverlay:document.body.getAttribute('data-lourex-shell-overlay'),
    backdropVisible:Array.from(document.querySelectorAll('.ta-overlay-backdrop')).some(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'),
    scrollWidth:document.documentElement.scrollWidth,
    width:innerWidth
  }));
}

async function openSettings(page){
  const nav=page.locator('.ta-mobile-nav');
  const more=nav.locator('button[aria-controls="ta-mobile-more"]');
  await more.click();
  await page.locator('#ta-mobile-more').waitFor({state:'visible'});
  await page.getByRole('button',{name:/Settings|الإعدادات/}).click();
  await page.getByLabel(/Interface Language|لغة الواجهة/).waitFor({state:'visible',timeout:15000});
}

async function createQuotation(page){
  await page.locator('.ta-mobile-create').click();
  const search=page.locator('.global-search-panel');
  await search.waitFor({state:'visible'});
  await search.getByRole('button',{name:/New quotation|عرض سعر جديد|إنشاء عرض سعر/}).click();
  await page.locator('.editor-screen').waitFor({state:'visible',timeout:30000});

  const customerSearch=page.getByPlaceholder(/Search customer|ابحث عن عميل/);
  await customerSearch.click();
  await page.locator('.new-customer-option').click();
  const modal=page.locator('.modal-backdrop').last();
  const customerName=`Mobile Sweep Buyer ${Date.now()}-${Math.floor(Math.random()*10000)}`;
  await modal.getByLabel(/Company Name English|اسم الشركة بالإنجليزية/).fill(customerName);
  await modal.getByRole('button',{name:/Save & Select|حفظ واختيار/}).click();
  await page.locator('.selected-customer').waitFor({state:'visible',timeout:30000});
  const card=page.locator('.item-card').first();
  await card.locator('textarea').first().fill('Mobile live QA item');
  await card.getByLabel(/Quantity|الكمية/).fill('2');
  const unit=card.getByRole('combobox',{name:/^(Unit|الوحدة)$/});
  await unit.selectOption('PCS');
  await card.getByLabel(/Unit Price \(|سعر الوحدة/).fill('10');
  await page.waitForTimeout(1200);
}

(async()=>{
  const browser=await webkit.launch({headless:true});

  const iphoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:IPHONE_UA});
  await installVoiceStub(iphoneContext);
  await iphoneContext.addInitScript(()=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const iphone=await iphoneContext.newPage();
  const iphoneErrors=[];iphone.on('pageerror',e=>iphoneErrors.push(String(e)));
  await createQaWorkspace(iphone,'iphone');

  await check(report.iphone,'More/Create repeated overlay release',async()=>{
    const nav=iphone.locator('.ta-mobile-nav');
    const more=nav.getByRole('button',{name:'More'});
    const baseline=await shellUnlocked(iphone);
    for(let i=0;i<3;i++){
      await more.click();await iphone.locator('#ta-mobile-more').waitFor({state:'visible'});
      await iphone.locator('#ta-mobile-more .ta-sheet-close').click();
      await iphone.locator('#ta-mobile-more').waitFor({state:'detached'}).catch(()=>iphone.locator('#ta-mobile-more').waitFor({state:'hidden'}));
      const state=await shellUnlocked(iphone);
      assert.equal(state.backdropVisible,false,`More close ${i+1} left backdrop visible`);
      assert.equal(state.htmlOverlay,null,`More close ${i+1} left html overlay lock`);
      assert.equal(state.bodyOverlay,null,`More close ${i+1} left body overlay lock`);
      assert.equal(state.bodyOverflow,baseline.bodyOverflow,`More close ${i+1} did not restore baseline body overflow`);
    }
    for(let i=0;i<3;i++){
      await iphone.locator('.ta-mobile-create').click();
      await iphone.locator('.global-search-panel').waitFor({state:'visible'});
      await iphone.keyboard.press('Escape');
      await iphone.locator('.global-search-panel').waitFor({state:'hidden'});
      const state=await shellUnlocked(iphone);
      assert.equal(state.backdropVisible,false,`Create close ${i+1} left backdrop visible`);
      assert.equal(state.htmlOverlay,null,`Create close ${i+1} left html overlay lock`);
      assert.equal(state.bodyOverlay,null,`Create close ${i+1} left body overlay lock`);
      assert.equal(state.bodyOverflow,baseline.bodyOverflow,`Create close ${i+1} did not restore baseline body overflow`);
    }
    await iphone.locator('.ta-mobile-create').click();await iphone.locator('.global-search-panel').waitFor({state:'visible'});await iphone.keyboard.press('Escape');
    await more.click();await iphone.locator('#ta-mobile-more').waitFor({state:'visible'});await iphone.locator('#ta-mobile-more .ta-sheet-close').click();
    const end=await shellUnlocked(iphone);assert.equal(end.backdropVisible,false);assert.ok(end.scrollWidth<=end.width+1);
    return end;
  });

  await check(report.iphone,'Voice can record three times in one live production session',async()=>{
    await iphone.locator('.lourex-ai-launcher').click();
    const panel=iphone.locator('#lourex-ai-panel');await panel.waitFor({state:'visible'});
    const mic=panel.locator('.lourex-ai-composer-mic');await mic.waitFor({state:'visible'});
    const input=panel.locator('.lourex-ai-compose form>input');
    const textarea=panel.locator('.lourex-ai-premium-textarea');
    try{
      for(let cycle=1;cycle<=3;cycle++){
        await mic.click();
        await iphone.waitForFunction(expected=>window.__LOUREX_QA_SPEECH_INSTANCES__?.length===expected,cycle);
        await iphone.evaluate(({index,text})=>window.__LOUREX_QA_SPEECH_INSTANCES__[index].__result(text),{index:cycle-1,text:`voice session ${cycle}`});
        await iphone.waitForFunction(text=>document.querySelector('.lourex-ai-premium-textarea')?.value?.includes(text),`voice session ${cycle}`);
        await mic.click();
        await iphone.evaluate(index=>window.__LOUREX_QA_SPEECH_INSTANCES__[index].__end(),cycle-1);
        await iphone.waitForTimeout(120);
      }
      const value=await textarea.inputValue().catch(()=>input.inputValue());
      assert.match(value,/voice session 1/);
      assert.match(value,/voice session 2/);
      assert.match(value,/voice session 3/);
      assert.equal(await iphone.evaluate(()=>window.__LOUREX_QA_SPEECH_INSTANCES__.length),3);
      return {sessions:3,transcript:value};
    }finally{
      const close=panel.locator('.lourex-ai-close');
      if(await close.isVisible().catch(()=>false))await close.click();
      await panel.waitFor({state:'hidden',timeout:5000}).catch(()=>panel.waitFor({state:'detached',timeout:5000})).catch(()=>{});
    }
  });

  await check(report.iphone,'Multi-file document attachments select together and accumulate',async()=>{
    const aiPanel=iphone.locator('#lourex-ai-panel');
    if(await aiPanel.isVisible().catch(()=>false)){
      const close=aiPanel.locator('.lourex-ai-close');
      if(await close.isVisible().catch(()=>false))await close.click();
      await aiPanel.waitFor({state:'hidden',timeout:5000}).catch(()=>{});
    }
    await createQuotation(iphone);
    await iphone.waitForFunction(()=>document.querySelectorAll('.ta-editor-step-list>button').length>=7,undefined,{timeout:30000});
    const stepLabels=await iphone.locator('.ta-editor-step-list>button').allTextContents();
    const attachmentStep=iphone.locator('.ta-editor-step-list>button').filter({hasText:/Attachments|المرفقات/}).first();
    assert.equal(await attachmentStep.count(),1,`Attachments step missing from live mobile editor: ${JSON.stringify(stepLabels)}`);
    await attachmentStep.click();
    const section=iphone.locator('#document-attachments');
    await section.waitFor({state:'attached',timeout:15000});
    await section.scrollIntoViewIfNeeded();
    const input=section.locator('.document-attachment-input');
    const pdf=(label)=>Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% '+label+'\n%%EOF\n');
    await input.setInputFiles([
      {name:'mobile-qa-a.pdf',mimeType:'application/pdf',buffer:pdf('a')},
      {name:'mobile-qa-b.pdf',mimeType:'application/pdf',buffer:pdf('b')}
    ]);
    await iphone.waitForFunction(()=>document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')==='2');
    await input.setInputFiles({name:'mobile-qa-c.pdf',mimeType:'application/pdf',buffer:pdf('c')});
    await iphone.waitForFunction(()=>document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')==='3');
    const names=await section.locator('.attachment-card .attachment-copy strong').allTextContents();
    assert.deepEqual(new Set(names),new Set(['mobile-qa-a.pdf','mobile-qa-b.pdf','mobile-qa-c.pdf']));
    return {count:3,names,steps:stepLabels};
  });

  await check(report.iphone,'Mobile keyboard-sized viewport keeps editor CTA reachable',async()=>{
    if(!(await iphone.locator('.editor-screen').isVisible().catch(()=>false))){
      const aiPanel=iphone.locator('#lourex-ai-panel');
      if(await aiPanel.isVisible().catch(()=>false)){
        const close=aiPanel.locator('.lourex-ai-close');
        if(await close.isVisible().catch(()=>false))await close.click();
        await aiPanel.waitFor({state:'hidden',timeout:5000}).catch(()=>{});
      }
      await createQuotation(iphone);
    }
    const lower=iphone.locator('.editor-screen textarea:visible').last();await lower.scrollIntoViewIfNeeded();await lower.focus();
    await iphone.setViewportSize({width:390,height:500});await iphone.waitForTimeout(250);
    const dock=iphone.locator('.mobile-editor-actionbar');await dock.waitFor({state:'visible'});
    const box=await dock.boundingBox();assert.ok(box,'mobile action bar has no geometry');
    assert.ok(box.y>=0&&box.y+box.height<=501,`mobile action bar escaped reduced visible viewport: ${JSON.stringify(box)}`);
    const overflow=await iphone.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth}));
    assert.ok(overflow.sw<=overflow.w+1,`horizontal overflow ${overflow.sw} > ${overflow.w}`);
    await iphone.setViewportSize({width:390,height:844});
    return {dock:box,overflow};
  });

  await check(report.iphone,'Documents mobile density exposes row above fold',async()=>{
    if(await iphone.locator('.editor-screen').isVisible().catch(()=>false)){
      await iphone.locator('.editor-topbar').getByRole('button',{name:/Back|رجوع/}).click();
    }
    await iphone.locator('.ta-mobile-nav').waitFor({state:'visible',timeout:30000});
    await iphone.locator('.ta-mobile-nav').getByRole('button',{name:/Documents|المستندات/}).click();
    const row=iphone.locator('.ta-doc-row').first();await row.waitFor({state:'visible',timeout:30000});
    const box=await row.boundingBox();assert.ok(box,'document row geometry missing');
    const state=await iphone.evaluate(()=>({height:innerHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(box.y<650,`first document row starts too low on phone: y=${box.y}`);
    assert.ok(box.y<state.height,`first document row is below fold: y=${box.y}, h=${state.height}`);
    assert.ok(state.scrollWidth<=state.width+1,'Documents page has horizontal overflow');
    return {row:box,viewport:state};
  });

  await check(report.iphone,'Authenticated RTL surfaces remain aligned and unclipped',async()=>{
    await openSettings(iphone);
    const settingsModal=iphone.locator('.modal-backdrop').last();
    await iphone.getByLabel('Interface Language').selectOption('ar');
    await iphone.waitForFunction(()=>document.documentElement.dir==='rtl'&&document.documentElement.lang==='ar');
    const closeSettings=settingsModal.locator('.modal-header button').first();
    await closeSettings.click();
    await settingsModal.waitFor({state:'detached',timeout:10000}).catch(()=>settingsModal.waitFor({state:'hidden',timeout:10000}));

    const inspect=async(label)=>{
      await iphone.waitForTimeout(120);
      const v=await iphone.evaluate(()=>({dir:document.documentElement.dir,lang:document.documentElement.lang,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.equal(v.dir,'rtl',`${label} lost RTL`);
      assert.equal(v.lang,'ar',`${label} lost Arabic interface language`);
      assert.ok(v.scrollWidth<=v.width+1,`${label} clips horizontally ${v.scrollWidth}>${v.width}`);
      return v;
    };
    const surfaces={};
    const nav=iphone.locator('.ta-mobile-nav');
    await nav.waitFor({state:'visible',timeout:15000});
    const navText=await nav.innerText();
    assert.match(navText,/الرئيسية/,'mobile navigation did not rerender Arabic Home label');
    assert.match(navText,/المستندات/,'mobile navigation did not rerender Arabic Documents label');
    assert.match(navText,/المزيد/,'mobile navigation did not rerender Arabic More label');

    await nav.locator('button').nth(0).click();surfaces.home=await inspect('Dashboard');
    await nav.locator('button').nth(1).click();surfaces.documents=await inspect('Documents');

    await iphone.locator('.ta-mobile-create').click();
    await iphone.locator('.global-search-panel').waitFor({state:'visible'});
    surfaces.create=await inspect('Create');
    await iphone.keyboard.press('Escape');
    await iphone.locator('.global-search-panel').waitFor({state:'hidden',timeout:10000});

    await openSettings(iphone);
    surfaces.settings=await inspect('Settings');
    const settingsModal2=iphone.locator('.modal-backdrop').last();
    await settingsModal2.locator('.modal-header button').first().click();
    await settingsModal2.waitFor({state:'detached',timeout:10000}).catch(()=>settingsModal2.waitFor({state:'hidden',timeout:10000}));

    await createQuotation(iphone);
    surfaces.editor=await inspect('Editor');
    return {navText,surfaces};
  });

  assert.deepEqual(iphoneErrors,[],'page errors occurred in iPhone sweep');
  await iphoneContext.close();

  const ipadContext=await browser.newContext({viewport:{width:820,height:1180},isMobile:true,hasTouch:true,userAgent:IPAD_UA});
  await ipadContext.addInitScript(()=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'iPad'});}catch{}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const ipad=await ipadContext.newPage();
  const ipadErrors=[];ipad.on('pageerror',e=>ipadErrors.push(String(e)));
  const credentials=await createQaWorkspace(ipad,'ipad');

  await check(report.ipad,'iPad PIN accepts after manual lock, sign-in, and reload',async()=>{
    await openSettings(ipad);
    await ipad.locator('[data-settings-tab="security"]').click();
    await ipad.getByRole('button',{name:'Lock Now'}).click();
    await ipad.locator('.ta-unlock-page').waitFor({state:'visible',timeout:30000});
    await ipad.getByLabel('PIN · 4–12 digits').fill(credentials.pin);
    await ipad.locator('.ta-auth-primary').click();
    await ipad.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:30000});

    const more=ipad.locator('.ta-mobile-nav').getByRole('button',{name:'More'});await more.click();
    await ipad.locator('#ta-mobile-more').waitFor({state:'visible'});
    await ipad.getByRole('button',{name:'Sign Out'}).click();
    await ipad.locator('#account-tab-signin').waitFor({state:'visible',timeout:60000});
    await ipad.locator('#account-tab-signin').click();
    await ipad.locator('input[type="email"]').fill(credentials.email);
    await ipad.locator('.ta-auth-card input[type="password"]').first().fill(credentials.password);
    await ipad.locator('.ta-auth-primary').click();
    await ipad.locator('.ta-unlock-page').waitFor({state:'visible',timeout:90000});
    await ipad.getByLabel('PIN · 4–12 digits').fill(credentials.pin);
    await ipad.locator('.ta-auth-primary').click();
    await ipad.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:60000});

    await ipad.reload({waitUntil:'networkidle',timeout:90000});
    let reloadPin=false;
    if(await ipad.locator('.ta-unlock-page').isVisible().catch(()=>false)){
      reloadPin=true;
      await ipad.getByLabel('PIN · 4–12 digits').fill(credentials.pin);
      await ipad.locator('.ta-auth-primary').click();
    }
    await ipad.locator('.app-ui').waitFor({state:'visible',timeout:60000});
    const geometry=await ipad.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(geometry.scrollWidth<=geometry.width+1);
    return {manualLock:true,signInPin:true,reloadRequestedPin:reloadPin,geometry};
  });

  const unexpectedIpadErrors=ipadErrors.filter(message=>!(message.includes('firestore.googleapis.com')&&message.includes('access control checks')));
  assert.deepEqual(unexpectedIpadErrors,[],'unexpected page errors occurred in iPad sweep');
  await ipadContext.close();
  await browser.close();

  console.log('LIVE MOBILE SWEEP REPORT',JSON.stringify(report));
  const failures=[...report.iphone.checks,...report.ipad.checks].filter(row=>row.status==='FAIL');
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
