const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-directory';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar'])for(const screen of ['customers','catalog','picker']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(10000);
  const failures=[];page.on('pageerror',error=>failures.push(String(error)));
  const shot=async state=>page.screenshot({path:`${output}/${viewport.width}-${lang}-${screen}-${state}.png`,fullPage:true,animations:'disabled'});
  const audit=async selector=>{
   const issues=await page.locator(selector).evaluate(root=>{
    const problems=[];if(document.documentElement.scrollWidth>innerWidth+1)problems.push('page overflow');
    for(const el of root.querySelectorAll('*')){
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||s.visibility==='hidden')continue;
     const rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
     if(r.width*r.height>1000&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>220)&&(rgb.length===3||rgb[3]>.8))problems.push('light chrome '+el.className);
     if(innerWidth<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push('small phone input '+el.className);
    }return [...new Set(problems)];
   });failures.push(...issues);
  };
  const reachable=async locator=>{
   await locator.scrollIntoViewIfNeeded();assert.equal(await locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'action clipped or covered');
  };
  try{
   await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-directory.html?lang=${lang}&screen=${screen}`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   if(screen==='customers'){
    const rows=page.locator('.premium-customer-card');await rows.first().waitFor();assert.equal(await rows.count(),8);await audit('.customers-page');await shot('list');
    const search=page.locator('.customers-search-input');await search.fill('finance0@');assert.equal(await rows.count(),1);
    await search.fill('No matching directory entry');await page.locator('.customers-empty').waitFor();await audit('.customers-empty');await shot('empty');await search.fill('finance0@');
    await rows.first().locator('.customer-card-main').click();await page.locator('.customer-profile-page').waitFor();await audit('.customer-profile-page');await shot('profile');
    await page.locator('.customer-profile-top-actions .btn-primary').click();assert.deepEqual(await page.evaluate(()=>window.createdDocument),{kind:'invoice',customerId:'customer-0'});
    await page.locator('.customer-profile-top-actions .btn').first().click();const email=page.locator('.customer-form-stack input[type="email"]');await email.fill('updated@example.test');await audit('.modal');await shot('form');
    const save=page.locator('.modal-footer .btn-primary');await reachable(save);await save.click();await page.waitForFunction(()=>window.savedCustomer?.email==='updated@example.test');
    await page.locator('.customer-profile-back').click();assert.equal(await page.locator('[data-customer-id="customer-0"] .customer-card-main').evaluate(el=>el===document.activeElement),true,'profile restores focus');
   }else if(screen==='catalog'){
    const rows=page.locator('.product-library-row');await rows.first().waitFor();assert.equal(await rows.count(),24);assert.equal(await page.locator('.product-library-editor').isVisible(),false);await audit('.product-library-page');await shot('list');
    const search=page.locator('.product-library-search input');await search.fill('LX-001');assert.equal(await rows.count(),1);await search.fill('missing-catalog-result');assert.equal(await rows.count(),0);await shot('empty');await search.fill('');
    await page.locator('.product-library-commandbar select').first().selectOption('Controls');assert.equal(await rows.count(),8);await page.locator('.product-library-commandbar select').first().selectOption('');
    await page.locator('.product-library-metrics button').last().click();assert.equal(await rows.count(),4);await rows.first().locator('.product-library-star').click();await page.waitForFunction(()=>document.querySelectorAll('.product-library-row').length===3);await page.locator('.product-library-metrics button').first().click();
    await search.fill('LX-001');await rows.first().locator('.product-library-row-main').click();await page.locator('.product-library-editor.is-open').waitFor();await audit('.product-library-editor');await shot('editor');
    const price=page.locator('.product-library-editor .field').filter({hasText:lang==='ar'?'سعر البيع':'Sale price'}).locator('input');await price.fill('275');
    const save=page.locator('.product-library-editor-actions .btn-primary');await reachable(save);await save.click();await page.waitForFunction(()=>window.savedProduct?.lastUnitPrice==='275');await page.locator('.product-library-row-price').filter({hasText:'275 USD'}).waitFor();
   }else{
    await page.locator('.saved-items-shell').waitFor();await page.locator('.saved-items-smart-nav button').last().click();const rows=page.locator('.saved-item-row');assert.equal(await rows.count(),24);await audit('.modal');await shot('list');
    await page.locator('.saved-items-search-input').fill('Precision');assert.equal(await rows.count(),8);await rows.nth(0).locator('.saved-item-main').click();await rows.nth(1).locator('.saved-item-main').click();assert.equal(await page.locator('.saved-item-row.is-selected').count(),2);
    const add=page.locator('.saved-items-picker-bar .btn-primary');await reachable(add);await shot('selected');await add.click();await page.waitForFunction(()=>window.selectedItems?.length===2);assert.equal(await page.evaluate(()=>window.selectedItems.every(item=>item.lastCurrency==='USD'&&item.unit==='PCS')),true);
   }
  }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
  results.push({viewport,lang,screen,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian directory: '+results.length+' language/viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
