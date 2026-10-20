const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/customer-statement-print';
mkdirSync(output,{recursive:true});
const normalize=value=>value.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/٫/g,'.');
(async()=>{
 const results=[];
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   for(const lang of ['en','ar'])for(const statementRows of [1,40]){
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];
    const amounts=statementRows===1?['2500.00','700.00','1800.00']:['100000.00','700.00','99300.00'];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.addInitScript(()=>{window.__statementPrints=0;window.print=()=>{window.__statementPrints++;};});
    await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-financial.html?screen=receivables&lang='+lang+'&statementRows='+statementRows);
    await page.locator('.ta-account-row').first().waitFor();
    const source=await page.evaluate(()=>window.financialSourceSnapshot());
    await page.locator('.ta-account-controls input').fill('Atlas');
    const account=page.locator('.ta-account-row');
    assert.equal(await account.count(),1);
    await account.getByRole('button',{name:/^(Statement|كشف حساب)$/}).click();
    const statement=page.locator('.customer-statement-print');
    await statement.waitFor();
    assert.equal(await statement.locator('.statement-table tbody tr').count(),statementRows+1,'invoice and partial receipt appear exactly once');
    const screenText=normalize(await statement.innerText());
    assert.ok(screenText.includes(lang==='ar'?'أطلس للتجارة':'Atlas Trading'),'full customer identity in printable DOM');
    assert.ok(screenText.includes(lang==='ar'?'لوركس للتجارة':'LOUREX Trading'),'full company identity in printable DOM');
    for(const amount of amounts)assert.ok(screenText.includes(amount),'statement amount '+amount);
    const references=await statement.locator('.statement-table tbody tr td:nth-child(2)').allTextContents();
    assert.match(references[0],/INV-\d{4}-0001/);
    assert.equal(references.filter(value=>value.includes('pay-usd-1')).length,1,'payment appears once');
    await page.locator('.statement-output-toolbar').getByRole('button').click();
    await page.waitForFunction(()=>window.__statementPrints===1);
    assert.ok(await page.evaluate(()=>document.body.classList.contains('printing-customer-statement')));
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.statement-output-toolbar').isVisible(),false,'print controls excluded');
    assert.ok(await statement.isVisible(),'statement must remain visible for print');
    await statement.screenshot({path:output+'/'+engine+'-'+lang+'-'+statementRows+'-print.png'});
    if(engine==='chromium'){
     const bytes=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
     writeFileSync(output+'/'+engine+'-'+lang+'-'+statementRows+'.pdf',bytes);
     const parsed=await page.evaluate(async base64=>{
      const pdfjs=await import('/dist/vendor/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
      const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}).promise;
      const pages=[];
      for(let index=1;index<=pdf.numPages;index++){
       const page=await pdf.getPage(index),content=await page.getTextContent();
       pages.push(content.items.map(item=>item.str||'').join(' '));
      }
      const result={count:pdf.numPages,text:pages.join(' '),pages};
      await pdf.destroy();return result;
     },bytes.toString('base64'));
     if(statementRows===1)assert.equal(parsed.count,1,'short customer statement must print on one page');
     else assert.ok(parsed.count>1,'long statement must exercise multiple physical pages');
     assert.ok(parsed.pages.every(text=>text.trim().length>0),'no blank printed pages');
     const text=normalize(parsed.text);
     for(const amount of amounts)assert.ok(text.includes(amount),'printed amount '+amount);
     assert.match(text,/pay-usd-1/,'printed receipt reference');
     assert.equal((text.match(/INV-\d{4}-0001/g)||[]).length,2,'invoice reference once in invoice row and once as receipt source');
     for(let index=2;index<=statementRows;index++){
      const reference='INV-QA-'+String(index).padStart(3,'0');
      const matches=normalize(parsed.text).replace(/\s/g,'').split(reference).length-1;
      assert.equal(matches,1,'missing or duplicated statement row '+reference);
     }
     // Full identities are checked in the printable DOM above. Native PDF Arabic
     // glyph runs split/reorder the generic trading suffix; retain exact unique names.
     const compact=text.replace(/\s/g,'');
     const hasIdentity=expected=>{
      const logical=expected.replace(/\s/g,'');
      return compact.includes(logical)||compact.includes([...logical].reverse().join(''));
     };
     assert.ok(hasIdentity(lang==='ar'?'أطلس':'Atlas Trading'),'printed customer identity: '+text);
     assert.ok(hasIdentity(lang==='ar'?'لوركس':'LOUREX Trading'),'printed company identity: '+text);
     assert.doesNotMatch(text,/Cedar|Harbor|pay-eur-1|pay-usd-2/,'unrelated customer history excluded');
     assert.doesNotMatch(text,/Review & export statement|Customer Accounts|Record Payment|مراجعة وتصدير كشف الحساب|حسابات العملاء|تسجيل دفعة/,'application controls must not leak into print');
     writeFileSync(output+'/'+engine+'-'+lang+'-'+statementRows+'-text.txt',parsed.text);
    }
    assert.equal(await page.evaluate(()=>window.financialSourceSnapshot()),source,'printing cannot mutate invoice or receipt');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-customer-statement')),false,'print state cleaned after dialog closes');
    assert.deepEqual(errors,[],engine+'/'+lang+' browser errors');
    results.push({engine,lang,statementRows,pdf:engine==='chromium'});
    await page.close();
   }
  }finally{await browser.close();}
 }
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
 console.log('Customer statement print passed: 8 short/long browser-language cases, including 4 parsed native PDFs.');
})().catch(error=>{console.error(error);process.exit(1);});
