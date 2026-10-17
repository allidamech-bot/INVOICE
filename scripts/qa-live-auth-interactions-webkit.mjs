// Real production signed-out authentication UX contract.
// Read-only browser navigation; never create/sign in to an account or submit
// valid credentials, send a password reset, launch Google OAuth or write to Firebase.
import assert from 'node:assert/strict';
import {webkit} from 'playwright';

const ORIGIN='https://invoice-three-puce.vercel.app/';
const targets=[{name:'iPhone 390',width:390,height:844},{name:'iPad 820',width:820,height:1180}];
const results=[];
const browser=await webkit.launch({headless:true});
let failures=0;
try{
  for(const t of targets){
    const context=await browser.newContext({viewport:{width:t.width,height:t.height},hasTouch:true,isMobile:t.width<600,serviceWorkers:'block'});
    const page=await context.newPage();
    const forbidden=[];
    // Fail closed if the UX accidentally reaches any remote mutation.
    await page.route('**/*', async route=>{
      const method=route.request().method().toUpperCase();
      if(['POST','PUT','PATCH','DELETE'].includes(method)){
        forbidden.push({method,path:new URL(route.request().url()).pathname.slice(0,100)});
        await route.abort('blockedbyclient');
      }else await route.continue();
    });
    try {
      const response=await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(response?.status(),200,'production root must be accessible');
      await page.locator('.ta-auth-page.is-signin').waitFor({state:'visible',timeout:25000});
      const tabs=page.locator('.ta-auth-tabs [role="tab"]');
      assert.equal(await tabs.count(),2);
      assert.equal(await page.locator('#account-tab-signin').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('.ta-auth-fields input[type=password]').count(),1);
      const steps=['opened signed-out login'];
      await page.locator('#account-tab-create').click();
      await page.locator('.ta-auth-page.is-create').waitFor({state:'visible'});
      assert.equal(await page.locator('#account-tab-create').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('.ta-auth-fields input[type=password]').count(),2);
      steps.push('create tab exposes confirmation field');
      // Invalid, locally handled input only. This must NOT call Firebase Auth.
      const email=page.locator('.ta-auth-fields input[type=email]');
      const passwords=page.locator('.ta-auth-fields input[type=password]');
      await email.fill('contract-only@example.invalid');
      await passwords.nth(0).fill('ExamplePassphrase123!A');
      await passwords.nth(1).fill('DifferentPassphrase123!B');
      await page.locator('.ta-auth-primary').click();
      await page.locator('.ta-auth-feedback.is-error[role=alert]').waitFor({state:'visible',timeout:5000});
      steps.push('mismatched confirmation rejected locally');
      await page.locator('#account-tab-signin').click();
      await page.locator('.ta-auth-page.is-signin').waitFor({state:'visible'});
      assert.equal(await page.locator('.ta-auth-fields input[type=password]').count(),1);
      assert.equal(await page.locator('.ta-auth-fields input[type=password]').inputValue(),'');
      assert.equal(await page.locator('.ta-auth-feedback.is-error').count(),0);
      steps.push('return to sign in clears password and error');
      // Accessible keyboard navigation between tabs.
      await page.locator('#account-tab-signin').focus();
      await page.keyboard.press('ArrowRight');
      await page.locator('.ta-auth-page.is-create').waitFor({state:'visible'});
      await page.keyboard.press('Home');
      await page.locator('.ta-auth-page.is-signin').waitFor({state:'visible'});
      steps.push('keyboard Arrow/Home navigation');
      // User-visible bilingual toggle without forcing any sign-in.
      await page.locator('.ta-auth-language').click();
      await page.getByRole('tab',{name:'تسجيل الدخول'}).waitFor({state:'visible',timeout:10000});
      assert.equal(await page.locator('#account-tab-signin').getAttribute('aria-selected'),'true');
      steps.push('Arabic locale switch');
      await page.locator('.ta-auth-language').click();
      await page.getByRole('tab',{name:'Sign In'}).waitFor({state:'visible',timeout:10000});
      steps.push('English locale switch');
      const theme=page.locator('.mf-theme-toggle');
      await theme.waitFor({state:'visible'});
      const before=await page.locator('html').getAttribute('data-ui-theme');
      await theme.click();
      await page.waitForFunction(previous=>document.documentElement.getAttribute('data-ui-theme')!==previous,before,{timeout:5000});
      steps.push('theme switch');
      assert.equal(forbidden.length,0,'No remote writes/auth actions should occur');
      results.push({profile:t.name,state:'PASS',steps,noRemoteWrite:true});
    }catch(error){
      failures++;
      results.push({profile:t.name,state:'FAIL',message:String(error?.message||error).slice(0,1200),blockedWrites:forbidden});
    }finally{await context.close();}
  }
}finally{await browser.close();}
console.log(JSON.stringify({type:'LOUREX_PRODUCTION_SIGNED_OUT_AUTH_INTERACTIONS',scope:'WebKit public login UX only, no production mutations or authenticated sessions',results},null,2));
if(failures){console.error('FAIL: signed-out UI acceptance needs investigation; not evidence of authenticated app failure.');process.exitCode=1;}
else console.log('PASS: public production login/create/validation/keyboard/language/theme behavior on iPhone+iPad WebKit.');
