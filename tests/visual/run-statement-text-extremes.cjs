/* Focused, synthetic UI-to-native-PDF statement acceptance. No production data. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/account-statement-text-extremes';
mkdirSync(output,{recursive:true});
const norm=value=>String(value).normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069٬,]/g,'').replace(/٫/g,'.');
const compact=value=>norm(value).replace(/\s+/g,'');
const arabicInventory=value=>[...norm(value).replace(/[^\u0600-\u06ff]/g,'')].sort().join('');
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const kind of ['customer','supplier'])for(const lang of ['en','ar']){
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__statementPrints=0;window.print=()=>{window.__statementPrints++;}});
    const file=kind==='customer'?'obsidian-financial.html':'supplier-statement-print.html';
    const params=new URLSearchParams({lang,textExtreme:'1',statementRows:'1'});
    if(kind==='customer')params.set('screen','receivables');
    await page.goto('http://127.0.0.1:4173/tests/visual/'+file+'?'+params);
    const selector=kind==='customer'?'.ta-account-row':'.lx-payables-row:not(.is-head)';
    await page.locator(selector).first().waitFor();
    const snapshot=await page.evaluate(()=>window.financialSourceSnapshot());
    const source=JSON.parse(snapshot);
    const target=kind==='customer'?source.documents.find(item=>item.id==='inv-usd-a'):source.purchases.find(item=>item.id==='qa-purchase-atlas');
    const payment=kind==='customer'?source.payments.find(item=>item.id==='pay-usd-1'):source.supplierPayments.find(item=>item.id==='qa-supplier-payment');
    const names=kind==='customer'?target.customerSnapshot:target.supplierSnapshot;
    const name=lang==='ar'?(kind==='customer'?names.companyNameAr:names.nameAr):(kind==='customer'?names.companyNameEn:names.nameEn);
    assert.ok(name.length>70,'extreme synthetic party identity length');
    assert.ok(target.number.length>70,'extreme financial document number length');
    assert.ok(payment.reference.length>70,'extreme payment reference length');
    await page.locator(kind==='customer'?'.ta-account-controls input':'.lx-payables-search input').fill('Atlas');
    assert.equal(await page.locator(selector).count(),1,'account filtering preserves correct customer/supplier');
    await page.locator(selector).first().getByRole('button',{name:kind==='customer'?/^(Statement|كشف حساب)$/:/^(Statement|الكشف)$/}).click();
    const printable=page.locator(kind==='customer'?'.customer-statement-print':'.lx-supplier-statement');
    await printable.waitFor();
    assert.equal(await printable.locator('tbody tr').count(),2,'one posted document and one partial payment');
    const dom=compact(await printable.innerText());
    for(const [label,value] of [['party',name],['document reference',target.number],['payment reference',payment.reference]])assert.ok(dom.includes(compact(value)),label+' fully visible in statement DOM');
    await page.locator(kind==='customer'?'.statement-output-toolbar':'.modal-footer').getByRole('button',{name:kind==='customer'?undefined:/^(Print \/ Save PDF|طباعة \/ حفظ PDF)$/}).click();
    await page.waitForFunction(()=>window.__statementPrints===1);
    const flag=kind==='customer'?'printing-customer-statement':'printing-supplier-statement';
    assert.equal(await page.evaluate(flag=>document.body.classList.contains(flag),flag),true,'actual print action enabled');
    await page.emulateMedia({media:'print'});
    assert.ok(await printable.isVisible(),'statement remains print-visible');
    const printText=compact(await printable.innerText());
    assert.ok(printText.includes(compact(target.number))&&printText.includes(compact(payment.reference)),'references preserved at print entry');
    if(engine==='chromium'){
     const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
     assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
     writeFileSync(output+'/'+kind+'-'+lang+'.pdf',pdf);
     const result=await page.evaluate(async bytes=>{
      const lib=await import('/dist/vendor/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const file=await lib.getDocument({data:Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))}).promise;
      const pages=[];
      for(let n=1;n<=file.numPages;n++){const p=await file.getPage(n);const text=await p.getTextContent();pages.push(text.items.map(x=>x.str||'').join(' '));}
      await file.destroy();return pages;
     },pdf.toString('base64'));
     assert.ok(result.length>=1&&result.every(text=>text.trim()),'native PDF has no blank pages');
     const text=compact(result.join(' '));
     for(const [label,value] of [['document reference',target.number],['payment reference',payment.reference]])assert.ok(text.includes(compact(value)),label+' not truncated in native PDF');
     if(lang==='en')assert.ok(text.includes(compact(name)),'long English party identity in native PDF');
     else{
      const present=arabicInventory(result.join(' '));
      const required=arabicInventory(name);
      const counts=str=>{const c=new Map;for(const ch of str)c.set(ch,(c.get(ch)||0)+1);return c};
      const available=counts(present);
      for(const [glyph,count] of counts(required))assert.ok((available.get(glyph)||0)>=count,'long Arabic identity glyph missing from PDF: '+glyph);
     }
     assert.ok(text.includes(kind==='customer'?'700.00':'350.00'),'payment amount retained in native PDF');
    }
    assert.equal(await page.evaluate(()=>window.financialSourceSnapshot()),snapshot,'printing is read-only');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.evaluate(flag=>document.body.classList.contains(flag),flag),false,'print state cleaned');
    assert.deepEqual(errors,[],'page errors');
    console.log('PASS extreme account statement',engine,kind,lang);
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1});
