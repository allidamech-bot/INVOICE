const {chromium}=require(process.cwd()+'/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../..');await fs.mkdir('visual-qa-output/brand-companion',{recursive:true});const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox']});
 try{
 for(const width of [390,1280])for(const lang of ['ar','en']){
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('http://localhost/**',async route=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpeg':'image/jpeg','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}});
 await page.goto('http://localhost/tests/visual/obsidian-dashboard.html?lang='+lang);await page.locator('.ta-brand-energy').waitFor({state:'attached'});
 await page.evaluate(lang=>{document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.documentElement.dataset.uiTheme='dark';},lang);
 const hero=page.locator('.ta-dashboard-header'),before=await hero.boundingBox();
 const state=await page.evaluate(()=>{const el=document.querySelector('.ta-brand-energy'),img=el.querySelector('img');return{pointer:getComputedStyle(el).pointerEvents,logo:img.complete&&img.naturalWidth>0,animations:el.getAnimations({subtree:true}).length,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 assert.equal(state.pointer,'none');assert.ok(state.logo);assert.ok(state.animations>=4);assert.equal(state.overflow,false);
 await page.evaluate(()=>document.querySelector('.ta-brand-energy').style.display='none');assert.deepEqual(await hero.boundingBox(),before,'decoration must not resize hero');await page.evaluate(()=>document.querySelector('.ta-brand-energy').style.display='');
 const positions=await page.locator('.ta-energy-blue').evaluate(async el=>{const a=getComputedStyle(el).transform;await new Promise(r=>setTimeout(r,450));return[a,getComputedStyle(el).transform];});assert.notEqual(...positions,'energy visibly moves');
 if(width===390&&lang==='ar')await hero.screenshot({path:'visual-qa-output/brand-companion/energy-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.ta-energy-blue').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://localhost/tests/visual/ai-conversation-workspace.html?lang='+lang);await page.locator('.lourex-ai-launcher').waitFor();
 const button=page.locator('.lourex-ai-launcher'),box=await button.boundingBox();assert.ok(box.width<=64&&box.height<=64);assert.equal(await button.locator('.lxw-robot-eyes').count(),1);
 const glyphBox=await button.locator('.lxw-brand-glyph').boundingBox();
 assert.ok(Math.abs(glyphBox.x+glyphBox.width/2-box.x-box.width/2)<.5,'robot stays horizontally centered in the button');
 assert.ok(Math.abs(glyphBox.y+glyphBox.height/2-box.y-box.height/2)<.5,'robot stays vertically centered in the button');
 await button.click();await page.locator('#lourex-ai-panel .lxw-welcome-identity .lxw-robot-eyes').waitFor();
 const mark=page.locator('#lourex-ai-panel .lourex-ai-mark .lxw-brand-glyph');assert.ok(await mark.isVisible(),'header robot visible');
 assert.ok(['none','normal'].includes(await page.locator('.lourex-ai-mark').evaluate(el=>getComputedStyle(el,'::before').content)),'no legacy logo overlay');
 assert.equal(await mark.evaluate(el=>getComputedStyle(el).display),'block');
 const gaze=page.locator('.lxw-welcome-identity .lxw-robot-gaze');assert.equal(await gaze.evaluate(el=>getComputedStyle(el).animationName),'lxw-robot-look');
 if(width===390&&lang==='ar')await page.screenshot({path:'visual-qa-output/brand-companion/robot-mobile.png'});
 await page.locator('#lourex-ai-panel').evaluate(el=>el.dataset.aiMotion='reduced');assert.equal(await gaze.evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.locator('#lourex-ai-panel').evaluate(el=>delete el.dataset.aiMotion);await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await gaze.evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(errors.length,0,errors.join('\n'));console.log(`PASS ${width}px ${lang}: fixed sizes, hero motion, three robot placements, no overlay, reduced motion`);await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
