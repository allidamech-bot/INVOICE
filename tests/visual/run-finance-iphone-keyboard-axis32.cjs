/* LOUREX Alif axis 32 — real React invoice/purchase-order editing during
   simulated iPhone Safari virtual keyboard with browser reload.
   All data is synthetic and stored in this browser context's sessionStorage. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/finance-iphone-keyboard-axis32';
mkdirSync(out,{recursive:true});
const cases=[
  {kind:'invoice',lang:'en',width:390},
  {kind:'invoice',lang:'ar',width:320},
  {kind:'purchase-order',lang:'en',width:390},
  {kind:'purchase-order',lang:'ar',width:320}
];
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
(async()=>{
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const testCase of cases){
   const {kind,lang,width}=testCase;
   const context=await browser.newContext({viewport:{width,height:844},userAgent:ua,
     isMobile:true,hasTouch:true,deviceScaleFactor:2});
   await context.addInitScript(()=>{
     const visual=new EventTarget();
     window.qa32Keyboard={height:844,offsetTop:0};
     for(const key of ['height','offsetTop'])Object.defineProperty(visual,key,{get:()=>window.qa32Keyboard[key]});
     Object.defineProperty(window,'visualViewport',{configurable:true,value:visual});
     try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
     try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
   });
   try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.setDefaultTimeout(20000);
    const url='http://127.0.0.1:4173/tests/visual/finance-editor-keyboard-axis32.html?kind='+kind+'&lang='+lang;
    await page.goto(url,{waitUntil:'load'});
    const editor=page.locator('.editor-screen');
    await editor.waitFor({state:'visible'});
    const dock=page.locator('.mobile-editor-actionbar');
    await dock.waitFor({state:'visible'});
    const first=page.locator('.editor-screen .item-card.premium-item-card').first();
    await first.waitFor({state:'visible'});
    const fields=first.locator('.item-pricing-grid input[inputmode="decimal"]');
    await fields.nth(1).waitFor({state:'visible'});
    assert.equal(await fields.count(),2,'actual editor exposes editable quantity and unit price as decimal fields');

    // Focus the financial amount before simulating Safari's keyboard.
    await fields.nth(0).focus();
    await page.evaluate(()=>{
      window.qa32Keyboard.height=360;
      window.qa32Keyboard.offsetTop=20;
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(()=>document.querySelector('.mobile-editor-actionbar')?.getBoundingClientRect().bottom<=382);
    let rect=await dock.evaluate(el=>el.getBoundingClientRect().toJSON());
    assert.ok(rect.top>=20&&rect.bottom<=381,
      'mobile invoice footer is hidden behind keyboard: '+JSON.stringify(rect));
    // Ready-to-issue documents intentionally show Issue rather than Save; this test must never issue a synthetic document.
    const primary=dock.locator('.mobile-action-buttons button.btn-primary').first();
    await primary.waitFor({state:'visible'});
    await primary.click({trial:true});

    await fields.nth(0).fill('7');
    await fields.nth(1).fill('17.25');
    await page.waitForFunction(()=>window.lastSaved?.items?.[0]?.quantity==='7'&&
      window.lastSaved?.items?.[0]?.unitPrice==='17.25',{timeout:15000});
    const saved=await page.evaluate(()=>({value:window.lastSaved,storage:window.qa32Read(),
      attempts:window.saveAttempts,log:window.eventLog.slice()}));
    assert.equal(saved.value.status,'draft','mobile keyboard edit must not issue/finalize the document');
    assert.equal(saved.storage.items[0].quantity,'7');
    assert.equal(saved.storage.items[0].unitPrice,'17.25');
    assert.equal(saved.storage.items.length,2,'editing during keyboard must not duplicate invoice rows');
    assert.equal(saved.value.number,saved.storage.number);
    assert.ok(saved.attempts>=1);
    assert.ok(saved.log.some(event=>event.type==='save-done'));

    // Dismissing the virtual keyboard must restore full viewport and controls.
    await page.evaluate(()=>{
      window.qa32Keyboard.height=844;window.qa32Keyboard.offsetTop=0;
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(()=>document.querySelector('.mobile-editor-actionbar')?.getBoundingClientRect().bottom<=845);
    assert.equal(await page.locator('.editor-screen').evaluate(el=>el.scrollWidth<=innerWidth+1),true,
      'mobile editor cannot overflow horizontally after dismissing keyboard');
    await page.screenshot({path:out+'/'+kind+'-'+lang+'-'+width+'.png',fullPage:false,animations:'disabled'});

    await page.reload({waitUntil:'load'});
    await page.locator('.item-card').first().waitFor({state:'visible'});
    const after=await page.evaluate(()=>({loaded:window.qa32Original,
      stored:window.qa32Read(),savedAttempts:window.saveAttempts}));
    assert.equal(after.loaded.status,'draft');
    assert.equal(after.loaded.items[0].quantity,'7','quantity retained after browser reload');
    assert.equal(after.loaded.items[0].unitPrice,'17.25','unit price retained after browser reload');
    assert.equal(after.loaded.items.length,2,'no duplicate lines after reload');
    assert.equal(after.stored.items[0].quantity,'7');
    assert.equal(after.loaded.number,saved.value.number);
    assert.deepEqual(errors,[],'no unhandled React/WebKit errors');
    results.push({kind,lang,width,status:'passed',savedNumber:after.loaded.number,rows:after.loaded.items.length});
    console.log('PASS iPhone keyboard financial draft save + reload '+kind+' '+lang);
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 assert.equal(results.length,cases.length);
 writeFileSync(out+'/persistence-results.json',JSON.stringify({cases:results.length,failures:0,results},null,2));
 console.log(JSON.stringify({suite:'LOUREX axis32 financial editor WebKit virtual keyboard',cases:results.length,failures:0},null,2));
})().catch(err=>{console.error(err);process.exitCode=1;});
