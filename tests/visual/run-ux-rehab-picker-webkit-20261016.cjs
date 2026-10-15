const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');

const output='visual-qa-output/ux-rehab-picker-webkit';
const cases=[
 {width:320,height:700,lang:'ar'},
 {width:390,height:844,lang:'en'},
 {width:390,height:844,lang:'ar'},
 {width:430,height:932,lang:'en'},
];
(async()=>{
 mkdirSync(output,{recursive:true});
 const browser=await webkit.launch({headless:true});
 try {
  for(const v of cases){
   const page=await browser.newPage({viewport:{width:v.width,height:v.height},hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const key=v.width+'-'+v.lang;
   try {
    await page.addInitScript(()=>localStorage.setItem('lourex-ui-theme','dark'));
    await page.goto('http://127.0.0.1:4173/tests/visual/obsidian-directory.html?lang='+v.lang+'&screen=picker',{waitUntil:'load',timeout:30000});
    const shell=page.locator('.saved-items-shell.is-picker');
    await shell.waitFor({timeout:15000});
    const rows=shell.locator('.saved-item-row');
    assert.equal(await rows.count(),24,'fixture must expose all 24 synthetic products '+key);
    const all=shell.locator('.saved-item-select-all input[type="checkbox"]');
    const first=rows.first().locator('.saved-item-select-control input[type="checkbox"]');
    assert.equal(await first.count(),1,'each row must have a native selection checkbox '+key);
    const full=await rows.first().locator('.saved-item-main strong').evaluate(el=>({
      whiteSpace:getComputedStyle(el).whiteSpace,
      lineHeight:getComputedStyle(el).lineHeight
    }));
    assert.equal(full.whiteSpace,'normal','full product name must wrap '+key);
    const scroll=shell.locator('.saved-items-list');
    const geometry=await scroll.evaluate(el=>({
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      overflow:getComputedStyle(el).overflowY
    }));
    assert.ok(['scroll','auto'].includes(geometry.overflow),'picker owns scroll '+key);
    assert.ok(geometry.scrollHeight>geometry.clientHeight,'test products must require scrolling '+key);
    const moved=await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop;});
    assert.ok(moved>0,'cannot reach final product row '+key);
    await scroll.evaluate(el=>{el.scrollTop=0;});
    await first.check();
    assert.equal(await first.isChecked(),true,'individual selection failed '+key);
    await all.check();
    await page.waitForFunction(()=>[...document.querySelectorAll('.saved-items-shell.is-picker .saved-item-select-control input')].every(el=>el.checked));
    assert.equal(await all.isChecked(),true,'select all visible failed '+key);
    await page.screenshot({path:output+'/'+key+'-all-selected.png',animations:'disabled'});
    await all.uncheck();
    await page.waitForFunction(()=>[...document.querySelectorAll('.saved-items-shell.is-picker .saved-item-select-control input')].every(el=>!el.checked));
    await shell.locator('.saved-items-search-input').fill('LX-001');
    await page.waitForFunction(()=>document.querySelectorAll('.saved-items-shell.is-picker .saved-item-row').length===1);
    await shell.locator('.saved-item-select-control input').check();
    const save=shell.locator('.saved-items-picker-bar .btn-primary');
    assert.ok(await save.isVisible(),'bulk add action hidden '+key);
    await save.click();
    await page.waitForFunction(()=>Array.isArray(window.selectedItems)&&window.selectedItems.length===1);
    const result=await page.evaluate(()=>window.selectedItems.map(item=>item.sku));
    assert.deepEqual(result,['LX-001'],'filtered selection must submit only the chosen SKU '+key);
    console.log('PASS WebKit touch saved-item picker',key);
   } finally {await page.close();}
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
