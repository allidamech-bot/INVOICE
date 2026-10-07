const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const rgb=value=>{const parts=String(value||'').match(/[\d.]+/g)||[];return parts.slice(0,3).map(Number);};
const channel=value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
const luminance=value=>{const [r=0,g=0,b=0]=rgb(value);return .2126*channel(r)+.7152*channel(g)+.0722*channel(b);};
const contrast=(a,b)=>{const hi=Math.max(luminance(a),luminance(b)),lo=Math.min(luminance(a),luminance(b));return(hi+.05)/(lo+.05);};

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
        await page.evaluate(async selectedTheme=>{
          const [{setupVault},{emptyVault},{establishSession},{setUiThemePreference}]=await Promise.all([
            import('/dist/src/storage/vault.js'),
            import('/dist/src/lib/defaults.js'),
            import('/dist/src/storage/session.js'),
            import('/dist/src/lib/ui-theme.js')
          ]);
          const initial=emptyVault();
          initial.company.nameEn='LOUREX Final QA';
          const {key}=await setupVault('2468',initial);
          if(!await establishSession(key))throw new Error('Final AI QA could not establish encrypted session');
          setUiThemePreference(selectedTheme);
          window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa-final'}}));
        },theme);

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
        assert.equal(await panel.getAttribute('data-lourex-conversation-remediation'),'3','final conversation presentation owner must be mounted');
        const panelVisual=await panel.evaluate(node=>{const style=getComputedStyle(node);return{theme:document.documentElement.dataset.uiTheme,bg:style.backgroundColor,text:style.color,chatBg:style.getPropertyValue('--lx-chat-bg').trim(),chatMuted:style.getPropertyValue('--lx-chat-muted').trim(),chatAccent:style.getPropertyValue('--lx-chat-accent').trim()};});
        assert.equal(panelVisual.theme,theme,'fixture theme must reach the conversation');
        assert.equal(panelVisual.bg,theme==='dark'?'rgb(11, 12, 14)':'rgb(255, 255, 255)','conversation canvas must visibly follow the selected theme');
        assert.ok(contrast(panelVisual.text,panelVisual.bg)>=4.5,'conversation base text contrast must meet WCAG AA');

        const textarea=panel.locator('.lourex-ai-premium-textarea');
        const plus=panel.locator('.lourex-ai-composer-plus');
        const send=panel.locator('.lourex-ai-send');
        await textarea.waitFor({state:'visible'});
        const plusBox=await plus.boundingBox();
        assert.ok(plusBox&&plusBox.width>=43&&plusBox.height>=43,'unified plus target remains touch safe');
        const scopeTrigger=panel.locator('.lourex-ai-scope-trigger');
        await scopeTrigger.waitFor({state:'visible'});
        const scopeTriggerBox=await scopeTrigger.boundingBox();
        assert.ok(scopeTriggerBox&&scopeTriggerBox.width>=44&&scopeTriggerBox.height>=(width<=720?44:36),'consolidated scope trigger remains touch safe');
        assert.equal(await panel.locator('.lourex-ai-scope-button:visible').count(),0,'legacy three-tab scope chrome is visually retired');
        await scopeTrigger.click();
        const scopeMenu=panel.locator('.lourex-ai-scope-menu');
        await scopeMenu.waitFor({state:'visible'});
        assert.equal(await scopeMenu.locator('.lourex-ai-scope-option').count(),3,'scope selector keeps Business, Personal and Temporary available');
        if(width<=720){for(let i=0;i<3;i++){const box=await scopeMenu.locator('.lourex-ai-scope-option').nth(i).boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'mobile scope option remains 44px touch safe');}}
        await page.keyboard.press('Escape');
        await scopeMenu.waitFor({state:'hidden'});
        await textarea.waitFor({state:'visible'});
        assert.equal(await panel.isVisible(),true,'closing the scope menu with Escape must keep the advisor open');
        assert.equal(await panel.locator('.lourex-ai-attach-button').isVisible(),false,'duplicate attachment control stays retired');
        await textarea.fill(lang==='ar'?'سطر أول':'First line');
        await textarea.press('Shift+Enter');
        await textarea.type(lang==='ar'?'سطر ثان':'Second line');
        assert.match(await textarea.inputValue(),/\n/,'multiline composer remains functional');
        const fileInput=panel.locator('input[type="file"][multiple]');
        await fileInput.setInputFiles({name:'final-qa.txt',mimeType:'text/plain',buffer:Buffer.from('Final AI responsive QA source')});
        const attachmentChip=panel.locator('.lourex-ai-attachment-chip');
        await attachmentChip.waitFor({state:'visible'});
        assert.match(await attachmentChip.innerText(),/final-qa\.txt/,'selected attachment is visible before Send');
        await attachmentChip.locator('.lourex-ai-attachment-remove').click();
        await attachmentChip.waitFor({state:'hidden'});

        // Exercise the actual user-facing textarea keyboard path separately from tool/menu lifecycle.
        await textarea.fill('Cost is 10 and margin 20%');
        const beforeKeyboardAssistants=await panel.locator('.lourex-ai-message.assistant').count();
        await textarea.press('Enter');
        const userMessage=panel.locator('.lourex-ai-message.user').filter({hasText:'Cost is 10'}).last();
        await userMessage.waitFor({state:'visible'});
        await page.waitForFunction(count=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.assistant').length>count,beforeKeyboardAssistants);
        const userVisual=await userMessage.evaluate(node=>{const style=getComputedStyle(node);return{bg:style.backgroundColor,text:style.color};});
        assert.ok(contrast(userVisual.text,userVisual.bg)>=4.5,'user bubble must meet WCAG AA text contrast');
        const messagesBox=await panel.locator('.lourex-ai-messages').boundingBox();
        const userBox=await userMessage.boundingBox();
        assert.ok(messagesBox&&userBox,'sender geometry must be measurable');
        const senderLeftGap=userBox.x-messagesBox.x;
        const senderRightGap=(messagesBox.x+messagesBox.width)-(userBox.x+userBox.width);
        assert.ok(senderRightGap<=senderLeftGap,'user bubble must stay on the physical right in both LTR and RTL');
        if(width<=720){
          const messageActions=panel.locator('.lourex-ai-message-actions .lourex-ai-message-action');
          for(let i=0;i<await messageActions.count();i++){const box=await messageActions.nth(i).boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'mobile message action remains 44px touch safe');}
        }
        assert.deepEqual(requests,[],'visible textarea Enter must keep deterministic margin calculation local');

        assert.equal(await panel.locator('.lourex-ai-hub-trigger').isVisible(),false,'persistent Tools hub is retired from conversation chrome');
        await plus.click();
        const menu=panel.locator('.lourex-ai-plus-menu');
        await menu.waitFor({state:'visible'});
        await menu.evaluate(async node=>{await Promise.all(node.getAnimations().map(animation=>animation.finished.catch(()=>undefined)));});
        assert.equal(await menu.getAttribute('data-view'),'root','plus opens the compact root gateway first');
        const rootCopy=await menu.innerText();
        assert.match(rootCopy,lang==='ar'?/الكاميرا[\s\S]*الصور والملفات[\s\S]*أدوات AI/:/Camera[\s\S]*Photos & files[\s\S]*AI Tools/,'root gateway exposes sources and AI Tools');
        const rootBox=await menu.boundingBox();
        assert.ok(rootBox&&rootBox.x>=-1&&rootBox.x+rootBox.width<=width+1&&rootBox.y>=-1&&rootBox.y+rootBox.height<=height+1,'plus root menu stays inside viewport');
        assert.ok(Math.abs(rootBox.x-plusBox.x)<=14,'plus menu remains physically anchored to the visible + control in LTR and RTL');
        const menuVisual=await menu.evaluate(node=>{const style=getComputedStyle(node);return{bg:style.backgroundColor,color:style.color};});
        assert.ok(contrast(menuVisual.color,menuVisual.bg)>=4.5,'plus menu text contrast must meet WCAG AA');
        if(width<=720){
          const rootItems=menu.locator('.lourex-ai-plus-item');
          for(let i=0;i<await rootItems.count();i++){const box=await rootItems.nth(i).boundingBox();assert.ok(box&&box.height>=44&&box.width>=44,'mobile root + item remains 44px touch safe');}
        }
        const toolsEntry=menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'أدوات AI':'AI Tools'}).last();
        await toolsEntry.click();
        await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');
        const toolsCopy=await menu.innerText();
        assert.match(toolsCopy,lang==='ar'?/صندوق AI[\s\S]*الموجز الصباحي[\s\S]*الذاكرة والمهام/:/AI Inbox[\s\S]*Morning Brief[\s\S]*Memory & Tasks/,'nested AI Tools exposes canonical destinations');
        const toolsBox=await menu.boundingBox();
        assert.ok(toolsBox&&toolsBox.x>=-1&&toolsBox.x+toolsBox.width<=width+1&&toolsBox.y>=-1&&toolsBox.y+toolsBox.height<=height+1,'nested AI Tools stays inside viewport');
        assert.ok(Math.abs(toolsBox.x-plusBox.x)<=14,'nested AI Tools remains physically anchored to the visible + control');
        const actions=menu.locator('.lourex-ai-plus-item');
        assert.ok((await actions.count())>=10,'AI Tools menu exposes the full LOUREX tool set');
        await page.waitForFunction(()=>document.activeElement?.classList?.contains('lourex-ai-plus-item'));
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'opening AI Tools focuses Back first');
        await page.keyboard.press('End');
        assert.equal(await actions.last().evaluate(node=>node===document.activeElement),true,'End focuses last AI tool');
        await page.keyboard.press('Home');
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'Home restores Back focus');
        await page.keyboard.press('ArrowDown');
        assert.equal(await actions.nth(1).evaluate(node=>node===document.activeElement),true,'ArrowDown advances AI tool focus');
        await page.keyboard.press('ArrowUp');
        assert.equal(await actions.first().evaluate(node=>node===document.activeElement),true,'ArrowUp returns AI tool focus to Back');
        await page.keyboard.press('Escape');
        await menu.waitFor({state:'hidden'});
        assert.equal(await plus.evaluate(node=>node===document.activeElement),true,'Escape returns focus to unified plus');

        await plus.click();
        await menu.waitFor({state:'visible'});
        await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'أدوات AI':'AI Tools'}).last().click();
        await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');
        await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'الذاكرة والمهام':'Memory & Tasks'}).click();
        const manager=panel.locator('.lourex-ai-manager');
        await manager.waitFor({state:'visible'});
        const managerBox=await manager.boundingBox();
        assert.ok(managerBox&&managerBox.x>=-1&&managerBox.x+managerBox.width<=width+1,'Memory & Tasks remains within viewport');
        if(width<=720)assert.ok(Math.abs(managerBox.width-width)<=2,'mobile Memory & Tasks is full width');
        await manager.locator('.lourex-ai-manager-head > button').click();

        // After opening/closing Tools and Memory, the visible composer must still submit normally.
        await textarea.fill(lang==='ar'?'اعرض وضع الخزينة والسيولة':'Show treasury and cash status');
        const beforeTreasuryAssistants=await panel.locator('.lourex-ai-message.assistant').count();
        assert.equal(await send.isEnabled(),true,'Send remains enabled after Tools and Memory lifecycle');
        await send.click();
        await page.waitForFunction(count=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.assistant').length>count,beforeTreasuryAssistants);
        const assistant=panel.locator('.lourex-ai-message.assistant').last();
        await assistant.waitFor({state:'visible'});
        assert.equal(await assistant.locator('.lourex-ai-structured-answer').count(),1,'assistant answer uses executive structured renderer');
        const activity=panel.locator('.lourex-ai-tool-activity').last();
        await activity.waitFor({state:'visible'});
        assert.match(await activity.innerText(),lang==='ar'?/خطة LOUREX/:/LOUREX plan/,'deterministic request exposes visible local tool plan');
        assert.equal(await activity.locator('.lourex-ai-tool-steps').isVisible(),false,'tool activity details are collapsed by default');
        await activity.locator('.lourex-ai-tool-activity-head').click();
        assert.equal(await activity.locator('.lourex-ai-tool-steps').isVisible(),true,'tool activity details remain available on demand');
        const activityBox=await activity.boundingBox();
        assert.ok(activityBox&&activityBox.x>=panelBox.x-1&&activityBox.x+activityBox.width<=panelBox.x+panelBox.width+1,'tool plan remains inside assistant panel');
        assert.deepEqual(requests,[],'deterministic treasury path must not call an AI provider');

        await plus.click();
        await menu.waitFor({state:'visible'});
        await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'أدوات AI':'AI Tools'}).last().click();
        await page.waitForFunction(()=>document.querySelector('#lourex-ai-panel .lourex-ai-plus-menu')?.dataset?.view==='tools');
        await menu.locator('.lourex-ai-plus-item').filter({hasText:lang==='ar'?'الموجز الصباحي':'Morning Brief'}).click();
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
        report.push({engine:matrix.name,width,height,lang,theme,panel:'PASS',composer:'PASS',keyboardSend:'PASS',attachments:'PASS',toolsKeyboard:'PASS',memoryTasks:'PASS',postToolsSend:'PASS',structuredAnswer:'PASS',localToolPlan:'PASS',morningBrief:'PASS',canvas:panelVisual.bg,userContrast:Number(contrast(userVisual.text,userVisual.bg).toFixed(2)),providerCalls:requests.length});
        await page.close();
      }
    }finally{
      await browser.close();
    }
  }

  writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`AI Conversation Batch 5 final responsive/visual/interaction QA: ${report.length} Chromium/WebKit cases PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
