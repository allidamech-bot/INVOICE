/* LOUREX Finance — synthetic iPhone-mode WebKit IndexedDB financial continuity.
 * Exercises real backup/restore, cancellation and account isolation functions.
 * This is browser emulation, NOT a physical iPhone or live Firebase test. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/finance-iphone-axis30';
mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:4173/tests/visual/financial-restore-browser.html';
const iphoneUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
(async()=>{
 const browser=await webkit.launch({headless:true});
 const scenarios=['roundtrip','audit-persist','audit-abort','transaction-abort','two-tab','account','period'];
 const results=[];
 try{
  for(const scenario of scenarios){
   const context=await browser.newContext({viewport:{width:390,height:844},userAgent:iphoneUA,
    isMobile:true,hasTouch:true,deviceScaleFactor:2});
   await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
   });
   try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>window.qaReady===true);
    const device=await page.evaluate(()=>({touch:navigator.maxTouchPoints,platform:navigator.platform,
      width:innerWidth,ua:navigator.userAgent,mobile:matchMedia('(pointer:coarse)').matches}));
    assert.equal(device.width,390,'real iPhone CSS viewport for browser emulation');
    assert.ok(device.touch>0&&device.platform==='iPhone'&&device.ua.includes('iPhone'),'touch/mobile UA must be active');
    if(scenario==='two-tab'){
     const writer=await context.newPage();
     writer.on('pageerror',e=>errors.push(String(e)));
     await writer.goto(url,{waitUntil:'load'});
     await writer.waitForFunction(()=>window.qaReady===true);
     await page.exposeFunction('qaWriteFromOtherTab',args=>writer.evaluate(x=>window.qaUpdate(x),args));
    }
    const result=await page.evaluate(s=>window.qaRun(s),scenario);
    await page.reload({waitUntil:'load'});
    await page.waitForFunction(()=>window.qaReady===true);
    assert.deepEqual(await page.evaluate(uid=>window.qaRead(uid),result.uid),result.expected,
      'iPhone reload must preserve financial vault exactly: '+scenario);
    assert.deepEqual(await page.evaluate(uid=>window.qaRecords(uid),result.uid),result.records,
      'iPhone reload must preserve all backup safety archives and revisions: '+scenario);
    if(result.other)assert.deepEqual(await page.evaluate(uid=>window.qaRead(uid),result.other.uid),result.other.expected,
      'other financial account never changed during restore');
    assert.deepEqual(errors,[],'no WebKit page errors: '+scenario);
    results.push({scenario,pass:true,mobile:device.width,touch:device.touch});
    console.log('PASS iPhone WebKit financial persistence '+scenario);
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 assert.equal(results.length,scenarios.length);
 writeFileSync(out+'/financial-restore-iphone.json',JSON.stringify({engine:'WebKit touch iPhone emulation',cases:results.length,failures:0,results},null,2));
 console.log(JSON.stringify({suite:'Finance iPhone WebKit real IndexedDB',cases:results.length,failures:0},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
