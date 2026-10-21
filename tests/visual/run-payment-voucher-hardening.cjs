const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const failures=[];
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const lang of ['en','ar'])for(const mode of ['customer','supplier']){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>{window.qaPrints=0;window.print=()=>{window.qaPrints++;};});
    try{
     await page.goto(`http://127.0.0.1:4173/tests/visual/payment-vouchers.html?mode=${mode}&lang=${lang}&future=1`);
     const source=await page.evaluate(()=>window.qaSource());
     await page.getByRole('button',{name:mode==='customer'?/Receipt \/ PDF|سند قبض \/ PDF/:/Voucher \/ PDF|سند دفع \/ PDF/}).first().click();
     const voucher=page.locator('[data-payment-voucher]');await voucher.waitFor();
     assert.equal(await voucher.locator('[data-voucher-future]').count(),1,'future receipt must visibly distinguish its future effective date');
     assert.equal(await voucher.locator('[data-voucher-company-current]').count(),mode==='supplier'?1:0,'supplier current identity must be distinguished from the customer frozen snapshot');
     await page.locator('.modal-footer').getByRole('button',{name:/Print \/ Save PDF|طباعة \/ حفظ PDF/}).click();
     await page.waitForFunction(()=>window.qaPrints===1);
     await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
     assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-payment-voucher')),false,'afterprint cleanup');
     await page.locator('.modal-footer').getByRole('button',{name:/Print \/ Save PDF|طباعة \/ حفظ PDF/}).click();
     await page.waitForFunction(()=>window.qaPrints===2);
     await page.locator('.modal-footer').getByRole('button',{name:/^Close$|^إغلاق$/}).click();
     assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-payment-voucher')),false,'closing without an afterprint event must release print mode');
     assert.equal(await page.evaluate(()=>window.qaSource()),source,'printing/closing cannot persist or rewrite a payment');
     assert.deepEqual(errors,[]);console.log('PASS future/issuer/cleanup '+engine+' '+mode+' '+lang);
    }catch(e){failures.push(`${engine} ${mode} ${lang}: ${e.message}`);}finally{await page.close();}
   }
   const page=await browser.newPage({viewport:{width:390,height:844}});
   try{
    await page.goto('http://127.0.0.1:4173/tests/visual/payment-vouchers.html?mode=supplier&many=1');
    const source=await page.evaluate(()=>window.qaSource());
    const actions=()=>page.getByRole('button',{name:/Voucher \/ PDF/});
    await actions().first().waitFor();assert.equal(await actions().count(),12);
    await page.getByRole('button',{name:/Show more payments/}).click();assert.equal(await actions().count(),24);
    await actions().nth(12).click();assert.ok((await page.locator('[data-payment-voucher]').innerText()).includes('supplier-voucher-013'));
    await page.locator('.modal-footer').getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:/Show more payments/}).click();assert.equal(await actions().count(),25);
    assert.equal(await page.getByRole('button',{name:/Show more payments/}).count(),0);
    assert.equal(await page.evaluate(()=>window.qaSource()),source);console.log('PASS older supplier payments '+engine);
   }catch(e){failures.push(`${engine} older: ${e.message}`);}finally{await page.close();}
  }finally{await browser.close();}
 }
 assert.deepEqual(failures,[]);
})().catch(e=>{console.error(e);process.exit(1);});
