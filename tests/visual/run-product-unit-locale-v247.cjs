const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const outputDir=path.resolve('visual-qa-output');
fs.mkdirSync(outputDir,{recursive:true});
const progressFile=path.join(outputDir,'unit-v247-progress.txt');
const progress=(message)=>fs.appendFileSync(progressFile,`${message}\n`);

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:390,height:844},{width:320,height:568}]){
      for(const lang of ['en','ar']){
        const scenario=`${viewport.width}x${viewport.height}-${lang}`;
        progress(`START ${scenario}`);
        const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
        page.setDefaultTimeout(12000);
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-directory.html?lang=${lang}&screen=catalog`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        progress(`LOADED ${scenario}`);

        const row=page.locator('.product-library-row').first();
        await row.waitFor();
        progress(`ROW ${scenario}`);
        const expected=lang==='ar'?'قطعة':'Piece';
        const meta=(await row.locator('.product-library-row-main small').textContent())||'';
        progress(`META ${scenario} ${JSON.stringify(meta)}`);
        assert.ok(meta.includes(expected),`catalog row must display ${expected} for canonical PCS`);
        if(lang==='ar')assert.ok(!/(^|\s|·)PCS($|\s|·)/.test(meta),'Arabic catalog row must not leak canonical PCS text');
        progress(`DISPLAY_PASS ${scenario}`);

        progress(`CLICK_START ${scenario}`);
        await row.locator('.product-library-row-main').click();
        progress(`CLICK_PASS ${scenario}`);
        const editor=page.locator('.product-library-editor.is-open');
        await editor.waitFor();
        progress(`EDITOR_OPEN ${scenario}`);
        const unitValue=await editor.locator('input').evaluateAll(inputs=>inputs.map(input=>input.value).find(value=>value==='PCS')||'');
        progress(`EDITOR_UNIT ${scenario} ${JSON.stringify(unitValue)}`);
        assert.equal(unitValue,'PCS','editor must retain the canonical stored unit');
        progress(`PASS ${scenario}`);

        await page.close();
      }
    }
  }finally{
    await browser.close();
  }
  console.log('Product unit locale QA: localized catalog display and canonical editor value passed at phone widths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
