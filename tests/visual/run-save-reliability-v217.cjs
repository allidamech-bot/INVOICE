const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');

const output='visual-qa-output/save-reliability-v217';
const base='http://127.0.0.1:4173/tests/visual';

const activateCurrentDarkTheme=page=>page.evaluate(()=>{
  document.documentElement.dataset.uiTheme='dark';
  document.documentElement.dataset.uiThemePreference='dark';
  document.documentElement.style.colorScheme='dark';
});

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of [{width:390,height:844},{width:430,height:932}])for(const lang of ['en','ar']){
      const size=`${viewport.width}x${viewport.height}`;
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`${base}/obsidian-shell.html?conflict=1&lang=${lang}`,{waitUntil:'load'});
        await activateCurrentDarkTheme(page);
        const banner=page.locator('.cloud-conflict-banner');
        await banner.waitFor();
        const palette=await page.evaluate(()=>({
          gradient:getComputedStyle(document.querySelector('.cloud-conflict-banner')).backgroundImage,
          icon:getComputedStyle(document.querySelector('.cloud-conflict-icon')).backgroundColor,
          text:getComputedStyle(document.querySelector('.cloud-conflict-banner')).color,
          appText:getComputedStyle(document.querySelector('.app-ui')).color
        }));
        assert.equal(palette.gradient,'none','conflict banner must stay flat without a decorative gradient');
        assert.notEqual(palette.icon,'rgba(0, 0, 0, 0)','conflict icon must stay on the semantic danger surface');
        assert.equal(palette.text,palette.appText,'conflict copy must follow the active application theme contrast');
        assert.notEqual(palette.text,'rgb(0, 0, 0)','dark-theme conflict copy must never regress to black text');
        const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,banner:document.querySelector('.cloud-conflict-banner')?.getBoundingClientRect().toJSON()}));
        assert.ok(geometry.scrollWidth<=geometry.width+1,`conflict shell overflow: ${JSON.stringify(geometry)}`);
        await banner.locator('button').click();
        assert.equal(await page.evaluate(()=>window.shellQa.account),1,'conflict action must open account recovery');
        await page.screenshot({path:`${output}/banner-${size}-${lang}.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:`banner-${size}-${lang}`,failures});
      await page.close();
    }

    for(const viewport of [{width:390,height:844},{width:430,height:932}])for(const lang of ['en','ar']){
      const size=`${viewport.width}x${viewport.height}`;
      const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
      const failures=[];
      page.on('pageerror',error=>failures.push(`pageerror: ${String(error)}`));
      try{
        await page.goto(`${base}/functional-account-v200.html?user=1&conflict=1&lang=${lang}`,{waitUntil:'load'});
        await activateCurrentDarkTheme(page);
        const recovery=page.locator('.cloud-conflict-recovery');
        await recovery.waitFor();
        assert.equal(await recovery.evaluate(el=>getComputedStyle(el).backgroundImage),'none','conflict recovery must stay flat without a decorative gradient');
        const recoveryPalette=await page.evaluate(()=>({
          text:getComputedStyle(document.querySelector('.cloud-conflict-recovery')).color,
          appText:getComputedStyle(document.querySelector('.app-ui')).color
        }));
        assert.equal(recoveryPalette.text,recoveryPalette.appText,'conflict recovery must follow the active application theme contrast');
        assert.notEqual(recoveryPalette.text,'rgb(0, 0, 0)','dark-theme conflict recovery must never regress to black text');
        const actions=page.locator('.cloud-conflict-actions button');
        assert.equal(await actions.count(),2,'both explicit conflict choices must be visible');
        await actions.first().click();
        await page.locator('.cloud-conflict-confirm').waitFor();
        assert.equal(await page.evaluate(()=>window.accountQa.keepLocalCalls),0,'choice must not execute before confirmation');
        await page.locator('.cloud-conflict-confirm button').first().click();
        await actions.last().click();
        await page.locator('.cloud-conflict-confirm').waitFor();
        const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,modal:document.querySelector('.modal')?.getBoundingClientRect().toJSON()}));
        assert.ok(geometry.scrollWidth<=geometry.width+1,`conflict modal overflow: ${JSON.stringify(geometry)}`);
        await page.screenshot({path:`${output}/recovery-${size}-${lang}.png`,fullPage:false,animations:'disabled'});
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:`recovery-${size}-${lang}`,failures});
      await page.close();
    }

    {
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const failures=[];
      try{
        await page.goto(`${base}/functional-account-v200.html?user=1&conflict=1&blocked=1`,{waitUntil:'load'});
        await activateCurrentDarkTheme(page);
        await page.locator('.cloud-conflict-recovery').waitFor();
        assert.equal(await page.locator('.cloud-conflict-actions').count(),0,'destructive choices must stay hidden while an editor or Settings blocks replacement');
        assert.match(await page.locator('.cloud-conflict-recovery').innerText(),/Close the open document or Settings first/);
      }catch(error){failures.push(error?.stack||String(error));}
      results.push({flow:'blocked-recovery',failures});
      await page.close();
    }
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.flow}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Save reliability v217: ${results.length} browser flows passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
