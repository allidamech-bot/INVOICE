const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/sales-return-webkit-v607';
const url='http://127.0.0.1:4173/tests/visual/sales-return-receipt-v607.html';
const cases=[{width:390,height:844,lang:'en'},{width:390,height:844,lang:'ar'},{width:768,height:1024,lang:'en'}];
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await webkit.launch({headless:true}),results=[];
  try{
    for(const config of cases){
      const key=config.width+'-'+config.lang;
      const page=await browser.newPage({viewport:{width:config.width,height:config.height},hasTouch:true,
        isMobile:config.width<600,deviceScaleFactor:2});
      try{
        await page.goto(url+'?lang='+config.lang,{waitUntil:'load'});
        const panel=page.locator('.ta-sales-return-receipt');
        await panel.waitFor({timeout:15000});
        assert.equal(await page.evaluate(()=>window.receivedQuantity()),'6');
        const selects=panel.locator('select');
        await selects.nth(0).selectOption({index:1});
        await selects.nth(1).selectOption({index:1});
        await panel.locator('input[inputmode="decimal"]').fill('1.5');
        await panel.locator('input').nth(2).fill('Two sealed cartons returned, checked and counted');
        await panel.locator('input[type="file"]').setInputFiles({name:'signed-receipt.pdf',mimeType:'application/pdf',buffer:pdf});
        await panel.getByText('signed-receipt.pdf').waitFor({timeout:12000});
        const submit=panel.getByRole('button',{name:config.lang==='ar'?'تسجيل المرتجع الفعلي':'Record Physical Return'});
        await submit.click();
        await page.waitForFunction(()=>window.returnMovements()===1,{timeout:15000});
        assert.equal(await page.evaluate(()=>window.receivedQuantity()),'7.5',
          'credit-linked physically received goods must increase inventory exactly once');
        assert.deepEqual(await page.evaluate(()=>window.returnErrors),[]);
        const dimensions=await panel.evaluate(el=>({width:el.getBoundingClientRect().width,
          max:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
        assert.ok(dimensions.width>200,'mobile return panel must be usable');
        assert.ok(dimensions.max<=dimensions.viewport+6,'return panel overflows page width');
        await page.screenshot({path:output+'/'+key+'.png',fullPage:true,animations:'disabled'});
        results.push({key,result:'pass',dimensions});
      }catch(error){
        results.push({key,result:'fail',error:String(error?.stack||error)});
        await page.screenshot({path:output+'/'+key+'-failure.png',fullPage:true}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
  writeFileSync(output+'/results.json',JSON.stringify(results,null,2));
  results.forEach(x=>console.log(x.key+': '+x.result));
  const fail=results.filter(x=>x.result==='fail');
  if(fail.length){console.error(fail);process.exitCode=1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
