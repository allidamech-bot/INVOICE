const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {exportQuotationPdf}=require('./quotation-pdf-pixels.cjs');
const root=path.resolve(__dirname,'../..');
const output='/tmp/lourex-arabic-item-description-fallback.pdf';
const names=['Valve 1/2 inch','PVC Pipe 20mm','Steel Elbow 90 Degree','Brass Connector 3/4 inch','Industrial Gasket Set','Packing Tape 48mm'];
const engines=(process.env.LOUREX_TEMPLATE_ENGINES||'chromium,webkit').split(',');

async function routeAssets(page){
  await page.route('http://lourex.test/**',async route=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
    if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
    try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
}
async function open(page,params){
  await page.goto('http://lourex.test/tests/visual/template-visual-qa.html?'+new URLSearchParams({template:'executive',profile:'showcase',mode:'print',...params}),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('.invoice-pages')?.dataset.paginationReady==='true');
  await page.evaluate(()=>document.fonts.ready);
}
async function inspectItems(page){
  return page.evaluate(()=>({
    direction:document.querySelector('.invoice-page')?.getAttribute('dir'),
    pageCount:document.querySelectorAll('.invoice-page').length,
    total:document.querySelector('.grand-total strong')?.textContent?.trim(),
    rows:[...document.querySelectorAll('tr[data-source-fragment="0"]')].map(row=>({
      description:row.querySelector('.description-cell')?.innerText.trim(),
      englishFallback:!!row.querySelector('.description-cell .bidi-en[lang="en"][dir="ltr"]'),
      arabic:!!row.querySelector('.description-cell .bidi-ar[lang="ar"][dir="rtl"]'),
      quantity:row.querySelector('.quantity-cell')?.textContent.trim(),
      price:row.querySelector('.money-cell:not(.strong)')?.textContent.trim()
    })),
    descriptions:[...document.querySelectorAll('.description-cell')].map(cell=>cell.innerText.trim())
  }));
}
(async()=>{
  for(const engine of engines){
    const browser=await({chromium,webkit})[engine].launch({headless:true,...(engine==='chromium'&&process.env.LOUREX_CHROMIUM_EXECUTABLE?{executablePath:process.env.LOUREX_CHROMIUM_EXECUTABLE}:{}),...(engine==='webkit'&&process.env.LOUREX_WEBKIT_EXECUTABLE?{executablePath:process.env.LOUREX_WEBKIT_EXECUTABLE}:{})});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:1400}});await routeAssets(page);
      await open(page,{language:'ar',descriptionScenario:'six-english-only',documentStatus:'draft',qr:'true'});
      let actual=await inspectItems(page);
      assert.equal(actual.direction,'rtl',`${engine}: document direction`);
      assert.equal(actual.rows.length,6,`${engine}: six quotation items`);
      assert.deepEqual(actual.rows.map(row=>row.description),names,`${engine}: original English item names in the unsaved Arabic preview`);
      assert.ok(actual.rows.every(row=>row.englishFallback&&!row.arabic),`${engine}: fallback text is isolated LTR`);
      assert.deepEqual(actual.rows.map(row=>row.quantity),['3','10','5','12','4','6']);
      assert.deepEqual(actual.rows.map(row=>row.price),['12','8.50','24','7','32.50','18']);
      assert.ok(actual.total.startsWith('563.00'),`${engine}: total (${actual.total})`);
      assert.ok(actual.rows.every(row=>row.description!=='–'&&row.description!=='—'),`${engine}: no empty-name dash`);

      await open(page,{language:'ar',descriptionScenario:'arabic-only'});
      actual=await inspectItems(page);assert.equal(actual.rows[0].description,'صمام صناعي');assert.ok(actual.rows[0].arabic);
      await open(page,{language:'ar',descriptionScenario:'both-languages'});
      actual=await inspectItems(page);assert.equal(actual.rows[0].description,'وصلة نحاسية ٣/٤ بوصة');assert.ok(actual.rows[0].arabic);
      await open(page,{language:'en',descriptionScenario:'both-languages'});
      actual=await inspectItems(page);assert.equal(actual.rows[0].description,'Brass Connector 3/4 inch');assert.ok(actual.rows[0].englishFallback);
      await open(page,{language:'bilingual',descriptionScenario:'both-languages'});
      actual=await inspectItems(page);assert.match(actual.rows[0].description,/Brass Connector 3\/4 inch/);assert.match(actual.rows[0].description,/وصلة نحاسية/);

      await open(page,{language:'ar',descriptionScenario:'six-english-only',documentStatus:'final',qr:'true'});
      const saved=await inspectItems(page);assert.deepEqual(saved.rows.map(row=>row.description),names);
      if(engine==='chromium'){
        await exportQuotationPdf(page,output);
        const pdfText=execFileSync('pdftotext',[output,'-'],{encoding:'utf8'});
        for(const name of names)assert.ok(pdfText.includes(name),`PDF missing ${name}`);
        assert.match(pdfText,/563\.00/);
      }
      await open(page,{language:'ar',descriptionScenario:'long-english-only'});
      actual=await inspectItems(page);
      assert.ok(actual.pageCount>=2,`${engine}: long English fallback reaches a second A4 page (${actual.pageCount})`);
      assert.ok(actual.descriptions[0].startsWith('Industrial valve specification'),`${engine}: long fallback starts intact`);
      assert.ok(actual.descriptions.length>1,`${engine}: long fallback continues through fragments`);
      console.log(`${engine}: Arabic/English/bilingual item descriptions, six-line USD preview and PDF, and long second-page fallback passed`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
