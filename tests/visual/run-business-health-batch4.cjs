const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/business-health-batch4';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,lang,ready=false)=>{
    const failures=[];let page;
    try{
      page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      page.setDefaultTimeout(12000);
      await page.goto(`http://127.0.0.1:4173/tests/visual/business-health-batch4.html?lang=${lang}&ready=${ready?'1':'0'}`,{waitUntil:'load'});
      const card=page.locator('.ta-business-health-card');await card.waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
      const geometry=await page.evaluate(()=>{
        const card=document.querySelector('.ta-business-health-card');const r=card.getBoundingClientRect();
        const buttons=[...card.querySelectorAll('button')].map(node=>{const b=node.getBoundingClientRect();return{height:b.height,left:b.left,right:b.right};});
        return{dir:document.documentElement.dir,innerWidth,scrollWidth:document.documentElement.scrollWidth,card:{left:r.left,right:r.right,width:r.width,textAlign:getComputedStyle(card).textAlign},buttons};
      });
      assert.equal(geometry.dir,lang==='ar'?'rtl':'ltr');
      assert.ok(geometry.card.left>=-1&&geometry.card.right<=geometry.innerWidth+1,`health card must stay in viewport: ${JSON.stringify(geometry.card)}`);
      assert.ok(geometry.scrollWidth<=geometry.innerWidth+1,`no horizontal overflow: ${geometry.scrollWidth}/${geometry.innerWidth}`);
      if(lang==='ar')assert.equal(geometry.card.textAlign,'right','Arabic Business Health card must align right');
      if(ready){
        assert.equal(await card.locator('button').count(),0,'ready state should not invent repair actions');
        assert.match(await card.innerText(),/بيانات الأعمال جاهزة|Business data is ready/);
      }else{
        assert.ok(geometry.buttons.length>=4,'attention state must expose canonical repair targets');
        assert.ok(geometry.buttons.every(button=>button.height>=44),`repair targets must be >=44px: ${JSON.stringify(geometry.buttons)}`);
        await card.locator('button').nth(0).click();
        assert.equal(await page.locator('.batch4-health-shell').getAttribute('data-last-target'),'settings');
        await card.locator('button').nth(1).click();
        assert.equal(await page.locator('.batch4-health-shell').getAttribute('data-last-target'),'customers');
      }
      await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
    }catch(error){failures.push(error?.stack||String(error));}
    finally{if(page)await page.close();}
    results.push({name,failures});
  };
  try{
    await run('mobile-en','en');
    await run('mobile-ar','ar');
    await run('mobile-ready-en','en',true);
    await run('mobile-ready-ar','ar',true);
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Business Health Batch 4 browser QA: ${results.length} mobile scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
