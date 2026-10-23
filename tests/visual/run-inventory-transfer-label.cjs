const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const out='visual-qa-output/inventory-transfer-label';mkdirSync(out,{recursive:true});
(async()=>{for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.CHROMIUM_ONLY&&engine!=='chromium')continue;
 const browser=await driver.launch({headless:true});try{for(const lang of ['en','ar'])for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/tests/visual/inventory-transfer-label.html?lang='+lang);await page.getByRole('tab',{name:lang==='ar'?/حركات المخزون/:/Inventory Movements/}).click();const history=page.locator('.ta-inventory-history'),rows=history.locator('.ta-ops-row'),filters=history.locator('.ta-inventory-history-filters select'),type=filters.nth(0),warehouse=filters.nth(2);
 const before=await page.evaluate(()=>window.qaSource()),balances=await page.evaluate(()=>window.qaBalances());assert.deepEqual(balances,{source:'80000',destination:'40000',total:'12'});
 const transferLabel=lang==='ar'?'تحويل مخزون':'Stock transfer',adjustmentLabel=lang==='ar'?'تسوية':'Adjustment';
 assert.equal(await type.locator('option[value=transfer]').innerText(),transferLabel,'transfer filter must not be labelled adjustment');assert.equal(await type.locator('option[value=adjustment]').innerText(),adjustmentLabel);assert.equal(await rows.count(),3);
 const transfer=rows.filter({hasText:'REF-TRANSFER'});assert.ok((await transfer.innerText()).includes(transferLabel));assert.ok(!(await transfer.innerText()).includes(adjustmentLabel));assert.equal(await transfer.locator('.ta-inventory-quantity').innerText(),'4');
 await type.selectOption('transfer');assert.equal(await rows.count(),1);assert.ok((await rows.innerText()).includes('REF-TRANSFER'));
 // Both endpoints retain the same transfer while the unrelated adjustment stays absent.
 const source=await warehouse.locator('option').nth(1).getAttribute('value');for(const id of [source,'QA-REMOTE']){await warehouse.selectOption(id);assert.equal(await rows.count(),1);assert.ok((await rows.innerText()).includes('REF-TRANSFER'));}
 await warehouse.selectOption('');await type.selectOption('adjustment');assert.equal(await rows.count(),1);assert.ok((await rows.innerText()).includes('REF-ADJUSTMENT'));assert.ok((await rows.innerText()).includes(adjustmentLabel));await type.selectOption('');assert.equal(await rows.count(),3);
 assert.equal(await page.evaluate(()=>window.qaSource()),before);assert.deepEqual(await page.evaluate(()=>window.qaBalances()),balances);assert.equal(await page.evaluate(()=>window.qaMutations),0);assert.deepEqual(errors,[]);await page.screenshot({path:out+'/'+engine+'-'+lang+'-'+width+'.png',fullPage:true});console.log('PASS inventory transfer label '+engine+' '+lang+' '+width);await page.close();
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
