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
     if(r.width*r.height>1000&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>220)&&(rgb.length===3||rgb[3]>.8))problems.push('light chrome '+el.tagName+'.'+el.className+' in '+el.parentElement.className+' '+s.backgroundColor);
     if(innerWidth<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push('small phone input '+el.className);
    }return [...new Set(problems)];
   });failures.push(...issues);
  };
  const reachable=async locator=>{
   await locator.scrollIntoViewIfNeeded();await page.waitForTimeout(180);const geometry=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {ok:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1&&el.contains(hit),rect:r.toJSON(),hit:hit?.className,viewport:{width:innerWidth,height:innerHeight}};});assert.equal(geometry.ok,true,'action clipped or covered '+JSON.stringify(geometry));
  };
  const auditFocusedProductEditor=async()=>{
   if(viewport.width>720)return;
   const state=await page.evaluate(()=>{
    const editor=document.querySelector('.product-library-editor.is-open');const nav=document.querySelector('.mobile-bottom-nav');
    if(!editor)return {error:'product editor missing'};
    const r=editor.getBoundingClientRect(),s=nav?getComputedStyle(nav):null;
    return {editor:{left:r.left,right:r.right,width:r.width},nav:nav?{display:s.display,visibility:s.visibility,opacity:s.opacity,pointerEvents:s.pointerEvents}:null,viewport:innerWidth};
   });
   assert.equal(state.error,undefined,JSON.stringify(state));
   assert.ok(state.editor.left>=-1&&state.editor.right<=viewport.width+1,'product editor exceeds phone viewport '+JSON.stringify(state));
   if(state.nav)assert.ok(state.nav.display==='none'||state.nav.visibility==='hidden'||state.nav.opacity==='0','mobile bottom nav covers focused product editor '+JSON.stringify(state));
  };
  const auditMobilePicker=async()=>{
   if(viewport.width>720)return;
   const state=await page.evaluate(()=>{
    const modal=document.querySelector('.modal:has(.saved-items-shell.is-picker)'),body=modal?.querySelector('.modal-body'),shell=modal?.querySelector('.saved-items-shell.is-picker'),pane=shell?.querySelector('.saved-items-list-pane'),list=shell?.querySelector('.saved-items-list'),bar=shell?.querySelector('.saved-items-picker-bar');
    if(!modal||!body||!shell||!pane||!list||!bar)return {error:'mobile picker containment nodes missing'};
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const info=[...bar.querySelectorAll('strong,small')].map(el=>({text:el.textContent,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,whiteSpace:getComputedStyle(el).whiteSpace}));
    const buttons=[...bar.querySelectorAll('.btn')].map(el=>({...rect(el),text:el.textContent?.trim()}));
    return {modal:rect(modal),body:rect(body),shell:rect(shell),pane:rect(pane),list:rect(list),bar:rect(bar),bodyOverflow:getComputedStyle(body).overflowY,shellOverflow:getComputedStyle(shell).overflowY,listOverflow:getComputedStyle(list).overflowY,listScrollable:list.scrollHeight>list.clientHeight+1,buttons,info,viewport:{width:innerWidth,height:innerHeight}};
   });
   assert.equal(state.error,undefined,JSON.stringify(state));
   assert.ok(state.modal.top>=-1&&state.modal.bottom<=state.viewport.height+1,'picker modal escapes viewport '+JSON.stringify(state));
   assert.ok(state.modal.height>=state.viewport.height*.72,'picker modal wastes phone viewport '+JSON.stringify(state));
   assert.equal(state.bodyOverflow,'hidden','picker modal body must not create a second scroll page '+JSON.stringify(state));
   assert.equal(state.shellOverflow,'hidden','picker shell must own contained geometry '+JSON.stringify(state));
   assert.ok(['auto','scroll'].includes(state.listOverflow),'picker list must be the scrolling surface '+JSON.stringify(state));
   assert.equal(state.listScrollable,true,'picker list should scroll inside the dialog '+JSON.stringify(state));
   assert.ok(state.list.bottom<=state.bar.top+1,'picker actions overlap the scrolling list '+JSON.stringify(state));
   assert.ok(state.bar.left>=state.modal.left-1&&state.bar.right<=state.modal.right+1&&state.bar.bottom<=state.body.bottom+1,'picker action bar escapes modal '+JSON.stringify(state));
   assert.ok(state.buttons.length>=2&&state.buttons.every(button=>button.height>=43&&button.left>=state.modal.left-1&&button.right<=state.modal.right+1),'picker action target clipped or below 44px '+JSON.stringify(state));
   assert.ok(state.info.every(item=>item.scrollWidth<=item.clientWidth+1&&item.whiteSpace==='normal'),'picker summary text clipped '+JSON.stringify(state));
  };
  try{
   await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
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
    await search.fill('LX-001');await rows.first().locator('.product-library-row-main').click();await page.locator('.product-library-editor.is-open').waitFor();await audit('.product-library-editor');await auditFocusedProductEditor();await shot('editor');
    const price=page.locator('.product-library-editor .field').filter({hasText:lang==='ar'?'سعر البيع':'Sale price'}).locator('input');await price.fill('275');
    const save=page.locator('.product-library-editor-actions .btn-primary');await reachable(save);await auditFocusedProductEditor();await save.click();await page.waitForFunction(()=>window.savedProduct?.lastUnitPrice==='275');await page.locator('.product-library-row-price').filter({hasText:'275 USD'}).waitFor();
   }else{
    await page.locator('.saved-items-shell').waitFor();await page.locator('.saved-items-smart-nav button').last().click();const rows=page.locator('.saved-item-row');assert.equal(await rows.count(),24);await audit('.modal');await auditMobilePicker();await shot('list');
    await page.locator('.saved-items-search-input').fill('Precision');assert.equal(await rows.count(),8);await rows.nth(0).locator('.saved-item-main').click();await rows.nth(1).locator('.saved-item-main').click();assert.equal(await page.locator('.saved-item-row.is-selected').count(),2);await auditMobilePicker();
    const add=page.locator('.saved-items-picker-bar .btn-primary');await reachable(add);await shot('selected');await add.click();await page.waitForFunction(()=>window.selectedItems?.length===2);assert.equal(await page.evaluate(()=>window.selectedItems.every(item=>item.lastCurrency==='USD'&&item.unit==='PCS')),true);
   }
  }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
  results.push({viewport,lang,screen,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian directory: '+results.length+' language/viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
