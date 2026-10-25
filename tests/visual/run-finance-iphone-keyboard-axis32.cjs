/* LOUREX FINANCE — Alif 32 iPhone keyboard + persisted draft callback.
 * Render real compiled AppShell/EditorPage, synthetic customer and supplier only.
 * WebKit touch simulation, not physical iPhone or Firebase production.
 */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/finance-iphone-keyboard-axis32';
mkdirSync(output,{recursive:true});
const cases=[
  {kind:'invoice',lang:'en',width:320},
  {kind:'invoice',lang:'ar',width:390},
  {kind:'purchase-order',lang:'en',width:390},
  {kind:'purchase-order',lang:'ar',width:320}
];
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
(async()=>{
  const browser=await webkit.launch({headless:true});
  const results=[];
  try{
    for(const c of cases){
      const label=c.kind+'-'+c.lang+'-'+c.width;
      const context=await browser.newContext({
        viewport:{width:c.width,height:844},
        isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:ua
      });
      await context.addInitScript(()=>{
        try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
        try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
        const fake=new EventTarget();
        window.axis32Viewport={height:844,offsetTop:0};
        for(const key of ['height','offsetTop'])
          Object.defineProperty(fake,key,{configurable:true,get:()=>window.axis32Viewport[key]});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:fake});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.setDefaultTimeout(16000);
      try{
        await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-editor.html?kind='+c.kind+'&lang='+c.lang,{waitUntil:'load'});
        const editor=page.locator('.editor-screen');
        await editor.waitFor({state:'visible'});
        const qty=editor.locator('.item-pricing-grid input').first();
        const amount=editor.locator('.mobile-editor-actionbar .mobile-total');
        await qty.focus();
        await page.evaluate(()=>{
          window.axis32Viewport.height=360;
          window.axis32Viewport.offsetTop=20;
          window.visualViewport.dispatchEvent(new Event('resize'));
          window.visualViewport.dispatchEvent(new Event('scroll'));
        });
        const dock=editor.locator('.mobile-editor-actionbar');
        const visible=await dock.evaluate(el=>{
          const r=el.getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,
            viewBottom:visualViewport.offsetTop+visualViewport.height,
            viewTop:visualViewport.offsetTop,
            touch:navigator.maxTouchPoints,
            userAgent:navigator.userAgent,
            docWidth:document.documentElement.scrollWidth,
            viewportWidth:innerWidth};
        });
        assert.ok(visible.touch>0&&visible.userAgent.includes('iPhone'),'iPhone simulation not active');
        assert.ok(visible.top>=visible.viewTop-2&&visible.bottom<=visible.viewBottom+2,
          label+': document actions hidden by virtual keyboard: '+JSON.stringify(visible));
        assert.ok(visible.docWidth<=c.width+2,label+': horizontal overflow during keyboard input');
        await qty.fill('5');
        await page.waitForFunction(()=>window.lastSaved?.items?.[0]?.quantity==='5',{timeout:13000});
        const initial=await page.evaluate(()=>({
          saved:structuredClone(window.lastSaved),
          count:window.saveAttempts,
          events:window.eventLog.filter(x=>x.type==='save-done')
        }));
        assert.equal(initial.saved.items[0].quantity,'5');
        assert.equal(initial.saved.items[0].unitPrice,'975.00');
        assert.equal(initial.saved.status,'draft');
        assert.equal(initial.saved.kind,c.kind);
        assert.ok(initial.count>=1);
        assert.match(await amount.innerText(),/5,045\.00/,'financial total must recompute under keyboard');
        assert.ok(initial.events.length>=1,'real EditorPage save callback was not invoked');
        const main=editor.locator('.ta-main');
        await main.evaluate(el=>{el.scrollTop=el.scrollHeight;});
        const scroll=await main.evaluate(el=>({pos:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}));
        assert.ok(scroll.pos>=scroll.max-8,label+': cannot reach final financial form content under keyboard');
        const dockSave=dock.getByRole('button',{name:c.lang==='ar'?'حفظ':'Save',exact:true});
        if(await dockSave.count()){
          await dockSave.click({trial:true});
        }
        await page.screenshot({path:output+'/'+label+'-keyboard.png',fullPage:false,animations:'disabled'});
        await page.evaluate(()=>{
          window.axis32Viewport.height=844;window.axis32Viewport.offsetTop=0;
          window.visualViewport.dispatchEvent(new Event('resize'));
        });
        await qty.fill('6');
        await page.waitForFunction(()=>window.lastSaved?.items?.[0]?.quantity==='6',{timeout:13000});
        const after=await page.evaluate(()=>({saved:structuredClone(window.lastSaved),
          count:window.saveAttempts,events:window.eventLog.filter(x=>x.type==='save-done')}));
        assert.equal(after.saved.items[0].quantity,'6');
        assert.equal(after.saved.items[0].unitPrice,'975.00');
        assert.match(await amount.innerText(),/6,020\.00/,'totals must recover after keyboard dismissal');
        assert.ok(after.count>initial.count,'post-keyboard edits still autosave');
        assert.deepEqual(errors,[],'no runtime page errors');
        results.push({label,passed:true,kind:c.kind,language:c.lang,width:c.width,
          saveEvents:after.events.length,firstTotal:'5045.00',secondTotal:'6020.00'});
        console.log('PASS finance iPhone keyboard autosave '+label);
      }catch(error){
        await page.screenshot({path:output+'/'+label+'-failure.png',fullPage:false}).catch(()=>{});
        throw error;
      }finally{await context.close();}
    }
  }finally{await browser.close();}
  assert.equal(results.length,cases.length);
  writeFileSync(output+'/results.json',JSON.stringify({cases:results.length,failed:0,results},null,2));
  console.log(JSON.stringify({suite:'Alif axis32 iPhone keyboard financial draft autosave',cases:results.length,failed:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
