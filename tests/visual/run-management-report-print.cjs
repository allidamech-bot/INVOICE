const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/management-report-print';mkdirSync(out,{recursive:true});
const normalize=s=>s.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g,'').replace(/٫/g,'.');
(async()=>{for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await driver.launch({headless:true});try{for(const lang of ['en','ar'])for(const mode of ['all','usd','query']){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/tests/visual/management-report-print.html?lang='+lang);await page.locator('.ta-report-kpi').first().waitFor();
 const before=await page.evaluate(()=>window.qaSource());
 if(mode==='usd')await page.locator('.ta-report-currency select').selectOption('USD');
 if(mode==='query')await page.locator('.ta-customer-report-header input').fill('QA-CUSTOMER-001');
 const rows=page.locator('.ta-customer-performance-table tbody tr'),count=mode==='all'?40:mode==='usd'?20:1;assert.equal(await rows.count(),count);
 const ids=await rows.locator('td:first-child strong').allTextContents();
 const kpis=await page.locator('.ta-report-kpi').allTextContents();assert.equal(kpis.length,mode==='usd'?1:2);
 for(const kpi of kpis){const text=normalize(kpi);for(const number of ['2000.00','800.00','500.00','1500.00'])assert.ok(text.includes(number),'known independent synthetic total '+number);}
 await page.getByRole('button',{name:lang==='ar'?'طباعة / حفظ PDF':'Print / Save PDF',exact:true}).click();await page.waitForFunction(()=>window.qaPrintCalls===1);
 await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.decode().catch(()=>{})));});
 const layout=await page.evaluate(()=>{const report=document.querySelector('.financial-report-print'),r=report.getBoundingClientRect();return {width:innerWidth,report:r.toJSON(),display:getComputedStyle(report).display,rows:Array.from(document.querySelectorAll('.ta-customer-performance-table tbody tr'),el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width};}),tables:Array.from(report.querySelectorAll('.ta-table-wrap'),el=>({client:el.clientWidth,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowX}))};});
 assert.notEqual(layout.display,'none','actual report visible in print');assert.ok(layout.report.width>0&&layout.report.height>0,'report has a real print box');
 assert.ok(layout.report.left>=-1&&layout.report.right<=layout.width+1,'report inside print page '+JSON.stringify(layout));
 assert.ok(layout.rows.every(r=>r.left>=-1&&r.right<=layout.width+1),'all financial columns fit print width '+JSON.stringify(layout));
 assert.ok(layout.tables.every(t=>t.scroll<=t.client+1),'no clipped horizontal financial tables '+JSON.stringify(layout));
 const logo=await page.locator('.report-print-brand img').boundingBox();assert.ok(logo&&logo.width<=83&&logo.height<=39,'print logo remains compact');
 await page.screenshot({path:out+'/'+engine+'-'+lang+'-'+mode+'.png',fullPage:true});
 if(engine==='chromium'){
  const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});writeFileSync(out+'/'+engine+'-'+lang+'-'+mode+'.pdf',pdf);
  const parsed=await page.evaluate(async base64=>{const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}).promise,parts=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),text=await p.getTextContent();parts.push(text.items.map(x=>x.str||'').join(' '));}await doc.destroy();return parts;},pdf.toString('base64'));
  assert.ok(parsed.length>=1&&parsed.length<=20,'bounded PDF pages');assert.ok(parsed.every(s=>s.trim()),'no blank PDF pages');const text=normalize(parsed.join(' '));
  for(const name of ids){const id=name.match(/QA-CUSTOMER-\d+/)[0];assert.equal(text.split(id).length-1,1,'exactly one complete customer reference '+id);if(lang==='en')assert.ok(text.includes(normalize(name)),'full customer name preserved '+id);}
  assert.ok(!text.includes('QA-FUTURE-EXCLUDED'),'future activity excluded');assert.ok(!text.includes('QA-SHELL-MUST-NOT-PRINT'),'app shell excluded');
  assert.ok(text.includes('2026-10-01')&&text.includes('2026-10-31'),'selected report period retained');
  for(const total of ['2000.00','800.00','500.00','1500.00'])assert.ok(text.includes(total),'PDF retains independently expected total '+total);
  if(mode==='usd')assert.ok(!text.includes('EUR'),'currency filter retained in PDF');
 }
 assert.equal(await page.evaluate(()=>window.qaSource()),before,'printing never mutates financial sources');
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-financial-report')),false,'afterprint clears print state');
 assert.deepEqual(errors,[]);console.log('PASS management report '+engine+' '+lang+' '+mode);await page.close();
 }}
 // An immediate screen switch or unmount must cancel the queued native print.
 // Run the action and navigation in a single browser task to reproduce the race
 // without a false pass caused by Playwright's asynchronous RPC scheduling.
 for(const lang of ['en','ar'])for(const route of ['switch','unmount']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/tests/visual/management-report-print.html?lang='+lang);
  await page.locator('.ta-report-kpi').first().waitFor();
  await page.evaluate(mode=>{
   const button=[...document.querySelectorAll('.ta-page-actions button')].find(item=>/Print \/ Save PDF|طباعة \/ حفظ PDF/.test(item.textContent));
   if(!button)throw Error('Native performance report print action missing');
   button.click();
   if(!document.body.classList.contains('printing-financial-report'))throw Error('Print intent was not scheduled');
   if(mode==='switch')window.qaReport.setState({view:'profitability'});
   else ReactDOM.unmountComponentAtNode(document.getElementById('visual-app'));
  },route);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.qaPrintCalls),0,'navigation must cancel queued print');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-financial-report')),false,'navigation must clear print-only body state');
  if(route==='switch'){
   assert.ok(await page.locator('#reports-tab-profitability[aria-selected="true"]').count(),'profitability tab is active');
   await page.locator('#reports-tab-performance').click();
   await page.getByRole('button',{name:lang==='ar'?'طباعة / حفظ PDF':'Print / Save PDF',exact:true}).click();
   await page.waitForFunction(()=>window.qaPrintCalls===1);
   await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
   assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-financial-report')),false,'ordinary native print still clears state');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS management pending-print cancellation '+engine+' '+lang+' '+route);
  await page.close();
 }
}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
