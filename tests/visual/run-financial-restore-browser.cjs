const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 for(const [name,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{for(const scenario of ['audit-persist','audit-abort','roundtrip','cas','two-tab','transaction-abort','account','protected','period']){
   const context=await browser.newContext();
   try{
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:4173/tests/visual/financial-restore-browser.html';
    await page.goto(url);await page.waitForFunction(()=>window.qaReady);
    if(scenario==='two-tab'){
     const writer=await context.newPage();writer.on('pageerror',e=>errors.push(e.message));
     await writer.goto(url);await writer.waitForFunction(()=>window.qaReady);
     await page.exposeFunction('qaWriteFromOtherTab',args=>writer.evaluate(value=>window.qaUpdate(value),args));
    }
    const result=await page.evaluate(s=>window.qaRun(s),scenario);
    await page.reload();await page.waitForFunction(()=>window.qaReady);
    assert.deepEqual(await page.evaluate(uid=>window.qaRead(uid),result.uid),result.expected,'reload preserves accepted database');
    assert.deepEqual(await page.evaluate(uid=>window.qaRecords(uid),result.uid),result.records,'all records and archives survive reload exactly');
    if(result.other)assert.deepEqual(await page.evaluate(uid=>window.qaRead(uid),result.other.uid),result.other.expected,'other account after reload');
    assert.deepEqual(errors,[]);console.log('PASS '+name+' IndexedDB restore '+scenario);
   }finally{await context.close();}
  }}finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
