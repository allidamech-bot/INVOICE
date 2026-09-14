const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:390,height:844},{width:320,height:568}]){
      for(const lang of ['en','ar']){
        const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
        page.setDefaultTimeout(12000);
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-directory.html?lang=${lang}&screen=catalog`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);

        const row=page.locator('.product-library-row').first();
        await row.waitFor();
        const expected=lang==='ar'?'قطعة':'Piece';
        const meta=(await row.locator('.product-library-row-main small').textContent())||'';
        assert.ok(meta.includes(expected),`catalog row must display ${expected} for canonical PCS`);
        if(lang==='ar')assert.ok(!/(^|\s|·)PCS($|\s|·)/.test(meta),'Arabic catalog row must not leak canonical PCS text');

        await row.locator('.product-library-row-main').click();
        const editor=page.locator('.product-library-editor.is-open');
        await editor.waitFor();
        const unitLabel=editor.getByText(lang==='ar'?'الوحدة':'Unit',{exact:true});
        await unitLabel.waitFor();
        const unitInput=unitLabel.locator('xpath=..').locator('input');
        assert.equal(await unitInput.inputValue(),'PCS','editor must retain the canonical stored unit');

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Product unit locale QA: localized catalog display and canonical editor value passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
