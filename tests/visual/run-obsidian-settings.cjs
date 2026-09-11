const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-settings';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const audit=async(page,failures)=>{
    const issues=await page.locator('.modal').evaluate(root=>{
      const problems=[],vw=innerWidth;
      if(document.documentElement.scrollWidth>vw+1)problems.push(`page overflow ${document.documentElement.scrollWidth}>${vw}`);
      const modal=root.getBoundingClientRect();
      if(modal.left<-1||modal.right>vw+1)problems.push(`modal horizontal clip ${JSON.stringify(modal.toJSON())}`);
      for(const el of root.querySelectorAll('*')){
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||s.visibility==='hidden'||s.display==='none')continue;
        const rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
        if(r.width*r.height>1200&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>225)&&(rgb.length===3||rgb[3]>.8))problems.push(`light chrome ${el.tagName}.${el.className} ${s.backgroundColor}`);
        if(vw<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push(`small phone input ${el.className} ${s.fontSize}`);
        if(vw<=430&&el.matches('.settings-tabs>button,.settings-title>.btn,.settings-account-actions .btn')&&(r.width<44||r.height<44))problems.push(`small touch target ${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return [...new Set(problems)];
    });
    failures.push(...issues);
  };

  try{
    for(const viewport of viewports)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      const shot=async state=>page.screenshot({path:`${output}/${viewport.width}-${lang}-settings-${state}.png`,fullPage:true,animations:'disabled'});
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang=${lang}&scope=settings`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        const workspace=page.locator('.settings-workspace-v2.settings-preferences-workspace');
        await workspace.waitFor();
        assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
        const modal=page.locator('.modal'),modalBox=await modal.boundingBox();
        assert.ok(modalBox&&modalBox.width<=viewport.width+1&&modalBox.height<=viewport.height+1,'settings modal exceeds viewport');
        const tabs=page.locator('.settings-tabs>button');
        assert.equal(await tabs.count(),4,'Settings must expose General, Commercial, Documents and Security');
        const labels=(await tabs.allTextContents()).map(value=>value.trim());
        assert.ok(labels.some(value=>/General|عام/.test(value)),'General/Preferences tab missing');
        assert.ok(labels.some(value=>/Commercial|تجاري/.test(value)),'Commercial tab missing');
        assert.ok(labels.some(value=>/Documents|المستندات/.test(value)),'Documents tab missing');
        assert.ok(labels.some(value=>/Security|الأمان/.test(value)),'Security tab missing');
        assert.equal(await page.locator('.account-profile-page').count(),0,'Company profile must not appear in Settings scope');

        const states=['preferences','commercial','documents','security'];
        for(let i=0;i<states.length;i++){
          const tab=tabs.nth(i);
          await tab.scrollIntoViewIfNeeded();
          await tab.click();
          await page.waitForTimeout(80);
          assert.equal(await tab.getAttribute('aria-current'),'page',`${states[i]} tab did not activate`);
          await audit(page,failures);
          await shot(states[i]);
          if(states[i]==='preferences'){
            assert.equal(await page.locator('.account-profile-logo-section').count(),0,'Company logo/profile must stay out of Settings');
            assert.ok(await page.locator('.settings-document-artwork').count()===1,'document artwork preferences missing');
            assert.ok(await page.locator('.company-artwork-section').count()===1,'document artwork section missing');
            assert.ok(await page.locator('.settings-document-artwork input[type="file"]').count()===2,'Settings should manage signature and stamp artwork only');
            const save=page.locator('.settings-title>.btn');
            await save.scrollIntoViewIfNeeded();
            const box=await save.boundingBox();
            assert.ok(box&&box.width>=44&&box.height>=40,'settings save action too small');
          }else if(states[i]==='commercial'){
            await page.locator('.commercial-controls-settings').waitFor();
            assert.ok(await page.locator('.commercial-settings-section').count()>=1,'commercial settings sections missing');
          }else if(states[i]==='documents'){
            await page.locator('.settings-section input').first().fill('QT');
            await page.locator('.settings-title>.btn').click();
            await page.waitForFunction(()=>window.savedSettings?.numbering.proformaPrefix==='QT');
            assert.ok(await page.locator('.numbering-preview').count()===1,'numbering preview missing');
            assert.ok(await page.locator('.settings-title>.btn').count()===1,'document save action missing');
          }else if(states[i]==='security'){
            await page.locator('.security-settings-page').waitFor();
            assert.ok(await page.locator('.settings-recovery-card').count()===1,'encrypted recovery controls missing');
            assert.ok(await page.locator('.device-security-section').count()===1,'device security controls missing');
            assert.equal(await page.locator('.settings-signout-button').count(),0,'Sign out belongs under Account, not Settings');
            assert.equal(await page.locator('.account-profile-page').count(),0,'Account profile must remain outside Security settings');
          }
        }
      }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
      results.push({scope:'settings',viewport,lang,failures});
      await page.close();
    }

    for(const lang of ['en','ar']){
      const viewport={width:390,height:844};
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      const shot=async state=>page.screenshot({path:`${output}/390-${lang}-account-${state}.png`,fullPage:true,animations:'disabled'});
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang=${lang}&scope=account`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('.settings-workspace-v2.account-profile-workspace').waitFor();
        assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
        assert.equal(await page.locator('.settings-tabs').count(),0,'Account must not expose Settings navigation tabs');
        await page.locator('.account-profile-page').waitFor();
        assert.ok(await page.locator('.account-profile-logo-section').count()===1,'Account company logo section missing');
        assert.ok(await page.locator('.account-profile-logo-section input[type="file"]').count()===1,'Account must own the company logo upload');
        assert.ok(await page.locator('.account-profile-page input[type="url"]').count()===1,'Account website field missing');
        assert.ok(await page.locator('.account-profile-page input[type="email"]').count()===1,'Account contact email field missing');
        assert.ok(await page.locator('.settings-account-card.account-profile-access').count()===1,'Account access card missing');
        assert.ok(await page.locator('.settings-signout-button').count()===1,'Account sign-out action missing');
        assert.equal(await page.locator('.security-settings-page').count(),0,'Security preferences must not be mixed into Account');
        const upload=page.locator('.account-profile-logo-section .logo-asset-control');
        const trigger=upload.locator('.asset-file-trigger');
        await trigger.waitFor();
        assert.match((await trigger.textContent())||'',lang==='ar'?/اختيار صورة/:/Choose image/,'artwork picker is not localized');
        const uploadGeometry=await page.evaluate(()=>{
          const control=document.querySelector('.account-profile-logo-section .logo-asset-control'),summary=document.querySelector('.account-profile-summary'),name=summary?.querySelector('strong'),detail=summary?.querySelector('span'),input=control?.querySelector('input[type="file"]');
          const c=control?.getBoundingClientRect(),s=summary?.getBoundingClientRect(),n=name?.getBoundingClientRect(),d=detail?.getBoundingClientRect(),i=input?.getBoundingClientRect();
          return {gap:c&&s?s.top-c.bottom:null,lineGap:n&&d?d.top-n.bottom:null,nativeInput:i?{width:i.width,height:i.height}:null};
        });
        assert.ok(uploadGeometry.gap!==null&&uploadGeometry.gap>=8,'company summary is attached to the upload control '+JSON.stringify(uploadGeometry));
        assert.ok(uploadGeometry.lineGap!==null&&uploadGeometry.lineGap>=3,'company name and website are not visually separated '+JSON.stringify(uploadGeometry));
        assert.ok(uploadGeometry.nativeInput&&uploadGeometry.nativeInput.width<=2&&uploadGeometry.nativeInput.height<=2,'native file control remains visually exposed '+JSON.stringify(uploadGeometry));

        const name=page.locator('.account-profile-page input.input').first();
        await name.fill('LOUREX verified company');
        await page.locator('.settings-title>.btn').click();
        await page.waitForFunction(()=>window.savedCompany?.nameEn==='LOUREX verified company');
        await audit(page,failures);
        await shot('profile');
      }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
      results.push({scope:'account',viewport,lang,failures});
      await page.close();
    }
  }finally{
    await browser.close();
  }

  writeFileSync(output+'/report.json',JSON.stringify(results,null,2));
  const failures=results.flatMap(r=>r.failures.map(f=>`${r.scope}/${r.viewport.width}/${r.lang}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Obsidian settings/account workspace: ${results.length} scoped language/viewport flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
