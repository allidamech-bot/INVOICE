/* LOUREX Alif axis 33: long (50-row) RTL/LTR financial PDFs through the
 * real iPhone Safari PDF bridge, using synthetic issued documents only.
 * Playwright WebKit emulation is not physical iPhone Safari acceptance. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/finance-iphone-rtl-long-axis33';
mkdirSync(out,{recursive:true});
const cases=[
  {lang:'en',financial:'invoice-en',width:390,arabic:false,number:'INV-QA-2026-0046'},
  {lang:'ar',financial:'invoice-ar',width:320,arabic:true,number:'INV-QA-2026-0046'},
  {lang:'ar',financial:'credit-bilingual',width:390,arabic:true,bilingual:true,number:'CN-QA-2026-0046'}
];
const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const clean=s=>String(s).normalize('NFKC').replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-0x660))
 .replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-0x6f0))
 .replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g,'').replace(/٫/g,'.');
(async()=>{
 const browser=await webkit.launch({headless:true});
 const results=[];
 try{
  for(const cfg of cases){
   const context=await browser.newContext({viewport:{width:cfg.width,height:844},
     userAgent:ua,isMobile:true,hasTouch:true,deviceScaleFactor:2});
   await context.addInitScript(()=>{
     try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
     try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
   });
   try{
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.setDefaultTimeout(60000);
    const url=new URL('http://127.0.0.1:4173/tests/visual/v542-pagination-parity.html');
    url.search=new URLSearchParams({financial:cfg.financial,rows:'50',lang:cfg.lang}).toString();
    await page.goto(url.toString(),{waitUntil:'load'});
    if(cfg.width!==390)await page.addStyleTag({content:
      '.qa-phone,.qa-phone .mobile-preview-stage{width:'+cfg.width+'px!important;max-width:'+cfg.width+'px!important;}'});
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages')].length===2&&[...document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages')].every(e=>e.dataset.paginationReady==='true'),{timeout:90000});
    await page.evaluate(async()=>{await document.fonts?.ready;});
    const result=await page.evaluate(()=>{
      const all=[...document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages')];
      return {viewport:innerWidth,lang:document.documentElement.lang,dir:document.documentElement.dir,
        preview:all[0]?.querySelectorAll('.invoice-page').length||0,
        output:all[1]?.querySelectorAll('.invoice-page').length||0,
        classes:[...all[1].querySelectorAll('.invoice-page')].map(p=>p.className),
        ids:[...all[1].querySelectorAll('tbody tr[data-source-item-id]')]
          .filter(r=>r.dataset.sourceFragment==='0')
          .map(r=>r.dataset.sourceItemId),
        text:all[1]?.textContent||'',
        emptyPages:[...all[1].querySelectorAll('.invoice-page')].filter(p=>!p.textContent.trim()).length,
        horizontalOverflow:[...all[1].querySelectorAll('.invoice-page')].some(p=>p.scrollWidth>p.clientWidth+3)
      };
    });
    assert.equal(result.viewport,cfg.width);
    assert.equal(result.dir,cfg.lang==='ar'?'rtl':'ltr');
    assert.ok(result.preview>1&&result.preview<=30,'50 financial rows must paginate in iPhone preview');
    assert.equal(result.output,result.preview,'preview/print page count must match');
    assert.equal(result.emptyPages,0,'no blank financial document pages');
    assert.equal(result.horizontalOverflow,false,'A4 page content must not clip horizontally');
    assert.equal(result.ids.length,50,'all 50 original stock/service item rows survive');
    assert.equal(new Set(result.ids).size,50,'no duplicate items in paginated output');
    for(let index=1;index<=50;index++)assert.ok(result.ids.includes('qa-item-'+String(index).padStart(3,'0')),
      'missing numbered source item '+index);
    if(cfg.bilingual)assert.ok(result.classes.every(x=>x.includes('lang-bilingual')),'all pages retain RTL/LTR bilingual styling');
    else assert.ok(result.classes.every(x=>x.includes('lang-'+cfg.lang)),'language class must persist across every A4 page');
    const visible=clean(result.text);
    assert.ok(visible.includes(cfg.number));
    assert.ok(visible.includes('362.25'),'correct discounted + VAT total in long document');
    if(cfg.arabic)assert.ok(visible.includes('الصنفرقم050'),'final Arabic item must survive page splits');
    if(cfg.financial==='invoice-en')assert.ok(visible.includes('Verifiedproduct050'),'final English item must survive page splits');

    await page.evaluate(()=>window.__LOUREX_PREPARE_PDF__('pdf'));
    const download=page.locator('.lourex-ios-output-primary[href^="blob:"]');
    await download.waitFor({state:'attached',timeout:90000});
    const urlBlob=await download.getAttribute('href');
    const artifact=await page.evaluate(async href=>{
      const response=await fetch(href);
      if(!response.ok)throw Error('Exported PDF cannot be reopened');
      const bytes=new Uint8Array(await response.arrayBuffer());
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const pdf=await pdfjs.getDocument({data:bytes.slice()}).promise;
      const pageTexts=[];
      for(let index=1;index<=pdf.numPages;index++){
        const page=await pdf.getPage(index);
        const content=await page.getTextContent();
        pageTexts.push(content.items.map(x=>x.str||'').join(' '));
      }
      const pages=pdf.numPages;await pdf.destroy();
      return {bytes:bytes.length,header:String.fromCharCode(...bytes.slice(0,5)),pages,pageTexts};
    },urlBlob);
    assert.equal(artifact.header,'%PDF-');
    assert.ok(artifact.bytes>20000);
    assert.equal(artifact.pages,result.output,'exported iPhone PDF pages equal display and print A4 pages');
    assert.equal(artifact.pageTexts.filter(t=>t.trim()).length,artifact.pages,'no blank downloaded pages');
    const searchable=clean(artifact.pageTexts.join(' '));
    assert.ok(searchable.includes(cfg.number),'searchable PDF retains original document number');
    assert.ok(searchable.includes('362.25'),'searchable PDF retains grand total');
    if(cfg.arabic)assert.match(searchable,/[\u0600-\u06ff]/,'downloaded PDF needs readable Arabic text layer');
    if(cfg.bilingual){
      assert.ok(searchable.includes('Verifiedproduct001'),'first Latin line present');
      assert.ok(searchable.includes('الصنفرقم001'),'first Arabic line present');
    }
    assert.deepEqual(errors,[],'iPhone WebKit browser errors');
    await page.screenshot({path:out+'/'+cfg.financial+'-'+cfg.width+'.png',fullPage:false,animations:'disabled'});
    results.push({financial:cfg.financial,viewport:cfg.width,pages:artifact.pages,bytes:artifact.bytes,rows:result.ids.length,pass:true});
    console.log('PASS iPhone WebKit 50-line RTL/LTR PDF '+cfg.financial+' pages='+artifact.pages);
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 assert.equal(results.length,cases.length);
 writeFileSync(out+'/results.json',JSON.stringify({cases:results.length,failures:0,results},null,2));
 console.log(JSON.stringify({suite:'LOUREX axis33 iPhone 50-line PDF RTL/LTR',cases:results.length,failures:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
