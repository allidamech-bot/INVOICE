const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/notification-center-batch5';

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
      await page.goto(`http://127.0.0.1:4173/tests/visual/notification-center-batch5.html?lang=${lang}`,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__batch5Ready===true);
      await page.locator('.lx-notification-summary').waitFor();
      await page.waitForFunction(()=>document.querySelector('.lx-notification-summary .lx-notification-count'));
      if(mobile){
        const more=page.locator('button[aria-controls="ta-mobile-more"]');
        await more.click();await page.locator('#ta-mobile-more').waitFor();
        const link=page.locator('#ta-mobile-more .ta-sheet-link').filter({hasText:lang==='ar'?'التنبيهات والمتابعة':'Notifications & Follow-up'});
        assert.ok(await link.count()===1,'Mobile More must contain one Notifications & Follow-up entry');
        const linkBox=await link.boundingBox();assert.ok(linkBox&&linkBox.height>=44,`Mobile notification entry must be >=44px: ${linkBox?.height}`);
        await link.click();
      }else{
        const link=page.locator('.lx-notification-topbar');
        assert.equal(await link.count(),1,'Desktop topbar must contain one Notifications & Follow-up entry');
        const linkBox=await link.boundingBox();assert.ok(linkBox&&linkBox.height>=44&&linkBox.width>=44,`Desktop notification entry must be >=44px: ${JSON.stringify(linkBox)}`);
        await link.click();
      }
      await page.locator('.lx-notification-center').waitFor();
      await page.locator('.lx-notification-item').first().waitFor();
      const geometry=await page.evaluate(()=>{
        const center=document.querySelector('.lx-notification-center');const cr=center?.getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.lx-notification-center button')].filter(node=>node.offsetParent!==null).map(node=>node.getBoundingClientRect().height);
        return{dir:center?.getAttribute('dir')||'',textAlign:center?getComputedStyle(center).textAlign:'',center:cr?{left:cr.left,right:cr.right,width:cr.width}:null,buttons,scrollWidth:document.documentElement.scrollWidth,innerWidth};
      });
      assert.equal(geometry.dir,lang==='ar'?'rtl':'ltr');
      assert.ok(geometry.center&&geometry.center.left>=-1&&geometry.center.right<=geometry.innerWidth+1,`center must stay inside viewport: ${JSON.stringify(geometry.center)}`);
      assert.ok(geometry.scrollWidth<=geometry.innerWidth+1,`page must not overflow horizontally: ${geometry.scrollWidth}/${geometry.innerWidth}`);
      assert.ok(geometry.buttons.length>=5,'notification controls must render');
      assert.ok(geometry.buttons.every(value=>value>=43.5),`visible notification buttons must be >=44px: ${geometry.buttons.join(',')}`);
      if(lang==='ar')assert.equal(geometry.textAlign,'right','Arabic notification center must align right');
      const activeCount=await page.locator('.lx-notification-item').count();assert.ok(activeCount>=5,`expected factual notification set, got ${activeCount}`);
      if(interact){
        const invoiceItem=page.locator('.lx-notification-item').filter({hasText:'INV-2026-0001'});
        assert.equal(await invoiceItem.count(),1,'Expected one overdue invoice notification for navigation QA');
        await invoiceItem.locator('button.is-primary').click();
        await page.waitForFunction(()=>window.__lastNav==='receivables');
        await page.evaluate(()=>window.dispatchEvent(new Event('lourex-notification-center-open')));
        await page.locator('.lx-notification-center').waitFor();
        // The shell is visible before the encrypted refresh finishes. Count the
        // factual rows only once they load; zero loading rows is not a baseline.
        await page.locator('.lx-notification-item').first().waitFor();
        const before=await page.locator('.lx-notification-item').count();
        assert.equal(before,activeCount,'reopening cannot remove recorded conditions before any mutation');
        const firstAgain=page.locator('.lx-notification-item').first();
        await firstAgain.getByRole('button',{name:'Snooze'}).click();
        await firstAgain.getByRole('button',{name:'Tomorrow'}).click();
        await page.waitForFunction(expected=>document.querySelectorAll('.lx-notification-item').length<expected||Boolean(document.querySelector('.lx-notification-error')?.textContent?.trim()),before);
        const uiError=(await page.locator('.lx-notification-error').count())?String(await page.locator('.lx-notification-error').innerText()).trim():'';
        assert.equal(uiError,'',`Snooze UI error: ${uiError}`);
        const after=await page.locator('.lx-notification-item').count();assert.equal(after,before-1,'Snooze must remove exactly the selected active condition');
        await page.getByRole('tab',{name:/Snoozed/}).click();await page.locator('.lx-notification-item').waitFor();
        assert.ok(await page.locator('.lx-notification-item').count()>=1,'Snoozed tab must contain persisted item');
        await page.locator('.lx-notification-item').first().getByRole('button',{name:'Done'}).click();
        await page.getByRole('tab',{name:/Done/}).click();await page.locator('.lx-notification-item').waitFor();
        assert.ok(await page.locator('.lx-notification-item').count()>=1,'Done tab must contain persisted current condition');
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
    await run('desktop-en',{lang:'en',width:1280,height:900,mobile:false});
  }finally{await browser.close();}
  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Notification Center Batch 5 browser QA: ${results.length} scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
