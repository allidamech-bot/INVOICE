const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/mobile-safari-chrome-v199';
const viewports=[{width:390,height:844},{width:430,height:932}];

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of viewports)for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
      page.setDefaultTimeout(12000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror: '+String(error)));
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-shell.html?lang=${lang}`,{waitUntil:'load'});
        await page.locator('.workspace-shell').waitFor();

        /* Simulate an iPhone Safari environment that reports hardware insets.
           Browser mode must deliberately ignore top/bottom raw insets because the
           browser bars already reserve them. */
        await page.evaluate(()=>{
          const root=document.documentElement;
          root.style.setProperty('--device-safe-top','47px');
          root.style.setProperty('--device-safe-bottom','34px');
          root.style.setProperty('--device-safe-left','0px');
          root.style.setProperty('--device-safe-right','0px');
          root.style.setProperty('--app-safe-top','0px');
          root.style.setProperty('--app-safe-bottom','0px');
        });
        const browserMode=await page.evaluate(()=>{
          const rect=selector=>document.querySelector(selector).getBoundingClientRect();
          const style=selector=>getComputedStyle(document.querySelector(selector));
          const top=rect('.workspace-topbar'),nav=rect('.mobile-bottom-nav');
          return {topbarHeight:top.height,navHeight:nav.height,contentPaddingBottom:parseFloat(style('.workspace-content').paddingBottom),scrollWidth:document.documentElement.scrollWidth};
        });
        if(Math.abs(browserMode.topbarHeight-58)>1)failures.push(`browser topbar double-counts safe top: ${browserMode.topbarHeight}`);
        if(Math.abs(browserMode.navHeight-66)>1)failures.push(`browser nav double-counts safe bottom: ${browserMode.navHeight}`);
        if(browserMode.scrollWidth>viewport.width+1)failures.push(`browser horizontal overflow ${browserMode.scrollWidth}`);
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-browser.png`,fullPage:false,animations:'disabled'});

        /* Resolve the same device insets as standalone PWA values. Hardware safe
           areas must expand the fixed chrome exactly once. */
        await page.evaluate(()=>{
          const root=document.documentElement;
          root.style.setProperty('--app-safe-top','47px');
          root.style.setProperty('--app-safe-bottom','34px');
        });
        const standaloneMode=await page.evaluate(()=>{
          const rect=selector=>document.querySelector(selector).getBoundingClientRect();
          const style=selector=>getComputedStyle(document.querySelector(selector));
          return {topbarHeight:rect('.workspace-topbar').height,navHeight:rect('.mobile-bottom-nav').height,contentPaddingBottom:parseFloat(style('.workspace-content').paddingBottom)};
        });
        if(Math.abs(standaloneMode.topbarHeight-browserMode.topbarHeight-47)>1)failures.push(`standalone top safe area not applied exactly once: ${JSON.stringify({browserMode,standaloneMode})}`);
        if(Math.abs(standaloneMode.navHeight-browserMode.navHeight-34)>1)failures.push(`standalone bottom safe area not applied exactly once: ${JSON.stringify({browserMode,standaloneMode})}`);
        if(Math.abs(standaloneMode.contentPaddingBottom-browserMode.contentPaddingBottom-34)>1)failures.push(`standalone content clearance mismatch: ${JSON.stringify({browserMode,standaloneMode})}`);
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-standalone-sim.png`,fullPage:false,animations:'disabled'});

        /* Reproduce the React launch state from the user's Safari screenshot. It
           must use the dynamic viewport and keep the logo/progress line compact. */
        await page.evaluate(()=>{
          const root=document.getElementById('root');
          document.documentElement.style.setProperty('--app-safe-top','0px');
          document.documentElement.style.setProperty('--app-safe-bottom','0px');
          root.innerHTML='<div class="loading-screen"><div class="brand official-brand"><span class="brand-mark"><img src="../../brand/lourex-logo.svg" alt="LOUREX"></span><span class="brand-words"><strong>LOUREX</strong></span></div><span class="loading-line"></span></div>';
        });
        await page.locator('.loading-screen').waitFor();
        // The launch brand intentionally animates for 450ms. Measure final layout,
        // not the transformed intermediate bounding box captured mid-animation.
        await page.waitForTimeout(520);
        const launch=await page.evaluate(()=>{
          const screen=document.querySelector('.loading-screen').getBoundingClientRect();
          const brand=document.querySelector('.loading-screen .brand').getBoundingClientRect();
          const line=document.querySelector('.loading-screen .loading-line').getBoundingClientRect();
          return {height:screen.height,width:screen.width,gap:line.top-brand.bottom,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
        });
        if(Math.abs(launch.height-viewport.height)>1)failures.push(`launch does not match dynamic viewport: ${JSON.stringify(launch)}`);
        if(Math.abs(launch.gap-24)>1)failures.push(`launch brand/progress gap is not compact: ${JSON.stringify(launch)}`);
        if(launch.scrollWidth>viewport.width+1)failures.push(`launch horizontal overflow ${launch.scrollWidth}`);
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-launch.png`,fullPage:false,animations:'disabled'});

        results.push({viewport,lang,browserMode,standaloneMode,launch,failures});
      }catch(error){
        failures.push(String(error));
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-failure.png`,fullPage:false}).catch(()=>{});
        results.push({viewport,lang,failures});
      }
      await page.close();
    }
  }finally{
    await browser.close();
  }
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.viewport.width}/${result.lang}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Safari chrome v199: ${results.length} browser/standalone/launch flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
