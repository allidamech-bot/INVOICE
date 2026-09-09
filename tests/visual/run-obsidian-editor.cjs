const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-editor';
const viewports=[{width:1440,height:1000},{width:1024,height:900},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar'])for(const kind of ['invoice','proforma']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('pageerror',e=>failures.push(String(e)));
  const stem=viewport.width+'-'+lang+'-'+kind;
  try{
   await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-editor.html?lang='+lang+'&kind='+kind,{waitUntil:'load'});
   await page.locator('.editor-section-nav-button').first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const audit=async()=>{
    const issues=await page.evaluate(()=>{
     const issues=[],screen=document.querySelector('.editor-screen');
     if(screen.scrollWidth>innerWidth+1)issues.push('editor horizontal overflow');
     for(const el of document.querySelectorAll('.editor-scroll *,.editor-topbar,.document-readiness,.mobile-editor-actionbar,.preview-stage')){
      if(el.closest('.invoice-pages,.template-mini,.template-thumbnail'))continue;
      const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
      if(rect.width&&rect.height&&css.backgroundColor==='rgb(255, 255, 255)')issues.push('white chrome: '+el.className);
     }
     return [...new Set(issues)];
    });failures.push(...issues);
   };
   await audit();
   await page.screenshot({path:output+'/'+stem+'-document.png',animations:'disabled'});
   const sections=page.locator('.editor-section');
   await sections.nth(2).scrollIntoViewIfNeeded();
   await page.screenshot({path:output+'/'+stem+'-items.png',animations:'disabled'});
   await page.locator('.item-pricing-grid input').first().fill('5');
   await page.waitForFunction(()=>window.lastSaved?.items[0].quantity==='5');
   await sections.nth(3).scrollIntoViewIfNeeded();
   assert.match(await page.locator('.editor-totals .grand').innerText(),/5,045.00/);
   await audit();
   await page.screenshot({path:output+'/'+stem+'-totals.png',animations:'disabled'});
   await sections.last().scrollIntoViewIfNeeded();
   await page.screenshot({path:output+'/'+stem+'-terms.png',animations:'disabled'});
   if(viewport.width<=1180){
    if(viewport.width<=900)await page.locator('.mobile-action-buttons .btn').nth(1).click();
    else await page.locator('.mobile-preview-button:visible').first().click();
    await page.locator('.mobile-preview-overlay').waitFor({state:'visible'});
    const preview=await page.locator('.mobile-preview-stage').evaluate(el=>({background:getComputedStyle(el).backgroundColor,paper:el.querySelectorAll('.invoice-page').length}));
    assert.equal(preview.background,'rgb(13, 24, 30)');assert.ok(preview.paper>0);
    await page.screenshot({path:output+'/'+stem+'-preview.png',animations:'disabled'});
    await page.locator('.mobile-preview-overlay header .icon-btn').click();
   }else assert.equal(await page.locator('.preview-stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(13, 24, 30)');
  }catch(e){failures.push(String(e));await page.screenshot({path:output+'/'+stem+'-failure.png',fullPage:true}).catch(()=>{});}
  results.push({viewport,lang,kind,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));
 const failures=results.flatMap(r=>r.failures.map(f=>r.viewport.width+'/'+r.lang+'/'+r.kind+': '+f));
 assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian editor: '+results.length+' responsive/language/document cases passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
