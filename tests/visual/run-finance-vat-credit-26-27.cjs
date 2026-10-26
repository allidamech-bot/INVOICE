const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/finance-vat-credit-26-27';mkdirSync(out,{recursive:true});

(async()=>{
const results=[];
for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
    for(const lang of ['en','ar']){
      const page=await browser.newPage({viewport:{width:engine==='webkit'?390:1280,height:844},
        isMobile:engine==='webkit',hasTouch:engine==='webkit'});
      const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      try{
        await page.goto('http://127.0.0.1:4173/tests/visual/finance-vat-credit-26-27.html?lang='+lang,{waitUntil:'load'});
        const root=page.locator('.lx-tax-center');
        await root.waitFor({state:'visible',timeout:12000});
        const dates=root.locator('.lx-tax-filters input[type="date"]');
        assert.equal(await dates.count(),2);
        const dataBefore=await page.evaluate(()=>window.qaVatSource());
        const reportRows=root.locator('.lx-tax-register tbody tr');

        await dates.nth(0).fill('2026-10-01');
        await dates.nth(1).fill('2026-10-31');
        assert.equal(await reportRows.count(),2,'Oct VAT includes only USD/EUR invoices');
        assert.equal(await root.locator('.lx-tax-register tbody tr.is-credit-note').count(),0);
        let octText=await root.locator('.lx-tax-summary').innerText();
        assert.ok(octText.includes('USD')&&octText.includes('EUR'),'separate currencies in October');
        assert.ok(octText.includes('20.00'),'October invoice VAT is 20 per currency');

        await dates.nth(0).fill('2026-11-01');
        await dates.nth(1).fill('2026-11-30');
        assert.equal(await reportRows.count(),1,'Nov VAT includes only tax-treated credit, not keep-VAT credit');
        let novRow=await reportRows.first().innerText();
        assert.match(novRow,/CN-QA-TAX-60/);
        assert.match(novRow,/-10\.00/);
        assert.ok(!(await root.innerText()).includes('CN-QA-KEEP-20'),
          'explicit keep-VAT credit does not falsely reduce output VAT');
        await root.screenshot({path:out+'/'+engine+'-'+lang+'-nov.png'});

        await dates.nth(0).fill('2026-10-01');
        assert.equal(await reportRows.count(),3,'Oct-Nov combined source invoices plus eligible credit');
        const allText=await root.locator('.lx-tax-summary').innerText();
        assert.ok(allText.includes('USD')&&allText.includes('EUR'));
        assert.match(allText,/10\.00/,'USD VAT 20 minus credit VAT 10 = 10');
        assert.equal(await page.evaluate(()=>window.qaVatSource()),dataBefore,'report is read-only');
        assert.deepEqual(errors,[],'browser without runtime errors');
        await root.screenshot({path:out+'/'+engine+'-'+lang+'-combined.png'});
        results.push({engine,lang,status:'passed'});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}
assert.equal(results.length,4);
writeFileSync(out+'/results.json',JSON.stringify({cases:4,failed:0,results},null,2));
console.log(JSON.stringify({suite:'VAT + credit month cutoff actual React 26/27',cases:4,failed:0,results},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
