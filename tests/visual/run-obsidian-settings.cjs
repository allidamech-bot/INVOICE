const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-settings';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of viewports)for(const lang of ['en','ar']){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});page.setDefaultTimeout(12000);
  const failures=[];page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
  const shot=async state=>page.screenshot({path:`${output}/${viewport.width}-${lang}-${state}.png`,fullPage:true,animations:'disabled'});
  const audit=async()=>{
   const issues=await page.locator('.modal').evaluate(root=>{
    const problems=[],vw=innerWidth;
    if(document.documentElement.scrollWidth>vw+1)problems.push(`page overflow ${document.documentElement.scrollWidth}>${vw}`);
    const modal=root.getBoundingClientRect();if(modal.left<-1||modal.right>vw+1)problems.push(`modal horizontal clip ${JSON.stringify(modal.toJSON())}`);
    for(const el of root.querySelectorAll('*')){
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||s.visibility==='hidden'||s.display==='none')continue;
     const rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
     if(r.width*r.height>1200&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>225)&&(rgb.length===3||rgb[3]>.8))problems.push(`light chrome ${el.tagName}.${el.className} ${s.backgroundColor}`);
     if(vw<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push(`small phone input ${el.className} ${s.fontSize}`);
     if(vw<=430&&el.matches('.settings-tabs>button,.settings-title>.btn,.settings-account-actions .btn')&&(r.width<44||r.height<44))problems.push(`small touch target ${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return [...new Set(problems)];
   });failures.push(...issues);
  };
  try{
   await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-settings.html?lang=${lang}`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   const workspace=page.locator('.settings-workspace-v2');await workspace.waitFor();
   assert.equal(await page.locator('html').getAttribute('dir'),lang==='ar'?'rtl':'ltr');
   const modal=page.locator('.modal');const modalBox=await modal.boundingBox();assert.ok(modalBox&&modalBox.width<=viewport.width+1&&modalBox.height<=viewport.height+1,'settings modal exceeds viewport');
   const tabs=page.locator('.settings-tabs>button');assert.equal(await tabs.count(),3,'settings must expose company, commercial and documents only');
   assert.equal(await page.locator('.security-settings-page:visible').count(),0,'legacy PIN controls must remain retired');
   const states=['company','commercial','documents'];
   for(let i=0;i<states.length;i++){
    const tab=tabs.nth(i);await tab.scrollIntoViewIfNeeded();await tab.click();await page.waitForTimeout(80);
    assert.equal(await tab.getAttribute('aria-current'),'page',`${states[i]} tab did not activate`);
    await audit();await shot(states[i]);
    if(states[i]==='company'){
      const name=page.locator('.settings-section input.input').first();
      await name.fill('LOUREX verified company');
      await page.locator('.settings-title>.btn').click();
      await page.waitForFunction(()=>window.savedCompany?.nameEn==='LOUREX verified company');
      await name.fill('Unsaved draft');
      await page.locator('.modal-header .icon-btn').first().click();
      const confirm=page.locator('.modal').last();
      assert.equal(await page.locator('.modal').count(),2,'unsaved edits need confirmation');
      await confirm.locator('.modal-footer .btn').first().click();
      assert.equal(await name.inputValue(),'Unsaved draft','cancel must retain draft');
      await page.locator('.settings-title>.btn').click();
      await page.waitForFunction(()=>window.savedCompany?.nameEn==='Unsaved draft');
      const bottom=page.locator('.settings-section textarea').last();
      await bottom.scrollIntoViewIfNeeded();
      const saveReachable=await page.locator('.settings-title>.btn').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&Boolean(hit&&(hit===el||el.contains(hit)));});
      assert.ok(saveReachable,'Save must stay visible and clickable at bottom of settings');

      assert.ok(await page.locator('.settings-section input.input').count()>=8,'company identity fields missing');
      assert.ok(await page.locator('.company-artwork-section').count()===1,'company artwork section missing');
      const save=page.locator('.settings-title>.btn');await save.scrollIntoViewIfNeeded();const box=await save.boundingBox();assert.ok(box&&box.width>=44&&box.height>=40,'company save action too small');
    }else if(states[i]==='commercial'){
      await page.locator('.commercial-controls-settings').waitFor();
      assert.ok(await page.locator('.commercial-settings-section').count()>=1,'commercial settings sections missing');
    }else if(states[i]==='documents'){
      await page.locator('.settings-section input').first().fill('QT');
      await page.locator('.settings-title>.btn').click();
      await page.waitForFunction(()=>window.savedSettings?.numbering.proformaPrefix==='QT');

      assert.ok(await page.locator('.numbering-preview').count()===1,'numbering preview missing');
      assert.ok(await page.locator('.settings-title>.btn').count()===1,'document save action missing');
    }else{
      await page.locator('.settings-account-card').waitFor();
      assert.ok(await page.locator('.settings-account-actions .btn').count()>=1,'account actions missing');
    }
   }
  }catch(error){failures.push(String(error));await shot('failure').catch(()=>{});}
  results.push({viewport,lang,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log('Obsidian settings workspace: '+results.length+' language/viewport flows passed across three tabs.');
})().catch(error=>{console.error(error);process.exitCode=1;});