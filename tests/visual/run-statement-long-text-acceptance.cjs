/* Bounded acceptance for long names and long references in the REAL
   statement print actions, using synthetic accounts only. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/long-statement-text';
mkdirSync(output,{recursive:true});
const compact=value=>String(value).normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g,'');
const refCount=(text,ref)=>compact(text).split(compact(ref)).length-1;
const cases=[
 {name:'customer',url:'obsidian-financial.html?screen=receivables',selector:'.customer-statement-print',table:'.statement-table tbody tr',search:'.ta-account-controls input',item:'.ta-account-row',button:/^(Statement|كشف حساب)$/,rows:40},
 {name:'supplier',url:'supplier-statement-print.html?',selector:'.lx-supplier-statement',table:'.ta-table tbody tr',search:'.lx-payables-search input',item:'.lx-payables-row:not(.is-head)',button:/^(Statement|الكشف)$/,rows:100}
];
(async()=>{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   for(const lang of ['en','ar'])for(const cfg of cases){
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__statementPrints=0;window.print=()=>{window.__statementPrints++;};});
    await page.goto('http://127.0.0.1:4173/tests/visual/'+cfg.url+'&lang='+lang+'&statementRows='+cfg.rows+'&extremeText=1');
    await page.locator(cfg.item).first().waitFor();
    const before=await page.evaluate(()=>window.financialSourceSnapshot());
    const data=JSON.parse(before);
    const first=cfg.name==='customer'?data.documents.find(x=>x.id==='inv-usd-a'):data.purchases.find(x=>x.id==='qa-purchase-atlas');
    const receipt=cfg.name==='customer'?data.payments.find(x=>x.id==='pay-usd-1'):data.supplierPayments.find(x=>x.id==='qa-supplier-payment');
    const name=cfg.name==='customer'?first.customerSnapshot['companyName'+(lang==='ar'?'Ar':'En')]:first.supplierSnapshot['name'+(lang==='ar'?'Ar':'En')];
    assert.ok(name.length>100,'long selected party identity fixture');
    assert.ok(first.number.length>55,'long final financial document reference fixture');
    assert.ok(receipt.reference.length>40,'long receipt/payment reference fixture');
    await page.locator(cfg.search).fill('Atlas');
    const target=page.locator(cfg.item).first();
    await target.getByRole('button',{name:cfg.button}).click();
    const print=page.locator(cfg.selector);await print.waitFor();
    assert.equal(await print.locator(cfg.table).count(),cfg.rows+1,'all statement financial rows and partial payment');
    const screen=compact(await print.innerText());
    assert.ok(screen.includes(compact(name)),'full extreme '+lang+' party identity in DOM');
    assert.ok(screen.includes(compact(first.number)),'full long financial document reference in DOM');
    assert.ok(screen.includes(compact(receipt.reference)),'full long payment reference in DOM');
    await (cfg.name==='customer'
      ?page.locator('.statement-output-toolbar').getByRole('button')
      :page.locator('.modal-footer').getByRole('button',{name:/^(Print \/ Save PDF|طباعة \/ حفظ PDF)$/})
    ).click();
    await page.waitForFunction(()=>window.__statementPrints===1);
    const css=cfg.name==='customer'?'printing-customer-statement':'printing-supplier-statement';
    assert.ok(await page.evaluate(css=>document.body.classList.contains(css),css),'real statement print mode activated');
    await page.emulateMedia({media:'print'});
    assert.ok(await print.isVisible(),'real statement content visible in print');
    const visible=await print.evaluate(el=>{
     const r=el.getBoundingClientRect();
     return {width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
    });
    assert.ok(visible.width>0&&visible.height>0,'nonempty print panel');
    if(engine==='chromium'){
     const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
     assert.equal(pdf.subarray(0,5).toString(),'%PDF-','valid native PDF');
     writeFileSync(output+'/'+cfg.name+'-'+lang+'.pdf',pdf);
     const pdfResult=await page.evaluate(async data=>{
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const d=await pdfjs.getDocument({data:Uint8Array.from(atob(data),x=>x.charCodeAt(0))}).promise,items=[];
      for(let n=1;n<=d.numPages;n++){
       const p=await d.getPage(n),text=await p.getTextContent();
       items.push(text.items.map(x=>x.str||'').join(' '));
      }
      const r={pages:d.numPages,items};await d.destroy();return r;
     },pdf.toString('base64'));
     assert.ok(pdfResult.pages>1,'multi-page native statement');
     assert.ok(pdfResult.items.every(t=>t.trim()),'no blank PDF pages');
     const full=compact(pdfResult.items.join(' '));
     assert.equal(refCount(full,first.number),2,'long financial reference retained in document row and linked payment source');
     assert.equal(refCount(full,receipt.reference),1,'long payment reference preserved exactly once');
     assert.ok(full.includes(cfg.name==='customer'?'99300.00':'114650.00'),'exact closing balance in PDF');
     // Native Arabic text can use visual-order presentation forms; the full
     // long Arabic identity is checked above in the real printable DOM.
     if(lang==='en')assert.ok(full.includes(compact(name)),'full long English party name in native PDF');
     for(let n=2;n<=cfg.rows;n++){
      const regular=(cfg.name==='customer'?'INV-QA-':'PUR-QA-')+String(n).padStart(3,'0');
      assert.equal(refCount(full,regular),1,'every financial row printed once '+regular);
     }
     assert.ok(!full.includes('Review&exportstatement')&&!full.includes('RecordSupplierPayment'),'no print controls in PDF');
    }
    assert.equal(await page.evaluate(()=>window.financialSourceSnapshot()),before,'no account/payment mutations from preview or print');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.evaluate(css=>document.body.classList.contains(css),css),false,'print mode released on afterprint');
    assert.deepEqual(errors,[],'no browser errors');
    console.log('PASS extreme statement '+engine+' '+lang+' '+cfg.name);
    await page.close();
   }
  }finally{await browser.close();}
 }
})().catch(err=>{console.error(err);process.exit(1);});
