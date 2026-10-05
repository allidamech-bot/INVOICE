const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
(async()=>{
 const output='visual-qa-output/ai-voice-reliability-batch5';mkdirSync(output,{recursive:true});const report=[];
 for(const [engine,width,lang] of [[chromium,390,'en'],[webkit,320,'ar']]){
  const browser=await engine.launch({headless:true});try{
   const page=await browser.newPage({viewport:{width,height:844}});const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'No live provider in fixture'});});
   await page.addInitScript(({releaseDelay})=>{
    window.speechInstances=[];window.nativeOwner=null;window.overlappingStarts=0;window.nativeReleaseDelayMs=releaseDelay;
    const releaseLater=instance=>window.setTimeout(()=>{if(window.nativeOwner===instance)window.nativeOwner=null;},window.nativeReleaseDelayMs);
    class Recognition{
     constructor(){window.speechInstances.push(this);}
     start(){if(window.nativeOwner){window.overlappingStarts++;throw new Error('native microphone is still owned');}window.nativeOwner=this;this.onstart?.();}
     stop(){this.stopCalled=true;}
     abort(){this.abortCalled=true;releaseLater(this);}
     result(text){const row={0:{transcript:text},length:1,isFinal:true};this.onresult?.({results:[row]});}
     end(){this.onend?.();releaseLater(this);}
    }
    window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;
   },{releaseDelay:engine.name()==='webkit'?1450:260});
   await page.goto(`http://127.0.0.1:4173/tests/visual/ai-voice-reliability-batch5.html?lang=${lang}`,{waitUntil:'networkidle'});await page.locator('.lourex-ai-launcher').click();const mic=page.locator('.lourex-ai-composer-mic'),input=page.locator('.lourex-ai-compose form>input'),textarea=page.locator('.lourex-ai-premium-textarea');await mic.waitFor();
   assert.equal(await page.locator('.lourex-ai-scope-button').count(),3,'unified assistant exposes Business, Personal and Temporary scopes');
   assert.equal(await page.evaluate(()=>window.__LOUREX_VOICE_RUNTIME_OWNER__),'ios-release-v2','final composer exposes the current iOS voice owner');
   await mic.click();await page.evaluate(()=>{window.staleResult=window.speechInstances[0].onresult;window.speechInstances[0].result('first session');});assert.equal(await input.inputValue(),'first session');
   await mic.click();assert.equal(await page.evaluate(()=>window.speechInstances.length),1,'restart waits for native onend');await page.evaluate(()=>window.speechInstances[0].end());await page.waitForFunction(()=>window.speechInstances.length===2);
   await mic.click();await page.evaluate(()=>{window.speechInstances[1].result('second session');window.speechInstances[1].end();});assert.equal(await input.inputValue(),'first session second session','manual stop accepts final transcript');
   await mic.click();await page.waitForFunction(()=>window.speechInstances.length===3);await page.evaluate(()=>window.speechInstances[2].onerror?.({error:'no-speech'}));assert.equal(await page.locator('.lourex-ai-voice-status').getAttribute('data-state'),'error');const retry=page.locator('.lourex-ai-voice-retry');await retry.waitFor({state:'visible'});await retry.click();await page.evaluate(()=>window.speechInstances[2].end());await page.waitForFunction(()=>window.speechInstances.length===4);await page.evaluate(()=>{window.staleResult({results:[{0:{transcript:'STALE'},length:1,isFinal:true}]});window.speechInstances[3].result('retry ١٢۳ session');window.speechInstances[3].end();});assert.equal(await input.inputValue(),'first session second session retry 123 session');assert.equal(await textarea.inputValue(),'first session second session retry 123 session','voice transcript remains editable in premium composer');
   assert.match(await page.locator('.lourex-ai-voice-status').innerText(),lang==='ar'?/جاهز|النص الصوتي/:/Transcript ready|edit or send/);
   await mic.click();await page.waitForFunction(()=>window.speechInstances.length===5);await page.locator('.lourex-ai-close').click();await page.waitForFunction(()=>window.speechInstances[4].abortCalled);await page.locator('.lourex-ai-launcher').click();await mic.click();await page.waitForFunction(()=>window.speechInstances.length===6);await page.evaluate(()=>window.speechInstances[5].end());
   await mic.click();await page.waitForFunction(()=>window.speechInstances.length===7);await page.evaluate(()=>window.speechInstances[6].result('fallback cleanup'));await page.waitForFunction(()=>window.speechInstances[6].abortCalled);await mic.click();await page.waitForFunction(()=>window.speechInstances.length===8);await page.evaluate(()=>window.speechInstances[7].end());

   for(let cycle=0;cycle<4;cycle+=1){
    const expected=9+cycle;await mic.click();await page.waitForFunction(count=>window.speechInstances.length===count,expected);await page.evaluate(({index,cycle})=>{window.speechInstances[index].result(`repeat session ${cycle+1}`);window.speechInstances[index].end();},{index:expected-1,cycle});
   }
   assert.equal(await page.evaluate(()=>window.speechInstances.length),12,'twelve independent speech sessions must be constructible in one open app lifecycle');
   assert.match(await input.inputValue(),/repeat session 4$/,'twelfth session transcript reaches the editable composer');
   assert.equal(await page.evaluate(()=>window.overlappingStarts),0,'Safari delayed release must never receive overlapping recognition.start() calls');assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'voice must not call providers before explicit Send');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await mic.boundingBox();assert.ok(box.width>=44&&box.height>=44);

   await input.fill(lang==='ar'?'اعرض وضع الخزينة والسيولة':'Show treasury and cash status');await input.press('Enter');
   await page.locator('.lourex-ai-message.assistant').last().waitFor({state:'visible'});
   const toolActivity=page.locator('.lourex-ai-tool-activity').last();await toolActivity.waitFor({state:'visible'});
   assert.match(await toolActivity.innerText(),lang==='ar'?/خطة LOUREX/:/LOUREX plan/,'deterministic tool request exposes the visible LOUREX plan');
   assert.ok((await toolActivity.locator('.lourex-ai-tool-step').count())>=1,'visible LOUREX plan lists at least one tool step');
   const panel=page.locator('#lourex-ai-panel'),messages=page.locator('#lourex-ai-panel .lourex-ai-messages');
   const activityBox=await toolActivity.boundingBox(),panelBox=await panel.boundingBox(),messagesBox=await messages.boundingBox();
   const geometry=await toolActivity.evaluate(el=>{const style=getComputedStyle(el),parent=el.parentElement,parentStyle=parent?getComputedStyle(parent):null;return{className:el.className,parentClass:parent?.className||'',offsetParentClass:el.offsetParent?.className||'',style:{display:style.display,position:style.position,width:style.width,maxWidth:style.maxWidth,minWidth:style.minWidth,marginLeft:style.marginLeft,marginRight:style.marginRight,transform:style.transform,translate:style.translate,boxSizing:style.boxSizing,alignSelf:style.alignSelf,overflow:style.overflow},parentStyle:parentStyle?{display:parentStyle.display,width:parentStyle.width,paddingLeft:parentStyle.paddingLeft,paddingRight:parentStyle.paddingRight,overflowX:parentStyle.overflowX,direction:parentStyle.direction}:null,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,parentScrollWidth:parent?.scrollWidth||0,parentClientWidth:parent?.clientWidth||0};});
   const activityContained=Boolean(activityBox&&panelBox&&activityBox.x>=panelBox.x-1&&activityBox.x+activityBox.width<=panelBox.x+panelBox.width+1);
   if(!activityContained)console.error('TOOL_ACTIVITY_GEOMETRY',JSON.stringify({engine:engine.name(),width,lang,activityBox,panelBox,messagesBox,geometry}));
   assert.ok(activityContained,`tool activity card stays inside assistant panel; geometry=${JSON.stringify({activityBox,panelBox,messagesBox,geometry})}`);
   assert.deepEqual(requests,[],'deterministic treasury tool must remain local and avoid provider calls');
   const naturalLanguageOs='PASS';

   let unifiedAssistant='not-run';
   if(engine.name()==='chromium'){
    await input.fill('Cost is 10 and margin 20%');await input.press('Enter');
    await page.locator('.lourex-ai-message.assistant').last().waitFor({state:'visible'});
    assert.deepEqual(requests,[],'deterministic advisor calculation must not call a provider');
    const overflow=page.locator('.lourex-ai-overflow-trigger');await overflow.waitFor({state:'visible'});await overflow.click();
    const overflowMenu=page.locator('.lourex-ai-overflow-menu');await overflowMenu.waitFor({state:'visible'});
    await overflowMenu.getByRole('menuitem',{name:/New conversation|محادثة جديدة/}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.lourex-ai-message').length===0);
    await page.locator('.lourex-ai-history-button').click();
    await page.locator('.lourex-ai-thread-row').first().waitFor({state:'visible'});
    assert.ok((await page.locator('.lourex-ai-thread-row').count())>=1,'saved assistant conversation must appear in recent chats');
    await page.locator('.lourex-ai-thread-open').first().click();
    await page.locator('.lourex-ai-message.user').filter({hasText:'Cost is 10'}).waitFor({state:'visible'});
    const scopes=page.locator('.lourex-ai-scope-button');
    await scopes.nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('.lourex-ai-scope-button')[1]?.getAttribute('aria-selected')==='true');
    assert.equal(await page.locator('.lourex-ai-message').count(),0,'personal scope must not inherit business conversation');
    await scopes.nth(2).click();await page.waitForFunction(()=>document.querySelectorAll('.lourex-ai-scope-button')[2]?.getAttribute('aria-selected')==='true');
    assert.equal(await page.locator('.lourex-ai-history-button').count(),0,'temporary scope must not expose durable chat history');
    await scopes.nth(0).click();await page.waitForFunction(()=>document.querySelectorAll('.lourex-ai-scope-button')[0]?.getAttribute('aria-selected')==='true');
    await page.locator('.lourex-ai-message.user').filter({hasText:'Cost is 10'}).waitFor({state:'visible'});
    unifiedAssistant='PASS';
   }

   await page.screenshot({path:`${output}/${engine.name()}-${lang}.png`,animations:'disabled'});report.push({engine:engine.name(),width,lang,sessions:12,restart:'PASS',manualStop:'PASS',errorRetry:'PASS',digitNormalization:'PASS',editableTranscript:'PASS',stale:'PASS',unmount:'PASS',missingOnend:'PASS',repeatSessions:'PASS',runtimeOwner:await page.evaluate(()=>window.__LOUREX_VOICE_RUNTIME_OWNER__),nativeReleaseDelayMs:await page.evaluate(()=>window.nativeReleaseDelayMs),overlappingStarts:0,providerCalls:requests.length,naturalLanguageOs,unifiedAssistant});
  }finally{await browser.close();}
 }writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('Voice reliability + 12-session delayed Safari native release PASS; Batch 4 natural-language local tool plan smoke PASS in Chromium + WebKit; unified encrypted conversation/scopes smoke PASS in Chromium.');
})().catch(error=>{console.error(error);process.exitCode=1;});
