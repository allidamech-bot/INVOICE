const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-overlays';
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true}),results=[];
 try{for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568},{width:844,height:390}])for(const lang of ['en','ar'])for(const screen of ['account','confirm','empty','recovery']){
  const page=await browser.newPage({viewport});const failures=[];page.on('pageerror',e=>failures.push(String(e)));
  try{
   await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-overlays.html?lang=${lang}&screen=${screen}`,{waitUntil:'load'});
   await page.locator(screen==='recovery'?'.app-recovery':screen==='empty'?'.empty-state':'.modal').first().waitFor();
   if(screen==='account'){
    await page.locator('.account-only-actions button').click();await page.locator('.auth-error').waitFor();
    assert.equal(await page.locator('.account-only-actions button').isEnabled(),true,'failed signout must permit retry');
   }
   if(screen==='confirm'){
    const trigger=page.locator('.modal-footer button').first();await trigger.click();
    assert.equal(await page.locator('.modal').count(),2);
    const top=page.locator('.modal').last();await top.focus();await page.keyboard.press('Tab');
    assert.ok(await top.evaluate(el=>el.contains(document.activeElement)),'focus stays inside top dialog');
    await page.keyboard.press('Shift+Tab');assert.ok(await top.evaluate(el=>el.contains(document.activeElement)));
    await page.keyboard.press('Escape');assert.equal(await page.locator('.modal').count(),1);
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'focus returns to trigger');
   }
   if(screen==='empty')await page.locator('.empty-state button').click();
   const issues=await page.evaluate(()=>{
    const errors=[];if(document.documentElement.scrollWidth>innerWidth+1)errors.push('horizontal overflow');
    for(const el of document.querySelectorAll('.modal,.modal-header,.modal-body,.modal-footer,.cloud-account-identity,.account-continuity-note,.auth-error,.toast,.empty-state,.app-recovery,.app-recovery>section')){
     const r=el.getBoundingClientRect(),s=getComputedStyle(el),rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
     if(r.width&&r.height&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>225)&&(rgb.length===3||rgb[3]>.8))errors.push('light surface '+el.className);
     if(el.matches('.modal')&&(r.left<-1||r.right>innerWidth+1||r.top<-1||r.bottom>innerHeight+1))errors.push('clipped dialog');
    }return errors;
   });failures.push(...issues);
   await page.screenshot({path:`${output}/${viewport.width}-${lang}-${screen}.png`,fullPage:true,animations:'disabled'});
  }catch(e){failures.push(String(e));}
  results.push({viewport,lang,screen,failures});await page.close();
 }}finally{await browser.close();}
 writeFileSync(output+'/report.json',JSON.stringify(results,null,2));const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));assert.equal(failures.length,0,failures.join('\n'));console.log(`Obsidian overlays: ${results.length} viewport/language/state flows passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
