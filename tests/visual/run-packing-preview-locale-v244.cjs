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

        const packing=editor.locator('.smart-product-field-packing');
        const select=packing.locator('select').first();
        const preview=packing.locator('.packing-preset-preview');
        await preview.waitFor();

        assert.equal(await select.inputValue(),'Box','packing select must retain canonical stored value');
        assert.equal((await preview.textContent())?.trim(),lang==='ar'?'علبة / صندوق':'Box','packing preview must follow the active UI language');

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Packing preview locale QA: canonical storage and EN/AR display passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
