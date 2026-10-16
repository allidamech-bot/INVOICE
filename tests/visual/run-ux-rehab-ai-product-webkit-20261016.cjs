const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

const out='visual-qa-output/ux-rehab-ai-product-webkit';
const cases=[{width:320,height:700,lang:'ar'},{width:390,height:844,lang:'en'},{width:430,height:932,lang:'ar'}];
(async()=>{
 mkdirSync(out,{recursive:true});const browser=await webkit.launch({headless:true});
 try{
  for(const c of cases){
   const key=c.width+'-'+c.lang;
   const page=await browser.newPage({viewport:{width:c.width,height:c.height},hasTouch:true,isMobile:true});
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/ux-rehab-ai-product-review-20261016.html?lang='+c.lang,{waitUntil:'load'});
    const modal=page.locator('.lxw-ai-product-review');
    await modal.waitFor({timeout:15000});
    const rows=modal.locator('tbody tr');
    assert.equal(await rows.count(),4,'fixture has four synthetic candidates '+key);
    const safe=page.locator('.lxw-ai-product-review-selection input[type=checkbox]');
    const all=rows.locator('input[type=checkbox]');
    assert.equal(await all.count(),4,'every candidate exposes native selection '+key);
    assert.equal(await all.nth(0).isChecked(),true,'safe product 1 initially checked');
    assert.equal(await all.nth(1).isChecked(),false,'existing match never prechecked');
    assert.equal(await all.nth(2).isChecked(),true,'safe product 2 initially checked');
    assert.equal(await all.nth(3).isDisabled(),true,'blocked row never selectable');
    await safe.uncheck();
    assert.equal(await all.nth(0).isChecked(),false);
    assert.equal(await all.nth(2).isChecked(),false);
    await all.nth(1).check();
    assert.equal(await all.nth(1).isChecked(),true,'existing match only after individual consent');
    await safe.check();
    assert.equal(await all.nth(0).isChecked(),true);
    assert.equal(await all.nth(2).isChecked(),true);
    assert.equal(await all.nth(1).isChecked(),true,'bulk-safe toggle must preserve existing manual decision');
    const filters=page.locator('.lxw-ai-product-review-filters button');
    assert.equal(await filters.count(),4);
    await filters.nth(3).click();
    assert.equal(await rows.count(),1,'blocked filter must show only blocked candidate');
    assert.equal(await rows.first().locator('input').isDisabled(),true);
    await filters.nth(2).click();
    assert.equal(await rows.count(),1,'matched filter must show one record');
    const diffs=rows.first().locator('.lxw-ai-product-row-diffs');
    await diffs.locator('summary').click();
    assert.ok((await diffs.textContent()).includes('22'),'old cost evidence must be retained');
    assert.ok((await diffs.textContent()).includes('25'),'new cost evidence must be retained');
    await filters.nth(0).click();
    assert.equal(await rows.count(),4);
    const stats=await page.evaluate(()=>({horizontal:document.documentElement.scrollWidth-innerWidth,selected:[...document.querySelectorAll('.lxw-ai-product-review tbody input[type=checkbox]')].filter(x=>x.checked).length}));
    assert.ok(stats.horizontal<=1,'AI review cannot overflow screen '+key+' '+JSON.stringify(stats));
    assert.equal(stats.selected,3,'two new + one manually confirmed match');
    await page.screenshot({path:out+'/'+key+'-review.png',fullPage:true,animations:'disabled'});
    console.log('PASS WebKit AI import safe selection',key);
   }finally{await page.close();}
  }
  for(const c of [{width:390,height:844,lang:'en'},{width:390,height:844,lang:'ar'}]){
   const page=await browser.newPage({viewport:{width:c.width,height:c.height},hasTouch:true,isMobile:true});
   try{
    const key=c.lang;
    await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-directory.html?lang='+c.lang+'&screen=catalog',{waitUntil:'load'});
    const chooser=page.locator('.ta-product-commandbar .ta-product-import-entry');
    await chooser.waitFor({timeout:12000});
    assert.equal(await chooser.count(),1,'catalog displays one import entry');
    await chooser.locator('summary').click();
    assert.equal(await chooser.locator('.ta-product-import-options button').count(),2,'AI and advanced import both survive');
    await page.screenshot({path:out+'/'+key+'-import-routes.png',fullPage:false,animations:'disabled'});
    const advanced=chooser.locator('.ta-product-import-options button').last();
    await advanced.click();
    await page.locator('.product-import-shell').waitFor({timeout:12000});
    assert.equal(await page.locator('.product-import-shell').isVisible(),true,'advanced multi-sheet importer opens');
    console.log('PASS WebKit catalog import routes',key);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
