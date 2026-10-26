/* LOUREX FINANCE / Alif axis 31.
 * Exercise generated PDF + mock Web Share File on real WebKit in iPhone touch mode.
 * Native Safari PDF viewer / iOS Files app still require a physical phone.
 * No production data and no production code changes. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/document-design-final-deep';
mkdirSync(out,{recursive:true});
const cases=[
  {financial:'invoice-en',number:'INV-QA-2026-0046',arabic:false},
  {financial:'invoice-ar',number:'INV-QA-2026-0046',arabic:true},
  {financial:'credit-bilingual',number:'CN-QA-2026-0046',arabic:true}
];
const userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const normalize=text=>String(text).replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-0x660))
  .replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-0x6f0)).replace(/[,٬\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');

(async()=>{
  const browser=await webkit.launch({headless:true});
  const results=[];
  try{
    for(const scenario of cases){
      const context=await browser.newContext({
        viewport:{width:390,height:844},deviceScaleFactor:2,
        userAgent,isMobile:true,hasTouch:true,acceptDownloads:true
      });
      await context.addInitScript(()=>{
        try{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=> 'iPhone'});}catch{}
        try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{configurable:true,get:()=>5});}catch{}
        Object.defineProperty(navigator,'canShare',{configurable:true,value:arg=>Array.isArray(arg?.files)&&arg.files.every(f=>f.type==='application/pdf')});
        Object.defineProperty(navigator,'share',{configurable:true,value:async arg=>{
          if(!arg||arg.files?.length!==1)throw Error('Expected one generated PDF File');
          const file=arg.files[0];
          const bytes=new Uint8Array(await file.arrayBuffer());
          window.__qaShareFile=file;
          window.__qaShared={
            name:file.name,type:file.type,size:file.size,header:String.fromCharCode(...bytes.slice(0,5))
          };
        }});
      });
      try{
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.setDefaultTimeout(25000);
        await page.goto('http://127.0.0.1:4173/tests/visual/v542-pagination-parity.html?financial='+scenario.financial,{waitUntil:'networkidle'});
        await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
        await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages')].length===2&&[...document.querySelectorAll('.mobile-preview-stage .invoice-pages,.print-portal .invoice-pages')].every(el=>el.dataset.paginationReady==='true'));

        const metrics=await page.evaluate(()=>({width:innerWidth,userAgent:navigator.userAgent,touches:navigator.maxTouchPoints,
          preview:document.querySelectorAll('.mobile-preview-stage .invoice-page').length,
          pages:document.querySelectorAll('.print-portal .invoice-page').length}));
        assert.equal(metrics.width,390);
        assert.ok(metrics.userAgent.includes('iPhone')&&metrics.touches>0);
        assert.equal(metrics.pages,metrics.preview);
        assert.equal(metrics.pages,1);
        const before=await page.locator('.print-portal').innerText();
        assert.ok(before.includes(scenario.number));

        assert.equal(await page.evaluate(()=>window.__LOUREX_PREPARE_PDF__('pdf')),true);
        const primary=page.locator('.lourex-ios-output-primary[href^="blob:"]');
        await primary.waitFor({state:'attached'});
        const downloadName=await primary.getAttribute('download');
        const href=await primary.getAttribute('href');
        assert.ok(downloadName?.endsWith('.pdf'));
        assert.ok(href?.startsWith('blob:'));
        assert.equal(await page.locator('.lourex-ios-output-secondary[href^="blob:"][type="application/pdf"]').count(),1,
          'iPhone must provide an independent Open PDF action');
        const read=await page.evaluate(async url=>{
          const resp=await fetch(url);
          if(!resp.ok)throw Error('PDF URL not fetchable for reopening');
          const bytes=new Uint8Array(await resp.arrayBuffer());
          const pdfjs=await import('/dist/vendor/pdf.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
          const file=await pdfjs.getDocument({data:bytes.slice()}).promise;
          const pages=file.numPages,parts=[];
          for(let index=1;index<=pages;index++){
            const p=await file.getPage(index);
            const content=await p.getTextContent();
            parts.push(content.items.map(x=>x.str||'').join(' '));
          }
          await file.destroy();
          return {bytes:bytes.length,pages,header:String.fromCharCode(...bytes.slice(0,5)),text:parts.join(' ')};
        },href);
        assert.equal(read.header,'%PDF-');
        assert.ok(read.bytes>10000);
        assert.equal(read.pages,metrics.pages);
        const text=normalize(read.text);
        assert.ok(text.includes(scenario.number),'reopened PDF text preserves invoice/credit number');
        assert.ok(text.includes('206896.50'),'reopened PDF preserves exactly calculated gross amount');
        assert.ok(text.includes('26986.50'),'reopened PDF preserves output VAT amount');
        if(scenario.arabic)assert.match(text,/[\u0600-\u06ff]/,'reopened PDF retains searchable Arabic glyphs');
        if(scenario.financial==='credit-bilingual')assert.ok(text.includes('INV-QA-2026-0046'),'credit-note PDF preserves source invoice');

        await page.screenshot({path:out+'/axis31-iphone-'+scenario.financial+'-pdf.png',fullPage:false,animations:'disabled'});
        await page.locator('.lourex-ios-output-cancel').click();
        assert.equal(await page.evaluate(()=>window.__LOUREX_PREPARE_PDF__('share')),true);
        const shareButton=page.locator('button.lourex-ios-output-primary');
        await shareButton.waitFor({state:'attached'});
        await shareButton.click();
        await page.waitForFunction(()=>Boolean(window.__qaShared));
        const shared=await page.evaluate(()=>window.__qaShared);
        assert.equal(shared.type,'application/pdf');
        assert.equal(shared.header,'%PDF-');
        assert.ok(shared.size>10000);
        assert.ok(shared.name.endsWith('.pdf'));
        const shareReopen=await page.evaluate(async()=>{
          const bytes=new Uint8Array(await window.__qaShareFile.arrayBuffer());
          const pdfjs=await import('/dist/vendor/pdf.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
          const pdf=await pdfjs.getDocument({data:bytes.slice()}).promise;
          const first=await pdf.getPage(1);
          const text=(await first.getTextContent()).items.map(x=>x.str||'').join(' ');
          const pages=pdf.numPages;await pdf.destroy();
          return {pages,text};
        });
        assert.equal(shareReopen.pages,1);
        assert.ok(normalize(shareReopen.text).includes(scenario.number),'shared PDF file is reopenable and retains its record ID');
        assert.equal(await page.locator('.print-portal').innerText(),before,'PDF output does not alter financial source');
        assert.deepEqual(errors,[]);
        results.push({financial:scenario.financial,pass:true,pages:read.pages,bytes:read.bytes,sharedBytes:shared.size});
        console.log('PASS WebKit iPhone finance PDF download/reopen/share '+scenario.financial);
      }finally{await context.close();}
    }
  }finally{await browser.close();}
  assert.equal(results.length,3);
  writeFileSync(out+'/axis31-iphone-financial-pdf.json',JSON.stringify({cases:results.length,failures:0,results},null,2));
  console.log(JSON.stringify({suite:'Alif 31 iPhone financial PDF',cases:results.length,failures:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
