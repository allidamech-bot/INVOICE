const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output='visual-qa-output/v365-iphone-document-editors';
fs.mkdirSync(output,{recursive:true});
const base=process.env.LOUREX_VISUAL_BASE_URL||'http://127.0.0.1:4173';
const iphoneUa='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

async function open(browser,url){
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent:iphoneUa,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(12_000);
  const errors=[];page.on('pageerror',error=>errors.push(String(error?.message||error)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForTimeout(240);
  return{context,page,errors};
}

async function assertScrollToEnd(page,{nestedSelector,dockSelector,lastSelector,label}){
  const initialUrl=page.url();
  const before=await page.evaluate(({nestedSelector,dockSelector,lastSelector})=>{
    const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');
    const nested=document.querySelector(nestedSelector),dock=document.querySelector(dockSelector),last=document.querySelector(lastSelector);
    const style=el=>el?getComputedStyle(el):null;
    const rect=el=>{const r=el?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}:null;};
    return{mainOverflow:style(main)?.overflowY||'missing',nestedOverflow:style(nested)?.overflowY||'missing',mainClient:main?.clientHeight||0,mainScroll:main?.scrollHeight||0,mainTop:main?.scrollTop||0,dock:rect(dock),last:rect(last),viewport:innerHeight};
  },{nestedSelector,dockSelector,lastSelector});
  assert.ok(['auto','scroll'].includes(before.mainOverflow),`${label}: outer .ta-main must own vertical scroll, got ${before.mainOverflow}`);
  assert.equal(before.nestedOverflow,'visible',`${label}: nested editor must not trap scroll, got ${before.nestedOverflow}`);
  assert.ok(before.mainScroll>before.mainClient+100,`${label}: no real scroll range ${before.mainScroll}/${before.mainClient}`);
  assert.ok(before.dock&&before.dock.bottom<=before.viewport+1,`${label}: action dock is outside the iPhone viewport: ${JSON.stringify(before.dock)}`);
  await page.evaluate(()=>{const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');if(main)main.scrollTop=main.scrollHeight;});
  await page.waitForTimeout(160);
  const after=await page.evaluate(({dockSelector,lastSelector})=>{
    const main=document.querySelector('.ta-shell.screen-editor>.ta-main,.ta-shell.is-editor>.ta-main,.screen-editor .ta-main');
    const dock=document.querySelector(dockSelector),last=document.querySelector(lastSelector);
    const dr=dock?.getBoundingClientRect(),lr=last?.getBoundingClientRect();
    return{scrollTop:main?.scrollTop||0,maxScroll:main?Math.max(0,main.scrollHeight-main.clientHeight):0,dockTop:dr?.top||0,lastBottom:lr?.bottom||0,lastTop:lr?.top||0};
  },{dockSelector,lastSelector});
  assert.ok(after.scrollTop>100,`${label}: scrollTop remained stuck at ${after.scrollTop}`);
  assert.ok(after.scrollTop>=after.maxScroll-8,`${label}: cannot reach bottom ${after.scrollTop}/${after.maxScroll}`);
  assert.ok(after.lastBottom<=after.dockTop+4,`${label}: last editor content is hidden behind action dock: ${JSON.stringify(after)}`);
  assert.equal(page.url(),initialUrl,`${label}: scrolling changed URL`);
  return{before,after};
}

(async()=>{
  const browser=await webkit.launch({headless:true});
  const failures=[],results=[];
  const run=async(name,fn)=>{try{results.push({name,...await fn()});console.log(`PASS ${name}`);}catch(error){failures.push(`${name}: ${error.stack||error}`);console.error(`FAIL ${name}: ${error.message}`);}};
  try{
    for(const kind of ['proforma','invoice']){
      await run(`iPhone WebKit ${kind} editor reaches the final section`,async()=>{
        const {context,page,errors}=await open(browser,`${base}/tests/visual/obsidian-editor.html?lang=ar&kind=${kind}&v=365`);
        try{
          await page.locator('.editor-screen').waitFor();
          const metrics=await assertScrollToEnd(page,{nestedSelector:'.editor-scroll',dockSelector:'.mobile-editor-actionbar',lastSelector:'.editor-scroll .editor-section:last-of-type',label:kind});
          assert.equal(await page.locator('.mobile-editor-actionbar').isVisible(),true,`${kind}: mobile action dock hidden`);
          assert.deepEqual(errors,[],`${kind}: browser errors: ${errors.join(' | ')}`);
          await page.screenshot({path:`${output}/${kind}-webkit-iphone-bottom.png`,fullPage:false,animations:'disabled'});
          return metrics;
        }finally{await context.close();}
      });
    }

    await run('iPhone WebKit Draft reaches end and exposes all shared templates + LOI purpose',async()=>{
      const {context,page,errors}=await open(browser,`${base}/tests/visual/obsidian-draft-editor.html?lang=ar&v=365`);
      try{
        await page.locator('.draft-studio').waitFor();
        const templates=page.locator('.draft-pdf-design-section .template-card');
        assert.equal(await templates.count(),18,'Draft must expose all 18 shared visual templates');
        const loi=page.getByRole('button',{name:/خطاب نوايا/}).first();
        await loi.scrollIntoViewIfNeeded();
        await loi.click();
        await page.waitForFunction(()=>document.querySelector('.draft-studio-topbar')?.textContent?.includes('خطاب نوايا'),null,{timeout:3000});
        assert.match((await loi.getAttribute('class'))||'',/active/,'Letter of Intent purpose did not become active');
        assert.ok((await page.locator('.draft-studio-topbar').innerText()).includes('خطاب نوايا'),'Draft topbar does not reflect Letter of Intent purpose');
        const minimal=page.getByRole('button',{name:/بسيط/}).first();
        await minimal.scrollIntoViewIfNeeded();
        await minimal.click();
        await page.waitForFunction(()=>document.querySelector('.draft-pdf-design-section .template-card[aria-pressed="true"]')?.textContent?.includes('بسيط'),null,{timeout:3000});
        assert.equal(await minimal.getAttribute('aria-pressed'),'true','Minimal shared template was not selected');
        const metrics=await assertScrollToEnd(page,{nestedSelector:'.draft-studio-scroll',dockSelector:'.draft-mobile-actionbar',lastSelector:'.draft-studio-scroll .draft-control-section:last-of-type',label:'draft'});
        await page.locator('.draft-mobile-actionbar').getByRole('button',{name:'معاينة'}).click();
        const preview=page.locator('.draft-mobile-preview');await preview.waitFor();
        const draftPage=preview.locator('.draft-letter-page').first();
        assert.match(await draftPage.getAttribute('class'),/template-minimal/,'Draft preview does not inherit selected shared template');
        assert.ok((await draftPage.innerText()).includes('خطاب نوايا'),'Draft preview lost Letter of Intent semantic title');
        assert.ok(!(await draftPage.innerText()).includes('عرض سعر'),'Draft preview incorrectly uses quotation semantics');
        await page.screenshot({path:`${output}/draft-loi-minimal-webkit-iphone.png`,fullPage:false,animations:'disabled'});
        assert.deepEqual(errors,[],`Draft browser errors: ${errors.join(' | ')}`);
        return metrics;
      }finally{await context.close();}
    });
  }finally{await browser.close();}
  fs.writeFileSync(`${output}/report.json`,JSON.stringify({results,failures},null,2));
  if(failures.length){console.error(failures.join('\n\n'));process.exit(1);}
  console.log(`v365 iPhone WebKit editors: ${results.length} live editor scenarios passed.`);
})().catch(error=>{console.error(error);process.exit(1);});
