const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  for(const [engine,width,language,kind] of [[chromium,390,'en','proforma'],[webkit,320,'ar','draft'],[webkit,820,'ar','draft'],[chromium,900,'en','proforma']]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
      await page.addInitScript(()=>{
        const viewport=new EventTarget();window.keyboardViewport={height:844,offsetTop:0};
        for(const key of ['height','offsetTop'])Object.defineProperty(viewport,key,{get:()=>window.keyboardViewport[key]});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
      });
      await page.goto(`http://127.0.0.1:4173/tests/visual/editor-keyboard-batch1.html?kind=${kind}&lang=${language}`,{waitUntil:'networkidle'});
      const dock=page.locator(kind==='draft'?'.draft-mobile-actionbar':'.mobile-editor-actionbar');
      await dock.waitFor({state:'visible'});
      for(const height of [360,844]){
        await page.evaluate(height=>{window.keyboardViewport.height=height;window.keyboardViewport.offsetTop=height===844?0:20;visualViewport.dispatchEvent(new Event('resize'));},height);
        const geometry=await dock.evaluate(element=>({rect:element.getBoundingClientRect().toJSON(),height:visualViewport.height,offset:visualViewport.offsetTop}));
        assert.ok(geometry.rect.top>=geometry.offset,`${engine.name()} ${kind}: dock above visible viewport`);
        assert.ok(geometry.rect.bottom<=geometry.height+geometry.offset+1,`${engine.name()} ${kind}: editor dock behind keyboard`);
        if(height===360){
          const scroll=await page.locator('.ta-main').evaluate(element=>{
            element.scrollTop=element.scrollHeight;
            return {bottom:element.getBoundingClientRect().bottom,maxScroll:element.scrollHeight-element.clientHeight,scrollTop:element.scrollTop,overflow:getComputedStyle(element).overflowY};
          });
          assert.ok(scroll.bottom<=geometry.height+geometry.offset+1,'editor scroll owner stays above keyboard');
          assert.ok(['auto','scroll'].includes(scroll.overflow),'existing outer scroll ownership retained');
          assert.ok(Math.abs(scroll.scrollTop-scroll.maxScroll)<=2,'true editor scroll end remains reachable');
        }
        const save=dock.getByRole('button',{name:language==='ar'?'حفظ':'Save',exact:true});
        await save.click({trial:true});
      }
    }finally{await browser.close();}
  }
  const browser=await webkit.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.addInitScript(()=>{
      const viewport=new EventTarget();window.keyboardViewport={height:844,offsetTop:0};
      for(const key of ['height','offsetTop'])Object.defineProperty(viewport,key,{get:()=>window.keyboardViewport[key]});
      Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
    });
    await page.goto('http://127.0.0.1:4173/tests/visual/workspace-ux-batch3.html?lang=en&theme=light',{waitUntil:'networkidle'});
    for(const [query,editor,footer] of [['VAL-1','.ta-product-editor.is-open','.ta-product-editor-footer'],['PUR-QA-1','.ta-ops-purchase-editor','.ta-ops-editor-actions']]){
      await page.evaluate(()=>{window.keyboardViewport.height=844;window.keyboardViewport.offsetTop=0;visualViewport.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('lourex-global-search-open'));});
      await page.locator('.global-search-input-wrap input').fill(query);await page.keyboard.press('Enter');await page.locator(editor).waitFor({state:'visible'});
      await page.evaluate(()=>{window.keyboardViewport.height=360;window.keyboardViewport.offsetTop=20;visualViewport.dispatchEvent(new Event('resize'));});
      const rect=await page.locator(footer).evaluate(element=>element.getBoundingClientRect().toJSON());
      assert.ok(rect.top>=20&&rect.bottom<=381,`${query}: workspace editor actions behind keyboard`);
      await page.locator(footer).getByRole('button').last().click({trial:true});
    }
  }finally{await browser.close();}
  console.log('Batch 1 document editor keyboard docks: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
