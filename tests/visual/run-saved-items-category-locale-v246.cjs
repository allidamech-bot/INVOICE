const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:390,height:844},{width:320,height:568}]){
      for(const lang of ['en','ar']){
        const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
        page.setDefaultTimeout(12000);
        await page.goto(`http://127.0.0.1:4173/tests/visual/saved-items-category-v246.html?lang=${lang}`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('.saved-items-shell').waitFor();

        const known=lang==='ar'?'مشروبات':'Beverages';
        const custom='Custom Industrial';
        const quick=page.locator('.saved-items-quick-filters');
        await quick.waitFor();
        assert.ok((await quick.textContent()).includes(known),'known category quick filter must follow UI language');
        assert.ok((await quick.textContent()).includes(custom),'custom category must remain unchanged');

        const knownQuick=quick.locator('button').filter({hasText:known}).first();
        await knownQuick.click();
        const context=page.locator('.saved-items-list-context strong');
        assert.ok((await context.textContent()).includes(known),'active quick-filter context must use localized category label');
        const visibleRows=page.locator('.saved-item-row');
        assert.equal(await visibleRows.count(),1,'known canonical category filter must still select the correct item');
        assert.equal((await visibleRows.first().locator('.saved-item-row-meta em').first().textContent())?.trim(),known,'saved-item row chip must use localized category label');

        const categoriesTab=page.locator('.saved-items-smart-nav button').filter({hasText:lang==='ar'?'التصنيفات':'Categories'}).first();
        await categoriesTab.click();
        const categoryBrowser=page.locator('.saved-items-categories');
        await categoryBrowser.waitFor();
        const browserText=await categoryBrowser.textContent();
        assert.ok(browserText.includes(known),'category browser must localize known canonical category');
        assert.ok(browserText.includes(custom),'category browser must preserve custom category text');

        const knownCategoryButton=categoryBrowser.locator('button').filter({hasText:known}).first();
        await knownCategoryButton.click();
        assert.ok((await page.locator('.saved-items-list-context strong').textContent()).includes(known),'category browsing context must remain localized');
        assert.equal(await page.locator('.saved-item-row').count(),1,'category browsing must keep canonical filtering behavior');

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Saved Items category locale QA: canonical filtering and EN/AR labels passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});