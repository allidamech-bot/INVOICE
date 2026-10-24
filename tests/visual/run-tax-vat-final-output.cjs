const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const out='visual-qa-output/tax-vat-final-output';mkdirSync(out,{recursive:true});
const normalize=s=>s.normalize('NFKC').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[٬,\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g,'').replace(/٫/g,'.');
function parseCsv(text){const rows=[],row=[];let value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\r'||c==='\n')){row.push(value);value='';if(c!==','){rows.push([...row]);row.length=0;if(c==='\r'&&text[i+1]==='\n')i++;}}else value+=c;}row.push(value);if(row.some(Boolean))rows.push(row);assert.equal(quoted,false,'balanced CSV quotes');return rows;}
(async()=>{for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await driver.launch({headless:true});try{for(const lang of ['en','ar'])for(const mode of ['all','usd','empty']){
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/tests/visual/tax-vat-final-output.html?lang='+lang);await page.getByRole('tab',{name:lang==='ar'?'الضريبة / VAT':'Tax / VAT',exact:true}).click();await page.locator('.lx-tax-center').waitFor();
 if(mode!=='all')await page.locator('.lx-tax-filters select').selectOption('USD');
 await page.locator('.lx-tax-filters input[type=date]').nth(0).fill(mode==='empty'?'2027-01-01':'2026-10-01');await page.locator('.lx-tax-filters input[type=date]').nth(1).fill(mode==='empty'?'2027-01-31':'2026-10-31');
 const expected=await page.evaluate(mode=>window.qaExpected.filter(row=>mode!=='empty'&&(mode==='all'||row.currency==='USD')),mode),before=await page.evaluate(()=>window.qaSource());
 const rows=page.locator('.lx-tax-register tbody tr');assert.equal(await rows.count(),expected.length);
 for(const wanted of expected){const row=rows.filter({has:page.locator('td:nth-child(2) strong',{hasText:wanted.number})});assert.equal(await row.count(),1);const cells=await row.locator('td').allTextContents();assert.equal(cells[2],wanted.customer);assert.equal(normalize(cells[5]),normalize(wanted.taxable+wanted.currency));assert.equal(normalize(cells[6]),normalize(wanted.vat+wanted.currency));assert.equal(normalize(cells[7]),normalize(wanted.total+wanted.currency));}
 const cards=await page.locator('.lx-tax-card').allTextContents();assert.equal(cards.length,mode==='empty'?0:mode==='usd'?1:2);
 for(const card of cards)for(const number of ['295.00','1950.00','300.00','-5.00'])assert.ok(normalize(card).includes(number),'independent tax summary '+number);
 const rates=await page.locator('.lx-tax-rates tbody tr').evaluateAll(rows=>rows.map(row=>Array.from(row.cells,cell=>cell.textContent)));
 assert.equal(rates.length,mode==='empty'?0:mode==='usd'?2:4);
 for(const rate of rates){const ten=rate[1]==='10%';assert.ok(ten||rate[1]==='20%');assert.equal(normalize(rate[2]),normalize((ten?'950.00':'1000.00')+rate[0]));assert.equal(normalize(rate[3]),normalize((ten?'95.00':'200.00')+rate[0]));}
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:lang==='ar'?'تصدير CSV':'Export CSV',exact:true}).click();const download=await downloadPromise;await download.saveAs(out+'/'+engine+'-'+lang+'-'+mode+'.csv');
 const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');assert.ok(csv.startsWith('\uFEFF'),'UTF-8 BOM');const exported=parseCsv(csv.slice(1));assert.equal(exported[0].length,9);assert.equal(exported.length,expected.length+1);
 for(const wanted of expected){const record=exported.slice(1).find(row=>row[2]===wanted.number);assert.ok(record);assert.equal(record.length,9);assert.equal(record[0],wanted.date);assert.equal(record[1],wanted.credit?(lang==='ar'?'إشعار دائن':'Credit Note'):(lang==='ar'?'فاتورة':'Invoice'));assert.equal(record[3],wanted.customer.startsWith('=')?"'"+wanted.customer:wanted.customer,'CSV quoting and formula protection');assert.deepEqual(record.slice(4),[wanted.currency,wanted.rate,wanted.taxable,wanted.vat,wanted.total]);}
 const end=mode==='empty'?'2027-01-31':'2026-10-31';assert.ok(download.suggestedFilename().includes(end),'download period');
 await page.getByRole('button',{name:lang==='ar'?'طباعة / حفظ PDF':'Print / Save PDF',exact:true}).click();await page.waitForFunction(()=>window.qaPrintCalls===1);
 await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.decode().catch(()=>{})));});
 const layout=await page.locator('.tax-vat-print').boundingBox();assert.ok(layout&&layout.width>0&&layout.height>0,'tax report has a real print box');assert.ok(layout.x>=-1&&layout.x+layout.width<=795,'tax report fits print width');
 const tableFit=await page.locator('.tax-vat-print .ta-table-wrap').evaluateAll(tables=>tables.every(table=>table.scrollWidth<=table.clientWidth+1));assert.ok(tableFit,'tax table columns are not clipped');
 await page.screenshot({path:out+'/'+engine+'-'+lang+'-'+mode+'.png',fullPage:true});
 if(engine==='chromium'){
 const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});writeFileSync(out+'/'+engine+'-'+lang+'-'+mode+'.pdf',pdf);
 const expectedFooter=await page.locator('.report-print-footer').innerText();
 const {parts,footers}=await page.evaluate(async base64=>{const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';const doc=await pdfjs.getDocument({data:Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}).promise,result=[],footers=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),text=await p.getTextContent();result.push(text.items.map(x=>x.str||'').join(' '));const anchor=text.items.find(x=>x.str?.includes('LOUREX'));if(anchor)footers.push(text.items.filter(x=>x.str&&x.transform[5]<=anchor.transform[5]+2).map(x=>x.str).join(' '));}await doc.destroy();return {parts:result,footers};},pdf.toString('base64'));
 assert.ok(parts.length>0&&parts.length<=20);assert.ok(parts.every(s=>s.trim()),'no blank PDF pages');const text=normalize(parts.join(' '));
 for(const wanted of expected)assert.equal(text.split(wanted.number).length-1,1,'PDF document appears once '+wanted.number);
 assert.ok(text.includes(end),'PDF report period');assert.ok(!text.includes('EXCLUDED'),'filtered drafts/void/future excluded');assert.ok(!text.includes('QA-SHELL-MUST-NOT-PRINT'),'no shell controls');
 if(mode!=='empty')for(const value of ['295.00','1950.00','300.00','-5.00'])assert.ok(text.includes(value)||(lang==='ar'&&value.startsWith('-')&&text.includes(value.slice(1)+'-')),'PDF independent tax total '+value);
 if(mode!=='all')assert.ok(!text.includes('EUR'),'selected currency respected');
 // Compare only the footer's PDF region, anchored on its unique LOUREX text.
 // Arabic fonts may emit visual-order presentation glyphs; values/array order
 // elsewhere remain exact, while every footer Arabic character is retained.
 assert.equal(footers.length,1,'exactly one scope footer in native PDF');
 if(lang==='ar'){
  const glyphs=value=>[...value.normalize('NFKC').replace(/[^\u0600-\u06ff]/g,'')].sort().join('');
  assert.equal(glyphs(footers[0]),glyphs(expectedFooter),'complete Arabic scope footer glyph inventory');
  assert.ok(footers[0].includes('LOUREX'));
 }else assert.equal(normalize(footers[0]),normalize(expectedFooter),'complete English scope footer');

 }
 assert.equal(await page.evaluate(()=>window.qaSource()),before,'CSV and print never mutate source documents');await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-tax-vat-report')),false);assert.deepEqual(errors,[]);console.log('PASS tax final output '+engine+' '+lang+' '+mode);await page.close();
 }
 // An immediate exit from Tax / VAT must not print the next report.
 // Schedule print and leave in one browser task: no Playwright timing races.
 for(const lang of ['en','ar'])for(const route of ['switch','unmount']){
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/tests/visual/tax-vat-final-output.html?lang='+lang);
  await page.getByRole('tab',{name:lang==='ar'?'الضريبة / VAT':'Tax / VAT',exact:true}).click();
  await page.locator('.lx-tax-center').waitFor();
  await page.evaluate(mode=>{
   const button=[...document.querySelectorAll('.lx-tax-header button')].find(element=>['Print / Save PDF','طباعة / حفظ PDF'].includes(element.textContent.trim()));
   if(!button)throw Error('Tax native print button missing');
   button.click();
   if(!document.body.classList.contains('printing-tax-vat-report'))throw Error('VAT print intent not scheduled');
   if(mode==='switch')window.qaReport.setState({view:'performance'});
   else ReactDOM.unmountComponentAtNode(document.getElementById('visual-app'));
  },route);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.qaPrintCalls),0,'VAT print must be canceled after navigation');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-tax-vat-report')),false,'VAT print-only body flag must be cleared');
  if(route==='switch'){
   assert.ok(await page.getByRole('tab',{name:lang==='ar'?'الأداء':'Performance',exact:true}).count(),'performance tab restored');
   await page.getByRole('tab',{name:lang==='ar'?'الضريبة / VAT':'Tax / VAT',exact:true}).click();
   await page.locator('.lx-tax-center').waitFor();
   await page.getByRole('button',{name:lang==='ar'?'طباعة / حفظ PDF':'Print / Save PDF',exact:true}).click();
   await page.waitForFunction(()=>window.qaPrintCalls===1);
   await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
   assert.equal(await page.evaluate(()=>document.body.classList.contains('printing-tax-vat-report')),false,'ordinary VAT print still releases body flag');
  }
  assert.deepEqual(errors,[],'no browser errors');
  console.log('PASS VAT pending print cancellation '+engine+' '+lang+' '+route);
  await page.close();
 }
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
