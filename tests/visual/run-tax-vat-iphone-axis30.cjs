/* iPhone WebKit touch simulation of actual LOUREX VAT report, filters, CSV and
 * navigation-safe print. Synthetic data only. Not native iOS Safari QA. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/finance-iphone-axis30';
mkdirSync(out,{recursive:true});
const iphoneUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
(async()=>{
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const lang of ['en','ar'])for(const width of [320,390]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,
     hasTouch:true,deviceScaleFactor:2,userAgent:iphoneUA,acceptDownloads:true});
   await context.addInitScript(()=>{
    try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
    try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
   });
   try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    await page.goto('http://127.0.0.1:4173/tests/visual/tax-vat-final-output.html?lang='+lang,{waitUntil:'load'});
    const tab=page.getByRole('tab',{name:lang==='ar'?'الضريبة / VAT':'Tax / VAT',exact:true});
    await tab.click();
    const root=page.locator('.lx-tax-center');
    await root.waitFor({state:'visible',timeout:14000});
    const baseline=await page.evaluate(()=>window.qaSource());
    const filters=root.locator('.lx-tax-filters');
    const dates=filters.locator('input[type="date"]');
    assert.equal(await dates.count(),2,'report has an editable time window on iPhone');
    await dates.nth(0).fill('2026-10-01');
    await dates.nth(1).fill('2026-10-31');
    await filters.locator('select').selectOption('USD');
    const rows=root.locator('.lx-tax-register tbody tr');
    assert.equal(await rows.count(),21,'20 USD invoices plus single accounted USD credit');
    assert.equal(await root.locator('.lx-tax-register .is-credit-note').count(),1);
    const measure=await page.evaluate(()=>({
      width:innerWidth,touch:navigator.maxTouchPoints,platform:navigator.platform,ua:navigator.userAgent,
      allSourcesIntact:typeof window.qaSource==='function'
    }));
    assert.equal(measure.width,width);
    assert.ok(measure.touch>0&&measure.ua.includes('iPhone'),'WebKit must expose touch and iPhone user agent: '+JSON.stringify(measure));
    assert.equal(measure.allSourcesIntact,true);

    const exportButton=page.getByRole('button',{name:lang==='ar'?'تصدير CSV':'Export CSV',exact:true});
    await exportButton.scrollIntoViewIfNeeded();
    const downloadPromise=page.waitForEvent('download',{timeout:15000});
    await exportButton.click();
    const download=await downloadPromise;
    const stream=await download.createReadStream(),chunks=[];
    for await(const chunk of stream)chunks.push(chunk);
    const csv=Buffer.concat(chunks).toString('utf8');
    assert.ok(csv.startsWith('\uFEFF'),'BOM protects Arabic CSV in common spreadsheet clients');
    assert.equal(csv.slice(1).split(/\r?\n/).filter(Boolean).length,22,'header + 21 selected USD rows in CSV');
    assert.ok(!csv.includes('VAT-FUTURE-EXCLUDED')&&!csv.includes('VAT-VOID-EXCLUDED'));
    assert.ok(download.suggestedFilename().includes('2026-10-31'),'export bound to selected month');
    assert.equal(await page.evaluate(()=>window.qaSource()),baseline,'CSV did not change financial source records');

    // One event-loop tick reproduces print/navigation race without RPC waits.
    await page.evaluate(()=>{
      const button=[...document.querySelectorAll('.lx-tax-header button')].find(x=>/Print \/ Save PDF|طباعة \/ حفظ PDF/.test(x.textContent));
      if(!button)throw Error('real VAT print control unavailable');
      button.click();
      if(!document.body.classList.contains('printing-tax-vat-report'))throw Error('print pending state absent');
      window.qaReport.setState({view:'performance'});
    });
    await page.waitForTimeout(125);
    assert.equal(await page.evaluate(()=>window.qaPrintCalls),0,'pending VAT print cannot leak into next report');
    assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-tax-vat-report')),false,'print state cleared on navigation');
    await tab.click();
    await root.waitFor({state:'visible'});
    await page.getByRole('button',{name:lang==='ar'?'طباعة / حفظ PDF':'Print / Save PDF',exact:true}).click();
    await page.waitForFunction(()=>window.qaPrintCalls===1,null,{timeout:5000});
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-tax-vat-report')),false);
    assert.equal(await page.evaluate(()=>window.qaSource()),baseline,'printing and navigation never mutate invoices or payments');
    assert.deepEqual(errors,[],'no WebKit page/HTTP errors');
    await page.screenshot({path:out+'/vat-'+lang+'-'+width+'.png',fullPage:false,animations:'disabled'});
    results.push({lang,width,pass:true,csvRows:21,printCalls:1});
    console.log('PASS iPhone WebKit tax/CSV/print '+lang+' '+width+'px');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 assert.equal(results.length,4);
 writeFileSync(out+'/vat-iphone.json',JSON.stringify({engine:'WebKit touch iPhone emulation',cases:4,failures:0,results},null,2));
 console.log(JSON.stringify({suite:'iPhone WebKit financial VAT output touch',cases:4,failures:0},null,2));
})().catch(err=>{console.error(err);process.exit(1);});
