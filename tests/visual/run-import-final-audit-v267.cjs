const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:4173/tests/visual/import-final-audit-v267.html';
const output='visual-qa-output/import-final-audit-v267';
const doubleClick=locator=>locator.evaluate(button=>{button.click();button.click();});

async function modalMeasurements(page){
  return await page.evaluate(()=>{
    const modal=document.querySelector('.modal');
    const header=modal?.querySelector('.modal-header');
    const body=modal?.querySelector('.modal-body');
    const footer=modal?.querySelector('.modal-footer');
    const stickyActions=modal?.querySelector('.product-import-mobile-actions');
    const backdrop=modal?.closest('.modal-backdrop');
    const close=modal?.querySelector('.modal-header button');
    const rect=node=>node?node.getBoundingClientRect():null;
    const blackText=[...modal.querySelectorAll('*')].filter(node=>{
      const box=node.getBoundingClientRect();
      const text=(node.textContent||'').trim();
      const color=getComputedStyle(node).color.replace(/\s+/g,'');
      return text&&box.width>0&&box.height>0&&(color==='rgb(0,0,0)'||color==='rgba(0,0,0,1)');
    }).slice(0,5).map(node=>`${node.tagName}.${node.className}`);
    const browserReserve=backdrop?parseFloat(getComputedStyle(backdrop).getPropertyValue('--modal-browser-bottom-reserve'))||0:0;
    return {modal:rect(modal),header:rect(header),body:rect(body),footer:rect(footer),stickyActions:rect(stickyActions),close:rect(close),closeColor:close?getComputedStyle(close).color:'',viewport:window.visualViewport?.height||innerHeight,browserReserve,bodyOverflow:document.body.style.overflow,docWidth:document.documentElement.scrollWidth,innerWidth,bodyScrollHeight:body?.scrollHeight||0,bodyClientHeight:body?.clientHeight||0,blackText};
  });
}

function assertMobileModal(layout,{mustScroll=true}={}){
  assert.ok(layout.modal.top>=-1,`modal top escaped viewport: ${layout.modal.top}`);
  assert.ok(layout.modal.bottom<=layout.viewport+1,`modal bottom ${layout.modal.bottom} exceeds ${layout.viewport}`);
  assert.ok(layout.header.top>=-1&&layout.close.bottom<=layout.viewport,'modal header/close must remain reachable');
  assert.ok(layout.close.left>=0&&layout.close.right<=layout.innerWidth&&layout.close.width>=44,'close control must stay fully inside the viewport');
  assert.notEqual(layout.closeColor,'rgb(0, 0, 0)','close icon must remain visible on the dark header');
  const footerVisible=layout.footer&&layout.footer.width>0&&layout.footer.height>0&&layout.footer.top>=0&&layout.footer.bottom<=layout.viewport+1;
  const stickyVisible=layout.stickyActions&&layout.stickyActions.width>0&&layout.stickyActions.height>0&&layout.stickyActions.top>=0&&layout.stickyActions.bottom<=layout.viewport+1;
  assert.ok(footerVisible||stickyVisible,'modal actions must remain visible');
  assert.equal(layout.bodyOverflow,'hidden','page scrolling must be locked behind the modal');
  assert.ok(layout.docWidth<=layout.innerWidth+1,`horizontal overflow ${layout.docWidth} > ${layout.innerWidth}`);
  if(mustScroll)assert.ok(layout.bodyScrollHeight>layout.bodyClientHeight,'modal body should own overflow on a short viewport');
  assert.deepEqual(layout.blackText,[],'visible modal text must not be black on dark surfaces');
}

