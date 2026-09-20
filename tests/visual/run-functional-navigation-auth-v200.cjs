const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/functional-navigation-auth-v200';
const base='http://127.0.0.1:4173/tests/visual';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:1366,height:768},hasTouch:false,isMobile:false});
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`${base}/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
        const sidebar=page.locator('.workspace-sidebar');
        await sidebar.waitFor();
        assert.equal(await sidebar.isVisible(),true,'Desktop sidebar must be visible at laptop width');
        assert.equal(await page.locator('.mobile-bottom-nav').isVisible(),false,'Mobile bottom navigation must stay hidden on desktop');
        assert.equal(await page.locator('.shell-nav-button').count(),7,'Desktop shell must expose all seven workspace destinations');

        const create=page.locator('.shell-create-button');
        await create.click();
        const createMenu=page.locator('#desktop-new-document-menu');
        await createMenu.waitFor();
        assert.equal(await createMenu.isVisible(),true,'Desktop New Document menu must open');
        await createMenu.locator('[role="menuitem"]').first().click();
        assert.equal(await page.evaluate(()=>window.shellQa.newKind),'proforma','Desktop quotation action must reach the document boundary');
        assert.equal(await createMenu.count(),0,'Desktop New Document menu must close after choosing a document type');

        const primary=page.locator('.shell-nav-primary .shell-nav-button');
        await primary.nth(1).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'documents');
        await primary.nth(2).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'customers');
        await primary.nth(3).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'items');
        await primary.nth(4).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'operations');
        await primary.nth(5).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'receivables');
        await primary.nth(6).click();
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'reports');

        await page.locator('.shell-settings-row').click();
        assert.equal(await page.evaluate(()=>window.shellQa.settings),1,'Desktop Settings must open through the scoped settings boundary');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'settings','Desktop Settings must request the Settings scope');

        await page.locator('.shell-account-row').click();
        assert.equal(await page.evaluate(()=>window.shellQa.settings),2,'Desktop sidebar Account must open through the scoped settings boundary');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'account','Desktop sidebar Account must request the Account scope');

        await page.locator('.shell-account-button').click();
        assert.equal(await page.evaluate(()=>window.shellQa.settings),3,'Desktop top-bar Account must remain functional');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'account','Desktop top-bar Account must request the Account scope');

        const geometry=await page.evaluate(()=>{
          const box=selector=>document.querySelector(selector)?.getBoundingClientRect();
          const sidebar=box('.workspace-sidebar');
          const topbar=box('.workspace-topbar');
          const content=box('.workspace-content');
          return {sidebar,topbar,content,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
        });
        assert.ok(geometry.sidebar&&geometry.sidebar.width>=240&&geometry.sidebar.width<=256,`Unexpected desktop sidebar width ${JSON.stringify(geometry.sidebar)}`);
        assert.ok(geometry.topbar&&geometry.content,'Desktop topbar/content geometry missing');
        assert.ok(geometry.scrollWidth<=geometry.width+1,`Desktop shell has horizontal overflow ${JSON.stringify(geometry)}`);
        if(lang==='ar'){
          assert.ok(geometry.sidebar.left>=geometry.content.right-1,'Arabic desktop sidebar must occupy the right rail');
          assert.ok(Math.abs(geometry.topbar.right-geometry.content.right)<=1,'Arabic desktop topbar/content rails must align');
        }else{
          assert.ok(geometry.sidebar.right<=geometry.content.left+1,'English desktop sidebar must occupy the left rail');
          assert.ok(Math.abs(geometry.topbar.left-geometry.content.left)<=1,'English desktop topbar/content rails must align');
        }
        await page.screenshot({path:`${output}/desktop-shell-${lang}.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:`desktop-shell-${lang}`,failures});
      await page.close();
    }

    for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`${base}/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
        await page.locator('.mobile-bottom-nav').waitFor();
        const create=page.locator('.mobile-create-button');
        const more=page.locator('button[aria-controls="mobile-more-sheet"]');

        await create.click();
        await page.locator('.mobile-shell-new-menu').waitFor();
        await more.click();
        assert.equal(await page.locator('.mobile-shell-new-menu').count(),0,'Create menu must close before More opens');
        await page.locator('#mobile-more-sheet').waitFor();
        assert.equal(await page.locator('#mobile-more-sheet').getAttribute('aria-modal'),'true');
        assert.equal(await page.locator('#mobile-more-sheet').getAttribute('dir'),lang==='ar'?'rtl':'ltr','More sheet must declare the active writing direction');
        const moreGeometry=await page.locator('#mobile-more-sheet .mobile-more-link').first().evaluate(button=>{
          const rect=selector=>button.querySelector(selector).getBoundingClientRect();
          const icon=rect('.mobile-more-link-icon');
          const copy=rect('.mobile-more-link-copy');
          const chevron=rect('.mobile-more-chevron');
          return {iconCenter:icon.left+icon.width/2,copyCenter:copy.left+copy.width/2,chevronCenter:chevron.left+chevron.width/2};
        });
        if(lang==='ar'){
          assert.ok(moreGeometry.iconCenter>moreGeometry.copyCenter,'Arabic More items must place the icon on the right of the copy');
          assert.ok(moreGeometry.chevronCenter<moreGeometry.copyCenter,'Arabic More items must place the chevron on the left of the copy');
        }else{
          assert.ok(moreGeometry.iconCenter<moreGeometry.copyCenter,'English More items must place the icon on the left of the copy');
          assert.ok(moreGeometry.chevronCenter>moreGeometry.copyCenter,'English More items must place the chevron on the right of the copy');
        }

        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#mobile-more-sheet').count(),0,'Escape must close More');

        await create.click();
        await page.locator('.mobile-shell-new-menu').waitFor();
        const primaryTabs=page.locator('.mobile-bottom-nav > button');
        await primaryTabs.nth(2).click();
        assert.equal(await page.locator('.mobile-shell-new-menu').count(),0,'Navigation must close Create menu');
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'customers');

        await more.click();
        await page.locator('#mobile-more-sheet').waitFor();
        await page.locator('#mobile-more-sheet .mobile-more-group .mobile-more-link').first().click();
        assert.equal(await page.locator('#mobile-more-sheet').count(),0,'More must close after secondary navigation');
        assert.equal(await page.evaluate(()=>window.shellQa.navigations.at(-1)),'items');

        await more.click();
        await page.locator('#mobile-more-sheet').waitFor();
        await page.locator('#mobile-more-sheet .mobile-more-settings').click();
        assert.equal(await page.locator('#mobile-more-sheet').count(),0,'More must close before Settings opens');
        assert.equal(await page.evaluate(()=>window.shellQa.settings),1);
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'settings','Settings entry must request the Settings scope');

        await more.click();
        await page.locator('#mobile-more-sheet').waitFor();
        await page.locator('#mobile-more-sheet .mobile-more-account').click();
        assert.equal(await page.locator('#mobile-more-sheet').count(),0,'More must close before Account opens');
        assert.equal(await page.evaluate(()=>window.shellQa.settings),2,'Account must open through the scoped Settings boundary');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'account','Account entry must request the Account scope');

        await page.locator('.shell-account-button').click();
        assert.equal(await page.evaluate(()=>window.shellQa.settings),3,'Top-bar Account must use the scoped Settings boundary');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('lourex-settings-scope')),'account','Top-bar Account must request the Account scope');

        await create.click();
        await page.locator('.mobile-shell-new-menu [role="menuitem"]').first().click();
        assert.equal(await page.evaluate(()=>window.shellQa.newKind),'proforma');
        assert.equal(await page.locator('.mobile-shell-new-menu').count(),0,'Create menu must close after choosing document type');

        const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,navHeight:document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect().height||0}));
        if(geometry.scrollWidth>geometry.width+1)failures.push(`horizontal overflow ${JSON.stringify(geometry)}`);
        if(geometry.navHeight<60||geometry.navHeight>70)failures.push(`unexpected browser bottom-nav height ${geometry.navHeight}`);
        await page.screenshot({path:`${output}/shell-${lang}.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:`shell-${lang}`,failures});
      await page.close();
    }

    for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`${base}/functional-account-v200.html?lang=${lang}`,{waitUntil:'load'});
        const form=page.locator('.cloud-auth-form');
        await form.waitFor();
        const tabs=page.locator('.cloud-auth-tabs [role="tab"]');
        await tabs.nth(1).click();
        const password=page.locator('.cloud-auth-form input[type="password"]').first();
        await password.fill('temporary7');
        await page.locator('.cloud-auth-form input[type="password"]').nth(1).fill('temporary7');
        await tabs.nth(0).click();
        assert.equal(await page.locator('.cloud-auth-form input[type="password"]').inputValue(),'','switching account mode must clear password');
        assert.equal(await page.locator('.cloud-auth-form input[type="password"]').count(),1,'confirm password must leave the sign-in form');

        await page.locator('.cloud-auth-form input[type="email"]').fill('user@example.test');
        await page.locator('.cloud-auth-form input[type="password"]').fill('secret7');
        await page.locator('.cloud-auth-form button[type="submit"]').click();
        await page.waitForFunction(()=>document.querySelector('.cloud-auth-form')?.getAttribute('aria-busy')==='true');
        const locked=await page.evaluate(()=>({inputs:[...document.querySelectorAll('.cloud-auth-form input')].every(input=>input.disabled),tabs:[...document.querySelectorAll('.cloud-auth-tabs button')].every(button=>button.disabled),calls:window.accountQa.signInCalls,last:window.accountQa.lastCredentials}));
        assert.equal(locked.inputs,true,'credentials must lock while sign-in is pending');
        assert.equal(locked.tabs,true,'mode tabs must lock while sign-in is pending');
        assert.equal(locked.calls,1);
        assert.deepEqual(locked.last,{email:'user@example.test',password:'secret7'});
        await page.evaluate(()=>window.accountQa.resolve());
        await page.waitForFunction(()=>document.querySelector('.cloud-auth-form')?.getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('.cloud-auth-form input[type="password"]').inputValue(),'','successful account action must clear password');
        await page.screenshot({path:`${output}/account-${lang}.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:`account-${lang}`,failures});
      await page.close();
    }

    {
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const failures=[];
      try{
        await page.goto(`${base}/functional-account-v200.html?user=1`,{waitUntil:'load'});
        const button=page.locator('.account-only-actions button');
        await button.waitFor();
        await page.evaluate(()=>{const button=document.querySelector('.account-only-actions button');button.click();button.click();});
        await page.locator('.auth-error').waitFor();
        const state=await page.evaluate(()=>({calls:window.accountQa.signOutCalls,disabled:document.querySelector('.account-only-actions button').disabled}));
        assert.equal(state.calls,1,'rapid sign-out presses must invoke the account boundary once');
        assert.equal(state.disabled,false,'failed sign-out must become retryable');
        await page.screenshot({path:`${output}/signout-retry.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:'signout-retry',failures});
      await page.close();
    }
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.flow}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Navigation/auth v200: ${results.length} browser flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
