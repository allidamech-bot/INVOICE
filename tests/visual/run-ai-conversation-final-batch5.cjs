const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

(async()=>{
  const output='visual-qa-output/ai-conversation-final-batch5';
  mkdirSync(output,{recursive:true});
  const report=[];
  const matrices=[
    {engine:chromium,name:'chromium',cases:[[320,'ar','dark'],[390,'en','light'],[820,'ar','light'],[1440,'en','dark']]},
    {engine:webkit,name:'webkit',cases:[[320,'ar','dark'],[390,'en','light'],[820,'ar','light']]}
  ];

  for(const matrix of matrices){
    const browser=await matrix.engine.launch({headless:true});
    try{
      for(const [width,lang,theme] of matrix.cases){
        const height=width<=430?844:width<=900?1180:1000;
        const page=await browser.newPage({viewport:{width,height}});
        const errors=[];
        const requests=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/api/**',route=>{
          requests.push(route.request().url());
          return route.fulfill({status:503,body:'Unexpected provider call in deterministic final QA'});
        });
        await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${lang}&theme=${theme}`,{waitUntil:'networkidle'});
        await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
        await page.evaluate(async()=>{
          const [{setupVault},{emptyVault},{establishSession}]=await Promise.all([
            import('/dist/src/storage/vault.js'),
            import('/dist/src/lib/defaults.js'),
            import('/dist/src/storage/session.js')
          ]);
          const initial=emptyVault();
          initial.company.nameEn='LOUREX Final QA';
          const {key}=await setupVault('2468',initial);
          if(!await establishSession(key))throw new Error('Final AI QA could not establish encrypted session');
          window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-final'}}));
        });

        const launcher=page.locator('.lourex-ai-launcher');
        await launcher.click();
        const panel=page.locator('#lourex-ai-panel');
        await panel.waitFor({state:'visible'});
        const panelBox=await panel.boundingBox();
        assert.ok(panelBox,'assistant panel must be visible');
        assert.ok(panelBox.x>=-1&&panelBox.y>=-1,'assistant panel begins inside viewport');
        assert.ok(panelBox.x+panelBox.width<=width+1,'assistant panel must not overflow horizontally');
        assert.ok(panelBox.y+panelBox.height<=height+2,'assistant panel must not overflow vertically');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page must not gain horizontal overflow');

        const textarea=panel.locator('.lourex-ai-premium-textarea');
        const attach=panel.locator('.lourex-ai-attach-button');
        await textarea.waitFor({state:'visible'});
        const attachBox=await attach.boundingBox();
        assert.ok(attachBox&&attachBox.width>=43&&attachBox.height>=43,'attachment target remains touch safe');
        await textarea.fill(lang==='ar'?'سطر أول':'First line');
        await textarea.press('Shift+Enter');
        await textarea.type(lang==='ar'?'سطر ثان':'Second line');
        assert.match(await textarea.inputValue(),/\n/,'multiline composer remains functional');
        const fileInput=panel.locator('input[type="file"][multiple]');
        await fileInput.setInputFiles({name:'final-qa.txt',mimeType:'text/plain',buffer:Buffer.from('Final AI responsive QA source')});
        await panel.locator('.lourex-ai-attachment-chip').waitFor({state:'visible'});

        const trigger=panel.locator('.lourex-ai-hub-trigger');
        assert.equal(await trigger.count(),1,'exactly one Tools trigger');
        await trigger.click();
        const menu=panel.locator('.lourex-ai-hub-menu');
        await menu.waitFor({state:'visible'});
        const menuBox=await menu.boundingBox();
        assert.ok(menuBox,'Tools menu must be visible');
        assert.ok(menuBox.x>=-1&&menuBox.x+menuBox.width<=width+1,'Tools menu stays horizontally inside viewport');
        assert.ok(menuBox.y>=-1&&menuBox.y+menuBox.height<=height+1,'Tools menu stays vertically inside viewport');
        const actions=menu.locator('.lourex-ai-hub-action');
        assert.ok((await actions.count())>=4,'Tools menu exposes canonical destinations');
        await page.waitForFunction(()=>document.activeElement?.classList?.contains('lourex-ai-hub-action'));
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'opening Tools focuses first action');
        await page.keyboard.press('End');
        assert.equal(await actions.last().evaluate(node=>node===document.activeElement),true,'End focuses last Tool');
        await page.keyboard.press('Home');
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'Home focuses first Tool');
        await page.keyboard.press('ArrowDown');
        assert.equal(await actions.nth(1).evaluate(node=>node===document.activeElement),true,'ArrowDown advances Tool focus');
        await page.keyboard.press('ArrowUp');
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'ArrowUp restores Tool focus');
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-hub-trigger')?.getAttribute('aria-expanded')!=='true');
        assert.equal(await trigger.evaluate(node=>node===document.activeElement),true,'Escape returns focus to Tools trigger');

        await trigger.click();
        await menu.waitFor({state:'visible'});
        await menu.getByRole('button',{name:lang==='ar'?'الذاكرة والمهام':'Memory & Tasks',exact:true}).click();
        const manager=panel.locator('.lourex-ai-manager');
        await manager.waitFor({state:'visible'});
        const managerBox=await manager.boundingBox();
        assert.ok(managerBox&&managerBox.x>=-1&&managerBox.x+managerBox.width<=width+1,'Memory & Tasks remains within viewport');
        if(width<=720)assert.ok(Math.abs(managerBox.width-width)<=2,'mobile Memory & Tasks is full width');
        await manager.locator('.lourex-ai-manager-head > button').click();

        const bridge=panel.locator('.lourex-ai-compose form>input');
        await bridge.fill(lang==='ar'?'اعرض وضع الخزينة والسيولة':'Show treasury and cash status');
        await bridge.press('Enter');
        const assistant=panel.locator('.lourex-ai-message.assistant').last();
        await assistant.waitFor({state:'visible'});
        assert.equal(await assistant.locator('.lourex-ai-structured-answer').count(),1,'assistant answer uses executive structured renderer');
        const activity=panel.locator('.lourex-ai-tool-activity').last();
        await activity.waitFor({state:'visible'});
        assert.match(await activity.innerText(),lang==='ar'?/خطة LOUREX/:/LOUREX plan/,'deterministic request exposes visible local tool plan');
        const activityBox=await activity.boundingBox();
        assert.ok(activityBox&&activityBox.x>=panelBox.x-1&&activityBox.x+activityBox.width<=panelBox.x+panelBox.width+1,'tool plan remains inside assistant panel');
        assert.deepEqual(requests,[],'deterministic treasury path must not call an AI provider');

        await trigger.click();
        await menu.waitFor({state:'visible'});
        await menu.getByRole('button',{name:lang==='ar'?'الموجز الصباحي':'Morning Brief',exact:true}).click();
        const brief=page.locator('.lourex-proactive-brief');
        await brief.waitFor({state:'visible'});
        const briefBox=await brief.boundingBox();
        assert.ok(briefBox&&briefBox.x>=-1&&briefBox.x+briefBox.width<=width+1,'Morning Brief stays within viewport');
        assert.match(await brief.innerText(),lang==='ar'?/الأعمال[\s\S]*الشخصي/:/Business[\s\S]*Personal/,'Morning Brief keeps Business and Personal separated');
        const modal=brief.locator('xpath=ancestor::*[contains(@class,"modal")][1]');
        const close=modal.locator('.modal-header .icon-btn');
        if(await close.count())await close.click();else await page.keyboard.press('Escape');

        assert.deepEqual(errors,[],'final AI QA must have no page errors');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'final AI state must remain overflow free');
        await page.screenshot({path:`${output}/${matrix.name}-${width}-${lang}-${theme}.png`,animations:'disabled'});
        report.push({engine:matrix.name,width,height,lang,theme,panel:'PASS',composer:'PASS',attachments:'PASS',toolsKeyboard:'PASS',memoryTasks:'PASS',structuredAnswer:'PASS',localToolPlan:'PASS',morningBrief:'PASS',providerCalls:requests.length});
        await page.close();
      }
    }finally{
      await browser.close();
    }
  }

  writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`AI Conversation Batch 5 final responsive/visual/interaction QA: ${report.length} Chromium/WebKit cases PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
