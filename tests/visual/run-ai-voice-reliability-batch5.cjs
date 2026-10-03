const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
(async()=>{
 const output='visual-qa-output/ai-voice-reliability-batch5';mkdirSync(output,{recursive:true});const report=[];
 for(const [engine,width,lang] of [[chromium,390,'en'],[webkit,320,'ar']]){
  const browser=await engine.launch({headless:true});try{
   const page=await browser.newPage({viewport:{width,height:844}});const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'No live provider in fixture'});});
   await page.addInitScript(()=>{
    window.speechInstances=[];window.nativeOwner=null;window.overlappingStarts=0;
    class Recognition{
     constructor(){window.speechInstances.push(this);}
     start(){if(window.nativeOwner){window.overlappingStarts++;throw new Error('native microphone is still owned');}window.nativeOwner=this;this.onstart?.();}
     stop(){this.stopCalled=true;}
     abort(){this.abortCalled=true;if(window.nativeOwner===this)window.nativeOwner=null;}
     result(text){const row={0:{transcript:text},length:1,isFinal:true};this.onresult?.({results:[row]});}
     end(){if(window.nativeOwner===this)window.nativeOwner=null;this.onend?.();}
    }
    window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;
   });
   await page.goto(`http://127.0.0.1:4173/tests/visual/ai-voice-reliability-batch5.html?lang=${lang}`,{waitUntil:'networkidle'});await page.locator('.lourex-ai-launcher').click();const mic=page.locator('.lourex-ai-composer-mic'),input=page.locator('.lourex-ai-compose form>input');await mic.waitFor();
   await mic.click();await page.evaluate(()=>{window.staleResult=window.speechInstances[0].onresult;window.speechInstances[0].result('first session');});assert.equal(await input.inputValue(),'first session');
   await mic.click();assert.equal(await page.evaluate(()=>window.speechInstances.length),1,'restart waits for native onend');await page.evaluate(()=>window.speechInstances[0].end());await page.waitForFunction(()=>window.speechInstances.length===2);
   await mic.click();await page.evaluate(()=>{window.speechInstances[1].result('second session');window.speechInstances[1].end();});assert.equal(await input.inputValue(),'first session second session','manual stop accepts final transcript');
   await mic.click();await page.evaluate(()=>window.speechInstances[2].onerror?.({error:'no-speech'}));assert.equal(await page.locator('.lourex-ai-voice-status').getAttribute('data-state'),'error');
   await mic.click();await page.evaluate(()=>window.speechInstances[2].end());await page.waitForFunction(()=>window.speechInstances.length===4);await page.evaluate(()=>{window.staleResult({results:[{0:{transcript:'STALE'},length:1,isFinal:true}]});window.speechInstances[3].result('retry session');window.speechInstances[3].end();});assert.equal(await input.inputValue(),'first session second session retry session');
   await mic.click();await page.locator('.lourex-ai-close').click();await page.waitForFunction(()=>window.speechInstances[4].abortCalled);await page.locator('.lourex-ai-launcher').click();await mic.click();await page.waitForFunction(()=>window.speechInstances.length===6);await page.evaluate(()=>window.speechInstances[5].end());
   await mic.click();await page.evaluate(()=>window.speechInstances[6].result('fallback cleanup'));await page.waitForFunction(()=>window.speechInstances[6].abortCalled);await mic.click();await page.waitForFunction(()=>window.speechInstances.length===8);await page.evaluate(()=>window.speechInstances[7].end());
   assert.equal(await page.evaluate(()=>window.overlappingStarts),0);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await mic.boundingBox();assert.ok(box.width>=44&&box.height>=44);
   await page.screenshot({path:`${output}/${engine.name()}-${lang}.png`,animations:'disabled'});report.push({engine:engine.name(),width,lang,sessions:8,restart:'PASS',manualStop:'PASS',errorRetry:'PASS',stale:'PASS',unmount:'PASS',missingOnend:'PASS',overlappingStarts:0,providerCalls:0});
  }finally{await browser.close();}
 }writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('Voice reliability: repeated sessions, delayed release, error/retry, stale callbacks and unmount PASS in Chromium + WebKit.');
})().catch(error=>{console.error(error);process.exitCode=1;});
