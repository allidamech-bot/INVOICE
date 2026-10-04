const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

(async()=>{
  mkdirSync('visual-qa-output/search-keyboard-batch1',{recursive:true});
  for(const [engine,width,language] of [[chromium,390,'en'],[webkit,320,'ar']]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{
        const viewport=new EventTarget();window.keyboardViewport={height:844,offsetTop:0};
        for(const key of ['height','offsetTop'])Object.defineProperty(viewport,key,{get:()=>window.keyboardViewport[key]});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
      });
      await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${language}`,{waitUntil:'networkidle'});
      await page.evaluate(language=>{document.documentElement.dataset.uiTheme=language==='ar'?'dark':'light';},language);
      await page.locator('.ta-mobile-create').click();
      const panel=page.locator('.global-search-panel');await panel.waitFor({state:'visible'});
      for(const height of [300,190,844]){
        await page.evaluate(height=>{window.keyboardViewport.height=height;window.keyboardViewport.offsetTop=height===844?0:20;visualViewport.dispatchEvent(new Event('resize'));},height);
        const geometry=await panel.evaluate(element=>{
          const rect=element.getBoundingClientRect(),input=element.querySelector('input').getBoundingClientRect();
          return {top:rect.top,bottom:rect.bottom,inputTop:input.top,inputBottom:input.bottom,offset:visualViewport.offsetTop,height:visualViewport.height,overflow:document.documentElement.scrollWidth>innerWidth+1};
        });
        assert.ok(geometry.top>=geometry.offset-1,`${engine.name()} ${height}: search begins outside visual viewport`);
        assert.ok(geometry.bottom<=geometry.offset+geometry.height+1,`${engine.name()} ${height}: search ends behind keyboard`);
        assert.ok(geometry.inputTop>=geometry.offset&&geometry.inputBottom<=geometry.offset+geometry.height,'search input remains keyboard-visible');
        assert.equal(geometry.overflow,false);
        await page.locator('.global-search-start').evaluate(element=>{element.scrollTop=element.scrollHeight;});
        await page.locator('.global-search-destinations button').last().click({trial:true});
        if(height===190){
          await panel.locator('input').fill('unmatched search');
          const results=page.locator('.global-search-results');await results.waitFor({state:'visible'});
          assert.ok(await results.evaluate(element=>element.getBoundingClientRect().bottom<=visualViewport.offsetTop+visualViewport.height),'empty result pane stays keyboard-safe');
          await panel.locator('input').fill('');
          await page.screenshot({path:`visual-qa-output/search-keyboard-batch1/${engine.name()}-${width}-${language}.png`,animations:'disabled'});
        }
      }
      await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});
      await page.locator('.ta-mobile-create').click();await panel.waitFor({state:'visible'});
      await panel.locator('.global-search-actions>button').first().click();
      await panel.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.shellQa.newKind),'proforma');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.lourexShellOverlay||document.body.style.overflow||''),'','close/action leaves no scroll lock');
      assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  }
  console.log('Batch 1 Global Search / Quick Create keyboard geometry, scrolling and release: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
