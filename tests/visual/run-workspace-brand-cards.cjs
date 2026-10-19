// Focused synthetic UI check: no accounts, network AI or real business records.
const {chromium,webkit}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),output='visual-qa-output/workspace-brand-cards';
(async()=>{
 await fs.mkdir(output,{recursive:true});let cases=0;
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:chromium.executablePath()}:{})});
 try{
 for(const width of [390,1280])for(const lang of ['ar','en']){
  const context=await browser.newContext({viewport:{width,height:932}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('http://localhost/**',async route=>{
   const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
   if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
   try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpeg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  for(const [kind,fixture,selector,action] of [
   ['documents','obsidian-documents.html','.ta-documents-header','.ta-documents-create-entry'],
   ['customers','obsidian-directory.html','.ta-customers-header','.btn-primary']
  ]){
   await page.goto(`http://localhost/tests/visual/${fixture}?lang=${lang}&screen=customers`);
   await page.locator(selector).waitFor();
   await page.evaluate(lang=>{document.documentElement.dir=lang==='ar'?'rtl':'ltr';},lang);
   for(const theme of ['dark','light']){
    await page.evaluate(theme=>document.documentElement.dataset.uiTheme=theme,theme);
    const header=page.locator(selector);
    const result=await header.evaluate(el=>({image:el.querySelectorAll('img').length,pointer:getComputedStyle(el,'::before').pointerEvents,background:getComputedStyle(el).backgroundImage,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    assert.equal(result.image,0,'introductions use brand colors without logo artwork');assert.equal(result.pointer,'none');assert.match(result.background,/gradient/);assert.equal(result.overflow,false);
    if(name==='webkit'&&width===390&&lang==='ar'&&theme==='dark')await header.screenshot({path:`${output}/${kind}-mobile.png`});
    cases++;
   }
   await page.locator(selector).locator(action).first().click();
   await page.getByRole('dialog').first().waitFor();assert.ok(await page.getByRole('dialog').first().isVisible(),`${kind}: create action remains usable`);
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el,'::before').animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  }
  await page.goto(`http://localhost/tests/visual/obsidian-dashboard.html?lang=${lang}`);
  await page.evaluate(lang=>{document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.documentElement.dataset.uiTheme='dark';},lang);
  const advisor=page.locator('.lourex-advisor-card');await advisor.waitFor();
  assert.equal(await advisor.locator('.lourex-advisor-mark .lxw-robot-eyes').count(),1);
  assert.equal(await advisor.locator('.lourex-advisor-atmosphere').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  const box=await advisor.boundingBox();
  await advisor.locator('.lourex-advisor-atmosphere').evaluate(el=>el.style.display='none');assert.deepEqual(await advisor.boundingBox(),box,'portrait never changes card geometry');await advisor.locator('.lourex-advisor-atmosphere').evaluate(el=>el.style.display='');
  assert.notEqual(await advisor.locator('.lourex-advisor-portrait').evaluate(el=>getComputedStyle(el).animationName),'none');
  if(name==='webkit'&&width===390&&lang==='ar')await advisor.screenshot({path:`${output}/advisor-mobile.png`});
  await advisor.locator('input').fill('cost 18.50 margin 30');await advisor.locator('button[type=submit]').click();
  await advisor.locator('.lourex-advisor-message.assistant').waitFor();assert.match(await advisor.locator('.lourex-advisor-message.assistant').innerText(),/26[.,]43/,'local calculation still reaches the conversation');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await advisor.locator('.lourex-advisor-portrait').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(errors.length,0,errors.join('\n'));cases++;console.log(`PASS ${name} ${width}px ${lang}: graphite headers, create actions, advisor portrait/composer and reduced motion`);await context.close();
 }
 }finally{await browser.close();}
 }
 console.log(`${cases} focused workspace card cases passed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
