const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});try{
 for(const [width,lang] of [[390,'ar'],[1440,'en']]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/tests/visual/commercial-completion-batch6.html?lang='+lang,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>Boolean(window.fixture));
 for(const mode of ['ordinary','tax']){
 // Invoke the actual App launcher, not an isolated mock of its picker.
 await page.evaluate(()=>window.fixture.newDocument('invoice'));
 const picker=page.locator('[data-invoice-type-picker=true]');await picker.waitFor({state:'visible'});
 assert.equal(await picker.locator('button.invoice-choice-ordinary').count(),1);
 assert.equal(await picker.locator('button.invoice-choice-tax').count(),1);
 const before=await page.evaluate(async()=> (await window.readStored()).documents.length);
 await picker.locator('button.invoice-choice-'+mode).click();
 await page.locator('.ta-editor-workspace').waitFor({state:'visible',timeout:15000});
 const result=await page.evaluate(async()=>{const d=window.fixture.state.editorDoc,v=await window.readStored();return {doc:d,stored:v.documents.find(x=>x.id===d.id),count:v.documents.length};});
 assert.equal(result.count,before+1);assert.equal(result.doc.invoiceMode,mode);assert.equal(result.stored.invoiceMode,mode);assert.equal(result.stored.adjustments.taxEnabled,mode==='tax');
 if(mode==='ordinary')assert.equal(result.stored.adjustments.taxPercent,'0');
 const title=lang==='ar'?(mode==='ordinary'?'فاتورة عادية':'فاتورة ضريبية'):(mode==='ordinary'?'Ordinary Invoice':'Tax Invoice');
 assert.ok((await page.locator('.editor-topbar').innerText()).includes(title));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
 await page.evaluate(()=>window.fixture.setState({screen:'documents',editorDoc:null}));
 await page.locator('.ta-doc-row-open').filter({hasText:result.doc.number}).waitFor();
 assert.ok((await page.locator('.ta-doc-row-open').filter({hasText:result.doc.number}).innerText()).includes(title));
 }
 assert.deepEqual(errors,[]);await context.close();
 }
 }finally{await browser.close();}
 }
 console.log('Invoice type picker: actual App, persisted ordinary/tax choice, editor and list labels passed in Chromium/WebKit AR mobile and EN desktop.');
})().catch(e=>{console.error(e);process.exitCode=1;});
