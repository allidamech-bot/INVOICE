const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/obsidian-settings';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
const sections=['company','workspaces','commercial','documents','access','data','security'];

async function audit(page,failures){
  const issues=await page.locator('.modal').evaluate(root=>{
    const problems=[],vw=innerWidth;
    if(document.documentElement.scrollWidth>vw+1)problems.push('page horizontal overflow '+document.documentElement.scrollWidth+'>'+vw);
    const modal=root.getBoundingClientRect();
    if(modal.left<-1||modal.right>vw+1||modal.height>innerHeight+1)problems.push('settings modal clipped '+JSON.stringify(modal.toJSON()));
    for(const el of root.querySelectorAll('.ta-settings-nav button,.ta-settings-page-action .btn,.ta-settings-card .btn,.ta-settings-content input,.ta-settings-content select,.ta-settings-content textarea,.ta-settings-card')){
      const r=el.getBoundingClientRect(),style=getComputedStyle(el);
      if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||style.visibility==='hidden'||style.display==='none')continue;
      if(vw<=430&&el.matches('input:not([type=file]),select,textarea')&&parseFloat(style.fontSize)<16)
        problems.push('small mobile input '+el.className+' '+style.fontSize);
      if(vw<=430&&el.matches('.ta-settings-nav button,.ta-settings-page-action .btn,.ta-settings-card .btn')&&(r.width<44||r.height<44))
        problems.push('small touch target '+el.className+' '+Math.round(r.width)+'x'+Math.round(r.height));
      if(el.matches('.ta-settings-card')&&document.documentElement.dataset.uiTheme==='dark'){
        const rgb=style.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
        if(rgb.length>=3&&rgb.slice(0,3).every(v=>v>225)&&(rgb.length===3||rgb[3]>.8))
          problems.push('light chrome in dark card '+style.backgroundColor);
      }
    }
    return [...new Set(problems)];
  });
  failures.push(...issues);
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of viewports)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport,isMobile:viewport.width<=820,hasTouch:viewport.width<=820});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
      const shot=async suffix=>page.screenshot({path:output+'/'+viewport.width+'-'+lang+'-settings-'+suffix+'.png',fullPage:true,animations:'disabled'});
      try{
        await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang='+lang+'&scope=settings',{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('.ta-settings-shell.is-settings').waitFor();
        await page.evaluate(()=>{document.documentElement.dataset.uiTheme='dark';document.documentElement.dataset.uiThemePreference='dark';document.documentElement.style.colorScheme='dark';});
        assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
        assert.equal(await page.locator('.ta-settings-nav [role=tab]').count(),7,'Modern Settings must expose all seven scoped sections');
        assert.equal(await page.locator('.ta-account-page').count(),0,'Company profile must not leak into Settings');
        const modalBox=await page.locator('.modal').boundingBox();
        assert.ok(modalBox&&modalBox.width<=viewport.width+1&&modalBox.height<=viewport.height+1,'Settings modal exceeds screen');

        for(const section of sections){
          const tab=page.locator('.ta-settings-nav [data-settings-tab="'+section+'"]');
          await tab.scrollIntoViewIfNeeded();
          await tab.click();
          await page.waitForTimeout(170); // Wait for TailAdmin's scoped page swap before checking section contents.
          await page.locator('.ta-settings-content .ta-settings-page').first().waitFor();
          assert.equal(await tab.getAttribute('aria-selected'),'true',section+' navigation selection lost');
          assert.equal(await tab.getAttribute('aria-current'),'page',section+' active route not marked');
          await audit(page,failures);
          if(['company','commercial','documents','security'].includes(section))await shot(section);
          if(section==='company'){
            assert.equal(await page.locator('.ta-account-page').count(),0,'Account profile must stay separate');
            assert.equal(await page.locator('.ta-settings-page input[type=file]').count(),0,'Company logo must stay in Account');
            const save=page.locator('.ta-settings-page-action .btn').first();
            assert.ok(await save.count(),'Workspace Save action missing');
            const box=await save.boundingBox();
            assert.ok(box&&box.width>=44&&box.height>=40,'Workspace Save target too small');
          }else if(section==='workspaces'){
            assert.match((await page.locator('.ta-settings-page').first().innerText()),lang==='ar'?/مساحات العمل|الشركات|الفروع/:/Workspace|Companies|Branches/i);
          }else if(section==='commercial'){
            assert.ok(await page.locator('.ta-settings-card').count()>=3,'Commercial settings cards missing');
            const text=await page.locator('.ta-settings-page').first().innerText();
            assert.match(text,lang==='ar'?/شروط الدفع/:/Payment terms/);
            assert.ok(await page.getByRole('button',{name:lang==='ar'?'إضافة بنك':'Add Bank'}).count()===1,'Bank management missing');
          }else if(section==='documents'){
            assert.equal(await page.locator('.ta-settings-page input[type=file]').count(),2,'Documents must manage signature and stamp artwork only');
            const numbering=page.locator('.ta-settings-card').filter({has:page.locator('h4')}).filter({hasText:lang==='ar'?'الترقيم':'Numbering'});
            assert.equal(await numbering.count(),1,'Document numbering section missing');
            await numbering.locator('input').first().fill('QT');
            await numbering.getByRole('button',{name:lang==='ar'?'حفظ':'Save'}).click();
            await page.waitForFunction(()=>window.savedSettings?.numbering.proformaPrefix==='QT');
            assert.equal(await numbering.locator('input').first().inputValue(),'QT','Saved numbering prefix drifted');
          }else if(section==='access'){
            assert.match((await page.locator('.ta-settings-page').first().innerText()),lang==='ar'?/الصلاحيات|الفريق/:/Team|approvals|roles/i);
          }else if(section==='data'){
            assert.match((await page.locator('.ta-settings-page').first().innerText()),lang==='ar'?/النسخ|البيانات/:/Backup|Data|activity/i);
          }else if(section==='security'){
            assert.ok(await page.locator('.ta-settings-card').count()>=3,'Security recovery cards missing');
            assert.equal(await page.locator('.ta-settings-page input[type=password]').count(),3,'Device PIN and recovery fields missing');
            assert.equal(await page.locator('.ta-account-page').count(),0,'Account profile leaked into Security');
            const restore=lang==='ar'?'استرجاع من السحابة':'Restore from Cloud';
            await page.getByRole('button',{name:restore}).first().click();
            assert.ok(await page.getByRole('button',{name:restore}).count()>=2,'Explicit restore confirmation missing');
            assert.ok(await page.locator('.modal').count()>=2,'Restore must open a separate confirmation dialog');
            await page.getByRole('button',{name:restore}).last().click();
            await page.waitForFunction(()=>window.cloudRestoreObserved?.called===true);
            assert.equal(await page.evaluate(()=>window.cloudRestoreObserved?.safe),true,'Cloud restore bypassed or lacked explicit safe confirmation');
            assert.equal(await page.getByText(/Close the open editor or dialog|أغلق.*المحرر|أغلق.*مربع/).count(),0,'Cloud restore blocked itself while Settings was open');
          }
        }
      }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
      results.push({scope:'settings',viewport,lang,failures});
      await page.close();
    }

    for(const lang of ['en','ar']){
      const viewport={width:390,height:844};
      const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
      const shot=async suffix=>page.screenshot({path:output+'/390-'+lang+'-account-'+suffix+'.png',fullPage:true,animations:'disabled'});
      try{
        await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang='+lang+'&scope=account',{waitUntil:'load'});
        await page.evaluate(()=>document.fonts.ready);
        await page.locator('.ta-settings-shell.is-account .ta-account-page').waitFor();
        await page.evaluate(()=>{document.documentElement.dataset.uiTheme='dark';document.documentElement.dataset.uiThemePreference='dark';document.documentElement.style.colorScheme='dark';});
        assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
        assert.equal(await page.locator('.ta-settings-nav').count(),0,'Account must not expose Settings navigation');
        const text=await page.locator('.ta-account-page').innerText();
        assert.match(text,lang==='ar'?/الشعار|الهوية/:/Company logo/);
        assert.equal(await page.locator('.ta-account-page input[type=file]').count(),1,'Account logo upload missing');
        assert.equal(await page.locator('.ta-account-page input[type=url]').count(),1,'Account website input missing');
        assert.equal(await page.locator('.ta-account-page input[type=email]').count(),1,'Account email input missing');
        assert.equal(await page.locator('.ta-account-access').count(),1,'Account access section missing');
        assert.equal(await page.locator('.ta-settings-nav [data-settings-tab=security]').count(),0,'Security settings leaked into Account');
        const file=page.locator('.ta-account-page input[type=file]');
        assert.match(await file.getAttribute('aria-label'),lang==='ar'?/اختيار صورة/:/Choose image/,'Logo upload is not localized');
        const geom=await file.evaluate(el=>({width:el.getBoundingClientRect().width,opacity:getComputedStyle(el).opacity}));
        assert.ok(geom.width<=2||geom.opacity==='0','Native file input exposed over custom accessible trigger');
        const name=page.locator('.ta-account-page input.input').first();
        await name.fill('LOUREX verified company');
        await page.locator('.ta-settings-page-action button').click();
        await page.waitForFunction(()=>window.savedCompany?.nameEn==='LOUREX verified company');
        await audit(page,failures);
        await shot('profile');
      }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
      results.push({scope:'account',viewport,lang,failures});
      await page.close();
    }
  }finally{await browser.close();}

  writeFileSync(output+'/report.json',JSON.stringify(results,null,2));
  const failures=results.flatMap(entry=>entry.failures.map(error=>entry.scope+'/'+entry.viewport.width+'/'+entry.lang+': '+error));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log('Obsidian/TailAdmin Settings & Account: '+results.length+' English/Arabic viewport flows passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
