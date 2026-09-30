const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/ai-assistant-help-batch3';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,{lang='en',width=390,height=844,reducedMotion='no-preference'}={})=>{
    const failures=[];let context,page;
    try{
      context=await browser.newContext({viewport:{width,height},hasTouch:width<=860,isMobile:width<=860,reducedMotion});
      page=await context.newPage();
      page.setDefaultTimeout(12000);
      await page.goto(`http://127.0.0.1:4173/tests/visual/ai-assistant-help-batch3.html?lang=${lang}`,{waitUntil:'load'});
      await page.locator('.lourex-ai-launcher').waitFor();
      await page.locator('.lx-usage-guide').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      if(width<=860&&reducedMotion!=='reduce')await page.waitForTimeout(1600);
      const geometry=await page.evaluate(()=>{
        const launcher=document.querySelector('.lourex-ai-launcher');
        const launcherRect=launcher.getBoundingClientRect();
        const coach=getComputedStyle(launcher,'::after');
        const pulse=getComputedStyle(launcher,'::before');
        const guide=document.querySelector('.lx-usage-guide-grid');
        const cards=[...document.querySelectorAll('.lx-usage-guide-card')];
        return{
          innerWidth,
          scrollWidth:document.documentElement.scrollWidth,
          dir:document.documentElement.dir,
          launcher:{width:launcherRect.width,height:launcherRect.height,left:launcherRect.left,right:launcherRect.right},
          coach:{content:coach.content,display:coach.display,opacity:Number.parseFloat(coach.opacity||'0'),animationName:coach.animationName},
          pulse:{display:pulse.display,animationName:pulse.animationName},
          guideColumns:getComputedStyle(guide).gridTemplateColumns,
          cardCount:cards.length,
          cardWidths:cards.map(card=>card.getBoundingClientRect().width),
          robot:Boolean(launcher.querySelector('.icon,svg'))
        };
      });
      assert.ok(geometry.robot,'AI launcher must render a recognizable robot icon');
      assert.ok(geometry.launcher.width>=44&&geometry.launcher.height>=44,`AI launcher touch target must be >=44px: ${JSON.stringify(geometry.launcher)}`);
      assert.ok(geometry.launcher.left>=-1&&geometry.launcher.right<=geometry.innerWidth+1,'AI launcher must stay inside viewport');
      assert.ok(geometry.scrollWidth<=geometry.innerWidth+1,`page must not create horizontal overflow: ${geometry.scrollWidth}/${geometry.innerWidth}`);
      assert.ok(geometry.cardCount>=9,`usage guide should cover the core workflows: ${geometry.cardCount}`);
      assert.ok(geometry.cardWidths.every(value=>value<=geometry.innerWidth+1),'usage guide cards must stay inside viewport');
      assert.equal(geometry.dir,lang==='ar'?'rtl':'ltr');
      if(width<=860&&reducedMotion!=='reduce'){
        const expected=lang==='ar'?'مساعدك الشخصي في LOUREX':'Your personal assistant in LOUREX';
        assert.ok(geometry.coach.content.includes(expected),`mobile coachmark must identify AI assistant: ${geometry.coach.content}`);
        assert.notEqual(geometry.coach.display,'none','mobile coachmark must render during discoverability window');
        assert.ok(geometry.coach.opacity>0,'mobile coachmark must become visible');
        assert.match(geometry.coach.animationName,/lourexAiCoachmark/);
        assert.ok(!geometry.guideColumns.includes(' '),'mobile usage guide must use one column');
      }
      if(width>860){
        assert.ok(geometry.coach.content==='none'||geometry.coach.display==='none','desktop must not receive the mobile coachmark');
      }
      if(reducedMotion==='reduce'){
        assert.equal(geometry.coach.display,'none','coachmark animation must be disabled for reduced motion');
        assert.equal(geometry.pulse.display,'none','attention pulse must be disabled for reduced motion');
      }
      await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
    }catch(error){failures.push(error?.stack||String(error));}
    finally{if(context)await context.close();}
    results.push({name,failures});
  };
  try{
    await run('mobile-en',{lang:'en'});
    await run('mobile-ar',{lang:'ar'});
    await run('desktop-en',{lang:'en',width:1280,height:900});
    await run('mobile-reduced-motion',{lang:'en',reducedMotion:'reduce'});
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`AI Assistant + Help Batch 3 browser QA: ${results.length} scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
