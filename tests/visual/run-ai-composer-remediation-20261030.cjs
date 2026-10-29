// Real built UI and synthetic local vault only. No production records/providers.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/ai-composer-remediation-20261030';mkdirSync(out,{recursive:true});
(async()=>{
 const results=[];
 for(const [name,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{for(const [width,height,lang] of [[320,700,'ar'],[390,844,'ar'],[412,915,'en'],[844,390,'ar']]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true});let requests=0;const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));await page.route('**/api/**',r=>{requests++;return r.fulfill({status:503,body:'No live providers in QA'});});
   await page.goto('http://127.0.0.1:4173/tests/visual/ai-conversation-workspace.html?lang='+lang,{waitUntil:'networkidle'});
   await page.locator('.lourex-ai-launcher').click();
   const panel=page.locator('#lourex-ai-panel[data-lourex-workspace="2"]'),input=panel.locator('textarea.lourex-ai-premium-textarea');
   await input.waitFor({state:'visible'});await page.waitForFunction(()=>window.fixture?.host?.state.__workspaceTurnPending!==true);
   assert.ok(Number(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=16,'Effective font must prevent focus zoom');
   assert.ok(await input.getAttribute('aria-label'),'Composer needs an accessible name');
   const before=await page.evaluate(()=>({scale:visualViewport.scale,x:scrollX}));await input.focus();
   await input.fill('جهزلي عرض سعر Tea 12 CTN\nالسعر 37.20 USD');
   await input.evaluate(el=>{el.setSelectionRange(5,5);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',isComposing:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));});
   assert.equal(await input.evaluate(el=>el.selectionStart),5,'Composition must not reset selection');
   assert.equal(requests,0,'IME Enter must not submit');
   const focus=await page.evaluate(()=>({scale:visualViewport.scale,x:scrollX}));assert.equal(focus.scale,before.scale);assert.equal(focus.x,before.x);
   const text=('صنف عربي English 37.20 USD\n').repeat(300)+'لا تغيّر السعر الأخير';
   await input.fill(text);await page.waitForTimeout(100);assert.equal(await input.inputValue(),text,'Long paste must remain intact');
   await panel.locator('.lourex-ai-send').click();
   await panel.locator('[role="alert"]').filter({hasText:'6000'}).waitFor();assert.equal(await input.inputValue(),text);assert.equal(requests,0);
   await input.fill('رسالة Arabic English');
   // Viewport resize is a simulation; this does not reproduce a physical iOS keyboard.
   await page.setViewportSize({width,height:Math.max(300,Math.round(height*.6))});await page.waitForTimeout(100);
   const send=await panel.locator('.lourex-ai-send').boundingBox();assert.ok(send&&send.y>=0&&send.y+send.height<=Math.max(300,Math.round(height*.6))+2,'Send visible after viewport resize');
   await page.setViewportSize({width,height});await input.blur();await page.waitForTimeout(100);
   assert.equal(await input.inputValue(),'رسالة Arabic English');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   await page.screenshot({path:`${out}/${name}-${width}-${lang}.png`});
   assert.deepEqual(errors,[]);results.push({engine:name,width,height,lang,font:await input.evaluate(el=>getComputedStyle(el).fontSize),apiRequests:requests,passed:true});await page.close();
  }}finally{await browser.close();}
 }
 writeFileSync(out+'/results.json',JSON.stringify({physicalIphone:false,results},null,2));console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exit(1);});
