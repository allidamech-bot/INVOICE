const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/invoice-void-stock-v608',url='http://127.0.0.1:4173/tests/visual/invoice-void-stock-v608.html';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const devices=[{width:375,height:812,lang:'en'},{width:390,height:844,lang:'ar'},{width:768,height:1024,lang:'en'}];
(async()=>{
 mkdirSync(output,{recursive:true});
 const browser=await webkit.launch({headless:true}),results=[];
 try{for(const device of devices){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},hasTouch:true,isMobile:device.width<600});
  const key=device.width+'-'+device.lang;
  try{
   await page.goto(url+'?lang='+device.lang,{waitUntil:'load'});
   await page.locator('.document-lifecycle-panel').waitFor({timeout:14000});
   const baseline=await page.evaluate(()=>window.invoiceVoidQa());
   assert.equal(baseline.balance,'7');assert.equal(baseline.status,'active');
   const open=page.locator('.lifecycle-actions button').filter({hasText:device.lang==='ar'?'إلغاء المستند':'Void Document'});
   await open.click();
   const dialog=page.locator('.modal').filter({hasText:device.lang==='ar'?'إلغاء المستند النهائي':'Void final document'});
   await dialog.waitFor({timeout:12000});
   await dialog.locator('textarea').fill('Three undamaged cartons physically received and documented by warehouse');
   const confirm=dialog.locator('button').filter({hasText:device.lang==='ar'?'تأكيد الإلغاء':'Confirm Void'});
   assert.equal(await confirm.isDisabled(),true,'Voiding an issued stock invoice must require actual proof');
   await dialog.locator('input[type="checkbox"]').check();
   await dialog.locator('input[type="file"]').setInputFiles({name:'returned-stock.pdf',mimeType:'application/pdf',buffer:pdf});
   await dialog.getByText('returned-stock.pdf').waitFor({timeout:12000});
   assert.equal(await confirm.isEnabled(),true,'Fully documented physical receipt must enable cancellation');
   await confirm.click();
   await page.waitForFunction(()=>window.invoiceVoidQa()?.status==='voided',{timeout:14000});
   const result=await page.evaluate(()=>({state:window.invoiceVoidQa(),attempts:window.voidAttempts,errors:window.voidErrors}));
   assert.deepEqual(result.errors,[]);assert.equal(result.attempts,1);
   assert.equal(result.state.balance,'10');assert.equal(result.state.issues,1);
   assert.equal(result.state.receipts,1);assert.equal(result.state.proofs,1);
   await page.screenshot({path:output+'/'+key+'.png',animations:'disabled'});
   results.push({key,result:'pass'});
  }catch(error){results.push({key,result:'fail',error:String(error?.stack||error)});
   await page.screenshot({path:output+'/'+key+'-failure.png',animations:'disabled'}).catch(()=>{});}
  finally{await page.close();}
 }}finally{await browser.close();}
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
 results.forEach(r=>console.log(r.key+': '+r.result));
 const failures=results.filter(r=>r.result==='fail');
 if(failures.length){console.error(failures);process.exitCode=1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
