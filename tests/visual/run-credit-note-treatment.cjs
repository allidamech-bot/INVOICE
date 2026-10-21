const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
(async()=>{
 for(const [name,engine,width,lang] of [['chromium',chromium,1280,'en'],['chromium',chromium,390,'en'],['webkit',webkit,390,'ar'],['webkit',webkit,1280,'ar']]){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width,height:844}});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
   const url='http://127.0.0.1:4173/tests/visual/credit-note-treatment.html?lang='+lang;
   await page.goto(url);
   const dialog=page.getByRole('dialog'),create=dialog.getByRole('button',{name:lang==='ar'?'إنشاء مسودة':'Create draft',exact:true});
   await dialog.waitFor();
   assert.equal(await create.isDisabled(),true);
   assert.equal(await page.evaluate(()=>window.qaCreated),null);
   await dialog.locator('select').selectOption('invoice-tax');
   await dialog.locator('textarea').fill('Agreed price reduction QA');
   await page.locator('[data-credit-preview]').waitFor();
   const preview=await page.locator('[data-credit-preview]').textContent();
   for(const amount of ['50.00','10.00','60.00'])assert.ok(preview.includes(amount),preview);
   await create.click();
   await page.waitForFunction(()=>window.qaCreated!==null);
   const credit=await page.evaluate(()=>window.qaCreated);
   assert.equal(credit.status,'draft');assert.equal(credit.adjustments.taxEnabled,true);
   assert.equal(credit.items[0].unitPrice,'50.00');assert.match(credit.terms.remarks,/Agreed price reduction QA/);
   await page.goto(url);await dialog.waitFor();
   await dialog.locator('select').selectOption('keep-vat');
   await dialog.locator('textarea').fill('Accounting-reviewed adjustment QA');
   await page.locator('[data-credit-preview]').waitFor();
   await dialog.locator('input').fill('61');
   await dialog.getByRole('alert').waitFor();
   assert.equal(await create.isDisabled(),true);
   await dialog.locator('input').fill('60');
   await create.click();await page.waitForFunction(()=>window.qaCreated!==null);
   const keep=await page.evaluate(()=>window.qaCreated);
   assert.equal(keep.adjustments.taxEnabled,false);assert.equal(keep.items[0].unitPrice,'60.00');
   await page.goto(url);await dialog.waitFor();
   await dialog.getByRole('button',{name:lang==='ar'?'إلغاء':'Cancel',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.qaClosed),true);
   assert.equal(await page.evaluate(()=>window.qaCreated),null);
   assert.deepEqual(errors,[]);
   console.log('PASS credit treatment '+name+' '+width+' '+lang);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exit(1);});
