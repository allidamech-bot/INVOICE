const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/functional-document-workflow';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const open=async(query,viewport={width:390,height:844})=>{
    const page=await browser.newPage({viewport,hasTouch:viewport.width<=820,isMobile:viewport.width<=820});
    page.setDefaultTimeout(12000);
    await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-editor.html?${query}`,{waitUntil:'load'});
    await page.locator('.editor-screen').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    return page;
  };
  const snap=async(page,name)=>page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
  const state=page=>page.evaluate(()=>({events:window.eventLog,lastSaved:window.lastSaved,lastOutput:window.lastOutput,outputAttempts:window.outputAttempts,saveAttempts:window.saveAttempts,preparedModes:window.preparedModes,convertCount:window.convertCount,closeCount:window.closeCount}));
  const run=async(name,fn)=>{
    const failures=[];
    try{await fn(failures);}catch(error){failures.push(error?.stack||String(error));}
    results.push({name,failures});
  };

  try{
    for(const lang of ['en','ar'])await run(`draft-invoice-pdf-${lang}`,async()=>{
      const page=await open(`lang=${lang}&kind=invoice`);
      try{
        const quantity=page.locator('.item-pricing-grid input').first();
        await quantity.fill('5');
        await page.waitForFunction(()=>window.lastSaved?.items?.[0]?.quantity==='5');
        const before=await state(page);
        const pdf=page.locator('.mobile-action-buttons button').filter({hasText:'PDF'}).first();
        await pdf.click();
        await page.locator('.issue-review').waitFor();
        const reviewSurfaces=await page.evaluate(()=>{
          const background=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;
          return {
            modal:background('.modal:has(.issue-review)>.modal-body'),
            purpose:background('.issue-review-purpose'),
            identity:background('.issue-review-grid>div'),
            total:background('.issue-total-check'),
            asset:background('.issue-asset-checks>span')
          };
        });
        assert.deepEqual(reviewSurfaces,{
          modal:'rgb(13, 24, 30)',
          purpose:'rgb(16, 29, 36)',
          identity:'rgb(16, 29, 36)',
          total:'rgb(24, 34, 49)',
          asset:'rgb(12, 23, 28)'
        },'final review must use the Obsidian surface hierarchy');
        await snap(page,`review-before-issue-${lang}`);
        assert.equal((await state(page)).lastOutput,undefined,'draft PDF must not output before confirmation');
        await page.locator('.modal-footer-actions .btn-primary').click();
        await page.waitForFunction(()=>window.lastSaved?.status==='final'&&window.lastOutput==='pdf');
        const after=await state(page);
        const finalSave=after.events.findIndex(event=>event.type==='save-done'&&event.status==='final');
        const outputStart=after.events.findIndex(event=>event.type==='output-start'&&event.mode==='pdf');
        assert.ok(finalSave>=0&&outputStart>finalSave,'PDF output must start only after the final snapshot is saved');
        assert.ok(after.preparedModes.includes('pdf'),'PDF mode must arm the output bridge');
        assert.equal(await page.locator('.editor-form-lock').evaluate(el=>el.disabled),true,'issued document must become read-only');
        const saveCount=after.saveAttempts;
        const share=page.locator('.mobile-action-buttons button').filter({hasText:lang==='ar'?'مشاركة':'Share'}).first();
        await share.click();
        await page.waitForFunction(()=>window.lastOutput==='share'&&window.outputAttempts>=2);
        assert.equal((await state(page)).saveAttempts,saveCount,'sharing an already-final document must not save/finalize it again');
        assert.ok((await state(page)).preparedModes.includes('share'),'Share mode must arm the output bridge');
        assert.ok(before.saveAttempts>=1,'autosave must persist edited quantity');
        await snap(page,`draft-invoice-pdf-${lang}`);
      }finally{await page.close();}
    });

    await run('issue-only-proforma',async()=>{
      const page=await open('lang=en&kind=proforma');
      try{
        const issue=page.locator('.mobile-action-buttons button').filter({hasText:'Issue'}).first();
        await issue.click();
        await page.locator('.issue-review').waitFor();
        await page.locator('.modal-footer-actions .btn-primary').click();
        await page.waitForFunction(()=>window.lastSaved?.status==='final');
        await page.locator('.issue-review').waitFor({state:'detached'});
        const current=await state(page);
        assert.equal(current.outputAttempts,0,'Issue-only action must not trigger print/PDF/share');
        assert.equal(await page.locator('.editor-form-lock').evaluate(el=>el.disabled),true,'issued quote must lock editing');
        await snap(page,'issue-only-proforma');
      }finally{await page.close();}
    });

    await run('issue-confirm-single-flight',async()=>{
      const page=await open('lang=en&kind=invoice&saveDelay=250&outputDelay=250');
      try{
        await page.locator('.mobile-action-buttons button').filter({hasText:'PDF'}).first().click();
        await page.locator('.issue-review').waitFor();
        const confirm=page.locator('.modal-footer-actions .btn-primary');
        await confirm.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.lastOutput==='pdf');
        await page.waitForTimeout(350);
        const current=await state(page);
        assert.equal(current.saveAttempts,1,'rapid issue confirmation must save the Final snapshot once');
        assert.equal(current.outputAttempts,1,'rapid issue confirmation must create one output only');
        await snap(page,'issue-confirm-single-flight');
      }finally{await page.close();}
    });

    await run('output-failure-retry',async()=>{
      const page=await open('lang=en&kind=invoice&outputFail=1');
      try{
        await page.locator('.mobile-action-buttons button').filter({hasText:'PDF'}).first().click();
        await page.locator('.issue-review').waitFor();
        await page.locator('.modal-footer-actions .btn-primary').click();
        await page.waitForFunction(()=>window.outputAttempts===1&&window.lastSaved?.status==='final');
        await page.locator('.editor-global-error').waitFor();
        let current=await state(page);
        assert.equal(current.lastOutput,undefined,'failed output must not be reported as successful');
        assert.equal(current.saveAttempts,1,'failed output after issuance must keep the already-saved final snapshot');
        await page.evaluate(()=>{window.failOutput=false;});
        await page.locator('.modal-footer-actions .btn-primary').click();
        await page.waitForFunction(()=>window.lastOutput==='pdf'&&window.outputAttempts===2);
        await page.locator('.issue-review').waitFor({state:'detached'});
        current=await state(page);
        assert.equal(current.saveAttempts,1,'retrying output must not issue/save the document a second time');
        assert.equal(await page.locator('.editor-global-error').count(),0,'successful retry must clear the stale output error');
        await snap(page,'output-failure-retry');
      }finally{await page.close();}
    });

    await run('final-quote-conversion-single-flight',async()=>{
      const page=await open('lang=en&kind=proforma&status=final&convertDelay=250');
      try{
        const convert=page.locator('.final-quote-convert-bar .btn-primary');
        await convert.waitFor();
        await convert.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.convertCount===1);
        await page.waitForTimeout(320);
        assert.equal((await state(page)).convertCount,1,'rapid conversion clicks must create only one downstream invoice request');
        await snap(page,'final-quote-conversion-single-flight');
      }finally{await page.close();}
    });

    await run('linked-final-quote-blocks-reconversion',async()=>{
      const page=await open('lang=ar&kind=proforma&status=final&linked=1');
      try{
        await page.locator('.final-quote-convert-bar.is-converted').waitFor();
        assert.equal(await page.locator('.final-quote-convert-bar .btn-primary').count(),0,'linked quote must not offer a second conversion action');
        assert.equal((await state(page)).convertCount,0);
        await snap(page,'linked-final-quote-blocks-reconversion');
      }finally{await page.close();}
    });

    await run('save-and-close-waits-for-inflight-autosave',async()=>{
      const page=await open('lang=en&kind=invoice&saveDelay=300');
      try{
        await page.locator('.item-pricing-grid input').first().fill('6');
        await page.waitForTimeout(500);
        await page.getByRole('button',{name:'Back'}).first().click();
        await page.waitForFunction(()=>window.closeCount===1,{timeout:5000});
        const current=await state(page);
        assert.equal(current.lastSaved?.items?.[0]?.quantity,'6','back navigation must not drop an in-flight edited value');
        assert.equal(current.closeCount,1,'editor must close once after persistence completes');
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Functional document workflow: ${results.length} real-component scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
