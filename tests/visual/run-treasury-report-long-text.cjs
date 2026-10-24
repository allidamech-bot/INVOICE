/* Read-only QA: extreme treasury names/references in the existing report fixture.
 * Existing fixture is amended in browser memory only, never in source control. */
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const out='visual-qa-output/treasury-long-text';mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:4173/tests/visual/treasury-report-output.html';
const marker=['COMPANY-END-719','ACCOUNT-END-719','REF-END-719','DESC-END-719'];
const compressed=text=>String(text).normalize('NFKC').replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
const injection=[
 "company.nameEn='Synthetic industrial treasury services for multi-branch financial reconciliation '.repeat(5)+'COMPANY-END-719';",
 "company.nameAr='شركة اختبار تقارير الخزينة المالية للفروع والحسابات التجارية '.repeat(6)+'COMPANY-END-719';",
 "const extremeBank=props.treasuryAccounts.find(a=>a.id==='BANK');",
 "extremeBank.label=(ar?'حساب المصرف المالي التجريبي للتحصيل وإدارة المدفوعات ':'QA industrial treasury account for multi-branch cash reconciliation ').repeat(7)+'ACCOUNT-END-719';",
 "const extremeEntry=props.treasuryEntries.find(e=>e.id==='MOVE-001');",
 "extremeEntry.reference='REF-START-719-'+'ZXQALONG'.repeat(32)+'-REF-END-719';",
 "extremeEntry.notes=(ar?'وصف حركة خزينة صناعية تجريبية تفصيلي للمراجعة المالية ':'Detailed synthetic treasury movement for financial review and audit ').repeat(10)+'DESC-END-719';"
].join('\n');
(async()=>{
 let passed=0,pdfs=0;
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch({headless:true});
  try{
   for(const lang of (process.env.LOUREX_TREASURY_ONE_CASE==='1'?['en']:['en','ar'])){
    const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/tests/visual/treasury-report-output.html*',async route=>{
     const response=await route.fetch(),html=await response.text(),anchor='window.qaSource=()=>JSON.stringify(props);';
     assert.equal(html.split(anchor).length,2,'existing treasury fixture anchor must be unique');
     await route.fulfill({response,body:html.replace(anchor,injection+'\n'+anchor)});
    });
    try{
     await page.goto(url+'?lang='+lang);
     const label=(en,ar)=>lang==='ar'?ar:en;
     await page.getByRole('button',{name:label('Treasury reconciliation report','تقرير مطابقة الخزينة'),exact:true}).click();
     const controls=page.locator('.lx-treasury-report-controls');
     await controls.locator('input[type=date]').nth(0).fill('2026-10-01');
     await controls.locator('input[type=date]').nth(1).fill('2026-10-31');
     const before=await page.evaluate(()=>window.qaSource());
     await page.getByRole('button',{name:label('Generate report','إعداد التقرير'),exact:true}).click();
     const report=page.locator('.lx-treasury-report-output');await report.waitFor();
     const raw=await report.innerText();
     for(const end of marker)assert.ok(raw.includes(end),'report HTML missing exact text ending: '+end);
     assert.equal(await report.locator('[data-movement]').count(),44,'all original ledger movements remain visible');
     assert.ok((await report.locator('[data-account="BANK"] [data-balance="closing"]').innerText()).includes('140.00'),'verified closing balance');

     // Browser download events can be swallowed by WebKit's headless context.
     // Capture the exact CSV Blob and actual filename-bearing anchor click.
     // The established treasury-output suite covers real browser download events.
     await page.evaluate(()=>{
       window.qaTreasuryCsvBlob=null;window.qaTreasuryCsvClicks=0;
       const makeUrl=URL.createObjectURL.bind(URL),originalClick=HTMLAnchorElement.prototype.click;
       URL.createObjectURL=function(blob){window.qaTreasuryCsvBlob=blob;return makeUrl(blob);};
       HTMLAnchorElement.prototype.click=function(...args){
         if(this.download?.startsWith('LOUREX-Treasury-'))window.qaTreasuryCsvClicks++;
         return originalClick.apply(this,args);
       };
     });
     const positions=await page.evaluate(()=>{
       const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export CSV'||b.textContent.trim()==='تصدير CSV');
       const pos=node=>{const r=node.getBoundingClientRect(),st=getComputedStyle(node);return{tag:node.tagName,cls:String(node.className).slice(0,100),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,overflowX:st.overflowX,display:st.display,cssWidth:st.width,minWidth:st.minWidth,maxWidth:st.maxWidth,inlineStyle:node.getAttribute('style')};};
       const ancestor=[];for(let node=button;node;node=node.parentElement)ancestor.push(pos(node));
       const rules=[];
       for(const sheet of document.styleSheets){
         try{for(const rule of sheet.cssRules)if(rule.selectorText?.includes('lx-treasury-report-filters'))rules.push({selector:rule.selectorText,css:rule.style?.cssText?.slice(0,480)});}catch{}
       }
       return{innerWidth,scrollX,documentWidth:document.documentElement.scrollWidth,ancestor:ancestor.slice(0,13),rules:rules.slice(-16)};
     });
     console.log('TREASURY_LONG_TEXT_CSV_MOBILE_GEOMETRY',JSON.stringify({engine,lang,positions}));
     await page.getByRole('button',{name:label('Export CSV','تصدير CSV'),exact:true}).click({timeout:6000});
     const capture=await page.evaluate(async()=>({
       clicks:window.qaTreasuryCsvClicks,
       csv:window.qaTreasuryCsvBlob?await window.qaTreasuryCsvBlob.text():null
     }));
     assert.equal(capture.clicks,1,'CSV output must initiate exactly one named download');
     assert.ok(capture.csv,'actual CSV Blob must be created');
     const csv=capture.csv;
     assert.ok(csv.startsWith('\uFEFF'),'CSV preserves UTF-8 BOM');
     for(const end of marker.filter(x=>x!=='COMPANY-END-719'))assert.ok(csv.includes(end),'CSV missing account/reference/note ending: '+end);
     assert.ok(csv.includes('140.00'),'CSV preserves financial closing balance');

     await page.getByRole('button',{name:label('Print / Save PDF','طباعة / حفظ PDF'),exact:true}).click();
     await page.waitForFunction(()=>window.qaPrintCalls===1);
     await page.setViewportSize({width:794,height:1123});
     await page.emulateMedia({media:'print'});
     await page.evaluate(async()=>{await document.fonts.ready;});
     const overflow=await page.evaluate(()=>{
       const report=document.querySelector('.lx-treasury-report-output');
       const tables=[...report.querySelectorAll('.ta-table-wrap, table, th, td')];
       return {width:report.getBoundingClientRect().width,clipped:tables.filter(n=>n.scrollWidth>n.clientWidth+2).map(n=>({tag:n.tagName,text:n.textContent.slice(0,75)}))};
     });
     assert.deepEqual(overflow.clipped,[],'print must not clip long treasury reference/description columns');
     const printed=await report.innerText();
     for(const end of marker)assert.ok(printed.includes(end),'printed report missing text ending: '+end);
     if(engine==='chromium'){
       const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
       assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
       writeFileSync(join(out,lang+'.pdf'),pdf);
       const pages=await page.evaluate(async b64=>{
         const pdfjs=await import('/dist/vendor/pdf.mjs');
         pdfjs.GlobalWorkerOptions.workerSrc='/dist/vendor/pdf.worker.mjs';
         const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(b64),c=>c.charCodeAt(0))}).promise,parts=[];
         for(let i=1;i<=pdf.numPages;i++){
           const part=await pdf.getPage(i),text=await part.getTextContent();
           parts.push(text.items.map(x=>x.str||'').join(' '));
         }
         await pdf.destroy();return parts;
       },pdf.toString('base64'));
       assert.ok(pages.length>1&&pages.length<40,'bounded multi-page A4 report');
       assert.ok(pages.every(x=>x.trim().length),'no blank native PDF pages');
       const extracted=compressed(pages.join(' '));
       for(const end of marker)assert.ok(extracted.includes(end),'native PDF missing complete text ending: '+end);
       for(let n=1;n<=40;n++){
         const key='MOVE-'+String(n).padStart(3,'0');
         assert.equal(extracted.split(key).length-1,1,'native PDF movement appears exactly once: '+key);
       }
       assert.ok(extracted.includes('140.00'),'PDF financial closing balance unchanged');
       pdfs++;console.log('NATIVE PDF treasury long text '+lang+' pages='+pages.length);
     }
     assert.equal(await page.evaluate(()=>window.qaSource()),before,'report/CSV/print do not mutate accounting source');
     assert.deepEqual(errors,[],'no script errors');
     await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
     passed++;console.log('PASS treasury long text '+engine+' '+lang);
    }finally{await page.close();}
   }
  }finally{await browser.close();}
 }
 assert.equal(passed,4);assert.equal(pdfs,2);console.log('PASS total 4 browser cases and 2 Chromium native PDFs');
})().catch(e=>{console.error(e);process.exitCode=1;});
