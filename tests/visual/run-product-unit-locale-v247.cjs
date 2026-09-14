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
        const saveButton=editor.getByRole('button',{name:lang==='ar'?'حفظ الصنف':'Save Product',exact:true});
        await saveButton.click();
        await page.waitForFunction(()=>Boolean(window.savedProduct));
        const savedUnit=await page.evaluate(()=>window.savedProduct?.unit||'');
        assert.equal(savedUnit,'PCS','saving the product must retain the canonical stored unit');

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Product unit locale QA: localized catalog display and canonical save path passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
