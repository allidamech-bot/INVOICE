const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});mkdirSync('visual-qa-output/notification-recovery-batch3',{recursive:true});
 try{
  for(const [width,lang,theme] of [[320,'ar','dark'],[390,'en','light']]){
   const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:4173/tests/visual/notification-center-batch5.html?lang=${lang}`,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.__batch5Ready);await page.evaluate(async theme=>{document.documentElement.dataset.uiTheme=theme;await window.lockNotificationQa();window.dispatchEvent(new Event('lourex-notification-center-open'));},theme);
   const error=page.locator('.lx-notification-error');await error.waitFor();assert.match(await error.innerText(),/Unlock the encrypted vault|افتح الخزنة المشفرة/);
   assert.match(await page.locator('.lx-notification-summary strong').innerText(),/Notifications unavailable|التنبيهات غير متاحة/,'dashboard must not imply zero follow-ups when the vault is unreadable');
   assert.equal(await page.locator('.lx-notification-empty').count(),0,'unread locked vault cannot be shown as healthy empty data');
   for(const tab of await page.getByRole('tab').all()){
    await tab.click();assert.equal(await page.locator('.lx-notification-empty').count(),0,'switching tabs cannot erase an unread-vault error');assert.match(await error.innerText(),/Unlock the encrypted vault|افتح الخزنة المشفرة/);
   }
   await page.getByRole('tab',{name:lang==='ar'?/^نشط ·/:/^Active ·/}).click();
   await page.evaluate(()=>window.unlockNotificationQa());
   const retry=error.getByRole('button',{name:lang==='ar'?'إعادة المحاولة':'Try again',exact:true});assert.ok((await retry.boundingBox()).height>=44);await retry.click();
   await page.locator('.lx-notification-item').first().waitFor();assert.equal(await error.count(),0);assert.equal(await page.evaluate(()=>window.__batch5MutationCount),0,'read retry never mutates financial or notification history');
   await page.getByRole('tab',{name:lang==='ar'?/^تم ·/:/^Done ·/}).click();
   const back=page.locator('.lx-notification-empty').getByRole('button',{name:lang==='ar'?'العودة إلى مساحة العمل':'Return to workspace',exact:true});await back.scrollIntoViewIfNeeded();assert.ok((await back.boundingBox()).height>=44);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`visual-qa-output/notification-recovery-batch3/${width}-${lang}-${theme}.png`,animations:'disabled'});
   await back.click();await page.locator('.lx-notification-center').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
 console.log('Notification locked-vault/retry/healthy-empty close: Arabic + English PASS.');
})().catch(e=>{console.error(e);process.exitCode=1;});
