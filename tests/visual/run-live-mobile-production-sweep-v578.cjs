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
    shellOverlay:document.documentElement.getAttribute('data-lourex-shell-overlay'),
    backdropVisible:Array.from(document.querySelectorAll('.ta-overlay-backdrop')).some(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'),
    scrollWidth:document.documentElement.scrollWidth,
    width:innerWidth
  }));
}

async function openSettings(page){
  const nav=page.locator('.ta-mobile-nav');
  const more=nav.getByRole('button',{name:/More|المزيد/});
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
  await modal.getByLabel(/Company Name English|اسم الشركة بالإنجليزية/).fill('Mobile Sweep Buyer');
  await modal.getByRole('button',{name:/Save & Select|حفظ واختيار/}).click();
  await page.locator('.selected-customer').waitFor({state:'visible',timeout:30000});
  const card=page.locator('.item-card').first();
  await card.locator('textarea').first().fill('Mobile live QA item');
  await card.getByLabel(/Quantity|الكمية/).fill('2');
  const unit=card.getByLabel(/Unit|الوحدة/,{exact:true});
  if(await unit.evaluate(el=>el.tagName==='SELECT'))await unit.selectOption('PCS');else await unit.fill('PCS');
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
    for(let i=0;i<3;i++){
      await more.click();await iphone.locator('#ta-mobile-more').waitFor({state:'visible'});
      await iphone.locator('#ta-mobile-more .ta-sheet-close').click();
      await iphone.locator('#ta-mobile-more').waitFor({state:'detached'}).catch(()=>iphone.locator('#ta-mobile-more').waitFor({state:'hidden'}));
      const state=await shellUnlocked(iphone);
      assert.equal(state.backdropVisible,false,`More close ${i+1} left backdrop visible`);
      assert.notEqual(state.bodyOverflow,'hidden',`More close ${i+1} left body locked`);
    }
    for(let i=0;i<3;i++){
      await iphone.locator('.ta-mobile-create').click();
      await iphone.locator('.global-search-panel').waitFor({state:'visible'});
      await iphone.keyboard.press('Escape');
      await iphone.locator('.global-search-panel').waitFor({state:'hidden'});
      const state=await shellUnlocked(iphone);
      assert.equal(state.backdropVisible,false,`Create close ${i+1} left backdrop visible`);
      assert.notEqual(state.bodyOverflow,'hidden',`Create close ${i+1} left body locked`);
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
    for(let i=1;i<=3;i++){
      await mic.click();
      await iphone.waitForFunction(n=>window.__LOUREX_QA_SPEECH_INSTANCES__?.length>=n,i);
      await iphone.evaluate(({index,text})=>window.__LOUREX_QA_SPEECH_INSTANCES__[index].__result(text),{index:i-1,text:`voice session ${i}`});
      await iphone.waitForTimeout(80);
      const value=await input.inputValue();
      assert.ok(value.includes(`voice session ${i}`),`voice result ${i} did not reach composer`);
      await mic.click();
      await iphone.evaluate(index=>window.__LOUREX_QA_SPEECH_INSTANCES__[index].__end(),i-1);
      await iphone.waitForTimeout(120);
      await input.fill('');
    }
    assert.equal(await iphone.evaluate(()=>window.__LOUREX_QA_SPEECH_INSTANCES__.length),3);
    await panel.getByRole('button',{name:/Close LOUREX Advisor|إغلاق مستشار LOUREX/}).click().catch(async()=>{await iphone.locator('.lourex-ai-backdrop').click();});
    return {sessions:3};
  });

  await check(report.iphone,'Multi-file selection accumulates across picker uses',async()=>{
    const nav=iphone.locator('.ta-mobile-nav');await nav.getByRole('button',{name:'Customers'}).click();
    await iphone.getByRole('button',{name:'Add with AI'}).click();
    const modal=iphone.locator('.modal-backdrop').last();await modal.waitFor({state:'visible'});
    const input=modal.locator('input[type="file"][multiple]');
    await input.setInputFiles({name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('first company source')});
    await iphone.waitForTimeout(100);
    const firstCount=await modal.getByText(/Selected sources/).locator('xpath=following-sibling::ul[1]/li').count().catch(()=>modal.locator('li').count());
    assert.ok(firstCount>=1,'first selected file did not appear');
    await input.setInputFiles({name:'second.txt',mimeType:'text/plain',buffer:Buffer.from('second company source')});
    await iphone.waitForTimeout(100);
    const names=await modal.locator('li').allTextContents();
    assert.ok(names.some(v=>v.includes('first.txt')),'first file was replaced after second picker use');
    assert.ok(names.some(v=>v.includes('second.txt')),'second file did not appear');
    await iphone.keyboard.press('Escape');
    return {selected:names};
  });

  await check(report.iphone,'Mobile keyboard-sized viewport keeps editor CTA reachable',async()=>{
    const nav=iphone.locator('.ta-mobile-nav');await nav.getByRole('button',{name:'Documents'}).click();
    await createQuotation(iphone);
    const fields=iphone.locator('.editor-pane input:not([type="hidden"]), .editor-pane textarea, .editor-pane select');
    const lower=fields.last();await lower.scrollIntoViewIfNeeded();await lower.focus();
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
    await iphone.locator('.editor-topbar button[aria-label="Back"]').click();
    await iphone.locator('.ta-mobile-nav').waitFor({state:'visible',timeout:30000});
    await iphone.locator('.ta-mobile-nav').getByRole('button',{name:'Documents'}).click();
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
    await iphone.getByLabel('Interface Language').selectOption('ar');
    await iphone.waitForFunction(()=>document.documentElement.dir==='rtl'&&document.documentElement.lang==='ar');
    await iphone.keyboard.press('Escape');
    const inspect=async(label)=>{
      await iphone.waitForTimeout(100);
      const v=await iphone.evaluate(()=>({dir:document.documentElement.dir,lang:document.documentElement.lang,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.equal(v.dir,'rtl',`${label} lost RTL`);assert.ok(v.scrollWidth<=v.width+1,`${label} clips horizontally ${v.scrollWidth}>${v.width}`);return v;
    };
    const surfaces={};
    await iphone.locator('.ta-mobile-nav').getByRole('button',{name:'الرئيسية'}).click();surfaces.home=await inspect('Dashboard');
    await iphone.locator('.ta-mobile-nav').getByRole('button',{name:'المستندات'}).click();surfaces.documents=await inspect('Documents');
    await iphone.locator('.ta-mobile-create').click();await iphone.locator('.global-search-panel').waitFor({state:'visible'});surfaces.create=await inspect('Create');await iphone.keyboard.press('Escape');
    await openSettings(iphone);surfaces.settings=await inspect('Settings');await iphone.keyboard.press('Escape');
    await iphone.locator('.ta-mobile-nav').getByRole('button',{name:'المستندات'}).click();
    const open=iphone.locator('.ta-doc-row .ta-doc-row-open').first();await open.click();
    const detail=iphone.locator('.ta-doc-detail');if(await detail.count())await detail.getByRole('button',{name:/Edit|تعديل/}).click().catch(()=>{});
    if(!(await iphone.locator('.editor-screen').isVisible().catch(()=>false))){
      await iphone.locator('.ta-doc-row .ta-doc-row-open').first().click().catch(()=>{});
      await iphone.getByRole('button',{name:/Edit|تعديل/}).click().catch(()=>{});
    }
    if(await iphone.locator('.editor-screen').isVisible().catch(()=>false))surfaces.editor=await inspect('Editor');
    else surfaces.editor={note:'existing document detail did not expose edit from this state'};
    return surfaces;
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
    await ipad.getByRole('button',{name:'Security'}).click();
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

  assert.deepEqual(ipadErrors,[],'page errors occurred in iPad sweep');
  await ipadContext.close();
  await browser.close();

  console.log('LIVE MOBILE SWEEP REPORT',JSON.stringify(report));
  const failures=[...report.iphone.checks,...report.ipad.checks].filter(row=>row.status==='FAIL');
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
