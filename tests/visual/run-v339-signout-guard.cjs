const {webkit}=require('playwright');

const BASE=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';

(async()=>{
  const failures=[];
  const browser=await webkit.launch({headless:true});
  const page=await browser.newPage({viewport:{width:820,height:1180}});
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(String(error?.message||error)));
  await page.goto(`${BASE}/tests/visual/v339-signout-guard.html?v=339`,{waitUntil:'networkidle'});
  const button=page.locator('#signout');
  await button.click();
  const blocked=await page.evaluate(()=>({
    calls:window.__qaSignOutCalls,
    warning:document.querySelector('[data-lourex-signout-deferred]')?.textContent||'',
    editor:document.documentElement.hasAttribute('data-lourex-document-editor')
  }));
  if(!blocked.editor)failures.push('fixture lost document editor marker before guarded click');
  if(blocked.calls!==0)failures.push(`sign-out handler executed behind editor: ${blocked.calls}`);
  if(!/Save and close the current document/i.test(blocked.warning))failures.push(`guard feedback missing: ${blocked.warning||'empty'}`);

  await page.evaluate(()=>document.documentElement.removeAttribute('data-lourex-document-editor'));
  await button.click();
  const allowed=await page.evaluate(()=>window.__qaSignOutCalls);
  if(allowed!==1)failures.push(`safe sign-out click was not released after editor closed: ${allowed}`);
  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));

  await browser.close();
  if(failures.length){console.error(failures.join('\n'));process.exit(1);}
  console.log('v339 WebKit sign-out guard: active editor blocks reload path and closed editor releases it.');
})().catch(error=>{console.error(error);process.exit(1);});