const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync,readFileSync}=require('node:fs');
const path=require('node:path');
const catalog=[...readFileSync(path.join(__dirname,'../../src/templates/TemplateThumbnails.tsx'),'utf8').matchAll(/\bid: '([^']+)'/g)].map(m=>m[1]);
const selection=process.argv.find(arg=>arg.startsWith('--templates='));
const templates=selection?selection.slice('--templates='.length).split(','):['obsidian','executive'];
assert.ok(templates.length&&new Set(templates).size===templates.length&&templates.every(id=>catalog.includes(id)),'templates must be distinct registered IDs');
const long=process.argv.includes('--long'),invoice=process.argv.includes('--invoice');
assert.ok(!invoice||long,'invoice acceptance requires --long');
const kind=invoice?'invoice':'purchase-order',number=invoice?'INV-QA-2026-LONG':'PO-QA-2026-003';
const out='visual-qa-output/'+(invoice?'invoice-native-pdf':'purchase-order-native-pdf');
mkdirSync(out,{recursive:true});
const normalize=value=>value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  if(process.env.CHROMIUM_ONLY&&engine!=='chromium')continue;
  const browser=await driver.launch({headless:true});
  try{
   for(const language of ['en','ar'])for(const template of templates)for(const logo of (long?['wide','tall','square']:['default'])){
    const page=await browser.newPage({viewport:{width:language==='ar'?390:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/visual/purchase-order-final-print.html?lang='+language+'&template='+template+(invoice?'&kind=invoice':'')+(long?'&long=1&logo='+logo:''));
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>{const root=document.querySelector('.print-portal .invoice-pages');return Boolean(root&&root.dataset.paginationReady==='true'&&root.querySelectorAll('.invoice-page').length);},null,{timeout:25000});
    await page.evaluate(async()=>{await document.fonts?.ready;await Promise.all(Array.from(document.querySelectorAll('.print-portal img'),img=>img.decode()));});
    const descriptions=await page.evaluate(()=>JSON.parse(window.qaSourceSnapshot()).items.map(item=>item[window.qaPurchaseOrder.language==='ar'?'descriptionAr':'descriptionEn']));
    const source=await page.evaluate(()=>window.qaSourceSnapshot()),state=await page.evaluate(()=>window.qaPurchaseOrder);
    const print=page.locator('.print-portal .invoice-pages');
    const content=normalize(await print.innerText());
    assert.equal(state.kind,kind);assert.equal(state.status,'final');assert.equal(state.templateId,template,'fixture must render the requested registered template');
    assert.equal(await print.locator('.invoice-page:not(.template-'+template+')').count(),0,'every rendered page uses the requested template');
    const total=long?'440.00':'357.50';
    assert.equal(state.lineCount,long?40:2);assert.equal(state.totals.grandTotal,total);
    assert.ok(content.includes(number),'actual issued document number');
    assert.ok(content.includes(total),'tax-inclusive total present');
    if(invoice){
      assert.ok(content.includes(state.partyName),'invoice customer identity');
      assert.ok(content.includes(state.companyName),'invoice issuer identity');
      assert.ok(content.includes(language==='ar'?'فاتورة':'INVOICE'),'invoice title');
    }
    if(long){
      for(let n=1;n<=40;n++)assert.ok(content.includes((language==='ar'?'بند':'PO-LINE-')+String(n).padStart(3,'0')),'every long document line in DOM');
      const images=await page.locator('.print-portal .doc-logo img').evaluateAll(imgs=>imgs.map(img=>{const r=img.getBoundingClientRect(),p=img.closest('.invoice-page').getBoundingClientRect(),h=img.closest('.doc-logo').getBoundingClientRect();return {width:img.naturalWidth,height:img.naturalHeight,contained:r.width>0&&r.height>0&&r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.left>=h.left-1&&r.right<=h.right+1&&r.top>=h.top-1&&r.bottom<=h.bottom+1};}));
      assert.ok(images.length>0&&images.every(img=>img.width>0&&img.height>0&&img.contained),'large logos decoded and contained within their logo box and printed page');
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
      const cells=await page.locator('.print-portal .invoice-page').evaluateAll(pages=>pages.map(page=>{const p=page.getBoundingClientRect();return Array.from(page.querySelectorAll('tbody .description-cell'),cell=>{const r=cell.getBoundingClientRect();return {id:cell.parentElement.dataset.sourceItemId,left:(r.left-p.left)/p.width,right:(r.right-p.left)/p.width,top:(r.top-p.top)/p.height,bottom:(r.bottom-p.top)/p.height};});}));
      const parsed=await page.evaluate(async ({data,cells})=>{
        const pdfjs=await import('/dist/vendor/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
        const doc=await pdfjs.getDocument({data:Uint8Array.from(atob(data),c=>c.charCodeAt(0))}).promise,parts=[],descriptions={};
        for(let n=1;n<=doc.numPages;n++){
          const p=await doc.getPage(n),txt=await p.getTextContent(),v=p.getViewport({scale:1});parts.push(txt.items.map(item=>item.str||'').join(' '));
          for(const cell of cells[n-1]){
            const text=txt.items.filter(item=>{if(!item.str)return false;const x=(item.transform[4]+item.width/2)/v.width,y=1-(item.transform[5]+item.height/3)/v.height;return x>=cell.left-.001&&x<=cell.right+.001&&y>=cell.top-.001&&y<=cell.bottom+.001;}).map(item=>item.str).join(' ');
            descriptions[cell.id]=(descriptions[cell.id]||'')+' '+text;
          }
        }
        const result={pages:doc.numPages,content:parts.join(' '),allPages:parts,descriptions};
        await doc.destroy();return result;
      },{data:pdf.toString('base64'),cells});
      assert.equal(parsed.pages,pages,'printed pagination and real PDF page count');
      assert.ok(parsed.allPages.every(pageText=>pageText.trim().length>0),'no blank PDF pages');
      const pdfText=normalize(parsed.content).replace(/\s+/g,'');
      assert.ok(pdfText.includes(number),'PDF has correct document reference');
      assert.ok(pdfText.includes(total),'PDF has accurate total');
      assert.ok(!pdfText.includes('QA-APP-CONTROL-LEAK'),'application controls excluded');
      if(long&&language==='en')for(let n=1;n<=40;n++){const marker='PO-LINE-'+String(n).padStart(3,'0');assert.equal(pdfText.split(marker).length-1,1,'PDF preserves line exactly once: '+marker);}
      if(long){
        const compact=value=>normalize(value).replace(/\s+/g,'');
        for(let i=0;i<descriptions.length;i++){
          const actual=compact(parsed.descriptions['po-long-'+i]||''),expected=compact(descriptions[i]);
          if(language==='en')assert.equal(actual,expected,'complete English description including continuation fragments');
          else{
            // Arabic PDF extraction may reverse visual runs. Compare exact
            // glyph inventories within this item's description cells only.
            assert.equal(actual.split(String(i+1).padStart(3,'0')).length-1,1,'Arabic item reference appears once in its description');
            const glyphs=value=>[...value.replace(/[^\u0600-\u06ff]/g,'')].sort().join('');
            assert.equal(glyphs(actual),glyphs(expected),'complete Arabic description including continuation fragments');
          }
        }
      }
      if(language==='en'){assert.ok(pdfText.includes(invoice?'AtlasSyntheticCustomer':'AtlasSupplier'),'PDF preserves correct party identity');if(invoice)assert.ok(pdfText.includes(state.companyName.replace(/\s+/g,'')),'PDF preserves invoice issuer');}
    }
    assert.equal(await page.evaluate(()=>window.qaSourceSnapshot()),source,'printing must never mutate the source document');
    assert.deepEqual(errors,[],'browser errors');
    console.log('PASS issued '+kind+' '+engine+' '+language+' '+template+(long?' long '+logo:''));
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exit(1);});
