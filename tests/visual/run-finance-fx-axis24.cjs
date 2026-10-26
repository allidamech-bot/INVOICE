const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const folder='visual-qa-output/finance-fx-axis24';mkdirSync(folder,{recursive:true});
(async()=>{
  const results=[];
  for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await driver.launch({headless:true});
    try{
      for(const lang of ['en','ar']){
        const page=await browser.newPage({viewport:{width:engine==='webkit'?390:1280,height:844},
          isMobile:engine==='webkit',hasTouch:engine==='webkit'});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const url='http://127.0.0.1:4173/tests/visual/finance-fx-axis24.html?lang='+lang;
        await page.goto(url,{waitUntil:'load'});
        const panel=page.locator('.lx-fx-rates'),output=panel.locator('.lx-fx-conversion-result strong');
        const amount=panel.locator('label').filter({hasText:lang==='ar'?'المبلغ':'Amount'}).locator('input').first();
        await output.waitFor({state:'visible'});
        const sourceBefore=await page.evaluate(()=>window.qaRate());
        await amount.fill('100.00');
        assert.match(await output.innerText(),/375\.00\s+SAR/,'correct direct USD->SAR');
        await amount.fill('not-a-number');
        assert.equal((await output.innerText()).trim(),'—','invalid amount cannot masquerade as zero');
        assert.match(await panel.locator('.lx-fx-conversion-result [role="alert"]').innerText(),
          new RegExp(lang==='ar'?'مبلغًا رقميًا صحيحًا':'valid numeric amount'));
        await amount.fill('');
        assert.equal((await output.innerText()).trim(),'—','blank means no output, never zero');
        await amount.fill('-100');
        assert.match(await output.innerText(),/-375\.00\s+SAR/,'negative FX must preserve its sign');
        assert.equal(await page.evaluate(()=>window.qaRate()),sourceBefore,'read-only converter did not touch rate');
        assert.deepEqual(errors,[],'no runtime browser errors');
        await page.screenshot({path:folder+'/'+engine+'-'+lang+'.png'});
        results.push({engine,lang,status:'passed'});
        await page.close();
      }
    }finally{await browser.close();}
  }
  assert.equal(results.length,4);
  writeFileSync(folder+'/results.json',JSON.stringify({tests:results.length,results,failures:0},null,2));
  console.log(JSON.stringify({suite:'Finance FX 24 actual React converter',cases:results.length,failures:0,results},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