(async()=>{
  mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const results=[];
  const run=async(name,fn)=>{const failures=[];try{await fn();}catch(error){failures.push(error?.stack||String(error));}results.push({name,failures});};
  try{
    await run('iphone-multisheet-excel-local-runtime',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const runtimeRequests=[];page.on('request',request=>{if(request.url().includes('xlsx'))runtimeRequests.push(request.url());});
      try{
        await page.goto(`${BASE}?mode=products&lang=en`,{waitUntil:'networkidle'});
        const workbookBytes=await page.evaluate(async()=>{
          const script=document.createElement('script');script.src='vendor/xlsx.full.min.js';
          await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
          const XLSX=window.XLSX;const workbook=XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Instructions'],['Use the Products sheet for import.']]),'Read Me');
          const products=XLSX.utils.aoa_to_sheet([['September catalogue'],[],['SKU','Product Name','Selling Price','Purchase Cost','Packaging','Unit'],['XL-1','Excel Coffee',44.5,22.25,'12 bags','BOX']]);
          products['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}}];
          XLSX.utils.book_append_sheet(workbook,products,'Products');
          const bytes=Array.from(new Uint8Array(XLSX.write(workbook,{bookType:'xlsx',type:'array'})));
          delete window.XLSX;script.remove();return bytes;
        });
        await page.getByRole('button',{name:'Import',exact:true}).click();
        await page.locator('.product-import-file-input').setInputFiles({name:'catalogue.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(workbookBytes)});
        const sheetPicker=page.locator('.product-import-sheet-picker select');await sheetPicker.waitFor();
        assert.equal(await sheetPicker.locator('option').count(),2);
        assert.match(await sheetPicker.locator('option:checked').innerText(),/Products/);
        assert.equal(await page.locator('.product-import-mapping-row').count(),6);
        assert.ok(runtimeRequests.length>=1,'the local SheetJS runtime should be requested');
        assert.ok(runtimeRequests.every(url=>url.startsWith('http://127.0.0.1:4173/dist/vendor/xlsx.full.min.js')),`unexpected SheetJS source ${runtimeRequests.join(', ')}`);
        await page.screenshot({path:`${output}/product-excel-multisheet-iphone.png`,fullPage:false,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('iphone-product-mapping-and-preview',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:664},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=products&lang=en`,{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Import',exact:true}).click();
        const csv=[
          'Catalogue export,,,,,,,,,',
          'Generated for mobile audit,,,,,,,,,',
          'SKU,Product Name,اسم المنتج,Selling Price,Purchase Cost,Packaging,Unit,Availability,Image URL,Extra Notes',
          'MX-1,Premium Coffee,قهوة فاخرة,"1,234.50",850.25,12 x 250g,BOX,Available,https://example.invalid/coffee.jpg,Mixed language row',
          'MX-2,Arabic Tea,شاي عربي,32.50,18.40,24 bags,CTN,In stock,,Second row'
        ].join('\n');
        await page.locator('.product-import-file-input').setInputFiles({name:'mixed-products.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
        await page.locator('.product-import-mapping-list').waitFor();
        assert.equal(await page.locator('.product-import-mapping-row').count(),10);
        assert.match(await page.locator('.product-import-mapping-row').filter({hasText:'Availability'}).innerText(),/Stock belongs to Inventory/);
        assert.match(await page.locator('.product-import-mapping-row').filter({hasText:'Image URL'}).innerText(),/images are not stored/i);
        assert.ok(await page.locator('.product-import-map-select').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)),'mapping selects must be touch-sized');
        assertMobileModal(await modalMeasurements(page));
        await page.screenshot({path:`${output}/product-mapping-iphone.png`,fullPage:false,animations:'disabled'});

        await page.getByRole('button',{name:'Review import'}).click();
        await page.locator('.product-import-table').waitFor();
        assert.equal(await page.getByRole('button',{name:'Confirm import of 2'}).isVisible(),true);
        const text=await page.locator('.product-import-table').innerText();
        assert.match(text,/1234\.50 USD/);assert.match(text,/850\.25 USD/);
        assertMobileModal(await modalMeasurements(page),{mustScroll:false});
        await page.screenshot({path:`${output}/product-preview-iphone.png`,fullPage:false,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('iphone-arabic-product-rtl',async()=>{
      const page=await browser.newPage({viewport:{width:375,height:667},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=products&lang=ar`,{waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        await page.getByRole('button',{name:'استيراد',exact:true}).click();
        const csv='كود الصنف,اسم المنتج,السعر,التكلفة,التعبئة,الوحدة,التوفر\nAR-1,قهوة عربية,١٢٫٥٠,٨٫٢٥,١٢ عبوة,كرتون,متوفر\n';
        await page.locator('.product-import-file-input').setInputFiles({name:'arabic-products.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
        await page.locator('.product-import-mapping-list').waitFor();
        assertMobileModal(await modalMeasurements(page));
        await page.screenshot({path:`${output}/product-mapping-arabic-iphone.png`,fullPage:false,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('iphone-safari-toolbar-keeps-product-actions-visible',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
      try{
        await page.addInitScript(()=>{
          const viewport=new EventTarget();
          Object.defineProperties(viewport,{
            width:{get:()=>390},height:{get:()=>620},
            offsetLeft:{get:()=>0},offsetTop:{get:()=>0},
            pageLeft:{get:()=>0},pageTop:{get:()=>0},scale:{get:()=>1}
          });
          Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
        });
        await page.goto(`${BASE}?mode=products&lang=ar`,{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'استيراد',exact:true}).click();
        const csv='SKU,Description EN,Description AR,HS Code,Origin,Packing,Unit,Currency,Selling Price,Purchase Cost,Barcode,Category,Brand,Notes\nIP-1,Mobile product,صنف جوال,2106.90,Jordan,12 bags,BOX,USD,12.50,8.25,123456789,Food,LOUREX,Mobile audit\n';
        await page.locator('.product-import-file-input').setInputFiles({name:'iphone-products.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
        await page.locator('.product-import-mapping-list').waitFor();
        const layout=await modalMeasurements(page);
        assertMobileModal(layout);
        assert.ok(layout.browserReserve>=72,`iPhone Safari overlay reserve is missing: ${layout.browserReserve}`);
        assert.ok(layout.stickyActions.bottom<=layout.viewport-layout.browserReserve+1,`sticky actions ${layout.stickyActions.bottom} remain beneath Safari chrome ending at ${layout.viewport-layout.browserReserve}`);
        const actions=page.locator('.product-import-mobile-actions');
        const before=await actions.boundingBox();
        await page.locator('.modal-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});
        await page.waitForTimeout(50);
        const after=await actions.boundingBox();
        assert.ok(before&&after,'sticky product actions must be measurable');
        assert.ok(Math.abs(after.y-before.y)<=1,`sticky actions moved during modal scroll: ${before.y} -> ${after.y}`);
        const hit=await actions.evaluate(node=>{const box=node.getBoundingClientRect();const target=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return target===node||node.contains(target);});
        assert.equal(hit,true,'sticky product actions must remain hit-testable after scrolling');
        assert.equal(await actions.getByRole('button',{name:'مراجعة الاستيراد'}).isVisible(),true);
        await page.screenshot({path:`${output}/product-mapping-arabic-safari-toolbar.png`,fullPage:false,animations:'disabled'});
      }finally{await page.close();}
    });

    await run('iphone-supplier-local-draft-single-flight',async()=>{
      const page=await browser.newPage({viewport:{width:390,height:664},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=supplier&lang=en`,{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Import Supplier Document'}).evaluate(button=>button.click());
        await page.locator('.supplier-import-file-input').waitFor({state:'attached'});
        const lines=['Supplier,ACME Mobile','Invoice Number,PI-267','Currency,EUR','','SKU,Product Name,Quantity,Unit,Purchase Price'];
        for(let index=1;index<=48;index+=1)lines.push(`AC-${index},Supplier item ${index},${index},BOX,${(index+0.25).toFixed(2)}`);
        await page.locator('.supplier-import-file-input').setInputFiles({name:'supplier.csv',mimeType:'text/csv',buffer:Buffer.from(lines.join('\n'))});
        await page.locator('.supplier-import-review').waitFor();
        assert.match(await page.locator('.supplier-import-review-head').innerText(),/Local spreadsheet parser/);
        assert.match(await page.locator('.supplier-import-more').innerText(),/8 more lines/);
        assertMobileModal(await modalMeasurements(page));
        await page.screenshot({path:`${output}/supplier-draft-iphone.png`,fullPage:false,animations:'disabled'});
        await doubleClick(page.getByRole('button',{name:'Confirm & Save Draft'}));
        await page.locator('.supplier-import-saved').waitFor();
        const state=await page.evaluate(()=>({attempts:window.supplierSaveAttempts,vault:window.supplierVaultState()}));
        assert.equal(state.attempts,1,'supplier draft save must be single-flight');
        assert.equal(state.vault.purchases.length,1);
        assert.equal(state.vault.purchases[0].status,'draft');
        assert.equal(state.vault.purchases[0].items.length,48);
        assert.equal(state.vault.inventoryMovements.length,0,'supplier import must not post inventory');
        assert.equal(state.vault.expenses.length,0,'supplier import must not post accounting expenses');
      }finally{await page.close();}
    });

    await run('iphone-arabic-supplier-rtl',async()=>{
      const page=await browser.newPage({viewport:{width:375,height:667},hasTouch:true,isMobile:true});
      try{
        await page.goto(`${BASE}?mode=supplier&lang=ar`,{waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
        await page.getByRole('button',{name:'استيراد مستند مورد'}).evaluate(button=>button.click());
        const csv='المورد,مورد الاختبار\nرقم الفاتورة,١٢٣\nالعملة,SAR\n\nكود الصنف,اسم المنتج,الكمية,الوحدة,سعر الشراء\nAR-7,قهوة عربية,١٢,كرتون,٨٫٢٥\n';
        await page.locator('.supplier-import-file-input').setInputFiles({name:'supplier-ar.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
        await page.locator('.supplier-import-review').waitFor();
        assert.match(await page.locator('.supplier-import-review').innerText(),/مورد الاختبار/);
        assertMobileModal(await modalMeasurements(page),{mustScroll:false});
        await page.screenshot({path:`${output}/supplier-draft-arabic-iphone.png`,fullPage:false,animations:'disabled'});
      }finally{await page.close();}
    });
  }finally{await browser.close();}

  writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));
  const failures=results.flatMap(result=>result.failures.map(failure=>`${result.name}: ${failure}`));
  assert.equal(failures.length,0,failures.join('\n\n'));
  console.log(`Import final audit v267: ${results.length} real-component mobile scenarios passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
