const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/payment-vouchers';
mkdirSync(output,{recursive:true});
const norm=value=>value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const mode of ['customer','supplier'])for(const lang of ['en','ar']){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{window.qaPrints=0;window.print=()=>{window.qaPrints++;};});
    await page.goto('http://127.0.0.1:4173/tests/visual/payment-vouchers.html?mode='+mode+'&lang='+lang);
    const source=await page.evaluate(()=>window.qaSource());
    const action=page.getByRole('button',{name:mode==='customer'?/Receipt \/ PDF|سند قبض \/ PDF/:/Voucher \/ PDF|سند دفع \/ PDF/}).first();
    await action.waitFor();await action.click();
    const voucher=page.locator('[data-payment-voucher]');await voucher.waitFor();
    assert.equal(await voucher.getAttribute('data-voucher-kind'),mode==='customer'?'customer-receipt':'supplier-disbursement');
    const text=norm(await voucher.innerText());
    const record=mode==='customer'?'customer-voucher-001':'supplier-voucher-001',parent=mode==='customer'?'INV-QA-RECEIPT':'PUR-QA-VOUCHER';
    assert.ok(text.includes(record),'real payment identity in voucher');
    assert.ok(text.includes(parent),'linked invoice/purchase in voucher');
    assert.ok(text.includes('TRANSFER-42'),'payment reference');
    assert.ok(text.includes('42.00'),'exact recorded amount');
    assert.ok(text.includes(lang==='ar'?'لوركس للتجارة':'LOUREX Trading'),'company identity');
    assert.ok(text.includes(lang==='ar'?(mode==='customer'?'أطلس العميل':'أطلس المورد'):(mode==='customer'?'Atlas Customer':'Atlas Supplier')),'party identity');
    await page.locator('.modal-footer').getByRole('button',{name:/Print \/ Save PDF|طباعة \/ حفظ PDF/}).click();
    await page.waitForFunction(()=>window.qaPrints===1);
    assert.ok(await page.evaluate(()=>document.body.classList.contains('printing-payment-voucher')));
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.modal-footer').isVisible(),false,'print does not leak UI controls');
    assert.ok(await voucher.isVisible(),'voucher visible in print media');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'no horizontal overflow');
    await voucher.screenshot({path:output+'/'+engine+'-'+mode+'-'+lang+'.png'});
    if(engine==='chromium'){
      const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
      writeFileSync(output+'/'+engine+'-'+mode+'-'+lang+'.pdf',pdf);
      const result=await page.evaluate(async data=>{
        const pdfjs=await import('/dist/vendor/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
        const instance=await pdfjs.getDocument({data:Uint8Array.from(atob(data),c=>c.charCodeAt(0))}).promise,parts=[];
        for(let i=1;i<=instance.numPages;i++){const page=await instance.getPage(i),content=await page.getTextContent();parts.push(content.items.map(item=>item.str||'').join(' '));}
        const count=instance.numPages;await instance.destroy();return{count,text:parts.join(' ')};
      },pdf.toString('base64'));
      assert.equal(result.count,1,'single voucher prints on one A4 page');
      const pdfText=norm(result.text).replace(/\s+/g,'');
      for(const needle of [record,parent,'TRANSFER-42','42.00'])assert.ok(pdfText.includes(needle),'native PDF missing '+needle);
    }
    assert.equal(await page.evaluate(()=>window.qaSource()),source,'printing cannot mutate the recorded payment');
    assert.deepEqual(errors,[],'browser errors');
    console.log('PASS '+engine+' '+mode+' '+lang);
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
