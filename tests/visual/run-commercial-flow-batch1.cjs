const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/commercial-flow-batch1';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const open=async(lang)=>{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    page.setDefaultTimeout(12000);
    await page.goto(`http://127.0.0.1:4173/tests/visual/commercial-flow-batch1.html?lang=${lang}`,{waitUntil:'load'});
    await page.locator('.ta-doc-row-open').first().waitFor();
    await page.locator('.ta-doc-row-open').first().click();
    await page.locator('.lx-commercial-flow').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    return page;
  };
  const run=async(name,fn)=>{
    const failures=[];
    try{await fn(failures);}catch(error){failures.push(error?.stack||String(error));}
    results.push({name,failures});
  };
  const assertMobileGeometry=async page=>{
    const geometry=await page.locator('.lx-commercial-flow').evaluate(panel=>{
      const rect=panel.getBoundingClientRect();
      const buttons=Array.from(panel.querySelectorAll('.lx-commercial-actions .btn')).map(button=>button.getBoundingClientRect().height);
      const input=panel.querySelector('.lx-commercial-followup input');
      return {left:rect.left,right:rect.right,width:innerWidth,buttonHeights:buttons,inputHeight:input?.getBoundingClientRect().height||0,inputFont:input?parseFloat(getComputedStyle(input).fontSize):0,textAlign:getComputedStyle(panel).textAlign,dir:document.documentElement.dir};
    });
    assert.ok(geometry.left>=-1&&geometry.right<=geometry.width+1,`commercial panel must stay within viewport: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.buttonHeights.length>=3,'commercial actions must expose sent/accepted/rejected controls');
    assert.ok(geometry.buttonHeights.every(height=>height>=44),`commercial action targets must be >=44px: ${geometry.buttonHeights.join(',')}`);
    assert.ok(geometry.inputHeight>=44,`follow-up date target must be >=44px, got ${geometry.inputHeight}`);
    assert.ok(geometry.inputFont>=16,`follow-up date input must be >=16px on iOS, got ${geometry.inputFont}`);
    return geometry;
  };

  try{
    await run('mobile-en-sent-followup-accepted',async()=>{
      const page=await open('en');
      try{
        const geometry=await assertMobileGeometry(page);
        assert.equal(geometry.dir,'ltr');
        await page.getByRole('button',{name:'Mark Sent'}).click();
        await page.waitForFunction(()=>window.__batch1Vault.documentEvents.some(event=>event.note.startsWith('@lourex:commercial:v1:sent')));
        await page.locator('.lx-commercial-status.status-sent').first().waitFor();

        const date=page.locator('.lx-commercial-followup input[type="date"]');
        await date.fill('2099-12-30');
        await page.getByRole('button',{name:'Schedule'}).click();
        await page.waitForFunction(()=>window.__batch1Vault.documentEvents.some(event=>event.note.includes('@lourex:commercial:v1:followup-scheduled\n2099-12-30')));
        await page.getByRole('button',{name:'Complete follow-up'}).click();
        await page.waitForFunction(()=>window.__batch1Vault.documentEvents.some(event=>event.note.startsWith('@lourex:commercial:v1:followup-completed')));

        await page.getByRole('button',{name:'Mark Accepted'}).click();
        await page.waitForFunction(()=>window.__batch1Vault.documentEvents.some(event=>event.note.startsWith('@lourex:commercial:v1:accepted')));
        await page.locator('.lx-commercial-status.status-accepted').first().waitFor();
        const state=await page.evaluate(()=>({status:window.__batch1Vault.documents[0].status,lifecycle:window.__batch1Vault.documents[0].lifecycleStatus,mutations:window.__batch1MutationCount,events:window.__batch1Vault.documentEvents.length}));
        assert.equal(state.status,'final','commercial tracking must not change DocumentStatus');
        assert.equal(state.lifecycle,'active','commercial tracking must not change lifecycleStatus');
        assert.equal(state.mutations,4,'sent, schedule, complete and accepted must each persist once');
        assert.equal(state.events,4);
        await page.screenshot({path:`${output}/mobile-en-accepted.png`,fullPage:true,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('mobile-ar-rejected-rtl',async()=>{
      const page=await open('ar');
      try{
        const geometry=await assertMobileGeometry(page);
        assert.equal(geometry.dir,'rtl');
        assert.equal(geometry.textAlign,'right','commercial panel must align Arabic content to the right');
        await page.getByRole('button',{name:'تسجيل الرفض'}).click();
        const modal=page.locator('.modal-backdrop');await modal.waitFor();
        await modal.locator('textarea').fill('السعر مرتفع');
        await page.getByRole('button',{name:'تأكيد الرفض'}).click();
        await page.waitForFunction(()=>window.__batch1Vault.documentEvents.some(event=>event.note.includes('@lourex:commercial:v1:rejected\nالسعر مرتفع')));
        await page.locator('.lx-commercial-status.status-rejected').first().waitFor();
        await page.locator('.lx-commercial-rejection').getByText('السعر مرتفع',{exact:true}).waitFor();
        const state=await page.evaluate(()=>({status:window.__batch1Vault.documents[0].status,lifecycle:window.__batch1Vault.documents[0].lifecycleStatus,mutations:window.__batch1MutationCount,events:window.__batch1Vault.documentEvents.length}));
        assert.equal(state.status,'final');assert.equal(state.lifecycle,'active');assert.equal(state.mutations,1);assert.equal(state.events,1);
        await page.screenshot({path:`${output}/mobile-ar-rejected.png`,fullPage:true,animations:'disabled'});
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Commercial Flow Batch 1 browser QA: ${results.length} mobile scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});