const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/purchase-order-native-pdf';
mkdirSync(out,{recursive:true});
const normalize=value=>value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const language of ['en','ar'])for(const template of ['obsidian','executive']){
    const page=await browser.newPage({viewport:{width:language==='ar'?390:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/visual/purchase-order-final-print.html?lang='+language+'&template='+template);
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>{const root=document.querySelector('.print-portal .invoice-pages');return Boolean(root&&root.dataset.paginationReady==='true'&&root.querySelectorAll('.invoice-page').length);},null,{timeout:25000});
    await page.evaluate(()=>document.fonts?.ready);
    const source=await page.evaluate(()=>window.qaSourceSnapshot()),state=await page.evaluate(()=>window.qaPurchaseOrder);
    const print=page.locator('.print-portal .invoice-pages');
    const content=normalize(await print.innerText());
    assert.equal(state.kind,'purchase-order');assert.equal(state.status,'final');
    assert.equal(state.lineCount,2);assert.equal(state.totals.grandTotal,'357.50');
    assert.ok(content.includes('PO-QA-2026-003'),'actual purchase order number');
    assert.ok(content.includes('357.50'),'tax-inclusive total present');
    assert.ok(content.includes(language==='ar'?'أطلس للتوريد':'Atlas Supplier'),'supplier name on issued purchase order');
    assert.ok(content.includes(language==='ar'?'مجموعة صمام تجريبية':'Synthetic valve assembly'),'purchase item detail in print');
    assert.ok(content.includes(language==='ar'?'وصلة تجريبية':'Synthetic fitting'),'second line in print');
    const pages=await page.locator('.print-portal .invoice-page').count();
    assert.ok(pages>=1&&pages<=3,'expected page range');
    await print.screenshot({path:out+'/'+engine+'-'+language+'-'+template+'.png'});
    if(engine==='chromium'){
      const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',bottom:'0',left:'0',right:'0'}});
      assert.equal(pdf.subarray(0,5).toString(),'%PDF-','valid native PDF');
      writeFileSync(out+'/'+engine+'-'+language+'-'+template+'.pdf',pdf);
      const parsed=await page.evaluate(async data=>{
        const pdfjs=await import('/dist/vendor/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
        const doc=await pdfjs.getDocument({data:Uint8Array.from(atob(data),c=>c.charCodeAt(0))}).promise,parts=[];
        for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),txt=await p.getTextContent();parts.push(txt.items.map(item=>item.str||'').join(' '));}
        const result={pages:doc.numPages,content:parts.join(' '),allPages:parts};
        await doc.destroy();return result;
      },pdf.toString('base64'));
      assert.equal(parsed.pages,pages,'printed pagination and real PDF page count');
      assert.ok(parsed.allPages.every(pageText=>pageText.trim().length>0),'no blank PDF pages');
      const pdfText=normalize(parsed.content).replace(/\s+/g,'');
      assert.ok(pdfText.includes('PO-QA-2026-003'),'PDF has correct purchase order reference');
      assert.match(pdfText,/357[,.]50/,'PDF has accurate total');
      if(language==='en')assert.ok(pdfText.includes('AtlasSupplier'),'PDF preserves supplier identity');
    }
    assert.equal(await page.evaluate(()=>window.qaSourceSnapshot()),source,'printing must never mutate the purchase order');
    assert.deepEqual(errors,[],'browser errors');
    console.log('PASS issued purchase order '+engine+' '+language+' '+template);
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exit(1);});
