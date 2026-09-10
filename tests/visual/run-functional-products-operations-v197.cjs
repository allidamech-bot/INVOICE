const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:4173/tests/visual/functional-products-operations-v197.html';
const output='visual-qa-output/functional-products-operations-v197';
const doubleClick=async locator=>locator.evaluate(button=>{button.click();button.click();});

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,fn)=>{const failures=[];try{await fn();}catch(error){failures.push(error?.stack||String(error));}results.push({name,failures});};
  try{
    await run('product-save-delete-import-single-flight',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=products&lang=en`,{waitUntil:'networkidle'});
        await page.locator('.product-library-row-main').click();
        await page.locator('.product-library-editor .form-grid.two input').nth(1).fill('Audit Product Updated');
        await doubleClick(page.getByRole('button',{name:'Save Product'}));
        await page.waitForFunction(()=>window.saveAttempts===1&&window.productState()[0]?.descriptionEn==='Audit Product Updated');
        await page.waitForTimeout(240);
        assert.equal(await page.evaluate(()=>window.saveAttempts),1,'product save must be single-flight');

        await page.locator('.product-library-row-main').click();
        await page.getByRole('button',{name:'Delete'}).click();
        await page.locator('.modal-backdrop').waitFor();
        const confirm=page.locator('.modal-footer-actions').getByRole('button',{name:'Delete'});
        await doubleClick(confirm);
        await page.waitForFunction(()=>window.deleteAttempts===1&&window.productState().length===0);
        await page.waitForTimeout(240);
        assert.equal(await page.evaluate(()=>window.deleteAttempts),1,'product delete must be single-flight');

        await page.getByRole('button',{name:'Import'}).click();
        await page.locator('.product-import-file-input').setInputFiles({name:'products.csv',mimeType:'text/csv',buffer:Buffer.from('SKU,Description EN,Unit,Unit Price,Currency\nSKU-NEW,Imported Product,PCS,12.00,USD\n')});
        const importButton=page.getByRole('button',{name:/Import 1 product/});
        await importButton.waitFor();
        await doubleClick(importButton);
        await page.waitForFunction(()=>window.importAttempts===1&&window.productState().length===1);
        await page.waitForTimeout(240);
        assert.equal(await page.evaluate(()=>window.importAttempts),1,'product import must be single-flight');
        await page.screenshot({path:`${output}/product-single-flight.png`,fullPage:true,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('purchase-post-and-inventory-single-flight',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=operations&lang=en`,{waitUntil:'networkidle'});
        await page.getByRole('tab',{name:'Purchases'}).click();
        await page.getByRole('button',{name:'New Purchase'}).click();
        await page.locator('.purchase-item select').selectOption('product-v197');
        await page.evaluate(()=>{window.confirm=()=>true;});
        await doubleClick(page.getByRole('button',{name:'Post Purchase'}));
        await page.waitForFunction(()=>window.postAttempts===1&&window.operationsState().purchases.length===1);
        await page.waitForTimeout(240);
        assert.equal(await page.evaluate(()=>window.postAttempts),1,'purchase post must be single-flight');

        await page.getByRole('tab',{name:'Inventory'}).click();
        await page.locator('.inventory-entry select').first().selectOption('product-v197');
        await page.locator('.inventory-entry input[inputmode="decimal"]').first().fill('3');
        await doubleClick(page.getByRole('button',{name:'Record Movement'}));
        await page.waitForFunction(()=>window.movementAttempts===1&&window.operationsState().movements.length===1);
        await page.waitForTimeout(240);
        assert.equal(await page.evaluate(()=>window.movementAttempts),1,'inventory movement must be single-flight');
        await page.screenshot({path:`${output}/operations-single-flight.png`,fullPage:true,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('arabic-operations-error-retry',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=operations&lang=ar&failPost=1`,{waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        await page.getByRole('tab',{name:'المشتريات'}).click();
        await page.getByRole('button',{name:'شراء جديد'}).click();
        await page.locator('.purchase-item select').selectOption('product-v197');
        await page.evaluate(()=>{window.confirm=()=>true;});
        await page.getByRole('button',{name:'ترحيل الشراء'}).click();
        await page.waitForFunction(()=>window.postAttempts===1);
        await page.locator('.operations-error').waitFor();
        assert.equal((await page.evaluate(()=>window.operationsState().purchases.length)),0);
        await page.evaluate(()=>{window.failPost=false;});
        await page.getByRole('button',{name:'ترحيل الشراء'}).click();
        await page.waitForFunction(()=>window.postAttempts===2&&window.operationsState().purchases.length===1);
        assert.equal(await page.evaluate(()=>window.postAttempts),2,'Arabic operations retry must release the mutation lock');
        await page.screenshot({path:`${output}/operations-arabic-retry.png`,fullPage:true,animations:'disabled'});
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Functional products/operations v197: ${results.length} real-component scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});