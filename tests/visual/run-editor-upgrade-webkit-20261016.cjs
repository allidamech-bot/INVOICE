const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const output='visual-qa-output/editor-upgrade-webkit';
(async()=>{
 mkdirSync(output,{recursive:true});
 const browser=await webkit.launch({headless:true});
 try{
 for(const c of [{width:320,height:700,lang:'ar'},{width:390,height:844,lang:'en'},{width:768,height:1024,lang:'ar'}]){
  const page=await browser.newPage({viewport:{width:c.width,height:c.height},isMobile:c.width<500,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   for(const kind of ['proforma','proforma-invoice','invoice','purchase-order','rfq']){
    await page.goto(`http://127.0.0.1:4173/tests/visual/editor-keyboard-batch1.html?lang=${c.lang}&kind=${kind}`);
    const templates=page.locator('.editor-template-options');
    await templates.waitFor({state:'attached'});
    assert.equal(await templates.getAttribute('open'),null,'templates start folded '+kind);
    await templates.locator('summary').click();
    await page.locator('.template-card').first().waitFor({state:'visible'});
    await templates.locator('summary').click();
    const design=page.locator('.editor-design-options');
    await design.locator('summary').click();
    assert.equal(await page.locator('.appearance-table-columns').isVisible(),true,'advanced columns remain reachable');
    await design.locator('summary').click();
    const geometry=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(geometry.width<=geometry.viewport+1,'editor fits viewport '+kind);
    await page.locator('.editor-document-elements').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/${c.width}-${c.lang}-${kind}.png`});
   }
   await page.goto(`http://127.0.0.1:4173/tests/visual/editor-keyboard-batch1.html?lang=${c.lang}&kind=draft`);
   await page.locator('.draft-content-section').waitFor({state:'attached'});
   assert.equal(await page.evaluate(()=>Boolean(document.querySelector('.draft-content-section').compareDocumentPosition(document.querySelector('.draft-pdf-design-section'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'draft content precedes templates in DOM');
   await page.evaluate(async()=>{
    const {ProductPriceLists}=await import('/dist/src/components/ProductPriceLists.js');
    const stamp=new Date().toISOString();
    ReactDOM.unmountComponentAtNode(document.getElementById('editor-fixture'));
    ReactDOM.render(React.createElement(ProductPriceLists,{items:[{id:'visual-price',createdAt:stamp,updatedAt:stamp,sku:'QA-VISUAL-1',descriptionEn:'Synthetic Product',descriptionAr:'منتج تجريبي',lastUnitPrice:'125',lastCurrency:'USD',unit:'PCS',usageCount:0}],currency:'USD',onEdit:()=>{window.priceEdit=true}}),document.getElementById('editor-fixture'));
   });
   const cells=page.locator('.lx-price-lists-row:not(.is-head)>[data-label]');
   assert.equal(await cells.count(),4);
   assert.equal(await cells.first().evaluate(el=>getComputedStyle(el,'::before').content.includes(el.dataset.label)),true,'mobile prices have visible category names');
   if(c.lang==='ar')assert.equal(await page.locator('.lx-price-product strong').innerText(),'منتج تجريبي');
   await page.screenshot({path:`${output}/${c.width}-${c.lang}-price-list.png`});
   await page.locator('.lx-price-lists-row button').click();
   assert.equal(await page.evaluate(()=>window.priceEdit),true,'pricing action stays wired');
   assert.deepEqual(errors,[],'no runtime errors');
   console.log('PASS WebKit template disclosures, five document kinds, draft order and price labels',c.width,c.lang);
  }finally{await page.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
