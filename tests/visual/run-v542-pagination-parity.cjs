const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const url='http://127.0.0.1:4173/tests/visual/v542-pagination-parity.html';
const output=path.resolve('visual-qa-output/document-design-final-deep');
mkdirSync(output,{recursive:true});

async function inspect(type,name,financial=''){
  const errors=[];
  const browser=await type.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(url+(financial?'?financial='+financial:''),{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    await page.waitForFunction(()=>{
      const nodes=Array.from(document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages'));
      return nodes.length===2&&nodes.every(node=>node.getAttribute('data-pagination-ready')==='true');
    });
    await page.evaluate(()=>document.fonts?.ready);
    const metrics=await page.evaluate(()=>{
      const previewRoot=document.querySelector('.mobile-preview-stage .invoice-pages');
      const outputRoot=document.querySelector('.print-portal .invoice-pages');
      const previewPages=Array.from(document.querySelectorAll('.mobile-preview-stage .invoice-page'));
      const outputPages=Array.from(document.querySelectorAll('.print-portal .invoice-page'));
      const previewFirst=previewPages[0];
      const outputFirst=outputPages[0];
      const rows=(page)=>page?Array.from(page.querySelectorAll('.items-table tbody tr')).length:0;
      const rect=(page)=>page?.getBoundingClientRect();
      return{
        previewReady:previewRoot?.getAttribute('data-pagination-ready')||'',
        outputReady:outputRoot?.getAttribute('data-pagination-ready')||'',
        previewCount:previewPages.length,
        outputCount:outputPages.length,
        previewRows:previewPages.map(rows),
        outputRows:outputPages.map(rows),
        previewOffsetWidth:previewFirst?.offsetWidth||0,
        outputOffsetWidth:outputFirst?.offsetWidth||0,
        previewOffsetHeight:previewFirst?.offsetHeight||0,
        outputOffsetHeight:outputFirst?.offsetHeight||0,
        previewRenderedWidth:rect(previewFirst)?.width||0,
        outputRenderedWidth:rect(outputFirst)?.width||0,
        previewFinalDetails:Boolean(previewFirst?.querySelector('.final-details')),
        outputFinalDetails:Boolean(outputFirst?.querySelector('.final-details')),
        outputContinuation:outputPages.some(page=>Boolean(page.querySelector('.continuation-header,.continued-label'))),
        outputFooter:outputFirst?.querySelector('.doc-footer')?.textContent||''
      };
    });
    assert.equal(metrics.previewReady,'true',`${name}: preview pagination not ready`);
    assert.equal(metrics.outputReady,'true',`${name}: output pagination not ready`);
    assert.equal(metrics.previewCount,1,`${name}: reported quotation must fit one preview page`);
    assert.equal(metrics.outputCount,metrics.previewCount,`${name}: PDF source page count diverged from preview`);
    assert.deepEqual(metrics.previewRows,[3],`${name}: preview item grouping changed`);
    assert.deepEqual(metrics.outputRows,metrics.previewRows,`${name}: PDF source item grouping diverged`);
    assert.ok(metrics.previewOffsetWidth>780&&metrics.outputOffsetWidth>780,`${name}: A4 layout width collapsed (${metrics.previewOffsetWidth}/${metrics.outputOffsetWidth})`);
    assert.ok(metrics.previewOffsetHeight>1100&&metrics.outputOffsetHeight>1100,`${name}: A4 layout height collapsed (${metrics.previewOffsetHeight}/${metrics.outputOffsetHeight})`);
    assert.ok(metrics.outputRenderedWidth>780,`${name}: output source is still viewport-clamped (${metrics.outputRenderedWidth})`);
    assert.equal(metrics.previewFinalDetails,true,`${name}: preview closing details missing`);
    assert.equal(metrics.outputFinalDetails,true,`${name}: output closing details detached`);
    assert.equal(metrics.outputContinuation,false,`${name}: false continuation page introduced`);
    assert.match(metrics.outputFooter,/1\s*\/\s*1/,`${name}: output footer did not stay 1 / 1`);

    await page.evaluate(()=>{if(typeof window.__LOUREX_PREPARE_PDF__!=='function')throw new Error('PDF bridge was not installed');window.__LOUREX_PREPARE_PDF__('pdf');});
    const pdfLink=page.locator('.lourex-ios-output-primary[href^="blob:"]');
    await pdfLink.waitFor({state:'attached',timeout:20000});
    const href=await pdfLink.getAttribute('href');
    assert.ok(href&&href.startsWith('blob:'),`${name}: PDF bridge did not expose a downloadable blob`);
    const pdfArtifact=await page.evaluate(async blobUrl=>{
      const response=await fetch(blobUrl);const buffer=await response.arrayBuffer();const bytes=new Uint8Array(buffer);let text='';
      for(let offset=0;offset<bytes.length;offset+=0x8000)text+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const pdf=await pdfjs.getDocument({data:bytes.slice()}).promise;
      const first=await pdf.getPage(1);
      const content=await first.getTextContent();
      const searchableText=content.items.map(item=>item.str||'').join(' ');
      const canvas=document.createElement('canvas');canvas.id='qa-downloaded-pdf';
      const viewport=first.getViewport({scale:1});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      document.body.append(canvas);
      await first.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let inkPixels=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]<220||rgba[i+1]<220||rgba[i+2]<220)inkPixels++;
      const base64=btoa(text);
      const parsedPages=pdf.numPages;await pdf.destroy();
      return{bytes:bytes.length,pageObjects:(text.match(/\/Type\s*\/Page\b/g)||[]).length,hasSingleCount:/\/Count\s+1\b/.test(text),parsedPages,searchableText,inkPixels,base64};
    },href);
    assert.ok(pdfArtifact.bytes>10000,`${name}: generated PDF blob is unexpectedly small (${pdfArtifact.bytes} bytes)`);
    assert.equal(pdfArtifact.pageObjects,1,`${name}: downloaded PDF blob contains ${pdfArtifact.pageObjects} physical pages`);
    assert.equal(pdfArtifact.hasSingleCount,true,`${name}: downloaded PDF page tree does not report Count 1`);
    assert.equal(pdfArtifact.parsedPages,1,`${name}: PDF parser found extra pages`);
    assert.ok(pdfArtifact.inkPixels>2000,`${name}: downloaded PDF rendered blank`);
    const normalized=pdfArtifact.searchableText.replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0)).replace(/[,٬\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
    assert.match(normalized,/LOUREX/,`${name}: company identity missing from PDF`);
    if(financial){
      const documentNumber=financial==='credit-bilingual'?'CN-QA-2026-0046':'INV-QA-2026-0046';
      assert.ok(normalized.includes(documentNumber),`${name}: PDF document number missing`);
      assert.ok(normalized.includes('206896.50'),`${name}: PDF total differs from 199900 less 10% discount plus 15% VAT`);
      assert.ok(normalized.includes('26986.50'),`${name}: PDF tax amount missing`);
      if(financial==='credit-bilingual')assert.ok(normalized.includes('INV-QA-2026-0046'),`${name}: credit source reference missing`);
      if(financial!=='invoice-en')assert.match(normalized,/[\u0600-\u06ff]/,`${name}: Arabic searchable text missing`);
    }
    writeFileSync(path.join(output,`v542-${name}.pdf`),Buffer.from(pdfArtifact.base64,'base64'));
    const cancel=page.locator('.lourex-ios-output-cancel');if(await cancel.count())await cancel.last().click();

    await page.locator('.mobile-preview-stage .invoice-page').first().screenshot({path:path.join(output,`v542-${name}-preview.png`)});
    await page.evaluate(()=>{const portal=document.querySelector('.print-portal');if(portal instanceof HTMLElement){portal.style.left='0';portal.style.top='0';portal.style.zIndex='999';}});
    await page.locator('.print-portal .invoice-page').first().screenshot({path:path.join(output,`v542-${name}-pdf-source.png`)});
    await page.locator('#qa-downloaded-pdf').screenshot({path:path.join(output,`v542-${name}-downloaded-pdf.png`)});
    assert.deepEqual(errors,[],`${name}: browser errors`);
    return{name,...metrics,pdfBytes:pdfArtifact.bytes,pdfPages:pdfArtifact.pageObjects};
  }finally{await browser.close();}
}

(async()=>{
  const results=[];
  results.push(await inspect(chromium,'chromium-iphone390'));
  results.push(await inspect(webkit,'webkit-iphone390'));
  for(const financial of ['invoice-en','invoice-ar','credit-bilingual']){
    results.push(await inspect(chromium,'chromium-'+financial,financial));
    results.push(await inspect(webkit,'webkit-'+financial,financial));
  }
  writeFileSync(path.join(output,'v542-pagination-parity.json'),JSON.stringify({results},null,2));
  console.log('v542 preview/PDF parity passed: '+results.length+' downloaded PDFs validated in Chromium + WebKit, including financial totals and references.');
})().catch(error=>{console.error(error);process.exit(1);});
