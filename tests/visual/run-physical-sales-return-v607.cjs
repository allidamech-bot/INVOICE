const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const url='http://127.0.0.1:4173/tests/visual/physical-sales-return-v607.html';
const output='visual-qa-output/physical-sales-return-v607';
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
(async()=>{
 mkdirSync(output,{recursive:true});
 const browser=await webkit.launch({headless:true}),results=[];
 try{
  for(const settings of [{width:375,height:812,lang:'en'},{width:390,height:844,lang:'ar'},{width:768,height:1024,lang:'en'}]){
   const key=settings.width+'-'+settings.lang;
   const page=await browser.newPage({viewport:{width:settings.width,height:settings.height},
     isMobile:settings.width<500,hasTouch:true});
   try{
    await page.goto(url+'?lang='+settings.lang,{waitUntil:'load'});
    const form=page.locator('.ta-sales-return-receipt');
    await form.waitFor({timeout:15000});
    assert.equal(await page.evaluate(()=>window.returnQaState().balance),'6');
    const choices=form.locator('select');
    assert.equal(await choices.count(),2,'Return and warehouse selectors should appear');
    await choices.nth(0).selectOption({index:1});
    await choices.nth(1).selectOption({index:1});
    await form.locator('input[inputmode="decimal"]').fill('1.5');
    await form.locator('label.is-wide input').filter({visible:true}).last().fill('Sealed cartons inspected at receiving dock');
    await form.locator('input[type="file"]').setInputFiles({
      name:'warehouse-receipt.pdf',mimeType:'application/pdf',buffer:bytes
    });
    await form.locator('small').filter({hasText:settings.lang==='ar'?'تم تحميل الإثبات':'Proof loaded'}).waitFor({timeout:10000});
    const submit=form.locator('button').filter({hasText:settings.lang==='ar'?'تسجيل المرتجع الفعلي':'Record Physical Return'});
    assert.equal(await submit.isEnabled(),true,'Validated physical goods receipt must be actionable');
    await submit.click();
    await page.waitForFunction(()=>window.returnQaState()?.returned?.length===1&&window.returnQaState().balance==='7.5',{timeout:15000});
    const outcome=await page.evaluate(()=>({state:window.returnQaState(),count:window.recordAttempts}));
    assert.equal(outcome.count,1,'One receipt must create exactly one stock movement');
    assert.deepEqual(outcome.state.returned.map(m=>[m.quantity,m.proof,m.cost]),[['1.5000',true,'4.50']]);
    await page.screenshot({path:output+'/'+key+'.png',animations:'disabled'});
    results.push({key,status:'pass'});
   }catch(error){
    results.push({key,status:'fail',error:String(error?.stack||error)});
    await page.screenshot({path:output+'/'+key+'-failure.png',animations:'disabled'}).catch(()=>{});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
 results.forEach(r=>console.log(r.key+': '+r.status));
 if(results.some(r=>r.status==='fail')){console.error(results.filter(r=>r.status==='fail'));process.exitCode=1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
