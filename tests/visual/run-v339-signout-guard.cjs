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

  const stale=await page.evaluate(()=>{
    window.__qaCurrentUid='account-a';
    window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:'account-b',deferredByEditorGuard:true}}));
    return {calls:window.__qaTransitionCalls,complete:[...window.__qaTransitionComplete]};
  });
  if(stale.calls!==0)failures.push(`stale account transition reached application listener: ${stale.calls}`);
  if(stale.complete.length!==1||stale.complete[0]?.uid!=='account-b'||stale.complete[0]?.rejectedByRuntimeSafety!==true)failures.push(`stale transition completion mismatch: ${JSON.stringify(stale.complete)}`);

  const valid=await page.evaluate(()=>{
    window.__qaCurrentUid='account-b';
    window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:'account-b',deferredByEditorGuard:true}}));
    return {calls:window.__qaTransitionCalls,complete:[...window.__qaTransitionComplete]};
  });
  if(valid.calls!==1)failures.push(`matching account transition was blocked: ${valid.calls}`);
  if(valid.complete.length!==1)failures.push(`matching account transition unexpectedly completed by guard: ${JSON.stringify(valid.complete)}`);

  const signedOut=await page.evaluate(()=>{
    window.__qaCurrentUid='';
    window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:'account-b',deferredByEditorGuard:true}}));
    return {calls:window.__qaTransitionCalls,complete:[...window.__qaTransitionComplete]};
  });
  if(signedOut.calls!==1)failures.push(`signed-out stale transition reached application listener: ${signedOut.calls}`);
  if(signedOut.complete.length!==2||signedOut.complete[1]?.uid!=='account-b'||signedOut.complete[1]?.rejectedByRuntimeSafety!==true)failures.push(`signed-out transition completion mismatch: ${JSON.stringify(signedOut.complete)}`);

  const deferred=await page.evaluate(()=>{
    window.__qaCurrentUid='account-b';
    const editor=document.createElement('aside');
    editor.id='qa-current-product-editor';
    editor.className='ta-product-editor is-open';
    document.body.appendChild(editor);
    window.dispatchEvent(new CustomEvent('lourex-account-transition-request',{detail:{uid:'account-b'}}));
    return window.__qaTransitionCalls;
  });
  if(deferred!==1)failures.push(`matching transition escaped current product editor before dirty publication: ${deferred}`);
  await page.waitForTimeout(80);
  const stillDeferred=await page.evaluate(()=>window.__qaTransitionCalls);
  if(stillDeferred!==1)failures.push(`matching transition was released while current product editor remained open: ${stillDeferred}`);
  await page.evaluate(()=>document.getElementById('qa-current-product-editor')?.remove());
  try{
    await page.waitForFunction(()=>window.__qaTransitionCalls===2,null,{timeout:1600});
  }catch{
    const after=await page.evaluate(()=>window.__qaTransitionCalls);
    failures.push(`matching transition did not resume after current product editor closed: ${after}`);
  }

  if(runtimeErrors.length)failures.push(...runtimeErrors.map(error=>`pageerror: ${error}`));
  await browser.close();
  if(failures.length){console.error(failures.join('\n'));process.exit(1);}
  console.log('v339 WebKit runtime guards: active-editor sign-out, stale account transitions, and current-editor deferral passed.');
})().catch(error=>{console.error(error);process.exit(1);});