const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/workspace-ux-batch3';
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const report=[];
 try{
  for(const [width,lang,theme] of [[320,'ar','dark'],[390,'en','light'],[820,'ar','light'],[1440,'en','dark']]){
   const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:4173/tests/visual/workspace-ux-batch3.html?lang=${lang}&theme=${theme}`,{waitUntil:'networkidle'});
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiTheme),theme,'exercise the requested resolved theme, not a pre-mount attribute');
   const inBounds=async surface=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${surface}: horizontal overflow`);};
   const search=async(query,key='Enter')=>{await page.evaluate(()=>window.dispatchEvent(new Event('lourex-global-search-open')));const input=page.locator('.global-search-input-wrap input');await input.fill(query);if(key==='ArrowDown')await input.press('ArrowDown');await page.keyboard.press('Enter');};
   await search('buyer@example.test');await page.locator('.ta-customer-profile').waitFor();assert.match(await page.locator('.ta-customer-profile-identity').innerText(),/Northstar|نورث/);await inBounds('customer');
   await search('VAL-1','ArrowDown');await page.locator('.ta-product-editor.is-open').waitFor();await inBounds('product');
   assert.equal(await page.locator('.ta-product-page-header').count(),0,'integrated product workspace must not repeat its hero');
   const description=page.getByLabel(lang==='ar'?'الوصف بالإنجليزية':'Description English',{exact:true});await description.fill('Reviewed valve');
   await page.locator('.ta-product-editor-footer').getByRole('button',{name:lang==='ar'?'حفظ الصنف':'Save Product',exact:true}).click();
   await page.waitForFunction(()=>window.savedProduct?.descriptionEn==='Reviewed valve');
   await search('Source Co');await page.locator('.lx-supplier-profile').waitFor();await inBounds('supplier');
   await search('PUR-QA-1');await page.locator('.ta-ops-purchase-editor').waitFor();assert.equal(await page.locator('.ta-ops-purchase-editor h2').innerText(),'PUR-QA-1');await inBounds('purchase');
   await page.evaluate(()=>window.navigateWorkspace('receivables'));await page.locator('.finance-workspace').waitFor();assert.equal(await page.locator('.lx-finance-context h1').innerText(),lang==='ar'?'المالية':'Finance');
   assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'workspace overflow');
   await page.screenshot({path:`${output}/finance-${width}-${lang}-${theme}.png`,animations:'disabled'});
   await page.goto(`http://127.0.0.1:4173/tests/visual/relationship-360-batch2.html?lang=${lang}`,{waitUntil:'networkidle'});
   await page.evaluate(theme=>document.documentElement.dataset.uiTheme=theme,theme);
   assert.match(await page.locator('.lx-customer-360 .lx-360-brief').innerText(),/QUO-2026-088/);
   const disclosures=page.locator('.lx-360-activity');assert.equal(await disclosures.count(),2);
   for(const disclosure of await disclosures.all()){assert.equal(await disclosure.getAttribute('open'),null);assert.equal(await disclosure.locator('.lx-360-timeline').isVisible(),false);const summary=disclosure.locator('summary');assert.ok((await summary.boundingBox()).height>=44);await summary.click();assert.ok(await disclosure.locator('.lx-360-timeline').isVisible());await summary.click();}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`${output}/relationships-${width}-${lang}-${theme}.png`,animations:'disabled'});report.push({width,lang,theme,routing:'PASS',productSave:'PASS',disclosure:'PASS'});await page.close();
  }
 }finally{await browser.close();}
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log('Workspace UX batch 3: four representative integrated paths PASS.');
})().catch(e=>{console.error(e);process.exitCode=1;});
