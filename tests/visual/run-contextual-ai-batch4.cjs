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
  const openTools=async(panel)=>{
    const plus=panel.locator('.lourex-ai-composer-plus');await plus.waitFor({state:'visible'});const box=await plus.boundingBox();assert.ok(box&&box.height>=43&&box.width>=43,'unified plus target');
    assert.equal(await panel.locator('.lourex-ai-hub-trigger').isVisible(),false,'persistent Tools hub is retired from conversation chrome');
    await plus.click();const menu=panel.locator('.lourex-ai-plus-menu');await menu.waitFor({state:'visible'});assert.equal(await menu.getAttribute('data-view'),'root','plus opens the compact source gateway');
    const rootCopy=await menu.innerText();assert.match(rootCopy,lang==='ar'?/الكاميرا[\s\S]*الصور والملفات[\s\S]*أدوات AI/:/Camera[\s\S]*Photos & files[\s\S]*AI Tools/,'plus root contains sources and nested AI Tools');
    const rootBox=await menu.boundingBox();assert.ok(rootBox&&rootBox.x>=-1&&rootBox.x+rootBox.width<=width+1&&rootBox.y>=-1&&rootBox.y+rootBox.height<=901,'plus root menu remains inside viewport');
    await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'أدوات AI':'AI Tools'}).last().click();await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');
    const copy=await menu.innerText();assert.match(copy,lang==='ar'?/صندوق AI[\s\S]*الموجز الصباحي[\s\S]*الذاكرة والمهام/:/AI Inbox[\s\S]*Morning Brief[\s\S]*Memory & Tasks/,'nested AI Tools contains canonical destinations');
    const actions=menu.locator('.lourex-ai-plus-item');assert.ok((await actions.count())>=10,'AI Tools exposes the full LOUREX tool set');
    if(width<=720){for(let i=0;i<await actions.count();i++){const target=await actions.nth(i).boundingBox();assert.ok(target&&target.height>=44&&target.width>=44,'mobile AI Tools action meets 44px target');}}
    if(!keyboardChecked){
      await page.waitForFunction(()=>document.activeElement?.classList?.contains('lourex-ai-plus-item'));
      assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'opening AI Tools moves focus to Back');
      await page.keyboard.press('ArrowDown');assert.equal(await actions.nth(1).evaluate(node=>node===document.activeElement),true,'ArrowDown advances AI Tools focus');
      await page.keyboard.press('End');assert.equal(await actions.last().evaluate(node=>node===document.activeElement),true,'End moves AI Tools focus to final action');
      await page.keyboard.press('Home');assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'Home moves AI Tools focus to Back');
      await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await plus.evaluate(node=>node===document.activeElement),true,'Escape returns focus to unified plus');
      await plus.click();await menu.waitFor({state:'visible'});await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'أدوات AI':'AI Tools'}).last().click();await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');keyboardChecked=true;
    }
    return menu;
  };
  const premium=async()=>{
    await page.locator('.lourex-ai-launcher').click();
    const panel=page.locator('#lourex-ai-panel'),textarea=panel.locator('.lourex-ai-premium-textarea'),bridge=panel.locator('.lourex-ai-compose-bridge'),plus=panel.locator('.lourex-ai-composer-plus');
    await textarea.waitFor();assert.equal(await textarea.count(),1,'premium textarea');assert.equal(await bridge.count(),1,'legacy input bridge retained');
    const plusBox=await plus.boundingBox();assert.ok(plusBox&&plusBox.width>=43&&plusBox.height>=43,'44px unified plus target');assert.equal(await panel.locator('.lourex-ai-attach-button').isVisible(),false,'duplicate attachment control stays retired');
    const panelBox=await panel.boundingBox();assert.ok(panelBox,'AI panel visible');
    const scopeTrigger=panel.locator('.lourex-ai-scope-trigger');await scopeTrigger.waitFor({state:'visible'});assert.equal(await panel.locator('.lourex-ai-scope-button:visible').count(),0,'persistent three-tab scope chrome is consolidated');
    await scopeTrigger.click();const scopeMenu=panel.locator('.lourex-ai-scope-menu');await scopeMenu.waitFor({state:'visible'});assert.equal(await scopeMenu.locator('.lourex-ai-scope-option').count(),3,'scope selector preserves all three scopes');if(width<=720){const triggerBox=await scopeTrigger.boundingBox();assert.ok(triggerBox&&triggerBox.height>=44,'mobile scope selector remains touch safe');}await page.keyboard.press('Escape');await scopeMenu.waitFor({state:'hidden'});await textarea.waitFor({state:'visible'});assert.equal(await panel.isVisible(),true,'scope-menu Escape keeps the advisor open');
    if(width<=720){assert.ok(panelBox.x<=1&&Math.abs(panelBox.width-width)<=2,'phone AI is full width');assert.ok(panelBox.height>=895,'phone AI uses full dynamic viewport');}
    else if(width<=900){assert.ok(panelBox.x>=0&&panelBox.x+panelBox.width<=width+1&&panelBox.width>=480&&panelBox.width<=540,'tablet AI remains a bounded side overlay');assert.ok(panelBox.height>=870,'tablet AI keeps near-full viewport height');}
    else assert.ok(panelBox.x>=0&&panelBox.x+panelBox.width<=width+1&&panelBox.width>=560&&panelBox.width<=600,'desktop AI uses the wider readable side panel from the conversation design audit');
    assert.equal(await panel.locator('.lourex-ai-tools').isVisible(),false,'legacy AI Inbox / AI Tools / Voice toolbar is not persistent chrome');
    assert.equal(await panel.locator('.lourex-ai-manager-button').isVisible(),false,'Memory & Tasks is not a separate persistent button');
    await textarea.fill(lang==='ar'?'سطر أول':'First line');await textarea.press('Shift+Enter');await textarea.type(lang==='ar'?'سطر ثان':'Second line');assert.match(await textarea.inputValue(),/\n/,'Shift+Enter creates multiline input');
    const fileInput=panel.locator('input[type="file"][multiple]');await fileInput.setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Sample business source')});await panel.locator('.lourex-ai-attachment-chip').waitFor();assert.match(await panel.locator('.lourex-ai-attachment-chip').innerText(),/source\.txt/);
    const overflow=panel.locator('.lourex-ai-overflow-trigger');await overflow.click();const overflowMenu=panel.locator('.lourex-ai-overflow-menu');await overflowMenu.waitFor({state:'visible'});await overflowMenu.getByRole('menuitem',{name:lang==='ar'?'المحادثات':'Conversations',exact:true}).click();const threadPicker=panel.locator('.lourex-ai-thread-picker');await threadPicker.waitFor({state:'visible'});assert.ok((await threadPicker.boundingBox()).height>0,'conversation history opens from header overflow');await overflow.click();await overflowMenu.waitFor({state:'visible'});await overflowMenu.getByRole('menuitem',{name:lang==='ar'?'المحادثات':'Conversations',exact:true}).click();await threadPicker.waitFor({state:'hidden'});
    const menu=await openTools(panel);const memoryAction=menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'الذاكرة والمهام':'Memory & Tasks'});await memoryAction.click();const manager=panel.locator('.lourex-ai-manager');await manager.waitFor();assert.match(await manager.innerText(),lang==='ar'?/ما يتذكره LOUREX.*المهام والتذكيرات/s:/What LOUREX remembers.*Tasks & reminders/s);if(width<=720){const managerBox=await manager.boundingBox();assert.ok(managerBox&&managerBox.x<=1&&Math.abs(managerBox.width-width)<=2,'mobile Memory & Tasks manager is full width');}await manager.locator('.lourex-ai-manager-head > button').click();
    assert.equal(await panel.locator('.lourex-ai-hub-trigger').isVisible(),false,'persistent Tools entry remains hidden');
    await bounds();await panel.locator('.lourex-ai-close').click();
  };
  const proactive=async()=>{
    const mount=page.locator('[data-lourex-proactive-assistant-mount]');assert.equal(await mount.count(),1,'one canonical proactive mount');const dock=page.locator('.lourex-proactive-dock');await dock.waitFor({state:'attached'});assert.equal(await dock.isVisible(),false,'proactive intelligence must not add a floating dock/card');
    const hasSignal=await dock.evaluate(node=>node.classList.contains('has-signal'));const launcher=page.locator('.lourex-ai-launcher');if(hasSignal)assert.equal(await launcher.getAttribute('data-lourex-proactive-attention'),'true','existing assistant launcher carries the subtle proactive badge');
    await launcher.click();const panel=page.locator('#lourex-ai-panel');await panel.waitFor();const menu=await openTools(panel);await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'الموجز الصباحي':'Morning Brief'}).click();const brief=page.locator('.lourex-proactive-brief');await brief.waitFor();const copy=await brief.innerText();assert.match(copy,lang==='ar'?/الأعمال[\s\S]*الشخصي/:/Business[\s\S]*Personal/,'morning brief keeps Business and Personal sections separate');assert.match(copy,lang==='ar'?/يبقى نطاق الأعمال والنطاق الشخصي منفصلين/:/Business and Personal scopes stay separate/);if(width<=720){const visibleActions=brief.locator('.lourex-proactive-actions button:visible');for(let i=0;i<Math.min(await visibleActions.count(),4);i++){const box=await visibleActions.nth(i).boundingBox();assert.ok(box&&box.height>=43,'mobile proactive action target');}}const modal=brief.locator('xpath=ancestor::*[contains(@class,"modal")][1]');const close=modal.locator('.modal-header .icon-btn');if(await close.count())await close.click();else await page.keyboard.press('Escape');await panel.locator('.lourex-ai-close').click();await bounds();
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
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'context, unified plus tools, proactive brief, memory manager and attachment selection must wait for user Send');await page.screenshot({path:`${output}/${width}-${lang}-${theme}.png`,animations:'disabled'});report.push({width,lang,theme,context:'PASS',premiumConversation:'PASS',unifiedPlusTools:'PASS',toolsKeyboard:'PASS',noFloatingProactiveDock:'PASS',memoryTasks:'PASS',proactiveBrief:'PASS',captureRoutes:'PASS',providerCalls:requests.length});await page.close();
 }}finally{await browser.close();}writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(`Contextual AI final responsive + keyboard QA: ${report.length} bounded, review-first ${safari?'WebKit':'Chromium'} workspace paths PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});