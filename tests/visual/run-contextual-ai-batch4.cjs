const {chromium,webkit}=require('playwright');
const safari=process.env.LOUREX_QA_BROWSER==='webkit';
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
(async()=>{
 const output=`visual-qa-output/contextual-ai-batch4-${safari?'webkit':'chromium'}`;mkdirSync(output,{recursive:true});const browser=await (safari?webkit:chromium).launch({headless:true});const report=[];
 const matrix=safari?[[320,'ar','dark'],[390,'en','light'],[820,'ar','light']]:[[320,'ar','dark'],[390,'en','light'],[820,'ar','light'],[1440,'en','dark']];
 try{for(const [width,lang,theme] of matrix){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[],requests=[];let keyboardChecked=false;page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'Unexpected provider call'});});
  await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${lang}&theme=${theme}`,{waitUntil:'networkidle'});
  const prepareUnlockedProductionAiRuntime=async()=>{
    const mount=page.locator('[data-lourex-proactive-assistant-mount]');await mount.waitFor({state:'attached'});
    await page.evaluate(async()=>{
      const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([import('/dist/src/storage/vault.js'),import('/dist/src/lib/defaults.js'),import('/dist/src/storage/session.js')]);
      const initial=emptyVault();initial.company.nameEn='LOUREX QA';
      const {key}=await setupVault('2468',initial);const established=await establishSession(key);if(!established)throw new Error('QA could not establish encrypted Vault session');
      window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa'}}));
    });
  };
  await prepareUnlockedProductionAiRuntime();
  const bounds=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  const question=async(name,pattern)=>{await page.getByRole('button',{name,exact:true}).click();const input=page.locator('#lourex-ai-panel .lourex-ai-compose-bridge');await input.waitFor();assert.match(await input.inputValue(),pattern);assert.equal(await page.locator('.lourex-ai-proposal').count(),0);await page.locator('.lourex-ai-close').click();};
  const openHub=async(panel)=>{
    const hub=panel.locator('.lourex-ai-hub-trigger');await hub.waitFor({state:'visible'});const box=await hub.boundingBox();assert.ok(box&&box.height>=(width<=720?43:35),'single Tools hub target');
    await hub.click();const menu=panel.locator('.lourex-ai-hub-menu');await menu.waitFor({state:'visible'});const copy=await menu.innerText();assert.match(copy,lang==='ar'?/صندوق AI[\s\S]*أدوات AI[\s\S]*الذاكرة والمهام[\s\S]*الموجز الصباحي/:/AI Inbox[\s\S]*AI Tools[\s\S]*Memory & Tasks[\s\S]*Morning Brief/,'Tools hub contains canonical AI destinations');
    const menuBox=await menu.boundingBox();assert.ok(menuBox&&menuBox.x>=-1&&menuBox.x+menuBox.width<=width+1&&menuBox.y>=-1&&menuBox.y+menuBox.height<=901,'Tools menu remains inside viewport');
    const actions=menu.locator('.lourex-ai-hub-action');assert.ok((await actions.count())>=4,'Tools menu exposes all canonical destinations');
    if(width<=720){for(let i=0;i<await actions.count();i++){const target=await actions.nth(i).boundingBox();assert.ok(target&&target.height>=44&&target.width>=44,'mobile Tools action meets 44px target');}}
    if(!keyboardChecked){
      await page.waitForFunction(()=>document.activeElement?.classList?.contains('lourex-ai-hub-action'));
      assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'opening Tools moves focus to first action');
      await page.keyboard.press('ArrowDown');assert.equal(await actions.nth(1).evaluate(node=>node===document.activeElement),true,'ArrowDown advances Tools focus');
      await page.keyboard.press('End');assert.equal(await actions.last().evaluate(node=>node===document.activeElement),true,'End moves Tools focus to final action');
      await page.keyboard.press('Home');assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'Home moves Tools focus to first action');
      await page.keyboard.press('ArrowUp');assert.equal(await actions.last().evaluate(node=>node===document.activeElement),true,'ArrowUp wraps Tools focus');
      await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await hub.evaluate(node=>node===document.activeElement),true,'Escape returns focus to Tools trigger');
      await hub.click();await menu.waitFor({state:'visible'});keyboardChecked=true;
    }
    return menu;
  };
  const premium=async()=>{
    await page.locator('.lourex-ai-launcher').click();
    const panel=page.locator('#lourex-ai-panel'),textarea=panel.locator('.lourex-ai-premium-textarea'),bridge=panel.locator('.lourex-ai-compose-bridge'),attach=panel.locator('.lourex-ai-attach-button');
    await textarea.waitFor();assert.equal(await textarea.count(),1,'premium textarea');assert.equal(await bridge.count(),1,'legacy input bridge retained');
    const attachBox=await attach.boundingBox();assert.ok(attachBox&&attachBox.width>=43&&attachBox.height>=43,'44px attachment target');
    const panelBox=await panel.boundingBox();assert.ok(panelBox,'AI panel visible');
    if(width<=720){assert.ok(panelBox.x<=1&&Math.abs(panelBox.width-width)<=2,'phone AI is full width');assert.ok(panelBox.height>=895,'phone AI uses full dynamic viewport');}
    else if(width<=900){assert.ok(panelBox.x>=0&&panelBox.x<=10&&panelBox.width<=width&&panelBox.width>=width-20,'tablet-compact AI remains a bounded overlay');assert.ok(panelBox.height>=870,'tablet-compact AI keeps near-full viewport height');}
    else assert.ok(panelBox.width<=502&&panelBox.width>=420,'desktop AI remains a side panel');
    assert.equal(await panel.locator('.lourex-ai-tools').isVisible(),false,'legacy AI Inbox / AI Tools / Voice toolbar is not persistent chrome');
    assert.equal(await panel.locator('.lourex-ai-manager-button').isVisible(),false,'Memory & Tasks is not a separate persistent button');
    await textarea.fill(lang==='ar'?'سطر أول':'First line');await textarea.press('Shift+Enter');await textarea.type(lang==='ar'?'سطر ثان':'Second line');assert.match(await textarea.inputValue(),/\n/,'Shift+Enter creates multiline input');
    const fileInput=panel.locator('input[type="file"][multiple]');await fileInput.setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Sample business source')});await panel.locator('.lourex-ai-attachment-chip').waitFor();assert.match(await panel.locator('.lourex-ai-attachment-chip').innerText(),/source\.txt/);
    const chats=panel.getByRole('button',{name:lang==='ar'?'المحادثات':'Chats',exact:true});if(await chats.count()){await chats.click();await panel.locator('.lourex-ai-thread-search').waitFor();assert.ok((await panel.locator('.lourex-ai-thread-search').boundingBox()).height>=39,'searchable conversation history');await chats.click();}
    const menu=await openHub(panel);const memoryAction=menu.getByRole('button',{name:lang==='ar'?'الذاكرة والمهام':'Memory & Tasks',exact:true});await memoryAction.click();const manager=panel.locator('.lourex-ai-manager');await manager.waitFor();assert.match(await manager.innerText(),lang==='ar'?/الذاكرة الدائمة.*المهام والتذكيرات/s:/Durable memory.*Tasks & reminders/s);if(width<=720){const managerBox=await manager.boundingBox();assert.ok(managerBox&&managerBox.x<=1&&Math.abs(managerBox.width-width)<=2,'mobile Memory & Tasks manager is full width');}await manager.locator('.lourex-ai-manager-head > button').click();
    assert.equal(await panel.locator('.lourex-ai-hub-trigger').count(),1,'exactly one persistent Tools entry');
    await bounds();await panel.locator('.lourex-ai-close').click();
  };
  const proactive=async()=>{
    const mount=page.locator('[data-lourex-proactive-assistant-mount]');assert.equal(await mount.count(),1,'one canonical proactive mount');const dock=page.locator('.lourex-proactive-dock');await dock.waitFor({state:'attached'});assert.equal(await dock.isVisible(),false,'proactive intelligence must not add a floating dock/card');
    const hasSignal=await dock.evaluate(node=>node.classList.contains('has-signal'));const launcher=page.locator('.lourex-ai-launcher');if(hasSignal)assert.equal(await launcher.getAttribute('data-lourex-proactive-attention'),'true','existing assistant launcher carries the subtle proactive badge');
    await launcher.click();const panel=page.locator('#lourex-ai-panel');await panel.waitFor();const menu=await openHub(panel);await menu.getByRole('button',{name:lang==='ar'?'الموجز الصباحي':'Morning Brief',exact:true}).click();const brief=page.locator('.lourex-proactive-brief');await brief.waitFor();const copy=await brief.innerText();assert.match(copy,lang==='ar'?/الأعمال[\s\S]*الشخصي/:/Business[\s\S]*Personal/,'morning brief keeps Business and Personal sections separate');assert.match(copy,lang==='ar'?/يبقى نطاق الأعمال والنطاق الشخصي منفصلين/:/Business and Personal scopes stay separate/);if(width<=720){const visibleActions=brief.locator('.lourex-proactive-actions button:visible');for(let i=0;i<Math.min(await visibleActions.count(),4);i++){const box=await visibleActions.nth(i).boundingBox();assert.ok(box&&box.height>=43,'mobile proactive action target');}}const modal=brief.locator('xpath=ancestor::*[contains(@class,"modal")][1]');const close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');await panel.locator('.lourex-ai-close').click();await bounds();
  };
  await premium();await proactive();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-open-customer',{detail:{id:'c1'}})));await page.locator('.ta-customer-profile').waitFor();await question(lang==='ar'?'شرح الحساب':'Explain account',/Northstar|نورث/);await bounds();
  await page.evaluate(()=>{window.navigateWorkspace('items');});await page.locator('.ta-product-commandbar').waitFor();await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Product catalog|كتالوج منتجات/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-edit-product',{detail:{itemId:'p1'}})));await page.locator('.ta-product-editor.is-open').waitFor();await question(lang==='ar'?'مراجعة التسعير المحفوظ':'Review saved pricing',/VAL-1.*(Industrial valve|صمام صناعي)/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('documents'));await page.locator('.ta-documents-header').waitFor();await bounds();assert.ok((await page.locator('.ta-documents-header').boundingBox()).height<=240,'compact document header');await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Customer quotation|طلب عرض سعر/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.navigateWorkspace('receivables'));await question(lang==='ar'?'شرح المتأخرات':'Explain overdue',/collection priorities/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('reports'));await question(lang==='ar'?'شرح التقرير':'Explain report',/selected LOUREX report.*DATA ONLY/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('operations'));await question(lang==='ar'?'مراجعة المشتريات':'Review purchasing',/supplier purchase costs/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('editor'));await question(lang==='ar'?'مراجعة مع AI':'Review with AI',/QUO-QA-1.*explain totals/);await bounds();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'context, Tools hub, proactive brief, memory manager and attachment selection must wait for user Send');await page.screenshot({path:`${output}/${width}-${lang}-${theme}.png`,animations:'disabled'});report.push({width,lang,theme,context:'PASS',premiumConversation:'PASS',singleToolsHub:'PASS',toolsKeyboard:'PASS',noFloatingProactiveDock:'PASS',memoryTasks:'PASS',proactiveBrief:'PASS',captureRoutes:'PASS',providerCalls:requests.length});await page.close();
 }}finally{await browser.close();}writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(`Contextual AI final responsive + keyboard QA: ${report.length} bounded, review-first ${safari?'WebKit':'Chromium'} workspace paths PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
