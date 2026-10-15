const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/product-editor-webkit-v606';
const origin='http://127.0.0.1:4173/tests/visual/product-editor-webkit-v606.html';
const configurations=[
  {width:320,height:700,lang:'en'},
  {width:375,height:812,lang:'en'},
  {width:390,height:844,lang:'ar'},
  {width:430,height:932,lang:'en'},
  {width:768,height:1024,lang:'ar'},
  {width:1024,height:1366,lang:'en'}
];
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await webkit.launch({headless:true});
  const checks=[];
  try{
    for(const config of configurations){
      const page=await browser.newPage({
        viewport:{width:config.width,height:config.height},hasTouch:true,
        isMobile:config.width<=430,deviceScaleFactor:2
      });
      const key=config.width+'-'+config.lang;
      try{
        await page.goto(origin+'?mode=products&lang='+config.lang,{waitUntil:'load',timeout:30000});
        await page.locator('.ta-product-row-main').first().waitFor({timeout:15000});
        await page.locator('.ta-product-row-main').first().click();
        const editor=page.locator('.ta-product-editor.is-open');
        await editor.waitFor({timeout:10000});
        const scroller=page.locator('.ta-product-editor-scroll');
        const before=await scroller.evaluate(el=>({
          height:el.clientHeight,scrollHeight:el.scrollHeight,
          overflow:getComputedStyle(el).overflowY,
          touchAction:getComputedStyle(el).touchAction,
          autoFocused:document.activeElement?.closest('.ta-product-editor-scroll')!==null
        }));
        assert.ok(before.height>80,'Editor scroll pane cannot be zero-height at '+key);
        if(config.width<=430){
          assert.equal(before.overflow,'auto','iPhone editor must own vertical scrolling '+key);
          assert.ok(before.scrollHeight>before.height,'Long form must actually scroll '+key);
          assert.equal(before.autoFocused,false,'Mobile editor must not auto-focus a field '+key);
          const scrolled=await scroller.evaluate(el=>{
            el.scrollTop=el.scrollHeight;
            return el.scrollTop;
          });
          assert.ok(scrolled>0,'Cannot scroll to the final product fields at '+key);
        }
        const label=config.lang==='ar'?'Description English':'Description English';
        const english=page.locator('.ta-product-editor-scroll input').nth(1);
        await english.fill('WebKit Audit '+key);
        const footer=page.locator('.ta-product-editor-footer');
        await footer.scrollIntoViewIfNeeded();
        const bounds=await footer.boundingBox();
        assert.ok(bounds,'Save/cancel footer missing at '+key);
        assert.ok(bounds.y>=-3&&bounds.y+bounds.height<=config.height+4,'Save controls obscured at '+key);
        const save=footer.locator('button').filter({hasText:config.lang==='ar'?'حفظ الصنف':'Save Product'});
        await save.click();
        await page.waitForFunction(()=>window.saveAttempts===1,{timeout:15000});
        const saved=await page.evaluate(()=>window.productState()[0]?.descriptionEn);
        assert.equal(saved,'WebKit Audit '+key,'Saved product did not persist in test harness');
        await page.screenshot({path:output+'/'+key+'.png',animations:'disabled'});
        checks.push({key,result:'pass',scrollHeight:before.scrollHeight,viewportHeight:before.height});
      }catch(error){
        checks.push({key,result:'fail',error:String(error?.stack||error)});
        await page.screenshot({path:output+'/'+key+'-failure.png',animations:'disabled'}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
  writeFileSync(output+'/results.json',JSON.stringify(checks,null,2));
  const failed=checks.filter(r=>r.result==='fail');
  for(const c of checks)process.stdout.write(c.key+': '+c.result+'\n');
  if(failed.length){console.error(failed);process.exitCode=1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
