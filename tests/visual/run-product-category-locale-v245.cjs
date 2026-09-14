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

        const first=page.locator('.product-library-row').first();
        await first.waitFor();
        await first.locator('.product-library-row-main').click();
        const editor=page.locator('.product-library-editor.is-open');
        await editor.waitFor();

        const expected=lang==='ar'?'مشروبات':'Beverages';
        const categoryChoice=editor.locator('.product-library-choice-strip button').filter({hasText:expected}).first();
        await categoryChoice.waitFor();
        await categoryChoice.click();
        await editor.locator('.product-library-editor-actions button').filter({hasText:lang==='ar'?'حفظ الصنف':'Save Product'}).click();
        await page.locator('.product-library-editor.is-open').waitFor({state:'detached'});

        assert.equal(await page.evaluate(()=>window.savedProduct?.category),'Beverages','saved category must remain canonical');
        assert.equal((await page.locator('.product-library-row').first().locator('.product-library-row-chips em').first().textContent())?.trim(),expected,'catalog chip must follow UI language');

        const filter=page.locator('select[aria-label]').filter({has:page.locator('option[value="Beverages"]')}).first();
        const option=filter.locator('option[value="Beverages"]');
        assert.equal((await option.textContent())?.trim(),expected,'category filter label must follow UI language');
        await filter.selectOption('Beverages');
        assert.equal(await filter.inputValue(),'Beverages','category filter must retain canonical value');
        assert.equal((await page.locator('.product-library-list-head strong').first().textContent())?.trim(),expected,'active category heading must follow UI language');

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Product category locale QA: canonical storage and EN/AR catalog labels passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
