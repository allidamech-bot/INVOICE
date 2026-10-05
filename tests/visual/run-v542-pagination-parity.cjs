const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');

const url='http://127.0.0.1:4173/tests/visual/v542-pagination-parity.html';
const output=path.resolve('visual-qa-output/document-design-final-deep');
mkdirSync(output,{recursive:true});

async function inspect(type,name){
  const browser=await type.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(url,{waitUntil:'networkidle'});
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
      return{bytes:bytes.length,pageObjects:(text.match(/\/Type\s*\/Page\b/g)||[]).length,hasSingleCount:/\/Count\s+1\b/.test(text)};
    },href);
    assert.ok(pdfArtifact.bytes>10000,`${name}: generated PDF blob is unexpectedly small (${pdfArtifact.bytes} bytes)`);
    assert.equal(pdfArtifact.pageObjects,1,`${name}: downloaded PDF blob contains ${pdfArtifact.pageObjects} physical pages`);
    assert.equal(pdfArtifact.hasSingleCount,true,`${name}: downloaded PDF page tree does not report Count 1`);
    const cancel=page.locator('.lourex-ios-output-cancel');if(await cancel.count())await cancel.last().click();

    await page.locator('.mobile-preview-stage .invoice-page').first().screenshot({path:path.join(output,`v542-${name}-preview.png`)});
    await page.evaluate(()=>{const portal=document.querySelector('.print-portal');if(portal instanceof HTMLElement){portal.style.left='0';portal.style.top='0';portal.style.zIndex='999';}});
    await page.locator('.print-portal .invoice-page').first().screenshot({path:path.join(output,`v542-${name}-pdf-source.png`)});
    return{name,...metrics,pdfBytes:pdfArtifact.bytes,pdfPages:pdfArtifact.pageObjects};
  }finally{await browser.close();}
}

(async()=>{
  const results=[];
  results.push(await inspect(chromium,'chromium-iphone390'));
  results.push(await inspect(webkit,'webkit-iphone390'));
  writeFileSync(path.join(output,'v542-pagination-parity.json'),JSON.stringify({results},null,2));
  console.log('v542 preview/PDF pagination parity plus downloaded PDF page-count validation passed for Chromium + WebKit.');
})().catch(error=>{console.error(error);process.exit(1);});
