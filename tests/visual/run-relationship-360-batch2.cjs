const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/relationship-360-batch2';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,lang)=>{
    const failures=[];let page;
    try{
      page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      page.setDefaultTimeout(12000);
      await page.goto(`http://127.0.0.1:4173/tests/visual/relationship-360-batch2.html?lang=${lang}`,{waitUntil:'load'});
      await page.locator('.lx-customer-360').waitFor();
      await page.locator('.lx-supplier-360').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      const geometry=await page.evaluate(()=>{
        const panels=[...document.querySelectorAll('.lx-360-shell')].map(node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,textAlign:getComputedStyle(node).textAlign};});
        const touchRows=[...document.querySelectorAll('.lx-360-product-list>div')].map(node=>node.getBoundingClientRect().height);
        const currencies=[...document.querySelectorAll('.lx-360-money-list>article>div>strong')].map(node=>node.textContent?.trim());
        return{panels,touchRows,currencies,scrollWidth:document.documentElement.scrollWidth,innerWidth,dir:document.documentElement.dir};
      });
      assert.equal(geometry.panels.length,2,'customer and supplier 360 panels must both render');
      assert.ok(geometry.panels.every(panel=>panel.left>=-1&&panel.right<=geometry.innerWidth+1),`360 panels must stay inside viewport: ${JSON.stringify(geometry.panels)}`);
      assert.ok(geometry.scrollWidth<=geometry.innerWidth+1,`page must not create horizontal overflow: ${geometry.scrollWidth}/${geometry.innerWidth}`);
      assert.ok(geometry.touchRows.length>=4,'product activity rows must render for both profiles');
      assert.ok(geometry.touchRows.every(height=>height>=44),`product activity rows must be >=44px: ${geometry.touchRows.join(',')}`);
      assert.ok(geometry.currencies.includes('USD')&&geometry.currencies.includes('EUR'),'currency-separated rows must preserve USD and EUR');
      assert.equal(geometry.dir,lang==='ar'?'rtl':'ltr');
      if(lang==='ar')assert.ok(geometry.panels.every(panel=>panel.textAlign==='right'),`Arabic 360 content must align right: ${JSON.stringify(geometry.panels)}`);
      const supplierText=await page.locator('.lx-supplier-360').innerText();
      assert.ok(/Not Accounts Payable|ليس حساب ذمم موردين/.test(supplierText),'Supplier 360 must explicitly avoid Accounts Payable semantics');
      await page.screenshot({path:`${output}/mobile-${lang}.png`,fullPage:true,animations:'disabled'});
    }catch(error){failures.push(error?.stack||String(error));}
    finally{if(page)await page.close();}
    results.push({name,failures});
  };
  try{await run('mobile-en','en');await run('mobile-ar','ar');}
  finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Relationship 360 Batch 2 browser QA: ${results.length} mobile scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
