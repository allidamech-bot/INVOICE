// Synthetic, isolated acceptance of the real panels, voucher and shipped print CSS.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/payment-vouchers/long';
mkdirSync(output,{recursive:true});
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const mode of ['customer','supplier'])for(const lang of ['ar','en'])for(const logo of ['wide','tall','square']){
    const label=`${engine}-${mode}-${lang}-${logo}`;
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>{window.qaPrints=0;window.print=()=>window.qaPrints++;});
    try{
     await page.goto(`http://127.0.0.1:4173/tests/visual/payment-vouchers.html?mode=${mode}&lang=${lang}&long=1&logo=${logo}`);
     const source=await page.evaluate(()=>window.qaSource());
     const action=()=>page.getByRole('button',{name:mode==='customer'?/Receipt \/ PDF|سند قبض \/ PDF/:/Voucher \/ PDF|سند دفع \/ PDF/}).first();
     await action().click();
     const voucher=page.locator('[data-payment-voucher]');await voucher.waitFor();
     assert.equal(await voucher.getAttribute('dir'),lang==='ar'?'rtl':'ltr');
     const image=voucher.locator('img');
     await image.evaluate(async img=>{await img.decode();});
     assert.ok(await image.evaluate(img=>{const r=img.getBoundingClientRect(),v=img.closest('[data-payment-voucher]').getBoundingClientRect();return img.naturalWidth>0&&img.naturalHeight>0&&r.width>0&&r.height>0&&r.width<=76.5&&r.height<=55.5&&r.left>=v.left&&r.right<=v.right;}),'large logo loaded and constrained within voucher');
     const text=await voucher.innerText();
     assert.ok(text.includes('QA-LAST-LINE-100'));
     assert.ok(text.includes('TRANSFER-42-'));
     await page.locator('.modal-footer button').last().click();
     await page.waitForFunction(()=>window.qaPrints===1);
     await page.emulateMedia({media:'print'});
     assert.equal(await page.locator('.modal-footer').isVisible(),false);
     assert.equal(await page.locator('.modal-header').isVisible(),false);
     await voucher.screenshot({path:`${output}/${label}.png`});
     if(engine==='chromium'){
      const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
      writeFileSync(`${output}/${label}.pdf`,pdf);
      const result=await page.evaluate(async base64=>{
       const pdfjs=await import('/dist/vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
       const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}).promise;
       const pages=[];
       for(let n=1;n<=pdf.numPages;n++){
        const p=await pdf.getPage(n),content=await p.getTextContent();
        pages.push({text:content.items.map(x=>x.str||'').join(' '),width:p.view[2],height:p.view[3],
         outside:content.items.filter(x=>x.str?.trim()&&(x.transform[4]<-1||x.transform[5]<-1||x.transform[4]+x.width>p.view[2]+1||x.transform[5]+x.height*.7>p.view[3]+1)).map(x=>x.str)});
       }
       await pdf.destroy();return pages;
      },pdf.toString('base64'));
      writeFileSync(`${output}/${label}.json`,JSON.stringify(result,null,2));
      assert.ok(result.length>1,'fixture must exercise multiple A4 pages');
      for(const p of result){assert.ok(p.text.trim(),'no blank page');assert.deepEqual(p.outside,[],'no text origins clipped outside A4');}
      const flat=result.map(p=>p.text).join('').normalize('NFKC').replace(/\s/g,'');
      for(let i=1;i<=100;i++)assert.equal(flat.split(`QA-LINE-${String(i).padStart(3,'0')}`).length-1,1,'each note appears exactly once');
      assert.ok(flat.includes('QA-LAST-LINE-100'),'last line retained');
      assert.ok(flat.includes('TRANSFER-42-'+('REFERENCE0123456789'.repeat(16))),'complete long reference retained');
      const noteWords=(lang==='ar'?'ملاحظة اختبار اصطناعية للتحقق من اكتمال طباعة السند دون فقدان المحتوى':'Synthetic acceptance note verifying complete voucher printing without lost content').split(' ');
      if(lang==='ar'){
       // Chromium PDF text uses shaped presentation glyphs in visual order.
       // NFKC plus a complete Arabic glyph inventory detects loss without
       // mistaking PDF extraction order for the browser's rendered word order.
       const glyphs=value=>Array.from(value.normalize('NFKC')).filter(c=>/[\u0621-\u064a]/.test(c)).sort().join('');
       const noteText=flat.split('QA-NOTES-BEGIN')[1]?.split('QA-LAST-LINE-100')[0];
       assert.ok(noteText,'bounded complete note section');
       assert.equal(glyphs(noteText),glyphs(noteWords.join(' ').repeat(100)),'complete Arabic note glyph inventory');
      }else for(const word of noteWords)assert.ok(flat.split(word).length-1>=100,`note body retained: ${word}`);
      for(const needle of [mode==='customer'?'customer-voucher-001':'supplier-voucher-001',mode==='customer'?'INV-QA-RECEIPT':'PUR-QA-VOUCHER','TRANSFER-42-','USD'])assert.ok(flat.includes(needle),`PDF identity: ${needle}`);
      assert.ok(!/Showmorepayments|Print\/SavePDF|طباعة\/حفظPDF/.test(flat),'controls must not leak into PDF');
     }
     await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
     await page.emulateMedia({media:'screen'});
     assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-payment-voucher')),false);
     await page.locator('.modal-footer button').last().click();
     await page.waitForFunction(()=>window.qaPrints===2);
     await page.locator('.modal-footer button').first().click();
     assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-payment-voucher')),false);
     await action().click();await voucher.waitFor();
     assert.ok((await voucher.innerText()).includes('QA-LAST-LINE-100'),'reopen retains long source');
     assert.equal(await page.evaluate(()=>window.qaSource()),source,'printing never changes stored financial inputs');
     assert.deepEqual(errors,[]);console.log('PASS '+label);
    }finally{await page.close();}
   }
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
