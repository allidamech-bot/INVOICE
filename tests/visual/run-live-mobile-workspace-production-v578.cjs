const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const url='https://invoice-three-puce.vercel.app/';
const origin='https://invoice-three-puce.vercel.app';
const output=path.resolve('visual-qa-output/live-mobile-workspace-v578');
mkdirSync(output,{recursive:true});

const phone={
  width:390,height:844,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  platform:'iPhone'
};
const ipad={
  width:820,height:1180,
  userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  platform:'iPad'
};
const pdfBuffer=label=>Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 0 /Kids [] >>
endobj
% ${label}
trailer
<< /Root 1 0 R >>
%%EOF
`);

function mobileContext(browser,device){
  return browser.newContext({
    viewport:{width:device.width,height:device.height},
    hasTouch:true,isMobile:true,userAgent:device.userAgent
  });
}
async function installPlatform(context,platform){
  await context.addInitScript(({platform})=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=>platform});}catch{}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  },{platform});
}
function captureErrors(page){
  const pageErrors=[],consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  return{pageErrors,consoleErrors};
}
async function createDisposableWorkspace(page){
  const stamp=Date.now();
  const email=`lourex.mobile.sweep.${stamp}@example.com`;
  const password=`MobileSweep!${stamp}Aa`;
  const pin='1234';
  await page.goto(url,{waitUntil:'networkidle',timeout:90000});
  await page.locator('#account-tab-create').click();
  await page.locator('input[type="email"]').fill(email);
  const passwords=page.locator('.ta-auth-card input[type="password"]');
  await passwords.nth(0).fill(password);
  await passwords.nth(1).fill(password);
  await page.locator('.ta-auth-primary').click();
  await page.locator('.ta-setup-card').waitFor({state:'visible',timeout:90000});
  await page.getByLabel('Company Name English').fill('LOUREX Mobile Workspace QA');
  await page.getByLabel('Create PIN · 4–12 digits').fill(pin);
  await page.getByLabel('Confirm PIN').fill(pin);
  await page.locator('.ta-pin-recovery-setup input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Create protected workspace'}).click();
  await page.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:90000});
  return{email,password,pin};
}
async function noHorizontalOverflow(page,label){
  const result=await page.evaluate(()=>({
    width:innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth
  }));
  assert.ok(result.scrollWidth<=result.width+1,`${label}: html horizontal overflow ${result.scrollWidth} > ${result.width}`);
  assert.ok(result.bodyScrollWidth<=result.width+1,`${label}: body horizontal overflow ${result.bodyScrollWidth} > ${result.width}`);
  return result;
}
async function closeGlobalSearch(page){
  const close=page.locator('.global-search-close');
  if(await close.isVisible().catch(()=>false))await close.click();
  await page.locator('.global-search-panel').waitFor({state:'detached',timeout:15000}).catch(()=>{});
}
async function openNewQuotation(page){
  await page.locator('.ta-mobile-create').click();
  await page.locator('.global-search-panel').waitFor({state:'visible',timeout:15000});
  const english=page.getByRole('button',{name:/New quotation/});
  if(await english.count())await english.first().click();
  else await page.locator('.global-search-start button').filter({hasText:/عرض سعر/}).first().click();
  await page.locator('.editor-screen').waitFor({state:'visible',timeout:30000});
}
async function closeEditor(page){
  const back=page.locator('.editor-topbar .icon-btn').first();
  await back.click();
  await page.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:30000});
}
async function openSettings(page){
  const more=page.locator('.ta-mobile-nav>button').last();
  await more.click();
  await page.locator('.ta-mobile-sheet').waitFor({state:'visible',timeout:15000});
  const settings=page.locator('.ta-sheet-link').filter({hasText:/Settings|الإعدادات/}).first();
  await settings.click();
  await page.locator('.modal-backdrop .modal').waitFor({state:'visible',timeout:15000});
}
async function closeTopModal(page){
  const modal=page.locator('.modal-backdrop').last();
  if(!await modal.count())return;
  const close=modal.locator('.modal-header button').last();
  if(await close.count())await close.click();
  await page.waitForTimeout(250);
  if(await page.locator('.modal-backdrop').count()>0){
    const discard=page.getByRole('button',{name:/Discard|تجاهل|إلغاء التغييرات/}).last();
    if(await discard.isVisible().catch(()=>false))await discard.click();
  }
}
async function signInExisting(page,credentials){
  await page.goto(url,{waitUntil:'networkidle',timeout:90000});
  if(await page.locator('.app-ui').count())return;
  const signinTab=page.locator('#account-tab-signin');
  if(await signinTab.count())await signinTab.click();
  await page.locator('input[type="email"]').fill(credentials.email);
  const passwords=page.locator('.ta-auth-card input[type="password"]');
  await passwords.nth(0).fill(credentials.password);
  await page.locator('.ta-auth-primary').click();
}
async function unlockIfNeeded(page,pin,timeout=90000){
  const nav=page.locator('.app-ui .ta-mobile-nav');
  const unlock=page.locator('.ta-unlock-card');
  await Promise.race([
    nav.waitFor({state:'visible',timeout}),
    unlock.waitFor({state:'visible',timeout})
  ]);
  if(await unlock.isVisible().catch(()=>false)){
    await page.getByLabel('PIN · 4–12 digits').fill(pin);
    await page.getByRole('button',{name:'Unlock LOUREX'}).click();
  }
  await nav.waitFor({state:'visible',timeout});
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  const report={url,engine:'webkit',phone:{},ipadPin:{},voice:{}};
  try{
    const phoneContext=await mobileContext(browser,phone);
    await installPlatform(phoneContext,phone.platform);
    const page=await phoneContext.newPage();
    const phoneErrors=captureErrors(page);
    const credentials=await createDisposableWorkspace(page);
    assert.equal(await page.evaluate(()=>innerWidth),390,'phone QA did not run at 390px');
    report.phone.initial=await noHorizontalOverflow(page,'initial iPhone workspace');

    const overlayCycles=[];
    for(let cycle=1;cycle<=3;cycle++){
      const more=page.locator('.ta-mobile-nav>button').last();
      await more.click();
      await page.locator('.ta-mobile-sheet').waitFor({state:'visible',timeout:15000});
      const moreState=await page.evaluate(()=>({
        sheet:Boolean(document.querySelector('.ta-mobile-sheet')),
        backdrop:Boolean(document.querySelector('.ta-sheet-backdrop')),
        width:innerWidth,
        scrollWidth:document.documentElement.scrollWidth
      }));
      await page.locator('.ta-sheet-close').click();
      await page.locator('.ta-mobile-sheet').waitFor({state:'detached',timeout:15000}).catch(()=>{});
      await page.locator('.ta-mobile-create').click();
      await page.locator('.global-search-panel').waitFor({state:'visible',timeout:15000});
      const createState=await page.evaluate(()=>({
        panel:Boolean(document.querySelector('.global-search-panel')),
        backdrop:Boolean(document.querySelector('.global-search-backdrop')),
        width:innerWidth,
        scrollWidth:document.documentElement.scrollWidth
      }));
      await closeGlobalSearch(page);
      const released=await page.evaluate(()=>({
        sheet:Boolean(document.querySelector('.ta-mobile-sheet')),
        sheetBackdrop:Boolean(document.querySelector('.ta-sheet-backdrop')),
        search:Boolean(document.querySelector('.global-search-panel')),
        searchBackdrop:Boolean(document.querySelector('.global-search-backdrop')),
        activeElement:(document.activeElement&&document.activeElement.className)||''
      }));
      assert.equal(released.sheet,false,`cycle ${cycle}: More sheet stayed mounted`);
      assert.equal(released.sheetBackdrop,false,`cycle ${cycle}: More backdrop stayed mounted`);
      assert.equal(released.search,false,`cycle ${cycle}: Create/search stayed mounted`);
      assert.equal(released.searchBackdrop,false,`cycle ${cycle}: Create/search backdrop stayed mounted`);
      assert.ok(moreState.scrollWidth<=moreState.width+1,`cycle ${cycle}: More overflowed horizontally`);
      assert.ok(createState.scrollWidth<=createState.width+1,`cycle ${cycle}: Create overflowed horizontally`);
      overlayCycles.push({cycle,moreState,createState,released});
    }
    report.phone.moreCreate={cycles:overlayCycles};

    const voiceCapability=await page.evaluate(()=>({
      speechRecognition:typeof window.SpeechRecognition==='function',
      webkitSpeechRecognition:typeof window.webkitSpeechRecognition==='function',
      runtimeOwner:window.__LOUREX_VOICE_RUNTIME_OWNER__||'',
      userAgent:navigator.userAgent
    }));
    await page.locator('.lourex-ai-launcher').click();
    const mic=page.locator('.lourex-ai-composer-mic');
    await mic.waitFor({state:'visible',timeout:15000});
    const micBox=await mic.boundingBox();
    const voiceCycles=[];
    if(voiceCapability.speechRecognition||voiceCapability.webkitSpeechRecognition){
      try{await phoneContext.grantPermissions(['microphone'],{origin});}catch{}
      for(let cycle=1;cycle<=3;cycle++){
        await mic.click();
        await page.waitForTimeout(900);
        const state=await page.locator('.lourex-ai-voice-status').getAttribute('data-state').catch(()=>null);
        const enabled=await mic.isEnabled();
        voiceCycles.push({cycle,state,enabled});
        if(state==='starting'||state==='listening'||state==='recording')await mic.click().catch(()=>{});
        await page.waitForTimeout(1800);
      }
    }
    report.voice={...voiceCapability,micBox,cycles:voiceCycles,liveMicrophoneVerified:voiceCycles.length===3&&voiceCycles.every(item=>item.enabled&&['starting','listening','recording','ready'].includes(String(item.state)))};
    await page.locator('.lourex-ai-close').click().catch(()=>{});

    await openNewQuotation(page);
    const attachmentInput=page.locator('.document-attachment-input');
    await attachmentInput.setInputFiles([
      {name:'mobile-a.pdf',mimeType:'application/pdf',buffer:pdfBuffer('mobile-a')},
      {name:'mobile-b.pdf',mimeType:'application/pdf',buffer:pdfBuffer('mobile-b')}
    ]);
    await page.waitForFunction(()=>document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')==='2'||Boolean(document.querySelector('#document-attachments .inline-error')),{timeout:30000});
    const firstBatchState=await page.evaluate(()=>({
      count:document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')||'',
      error:document.querySelector('#document-attachments .inline-error')?.textContent?.trim()||'',
      cards:Array.from(document.querySelectorAll('.attachment-card .attachment-copy strong')).map(node=>node.textContent?.trim()||'')
    }));
    assert.equal(firstBatchState.count,'2',`multi-file first selection was rejected: ${JSON.stringify(firstBatchState)}`);
    const firstBatchNames=await page.locator('.attachment-card .attachment-copy strong').allTextContents();
    await attachmentInput.setInputFiles([
      {name:'mobile-c.pdf',mimeType:'application/pdf',buffer:pdfBuffer('mobile-c')}
    ]);
    await page.waitForFunction(()=>document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')==='3'||Boolean(document.querySelector('#document-attachments .inline-error')),{timeout:30000});
    const secondBatchState=await page.evaluate(()=>({
      count:document.querySelector('#document-attachments')?.getAttribute('data-attachment-count')||'',
      error:document.querySelector('#document-attachments .inline-error')?.textContent?.trim()||'',
      cards:Array.from(document.querySelectorAll('.attachment-card .attachment-copy strong')).map(node=>node.textContent?.trim()||'')
    }));
    assert.equal(secondBatchState.count,'3',`multi-file accumulation failed: ${JSON.stringify(secondBatchState)}`);
    const accumulatedNames=await page.locator('.attachment-card .attachment-copy strong').allTextContents();
    assert.deepEqual(firstBatchNames,['mobile-a.pdf','mobile-b.pdf'],'multi-file first selection did not preserve both files');
    assert.deepEqual(accumulatedNames,['mobile-a.pdf','mobile-b.pdf','mobile-c.pdf'],'second file selection replaced prior attachments instead of accumulating');
    assert.equal(await page.locator('.editor-screen').isVisible(),true,'editor disappeared after multi-file upload');
    report.phone.multiFile={firstBatchNames,accumulatedNames,count:3};

    const lowerField=page.locator('.editor-form-lock textarea').last();
    await lowerField.scrollIntoViewIfNeeded();
    await lowerField.focus();
    await page.setViewportSize({width:390,height:500});
    await page.waitForTimeout(350);
    const keyboardMetrics=await page.evaluate(()=>{
      const bar=document.querySelector('.mobile-editor-actionbar');
      const rect=bar?.getBoundingClientRect();
      const focused=document.activeElement?.getBoundingClientRect();
      return{
        width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        actionbar:rect?{top:rect.top,bottom:rect.bottom,height:rect.height}:null,
        focused:focused?{top:focused.top,bottom:focused.bottom}:null,
        actionButtons:bar?.querySelectorAll('button:not([disabled])').length||0
      };
    });
    assert.ok(keyboardMetrics.scrollWidth<=keyboardMetrics.width+1,'keyboard-height iPhone editor overflowed horizontally');
    assert.ok(keyboardMetrics.actionbar,'mobile editor action bar disappeared under compact keyboard height');
    assert.ok(keyboardMetrics.actionbar.bottom<=keyboardMetrics.height+1,`mobile action bar fell below compact visible height: ${JSON.stringify(keyboardMetrics.actionbar)}`);
    assert.ok(keyboardMetrics.actionButtons>0,'no reachable mobile CTA under compact keyboard height');
    report.phone.keyboardHeightSimulation=keyboardMetrics;
    await page.screenshot({path:path.join(output,'iphone-keyboard-height.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await closeEditor(page);

    const navButtons=page.locator('.ta-mobile-nav>button');
    await navButtons.nth(1).click();
    await page.locator('.ta-documents-page').waitFor({state:'visible',timeout:30000});
    const firstRow=page.locator('.ta-doc-row').first();
    await firstRow.waitFor({state:'visible',timeout:30000});
    const density=await page.evaluate(()=>{
      const row=document.querySelector('.ta-doc-row');
      const action=row?.querySelector('.ta-doc-actions .icon-btn');
      const nav=document.querySelector('.ta-mobile-nav');
      const header=document.querySelector('.ta-documents-header');
      const register=document.querySelector('.ta-doc-register-card');
      const rr=row?.getBoundingClientRect(),ar=action?.getBoundingClientRect(),nr=nav?.getBoundingClientRect(),hr=header?.getBoundingClientRect(),gr=register?.getBoundingClientRect();
      return{
        viewport:{width:innerWidth,height:innerHeight},
        row:rr?{top:rr.top,bottom:rr.bottom,height:rr.height}:null,
        action:ar?{top:ar.top,bottom:ar.bottom,width:ar.width,height:ar.height}:null,
        nav:nr?{top:nr.top,height:nr.height}:null,
        header:hr?{top:hr.top,bottom:hr.bottom,height:hr.height}:null,
        register:gr?{top:gr.top,bottom:gr.bottom,height:gr.height}:null,
        scrollWidth:document.documentElement.scrollWidth
      };
    });
    assert.ok(density.row,'Documents first row missing');
    assert.ok(density.nav,'mobile nav missing on Documents');
    assert.ok(density.row.top<density.nav.top,`Documents first row begins below the visible fold/navigation: ${JSON.stringify(density)}`);
    assert.ok(density.action&&density.action.top<density.nav.top,'first document action is not visible above mobile navigation');
    assert.ok(density.action.width>=40&&density.action.height>=40,'first document action touch target is too small');
    assert.ok(density.scrollWidth<=density.viewport.width+1,'Documents page has horizontal overflow');
    report.phone.documentsDensity=density;
    await page.screenshot({path:path.join(output,'iphone-documents-density.png'),animations:'disabled'});

    await openSettings(page);
    const settingsBefore=await noHorizontalOverflow(page,'iPhone Settings before RTL');
    const language=page.getByLabel('Interface Language');
    await language.selectOption('ar');
    await page.waitForFunction(()=>document.documentElement.dir==='rtl');
    const settingsRtl=await page.evaluate(()=>{
      const modal=document.querySelector('.modal');
      const rect=modal?.getBoundingClientRect();
      return{dir:document.documentElement.dir,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,modal:rect?{left:rect.left,right:rect.right,width:rect.width}:null};
    });
    assert.equal(settingsRtl.dir,'rtl','Settings language switch did not activate RTL');
    assert.ok(settingsRtl.scrollWidth<=settingsRtl.width+1,'RTL Settings caused horizontal overflow');
    report.phone.rtl={settingsBefore,settings:settingsRtl};
    await page.screenshot({path:path.join(output,'iphone-rtl-settings.png'),animations:'disabled'});
    await closeTopModal(page);
    await page.waitForTimeout(350);

    const rtlSurfaces={};
    const rtlNav=page.locator('.ta-mobile-nav>button');
    await rtlNav.nth(0).click();
    await page.locator('.ta-finance-dashboard').waitFor({state:'visible',timeout:30000});
    rtlSurfaces.dashboard=await noHorizontalOverflow(page,'RTL Dashboard');

    await rtlNav.nth(1).click();
    await page.locator('.ta-documents-page').waitFor({state:'visible',timeout:30000});
    rtlSurfaces.documents=await noHorizontalOverflow(page,'RTL Documents');

    await page.locator('.ta-mobile-create').click();
    const searchPanel=page.locator('.global-search-panel');
    await searchPanel.waitFor({state:'visible',timeout:15000});
    rtlSurfaces.create={
      ...(await noHorizontalOverflow(page,'RTL Create')),
      dir:await searchPanel.getAttribute('dir')
    };
    assert.equal(rtlSurfaces.create.dir,'rtl','RTL Create panel did not declare rtl');
    await closeGlobalSearch(page);

    await openNewQuotation(page);
    rtlSurfaces.editor={
      ...(await noHorizontalOverflow(page,'RTL Editor')),
      htmlDir:await page.evaluate(()=>document.documentElement.dir),
      editorDirection:await page.locator('.editor-screen').evaluate(node=>getComputedStyle(node).direction)
    };
    assert.equal(rtlSurfaces.editor.htmlDir,'rtl','RTL Editor lost document direction');
    await page.screenshot({path:path.join(output,'iphone-rtl-editor.png'),animations:'disabled'});
    await closeEditor(page);
    report.phone.rtl.surfaces=rtlSurfaces;

    report.phone.pageErrors=phoneErrors.pageErrors;
    report.phone.consoleErrors=phoneErrors.consoleErrors;
    assert.deepEqual(phoneErrors.pageErrors,[],'page errors occurred during iPhone workspace sweep');

    await page.waitForTimeout(5000);

    const ipadContext=await mobileContext(browser,ipad);
    await installPlatform(ipadContext,ipad.platform);
    const ipadPage=await ipadContext.newPage();
    const ipadErrors=captureErrors(ipadPage);
    await signInExisting(ipadPage,credentials);
    await unlockIfNeeded(ipadPage,credentials.pin,120000);
    const firstUnlock=await ipadPage.evaluate(()=>({width:innerWidth,dir:document.documentElement.dir,app:Boolean(document.querySelector('.app-ui'))}));
    assert.equal(firstUnlock.width,820,'iPad QA did not run at 820px');
    assert.equal(firstUnlock.app,true,'iPad PIN did not unlock workspace after sign-in');

    await ipadPage.reload({waitUntil:'networkidle',timeout:90000});
    const unlockAfterReload=ipadPage.locator('.ta-unlock-card');
    await unlockAfterReload.waitFor({state:'visible',timeout:120000});
    await ipadPage.getByLabel(/PIN · 4–12 digits|PIN · من 4 إلى 12 رقمًا/).fill(credentials.pin);
    const unlockButton=ipadPage.getByRole('button',{name:/Unlock LOUREX|فتح LOUREX/});
    await unlockButton.click();
    await ipadPage.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:120000});
    const secondUnlock=await ipadPage.evaluate(()=>({width:innerWidth,app:Boolean(document.querySelector('.app-ui')),scrollWidth:document.documentElement.scrollWidth}));
    assert.equal(secondUnlock.app,true,'iPad PIN failed after reload');
    assert.ok(secondUnlock.scrollWidth<=secondUnlock.width+1,'iPad workspace overflowed after PIN reload unlock');

    const ipadMore=ipadPage.locator('.ta-mobile-nav>button').last();
    await ipadMore.click();
    await ipadPage.locator('.ta-mobile-sheet').waitFor({state:'visible',timeout:15000});
    const ipadSettings=ipadPage.locator('.ta-sheet-link').filter({hasText:/Settings|الإعدادات/}).first();
    await ipadSettings.click();
    await ipadPage.locator('.modal-backdrop .modal').waitFor({state:'visible',timeout:15000});
    await ipadPage.locator('[data-settings-tab="security"]').click();
    const lockNow=ipadPage.getByRole('button',{name:/Lock Now|قفل الآن/});
    await lockNow.waitFor({state:'visible',timeout:15000});
    await lockNow.click();
    const manualUnlock=ipadPage.locator('.ta-unlock-card');
    await manualUnlock.waitFor({state:'visible',timeout:30000});
    await ipadPage.getByLabel(/PIN · 4–12 digits|PIN · من 4 إلى 12 رقمًا/).fill(credentials.pin);
    await ipadPage.getByRole('button',{name:/Unlock LOUREX|فتح LOUREX/}).click();
    await ipadPage.locator('.app-ui .ta-mobile-nav').waitFor({state:'visible',timeout:120000});
    const thirdUnlock=await ipadPage.evaluate(()=>({app:Boolean(document.querySelector('.app-ui')),width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.equal(thirdUnlock.app,true,'iPad PIN failed after manual lock');
    report.ipadPin={firstUnlock,secondUnlock,thirdUnlock,pageErrors:ipadErrors.pageErrors,consoleErrors:ipadErrors.consoleErrors};
    assert.deepEqual(ipadErrors.pageErrors,[],'page errors occurred during iPad PIN flow');
    await ipadPage.screenshot({path:path.join(output,'ipad-pin-unlocked.png'),animations:'disabled'});

    writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log('LIVE MOBILE WORKSPACE PASS',JSON.stringify(report));
    await ipadContext.close();
    await phoneContext.close();
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
