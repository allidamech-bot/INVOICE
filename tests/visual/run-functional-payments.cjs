const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const output='visual-qa-output/functional-payments';

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const open=async(query,viewport={width:390,height:844})=>{
    const page=await browser.newPage({viewport,hasTouch:true,isMobile:true});
    page.setDefaultTimeout(12000);
    await page.goto(`http://127.0.0.1:4173/tests/visual/functional-payments.html?${query}`,{waitUntil:'load'});
    await page.locator('.invoice-payments-panel').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    return page;
  };
  const snap=(page,name)=>page.screenshot({path:`${output}/${name}.png`,fullPage:true,animations:'disabled'});
  const state=page=>page.evaluate(()=>({payments:window.paymentsState(),summary:window.paymentSummary(),saveAttempts:window.saveAttempts,deleteAttempts:window.deleteAttempts,events:window.eventLog}));
  const run=async(name,fn)=>{const failures=[];try{await fn(failures);}catch(error){failures.push(error?.stack||String(error));}results.push({name,failures});};

  try{
    await run('payment-save-single-flight',async()=>{
      const page=await open('lang=en&saveDelay=250');
      try{
        await page.getByRole('button',{name:'Record Payment'}).click();
        await page.locator('.payment-entry-form').waitFor();
        await page.locator('.payment-form-grid input').first().fill('500');
        const save=page.getByRole('button',{name:'Save Payment'});
        await save.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.paymentsState().length>=1);
        await page.waitForTimeout(350);
        const current=await state(page);
        assert.equal(current.saveAttempts,1,'rapid Save Payment clicks must create one persistence request');
        assert.equal(current.payments.length,1,'rapid Save Payment clicks must create one payment record');
        assert.equal(current.payments[0].amount,'500.00');
        assert.equal(current.summary.remaining,'500.00');
        await page.locator('.payment-entry-form').waitFor({state:'detached'});
        await snap(page,'payment-save-single-flight');
      }finally{await page.close();}
    });

    await run('payment-save-error-retry',async()=>{
      const page=await open('lang=en&saveDelay=100&saveFail=1');
      try{
        await page.getByRole('button',{name:'Record Payment'}).click();
        await page.locator('.payment-form-grid input').first().fill('250');
        await page.getByRole('button',{name:'Save Payment'}).click();
        await page.locator('.payment-entry-form .payment-error').waitFor();
        let current=await state(page);
        assert.equal(current.saveAttempts,1);
        assert.equal(current.payments.length,0,'failed payment save must not mutate collection state');
        assert.equal(await page.locator('.payment-entry-form').count(),1,'failed save must keep the form recoverable');
        await page.evaluate(()=>{window.failSave=false;});
        await page.getByRole('button',{name:'Save Payment'}).click();
        await page.waitForFunction(()=>window.paymentsState().length===1);
        await page.locator('.payment-entry-form').waitFor({state:'detached'});
        current=await state(page);
        assert.equal(current.saveAttempts,2,'retry must perform exactly one new save attempt');
        assert.equal(current.payments[0].amount,'250.00');
        assert.equal(current.summary.remaining,'750.00');
        await snap(page,'payment-save-error-retry');
      }finally{await page.close();}
    });

    await run('net-balance-guard-with-credit-note',async()=>{
      const page=await open('lang=en&credit=1&existing=300');
      try{
        let current=await state(page);
        assert.deepEqual(current.summary,{status:'partially-paid',total:'1000.00',credits:'200.00',netTotal:'800.00',paid:'300.00',remaining:'500.00'});
        await page.getByRole('button',{name:'Record Payment'}).click();
        const amount=page.locator('.payment-form-grid input').first();
        assert.equal(await amount.inputValue(),'500.00','payment form must default to the collectible net balance');
        await amount.fill('501');
        await page.getByRole('button',{name:'Save Payment'}).click();
        await page.locator('.payment-entry-form .payment-error').waitFor();
        current=await state(page);
        assert.equal(current.payments.length,1,'over-collection attempt must not create a payment');
        assert.equal(current.saveAttempts,1);
        await amount.fill('500');
        await page.getByRole('button',{name:'Save Payment'}).click();
        await page.waitForFunction(()=>window.paymentsState().length===2);
        await page.locator('.payment-entry-form').waitFor({state:'detached'});
        current=await state(page);
        assert.equal(current.summary.status,'paid');
        assert.equal(current.summary.remaining,'0.00');
        assert.equal(await page.getByRole('button',{name:'Record Payment'}).count(),0,'paid invoice must not offer another receipt entry');
        await snap(page,'net-balance-guard-with-credit-note');
      }finally{await page.close();}
    });

    await run('payment-delete-single-flight',async()=>{
      const page=await open('lang=en&existing=300&deleteDelay=250');
      try{
        await page.evaluate(()=>{window.confirm=()=>true;});
        const remove=page.locator('.payment-history .payment-row button').first();
        await remove.evaluate(button=>{button.click();button.click();});
        await page.waitForFunction(()=>window.paymentsState().length===0);
        await page.waitForTimeout(350);
        const current=await state(page);
        assert.equal(current.deleteAttempts,1,'rapid Delete clicks must create one destructive request');
        assert.equal(current.payments.length,0);
        assert.equal(current.summary.remaining,'1000.00');
        await snap(page,'payment-delete-single-flight');
      }finally{await page.close();}
    });

    await run('arabic-payment-recovery',async()=>{
      const page=await open('lang=ar&credit=1&existing=300&saveFail=1');
      try{
        await page.getByRole('button',{name:'تسجيل دفعة'}).click();
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        assert.equal(await page.locator('.payment-form-grid input').first().inputValue(),'500.00');
        await page.getByRole('button',{name:'حفظ الدفعة'}).click();
        await page.locator('.payment-entry-form .payment-error').waitFor();
        assert.equal((await state(page)).payments.length,1,'Arabic failed save must preserve the existing receipt ledger');
        await page.evaluate(()=>{window.failSave=false;});
        await page.getByRole('button',{name:'حفظ الدفعة'}).click();
        await page.waitForFunction(()=>window.paymentsState().length===2);
        await page.locator('.payment-entry-form').waitFor({state:'detached'});
        assert.equal((await state(page)).summary.status,'paid');
        await snap(page,'arabic-payment-recovery');
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Functional payments: ${results.length} real-component scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
