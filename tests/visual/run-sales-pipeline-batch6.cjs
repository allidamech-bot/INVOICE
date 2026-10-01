const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/sales-pipeline-batch6';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,{lang='en',width=390,height=844,mobile=true,interact=false}={})=>{
    const failures=[];let page;
    try{
      page=await browser.newPage({viewport:{width,height},hasTouch:mobile,isMobile:mobile});
      page.setDefaultTimeout(15000);
      const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:4173/tests/visual/sales-pipeline-batch6.html?lang=${lang}`,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__batch6Ready===true);
      await page.locator('.lx-pipeline-page').waitFor();
      await page.locator('.lx-pipeline-board').waitFor();
      const geometry=await page.evaluate(()=>{
        const root=document.querySelector('.lx-pipeline-page');const rr=root?.getBoundingClientRect();
        const tabs=[...document.querySelectorAll('.lx-pipeline-tabs button')].map(node=>node.getBoundingClientRect().height);
        const primary=document.querySelector('.lx-pipeline-topbar .btn');const pb=primary?.getBoundingClientRect();
        const columns=[...document.querySelectorAll('.lx-pipeline-column')].map(node=>node.getBoundingClientRect());
        return{dir:root?.getAttribute('dir')||'',align:root?getComputedStyle(root).textAlign:'',root:rr?{left:rr.left,right:rr.right,width:rr.width}:null,tabs,primary:pb?{height:pb.height,width:pb.width}:null,columns:columns.map(r=>({left:r.left,right:r.right,width:r.width})),scrollWidth:document.documentElement.scrollWidth,innerWidth};
      });
      assert.equal(geometry.dir,lang==='ar'?'rtl':'ltr');
      assert.ok(geometry.root&&geometry.root.left>=-1&&geometry.root.right<=geometry.innerWidth+1,`pipeline root must stay in viewport: ${JSON.stringify(geometry.root)}`);
      assert.ok(geometry.scrollWidth<=geometry.innerWidth+1,`page must not overflow horizontally: ${geometry.scrollWidth}/${geometry.innerWidth}`);
      assert.ok(geometry.tabs.length===2&&geometry.tabs.every(value=>value>=43.5),`tabs must be >=44px: ${geometry.tabs.join(',')}`);
      assert.ok(geometry.primary&&geometry.primary.height>=43.5,`New Opportunity must be >=44px: ${JSON.stringify(geometry.primary)}`);
      if(mobile)assert.ok(geometry.columns.every(column=>column.left>=-1&&column.right<=geometry.innerWidth+1),`mobile columns must stack inside viewport: ${JSON.stringify(geometry.columns)}`);
      if(lang==='ar')assert.equal(geometry.align,'right','Arabic Pipeline must align right');

      const directory=page.getByRole('tab',{name:lang==='ar'?'الدليل':'Directory'});assert.equal(await directory.count(),1,'Directory tab must be available');
      await directory.click();await page.waitForFunction(()=>window.__directoryRequested===true);

      if(interact){
        await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__batch6Ready===true);await page.locator('.lx-pipeline-page').waitFor();
        await page.getByRole('button',{name:'New Opportunity'}).click();await page.locator('.lx-opportunity-form').waitFor();
        const inputs=page.locator('.lx-opportunity-grid input');
        assert.ok(await inputs.count()>=5,'Opportunity editor inputs must render');
        await inputs.nth(0).fill('Jeddah retail launch');
        await inputs.nth(1).fill('1250.50');
        await inputs.nth(2).fill('USD');
        await inputs.nth(3).fill('2026-10-20');
        await inputs.nth(4).fill('Call buyer Thursday');
        const checks=page.locator('.lx-opportunity-documents input[type="checkbox"]');assert.ok(await checks.count()>=1,'Customer document must be linkable');await checks.first().check();
        await page.getByRole('button',{name:'Save Opportunity'}).click();await page.locator('.lx-opportunity-card').waitFor();
        assert.equal(await page.locator('.lx-opportunity-card').count(),1,'Saved opportunity must appear exactly once');
        assert.equal(await page.evaluate(()=>window.__batch6MutationCount),1,'Save must use one canonical vault mutation');
        await page.locator('.lx-opportunity-card').click();await page.locator('.lx-opportunity-form').waitFor();
        const selects=page.locator('.lx-opportunity-grid select');assert.ok(await selects.count()>=2,'Customer and Stage selectors must render');await selects.nth(1).selectOption('won');
        await page.getByRole('button',{name:'Save Opportunity'}).click();await page.waitForFunction(()=>document.querySelectorAll('.lx-opportunity-card').length===1);
        const summary=page.locator('.lx-pipeline-summary .lx-pipeline-stat');assert.equal(String(await summary.nth(1).locator('strong').innerText()).trim(),'1','Won summary must update deterministically');
        assert.equal(await page.evaluate(()=>window.__batch6MutationCount),2,'Stage update must use one additional canonical vault mutation');
        await page.locator('.lx-opportunity-card').click();await page.locator('.lx-opportunity-form').waitFor();
        const deleteButton=page.getByRole('button',{name:'Delete'});assert.equal(await deleteButton.count(),1,'Existing opportunity must expose one visible Delete action');
        const deleteBox=await deleteButton.boundingBox();assert.ok(deleteBox&&deleteBox.height>=43.5,'Delete action must remain touch-safe');
      }
      assert.deepEqual(pageErrors,[],`browser page errors: ${pageErrors.join(' | ')}`);
      await page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
    }catch(error){failures.push(error?.stack||String(error));}
    finally{if(page)await page.close();}
    results.push({name,failures});
  };
  try{
    await run('mobile-en',{lang:'en',interact:true});
    await run('mobile-ar',{lang:'ar'});
    await run('desktop-en',{lang:'en',width:1365,height:900,mobile:false});
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Sales Pipeline Batch 6 browser QA: ${results.length} scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
