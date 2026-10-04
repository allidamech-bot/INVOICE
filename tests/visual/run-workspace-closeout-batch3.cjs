const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const output='visual-qa-output/workspace-closeout-batch3';
(async()=>{
 mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
 try{
  for(const [width,lang,theme] of [[320,'ar','dark'],[390,'en','light'],[820,'ar','light'],[1440,'en','dark']]){
   const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(8000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const text=(en,ar)=>lang==='ar'?ar:en;
   const open=async(screen,empty=false)=>{await page.goto(`http://127.0.0.1:4173/tests/visual/obsidian-financial.html?screen=${screen}&lang=${lang}${empty?'&empty=1':''}`,{waitUntil:'networkidle'});await page.evaluate(theme=>document.documentElement.dataset.uiTheme=theme,theme);};
   const bounds=async(name)=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: horizontal overflow`);
   const touch=async locator=>{await locator.scrollIntoViewIfNeeded();const rect=await locator.boundingBox();assert.ok(rect.height>=43.5,'action retains 44px hit area');await locator.click({trial:true});};
   await open('reports');const before=await page.evaluate(()=>window.financialSourceSnapshot());
   // A future as-of date legitimately retains historical receivable balances.
   // Use a period before the recorded sources to exercise a truly empty report.
   await page.getByLabel(text('From date','تاريخ البداية'),{exact:true}).fill('1900-01-01');
   await page.getByLabel(text('To date','تاريخ النهاية'),{exact:true}).fill('1900-12-31');
   const reset=page.locator('.ta-empty-card').getByRole('button',{name:text('Reset filters','إعادة ضبط الفلاتر'),exact:true});await touch(reset);await reset.click();
   await page.waitForFunction(()=>document.querySelectorAll('.ta-report-kpi').length>=2);
   assert.equal(await page.getByLabel(text('From date','تاريخ البداية'),{exact:true}).inputValue(),'');
   assert.equal(await page.evaluate(()=>window.financialSourceSnapshot()),before,'report recovery cannot mutate financial sources');await bounds('report');
   for(const tab of [['Profitability','الربحية'],['Tax / VAT','الضريبة / VAT'],['Performance','الأداء']])await page.getByRole('tab',{name:text(...tab),exact:true}).click();
   await page.screenshot({path:`${output}/reports-${width}-${lang}-${theme}.png`,animations:'disabled'});
   await open('operations');await page.locator('#operations-tab-purchases').click();
   const search=page.getByRole('searchbox',{name:text('Search this workspace','بحث في مساحة العمل'),exact:true});await search.fill('no-such-record');
   assert.match(await page.locator('.ta-ops-empty').innerText(),/No matching records|لا توجد سجلات مطابقة/);
   const clear=page.locator('.ta-ops-empty').getByRole('button',{name:text('Clear search','مسح البحث'),exact:true});await touch(clear);await clear.click();
   assert.equal(await search.inputValue(),'');assert.equal(await page.locator('.ta-ops-empty').count(),0);await bounds('purchase recovery');
   await open('operations',true);
   const create=page.locator('.ta-ops-empty').getByRole('button',{name:text('Add Supplier','إضافة مورد'),exact:true});await touch(create);await create.click();
   const editor=page.locator('.ta-ops-editor');await editor.getByLabel(text('Name EN','الاسم EN'),{exact:true}).fill('Reviewed Source');
   const save=editor.getByRole('button',{name:text('Save Supplier','حفظ المورد'),exact:true});await touch(save);await save.click();
   await page.waitForFunction(()=>window.financialFixture.state.suppliers.length===1);
   assert.equal(await page.evaluate(()=>window.financialFixture.state.suppliers[0].nameEn),'Reviewed Source');
   await page.locator('#operations-tab-purchases').click();await page.locator('.ta-ops-empty').getByRole('button',{name:text('New Purchase','شراء جديد'),exact:true}).click();
   await page.locator('.ta-ops-purchase-editor').waitFor();assert.equal(await page.evaluate(()=>window.financialFixture.state.purchases.length),0,'opening a reviewed draft cannot post or persist it');await bounds('purchase create');
   await page.screenshot({path:`${output}/purchase-${width}-${lang}-${theme}.png`,animations:'disabled'});
   await page.goto(`http://127.0.0.1:4173/tests/visual/workspace-ux-batch3.html?lang=${lang}&theme=${theme}&vault=1`,{waitUntil:'networkidle'});
   await page.evaluate(()=>window.navigateWorkspace('items'));
   await page.locator('.ta-product-stock').waitFor();assert.equal((await page.locator('.ta-product-stock bdi').innerText()).trim(),'12','stock comes from the posted movement, not the draft purchase');
   await page.locator('.ta-product-search input').fill('no-such-product');
   const productClear=page.locator('.ta-product-empty').getByRole('button',{name:text('Clear filters','مسح التصفية'),exact:true});await touch(productClear);await productClear.click();
   await page.locator('.ta-product-stock').waitFor();await bounds('product stock');
   await page.screenshot({path:`${output}/products-${width}-${lang}-${theme}.png`,animations:'disabled'});
   await page.getByRole('tab').filter({hasText:text('Planning','التخطيط')}).click();await page.locator('.lx-inventory-plan-row').waitFor();
   await page.locator('.lx-inventory-plan-search input').fill('no-such-product');
   await page.locator('.lx-inventory-plan-list .lx-inventory-plan-empty').getByRole('button',{name:text('Clear filters','مسح التصفية'),exact:true}).click();
   await page.locator('.lx-inventory-plan-row').waitFor();
   await page.evaluate(async()=>{await window.lockWorkspaceQa();window.dispatchEvent(new Event('lourex-cloud-applied'));});
   const unavailable=page.locator('.lx-inventory-plan-empty');await unavailable.waitFor();assert.match(await unavailable.innerText(),/unavailable|غير متاح/);
   await page.evaluate(()=>window.unlockWorkspaceQa());const planningRetry=unavailable.getByRole('button',{name:text('Try again','إعادة المحاولة'),exact:true});await touch(planningRetry);await planningRetry.click();await page.locator('.lx-inventory-plan-row').waitFor();await bounds('planning recovery');
   await page.evaluate(()=>window.fixture.setState({newMenu:true}));
   const createItems=page.locator('.ta-create-menu').filter({visible:true}).getByRole('menuitem');
   assert.equal(await createItems.count(),10,'all existing document types remain');
   assert.match(await createItems.nth(0).innerText(),/Quotation|عرض سعر/);assert.match(await createItems.nth(1).innerText(),/Commercial Invoice|فاتورة تجارية/);
   await page.keyboard.press('Escape');
   assert.deepEqual(errors,[],'no runtime error through report views and canonical editor paths');results.push({width,lang,theme,reportRecovery:'PASS',supplierSave:'PASS',purchaseDraft:'PASS',recordedStock:'PASS',productRecovery:'PASS',planningRecovery:'PASS',commonCreateOrder:'PASS'});await page.close();
  }
 }finally{await browser.close();}
 writeFileSync(`${output}/report.json`,JSON.stringify(results,null,2));console.log('Batch 3 workspace recovery/catalog acceptance: four representative paths PASS.');
})().catch(error=>{console.error(error);process.exitCode=1;});
