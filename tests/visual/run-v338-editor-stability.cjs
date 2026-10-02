const {webkit,chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');

const output='visual-qa-output/v338-editor-stability';

async function run(name,browserType,platform,maxTouchPoints){
  const browser=await browserType.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:820,height:1180},hasTouch:maxTouchPoints>0,isMobile:false});
    await context.addInitScript(({platform,maxTouchPoints})=>{
      try{Object.defineProperty(navigator,'platform',{configurable:true,get:()=>platform});}catch{}
      try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>maxTouchPoints});}catch{}
    },{platform,maxTouchPoints});
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto('http://127.0.0.1:4173/tests/visual/v338-editor-stability.html',{waitUntil:'load'});
    await page.locator('#draft-input').waitFor({state:'visible'});

    const initial=await page.evaluate(()=>({
      guard:Boolean(window.__LOUREX_EDITOR_STABILITY_V338__),
      appleMobile:Boolean(window.__LOUREX_EDITOR_STABILITY_V338__?.appleMobile),
      rootFlag:document.documentElement.dataset.lourexIosWebkit||'',
      activity:Number(window.__activityEvents||0),
      href:location.href
    }));
    if(!initial.guard)failures.push('v338 editor stability guard missing at runtime');

    const expectedApple=platform==='MacIntel'&&maxTouchPoints>1;
    if(initial.appleMobile!==expectedApple)failures.push(`appleMobile=${initial.appleMobile}, expected ${expectedApple}`);
    if(expectedApple&&initial.rootFlag!=='true')failures.push(`iPad root stability flag=${initial.rootFlag||'missing'}`);

    const input=page.locator('#draft-input');
    await input.fill('Typing on iPad must count as real activity');
    await page.waitForTimeout(50);
    const afterInput=await page.evaluate(()=>({
      activity:Number(window.__activityEvents||0),
      lastInputAt:Number(window.__LOUREX_EDITOR_STABILITY_V338__?.lastInputAt?.()||0),
      href:location.href
    }));
    if(afterInput.activity<=initial.activity)failures.push(`editor input did not reach activity channel: ${initial.activity} -> ${afterInput.activity}`);
    if(afterInput.lastInputAt<=0)failures.push('editor input timestamp was not recorded');
    if(afterInput.href!==initial.href)failures.push(`typing navigated page: ${initial.href} -> ${afterInput.href}`);

    if(expectedApple){
      const registration=await page.evaluate(async()=>{
        if(!('serviceWorker' in navigator))return {supported:false};
        try{await navigator.serviceWorker.register('./sw.js');return {supported:true,blocked:false};}
        catch(error){return {supported:true,blocked:true,name:String(error?.name||''),message:String(error?.message||'')};}
      });
      if(registration.supported&&!registration.blocked)failures.push('iPad service-worker registration was not blocked');
      if(registration.supported&&registration.blocked&&!/NotSupportedError/.test(registration.name))failures.push(`unexpected service-worker block error ${registration.name}: ${registration.message}`);
    }

    await page.waitForTimeout(2800);
    const settled=await page.evaluate(async()=>({
      href:location.href,
      registrations:'serviceWorker' in navigator?(await navigator.serviceWorker.getRegistrations()).length:0,
      editor:Boolean(document.querySelector('.editor-screen'))
    }));
    if(settled.href!==initial.href)failures.push(`runtime changed location after settle: ${initial.href} -> ${settled.href}`);
    if(!settled.editor)failures.push('editor disappeared during stability settle');
    if(expectedApple&&settled.registrations!==0)failures.push(`iPad retained ${settled.registrations} service-worker registration(s)`);

    const screenshot=`${output}/${name}.png`;
    await page.screenshot({path:screenshot,fullPage:false});
    await context.close();
    return{name,failures,initial,afterInput,settled,screenshot};
  }finally{await browser.close();}
}

async function runQuoteSaveLoop(){
  const browser=await webkit.launch({headless:true});
  try{
    const context=await browser.newContext({
      viewport:{width:390,height:844},
      hasTouch:true,
      isMobile:true,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    });
    const page=await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
    await page.goto('http://127.0.0.1:4173/tests/visual/v483-editor-save-loop.html',{waitUntil:'load'});
    await page.locator('.editor-screen').waitFor({state:'visible'});
    const initialHref=page.url();

    /* New/opened documents must not be persisted merely because the editor mounted. */
    await page.waitForTimeout(1750);
    const opened=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts||0),renderCount:Number(window.renderCount||0),editor:Boolean(document.querySelector('.editor-screen'))}));
    if(opened.saveAttempts!==0)failures.push(`editor mount wrote ${opened.saveAttempts} implicit draft save(s)`);
    if(!opened.editor)failures.push('quote editor disappeared before editing');

    const numberInput=page.locator('.editor-form-lock > .editor-section').first().locator('input').first();
    await numberInput.fill('PI-2026-0483-A');
    await page.waitForFunction(()=>Number(window.saveAttempts||0)>=1,null,{timeout:5000});
    await page.waitForTimeout(1900);
    const first=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts||0),renderCount:Number(window.renderCount||0),events:window.saveEvents,editor:Boolean(document.querySelector('.editor-screen'))}));
    if(first.saveAttempts!==1)failures.push(`one edit produced ${first.saveAttempts} saves after company-clone rerender; expected exactly 1`);
    if(!first.editor)failures.push('quote editor disappeared after first persisted edit');
    if(page.url()!==initialHref)failures.push(`quote edit changed location: ${initialHref} -> ${page.url()}`);

    await numberInput.fill('PI-2026-0483-B');
    await page.waitForFunction(()=>Number(window.saveAttempts||0)>=2,null,{timeout:5000});
    await page.waitForTimeout(1900);
    const second=await page.evaluate(()=>({saveAttempts:Number(window.saveAttempts||0),renderCount:Number(window.renderCount||0),events:window.saveEvents,editor:Boolean(document.querySelector('.editor-screen'))}));
    if(second.saveAttempts!==2)failures.push(`two deliberate edits produced ${second.saveAttempts} saves; feedback loop is still active`);
    if(second.renderCount!==3)failures.push(`unexpected parent rerender count ${second.renderCount}; expected initial + 2 persisted updates`);
    if(!second.editor)failures.push('quote editor disappeared after second persisted edit');
    if(page.url()!==initialHref)failures.push(`quote editor navigated/reloaded during save-loop test: ${initialHref} -> ${page.url()}`);

    const screenshot=`${output}/webkit-iphone-v483-save-loop.png`;
    await page.screenshot({path:screenshot,fullPage:false,animations:'disabled'});
    await context.close();
    return{name:'webkit-iphone-v483-save-loop',failures,opened,first,second,screenshot};
  }finally{await browser.close();}
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const rows=[];
  rows.push(await run('webkit-ipad-desktop-ua',webkit,'MacIntel',5));
  rows.push(await run('chromium-desktop-control',chromium,'Win32',0));
  rows.push(await runQuoteSaveLoop());
  writeFileSync(`${output}/report.json`,JSON.stringify(rows,null,2));
  const failures=rows.flatMap(row=>row.failures.map(failure=>`${row.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log('v338/v483 editor stability: iPad guard + real iPhone quote save-loop regression passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
