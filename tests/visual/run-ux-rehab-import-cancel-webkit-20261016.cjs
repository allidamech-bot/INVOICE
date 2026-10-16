const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const out='visual-qa-output/ux-rehab-import-cancel-webkit';
const qaUrl='http://127.0.0.1:4173/tests/visual/ux-rehab-import-cancel-20261016.html';
const cases=[{width:320,height:700,lang:'ar'},{width:390,height:844,lang:'en'}];
const sheet=(name,sku,description)=>({name,mimeType:'text/csv',buffer:Buffer.from(
 'SKU,Description EN,Unit,Unit Price,Currency,Unit Cost\n'+sku+','+description+',PCS,125.00,USD,48.00\n')});

(async()=>{
 mkdirSync(out,{recursive:true});
 const browser=await webkit.launch({headless:true});
 try{
 for(const c of cases){
  const page=await browser.newPage({viewport:{width:c.width,height:c.height},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   for(const scenario of ['clean','duplicate']){
    await page.goto(qaUrl+'?lang='+c.lang,{waitUntil:'load'});
    assert.equal(await page.locator('.product-import-steps li').count(),3,'upload, mapping and review steps');
    const upload=await page.locator('.product-import-dropzone').boundingBox();
    assert.ok(upload&&upload.width>c.width*.65&&upload.height>=140,'file upload is a clear full-width touch surface');
    const files=scenario==='clean'
      ?[sheet('first.csv','ACCEPT-1','Synthetic Valve'),sheet('second.csv','ACCEPT-2','Synthetic Coupling')]
      :[sheet('first.csv','ACCEPT-1','Synthetic Valve'),sheet('repeat.csv','ACCEPT-1','Synthetic Valve')];
    await page.locator('.product-import-file-input').setInputFiles(files);
    await page.locator('[data-import-stage="mapping"]').waitFor({state:'visible',timeout:15000});
    const sheetChecks=page.locator('.product-import-sheet-picker input[type=checkbox]');
    assert.equal(await sheetChecks.count(),2,'both CSV worksheets can be selected');
    assert.equal(await sheetChecks.nth(0).isChecked(),true);
    assert.equal(await sheetChecks.nth(1).isChecked(),true);
    const review=page.locator('button:visible').filter({hasText:/Review import|مراجعة الاستيراد/}).first();
    await review.waitFor({state:'visible'});
    assert.equal(await review.isDisabled(),false,'local mapping should be reviewable');
    await review.click();
    const preview=page.locator('[data-import-stage="preview"]');
    await preview.waitFor({state:'visible',timeout:12000});
    const counts=await preview.locator('.product-import-counts').innerText();
    assert.equal(await page.evaluate(()=>window.qaImport.savedCalls),0,'preview never saves');
    const confirm=page.locator('button:visible').filter({hasText:/Confirm import of|تأكيد استيراد|Fix file errors first|أصلح أخطاء الملف أولًا/}).first();
    await confirm.waitFor({state:'visible'});
    const footerBounds=await confirm.boundingBox();
    assert.ok(footerBounds&&footerBounds.y>=0&&footerBounds.y+footerBounds.height<=c.height+1,'confirmation stays in viewport without scrolling');
    const rowBounds=await preview.locator('tbody tr').first().boundingBox();
    assert.ok(rowBounds&&rowBounds.x>=0&&rowBounds.x+rowBounds.width<=c.width,'preview product card fits phone');
    assert.equal(await page.locator('.product-import-mobile-actions button').count(),0,'confirmation is not duplicated');

    if(scenario==='duplicate'){
     assert.equal(await confirm.isDisabled(),true,'duplicate across files must block import');
     assert.match(counts,/1/,'one error visible');
     assert.equal(await preview.locator('tr.row-error').count(),1,'exactly one duplicate error visible');
    }else{
     assert.equal(await confirm.isDisabled(),false,'valid import could be confirmed deliberately');
     assert.equal(await preview.locator('tr.row-create').count(),2);
    }
    await page.screenshot({path:out+'/'+c.width+'-'+c.lang+'-'+scenario+'-preview.png',fullPage:false,animations:'disabled'});
    await page.locator('.modal-header button').click();
    await page.locator('.product-import-shell').waitFor({state:'detached',timeout:9000});
    const state=await page.evaluate(()=>window.qaImport);
    assert.equal(state.savedCalls,0,'cancel cannot call catalog save handler');
    assert.equal(state.closed,1,'cancel closes the importer');
    assert.deepEqual(state.received,[],'cancel never commits product rows');
    console.log('PASS WebKit multi-CSV review/cancel',c.width+'-'+c.lang,scenario);
   }
   assert.equal(errors.length,0,'no runtime errors: '+errors.join('|'));
  }finally{await page.close();}
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
