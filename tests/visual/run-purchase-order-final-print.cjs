const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const long=process.argv.includes('--long');
const out='visual-qa-output/purchase-order-native-pdf';
mkdirSync(out,{recursive:true});
const normalize=value=>value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const language of ['en','ar'])for(const template of ['obsidian','executive'])for(const logo of (long?['wide','tall','square']:['default'])){
    const page=await browser.newPage({viewport:{width:language==='ar'?390:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/visual/purchase-order-final-print.html?lang='+language+'&template='+template+(long?'&long=1&logo='+logo:''));
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>{const root=document.querySelector('.print-portal .invoice-pages');return Boolean(root&&root.dataset.paginationReady==='true'&&root.querySelectorAll('.invoice-page').length);},null,{timeout:25000});
    await page.evaluate(async()=>{await document.fonts?.ready;await Promise.all(Array.from(document.querySelectorAll('.print-portal img'),img=>img.decode()));});
    const source=await page.evaluate(()=>window.qaSourceSnapshot()),state=await page.evaluate(()=>window.qaPurchaseOrder);
    const print=page.locator('.print-portal .invoice-pages');
    const content=normalize(await print.innerText());
    assert.equal(state.kind,'purchase-order');assert.equal(state.status,'final');
    const total=long?'440.00':'357.50';
    assert.equal(state.lineCount,long?40:2);assert.equal(state.totals.grandTotal,total);
    assert.ok(content.includes('PO-QA-2026-003'),'actual purchase order number');
    assert.ok(content.includes(total),'tax-inclusive total present');
    if(long){
      for(let n=1;n<=40;n++)assert.ok(content.includes('PO-LINE-'+String(n).padStart(3,'0')),'every long purchase order line in DOM');
      const images=await page.locator('.print-portal .doc-logo img').evaluateAll(imgs=>imgs.map(img=>({width:img.naturalWidth,height:img.naturalHeight})));
      assert.ok(images.length>0&&images.every(img=>img.width>0&&img.height>0),'large logos decoded');
    }else{
    assert.ok(content.includes(language==='ar'?'أطلس للتوريد':'Atlas Supplier'),'supplier name on issued purchase order');
    assert.ok(content.includes(language==='ar'?'مجموعة صمام تجريبية':'Synthetic valve assembly'),'purchase item detail in print');
    assert.ok(content.includes(language==='ar'?'وصلة تجريبية':'Synthetic fitting'),'second line in print');
    }
    const pages=await page.locator('.print-portal .invoice-page').count();
    assert.ok(long?pages>1&&pages<=30:pages>=1&&pages<=3,'expected page range');
    await print.screenshot({path:out+'/'+engine+'-'+language+'-'+template+(long?'-long-'+logo:'')+'.png'});
    if(engine==='chromium'){
      const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',bottom:'0',left:'0',right:'0'}});
      assert.equal(pdf.subarray(0,5).toString(),'%PDF-','valid native PDF');
      writeFileSync(out+'/'+engine+'-'+language+'-'+template+(long?'-long-'+logo:'')+'.pdf',pdf);
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
      assert.ok(pdfText.includes(total),'PDF has accurate total');
      assert.ok(!pdfText.includes('QA-APP-CONTROL-LEAK'),'application controls excluded');
      if(long)for(let n=1;n<=40;n++){const marker='PO-LINE-'+String(n).padStart(3,'0');assert.equal(pdfText.split(marker).length-1,1,'PDF preserves line exactly once: '+marker);}
      if(language==='en')assert.ok(pdfText.includes('AtlasSupplier'),'PDF preserves supplier identity');
    }
    assert.equal(await page.evaluate(()=>window.qaSourceSnapshot()),source,'printing must never mutate the purchase order');
    assert.deepEqual(errors,[],'browser errors');
    console.log('PASS issued purchase order '+engine+' '+language+' '+template+(long?' long '+logo:''));
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exit(1);});
