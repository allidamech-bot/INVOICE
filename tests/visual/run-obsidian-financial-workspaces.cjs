const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/obsidian-financial';
const viewports=[{width:1440,height:1000},{width:820,height:1180},{width:390,height:844},{width:320,height:568}];
const screens=['receivables','reports','operations'];

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const viewport of viewports)for(const lang of ['en','ar'])for(const screen of screens){
      const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});
      page.setDefaultTimeout(10000);
      const failures=[];
      page.on('pageerror',error=>failures.push('pageerror '+String(error)));
      try{
        await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-financial-workspaces.html?lang=${lang}&screen=${screen}`,{waitUntil:'load'});
        await page.evaluate(()=>document.fonts?.ready);
        const visible=`#${screen}`;
        await page.locator(visible).waitFor();
        const issues=await page.locator(visible).evaluate((root)=>{
          const problems=[];
          if(document.documentElement.scrollWidth>innerWidth+1)problems.push(`page overflow ${document.documentElement.scrollWidth}>${innerWidth}`);
          for(const el of root.querySelectorAll('*')){
            const r=el.getBoundingClientRect(),s=getComputedStyle(el);
            if(!r.width||!r.height||r.bottom<0||r.top>innerHeight||s.visibility==='hidden'||s.display==='none')continue;
            const rgb=s.backgroundColor.match(/[\d.]+/g)?.map(Number)||[];
            if(r.width*r.height>1200&&rgb.length>=3&&rgb.slice(0,3).every(v=>v>220)&&(rgb.length===3||rgb[3]>.82))problems.push(`light chrome ${el.tagName}.${el.className} ${s.backgroundColor}`);
            if(innerWidth<=430&&el.matches('input,select,textarea')&&parseFloat(s.fontSize)<16)problems.push(`small phone input ${el.className} ${s.fontSize}`);
            if(innerWidth<=430&&el.matches('button,.btn')&&(r.height<43.5||r.width<43.5))problems.push(`small phone action ${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return [...new Set(problems)];
        });
        failures.push(...issues);
        const rootBox=await page.locator(visible).boundingBox();
        assert.ok(rootBox&&rootBox.width<=viewport.width+1,'workspace exceeds viewport width');
        if(screen==='receivables'){
          assert.ok(await page.locator('.receivable-currency-card').count()>=2,'currency exposure cards missing');
          assert.ok(await page.locator('.aging-table').isVisible(),'aging table missing');
          assert.ok(await page.locator('.receivable-account-row').count()>=2,'customer account register missing');
        }else if(screen==='reports'){
          assert.ok(await page.locator('.report-currency-card').count()>=2,'report currency summaries missing');
          assert.ok(await page.locator('.reports-table').count()>=2,'report tables missing');
        }else{
          assert.equal(await page.locator('.operations-tabs button').count(),4,'operations workflow tabs missing');
          assert.ok(await page.locator('.operations-editor').isVisible(),'operations editor missing');
          assert.ok(await page.locator('.inventory-table').isVisible(),'inventory register missing');
        }
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-${screen}.png`,fullPage:true,animations:'disabled'});
      }catch(error){
        failures.push(String(error));
        await page.screenshot({path:`${output}/${viewport.width}-${lang}-${screen}-failure.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
      }
      results.push({viewport,lang,screen,failures});
      await page.close();
    }
  }finally{await browser.close()}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(r=>r.failures.map(f=>`${r.viewport.width}/${r.lang}/${r.screen}: ${f}`));
  assert.equal(failures.length,0,failures.join('\n'));
  console.log(`Obsidian financial workspaces: ${results.length} responsive/language cases passed.`);
})().catch(error=>{console.error(error);process.exitCode=1});
