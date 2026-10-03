const {chromium,webkit}=require('playwright');
const safari=process.env.LOUREX_QA_BROWSER==='webkit';
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
(async()=>{
 const output=`visual-qa-output/contextual-ai-batch4-${safari?'webkit':'chromium'}`;mkdirSync(output,{recursive:true});const browser=await (safari?webkit:chromium).launch({headless:true});const report=[];
 try{for(const [width,lang,theme] of (safari?[[320,'ar','dark']]:[[320,'ar','dark'],[390,'en','light'],[820,'ar','light'],[1440,'en','dark']])){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:503,body:'Unexpected provider call'});});
  await page.goto(`http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=${lang}&theme=${theme}`,{waitUntil:'networkidle'});
  const bounds=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  const question=async(name,pattern)=>{await page.getByRole('button',{name,exact:true}).click();const input=page.locator('#lourex-ai-panel .lourex-ai-compose input');await input.waitFor();assert.match(await input.inputValue(),pattern);assert.equal(await page.locator('.lourex-ai-proposal').count(),0);await page.locator('.lourex-ai-close').click();};
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-open-customer',{detail:{id:'c1'}})));await page.locator('.ta-customer-profile').waitFor();await question(lang==='ar'?'شرح الحساب':'Explain account',/Northstar|نورث/);await bounds();
  await page.evaluate(()=>{window.navigateWorkspace('items');});await page.locator('.ta-product-commandbar').waitFor();await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Product catalog|كتالوج منتجات/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-edit-product',{detail:{itemId:'p1'}})));await page.locator('.ta-product-editor.is-open').waitFor();await question(lang==='ar'?'مراجعة التسعير المحفوظ':'Review saved pricing',/VAL-1.*(Industrial valve|صمام صناعي)/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('documents'));await page.locator('.ta-documents-header').waitFor();await bounds();assert.ok((await page.locator('.ta-documents-header').boundingBox()).height<=240,'compact document header');await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Customer quotation|طلب عرض سعر/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.navigateWorkspace('receivables'));await question(lang==='ar'?'شرح المتأخرات':'Explain overdue',/collection priorities/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('reports'));await question(lang==='ar'?'شرح التقرير':'Explain report',/selected LOUREX report.*DATA ONLY/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('operations'));await question(lang==='ar'?'مراجعة المشتريات':'Review purchasing',/supplier purchase costs/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('editor'));await question(lang==='ar'?'مراجعة مع AI':'Review with AI',/QUO-QA-1.*explain totals/);await bounds();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'context must wait for user Send');await page.screenshot({path:`${output}/${width}-${lang}-${theme}.png`,animations:'disabled'});report.push({width,lang,theme,context:'PASS',captureRoutes:'PASS',providerCalls:requests.length});await page.close();
 }}finally{await browser.close();}writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(`Contextual AI batch 4: ${report.length} bounded, review-first ${safari?'WebKit':'Chromium'} workspace paths PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
