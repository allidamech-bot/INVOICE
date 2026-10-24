/* Actual App.requestPrint -> portal -> native A4 PDF, using a completely
 * synthetic saved final document. No production sign-in or real finance data. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/long-app-print-entry';
mkdirSync(out,{recursive:true});
const compact=value=>String(value).normalize('NFKC').replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g,'');
const cases=[
 {kind:'invoice',template:'obsidian'},
 {kind:'purchase-order',template:'minimal'}
];
(async()=>{
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const lang of ['en','ar'])for(const scenario of cases){
    const page=await browser.newPage({viewport:{width:lang==='ar'?390:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const search=new URLSearchParams({lang,kind:scenario.kind,template:scenario.template});
    await page.goto('http://127.0.0.1:4173/tests/visual/long-document-app-print-entry.html?'+search);
    try{await page.waitForFunction(()=>window.qaReady===true,null,{timeout:12000});}
    catch(error){
     const debug=await page.evaluate(()=>({ready:window.qaReady,htmlLang:document.documentElement.lang,docState:document.readyState,rendered:document.body?.innerText?.slice(0,300),errors:window.qaErrors}));
     console.error('APP_LONG_PRINT_BOOT_DIAG',JSON.stringify({engine,lang,kind:scenario.kind,errors,debug}));
     throw error;
    }
    const before=await page.evaluate(()=>window.qaSourceSnapshot());
    const doc=JSON.parse(before);
    const amount=await page.evaluate(()=>window.qaTotal);
    assert.equal(amount,'440.00','fixture independently fixes 40 x 10 plus 10% tax');
    assert.equal(doc.items.length,40);
    assert.equal(doc.status,'final');
    assert.equal(doc.appearance.templateId,scenario.template);
    const printed=await page.evaluate(async()=>{await window.qaNormalOutput('print');return{prints:window.qaPrints.length,errors:window.qaErrors};});
    assert.equal(printed.prints,1,'real App output action must issue exactly one native print');
    assert.deepEqual(printed.errors,[],'App must not report an output error');
    await page.emulateMedia({media:'print'});
    await page.waitForFunction(()=>document.querySelector('.print-portal .invoice-pages')?.dataset.paginationReady==='true',null,{timeout:25000});
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.print-portal img')].map(img=>img.decode().catch(()=>{})));});
    const root=page.locator('.print-portal .invoice-pages');
    const pages=await root.locator('.invoice-page').count();
    assert.ok(pages>1&&pages<30,'long App output requires A4 continuation');
    assert.equal(await root.locator('.invoice-page:not(.template-'+scenario.template+')').count(),0,'every page uses actual saved template');
    const text=compact(await root.innerText());
    assert.ok(text.includes(doc.number),'document number present');
    assert.ok(text.includes(amount),'exact financial total present');
    for(let i=1;i<=40;i++){
     const marker=(lang==='ar'?'بند':'LONG-ITEM-')+String(i).padStart(3,'0');
     assert.equal(text.split(marker).length-1,1,'each issued line appears once in the real App portal: '+marker);
    }
    if(engine==='chromium'){
     const bytes=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'0',bottom:'0',left:'0',right:'0'}});
     assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
     writeFileSync(out+'/'+scenario.kind+'-'+lang+'.pdf',bytes);
     const result=await page.evaluate(async payload=>{
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const doc=await pdfjs.getDocument({data:Uint8Array.from(atob(payload),c=>c.charCodeAt(0))}).promise;
      const pageText=[];
      for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),txt=await p.getTextContent();pageText.push(txt.items.map(item=>item.str||'').join(' '));}
      const count=doc.numPages;await doc.destroy();return{count,pageText};
     },bytes.toString('base64'));
     assert.equal(result.count,pages,'native PDF A4 page count matches real App output');
     assert.ok(result.pageText.every(p=>p.trim()),'no blank native PDF pages');
     const pdfText=compact(result.pageText.join(' '));
     assert.ok(pdfText.includes(doc.number),'native PDF references same saved document');
     assert.ok(pdfText.includes(amount),'native PDF retains exact total');
     if(lang==='en')for(let i=1;i<=40;i++){
      const marker='LONG-ITEM-'+String(i).padStart(3,'0');
      assert.equal(pdfText.split(marker).length-1,1,'native PDF retains every English line exactly once: '+marker);
     }
    }
    assert.equal(await page.evaluate(()=>window.qaSourceSnapshot()),before,'App printing cannot mutate original issued document');
    assert.deepEqual(errors,[],'no browser errors during real App print entry');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    console.log('PASS App.requestPrint '+engine+' '+lang+' '+scenario.kind+' '+scenario.template+' pages='+pages);
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
