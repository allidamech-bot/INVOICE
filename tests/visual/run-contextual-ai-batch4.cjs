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
  const question=async(name,pattern)=>{await page.getByRole('button',{name,exact:true}).click();const input=page.locator('#lourex-ai-panel .lourex-ai-compose-bridge');await input.waitFor();assert.match(await input.inputValue(),pattern);assert.equal(await page.locator('.lourex-ai-proposal').count(),0);await page.locator('.lourex-ai-close').click();};
  const premium=async()=>{
    await page.locator('.lourex-ai-launcher').click();
    const panel=page.locator('#lourex-ai-panel'),textarea=panel.locator('.lourex-ai-premium-textarea'),bridge=panel.locator('.lourex-ai-compose-bridge'),attach=panel.locator('.lourex-ai-attach-button');
    await textarea.waitFor();assert.equal(await textarea.count(),1,'premium textarea');assert.equal(await bridge.count(),1,'legacy input bridge retained');
    const attachBox=await attach.boundingBox();assert.ok(attachBox&&attachBox.width>=43&&attachBox.height>=43,'44px attachment target');
    const panelBox=await panel.boundingBox();assert.ok(panelBox,'AI panel visible');
    if(width<=720){assert.ok(panelBox.x<=1&&Math.abs(panelBox.width-width)<=2,'phone AI is full width');assert.ok(panelBox.height>=895,'phone AI uses full dynamic viewport');}
    else if(width<=900){assert.ok(panelBox.x>=0&&panelBox.x<=10&&panelBox.width<=width&&panelBox.width>=width-20,'tablet-compact AI remains a bounded overlay');assert.ok(panelBox.height>=870,'tablet-compact AI keeps near-full viewport height');}
    else assert.ok(panelBox.width<=502&&panelBox.width>=420,'desktop AI remains a side panel');
    await textarea.fill(lang==='ar'?'سطر أول':'First line');await textarea.press('Shift+Enter');await textarea.type(lang==='ar'?'سطر ثان':'Second line');assert.match(await textarea.inputValue(),/\n/,'Shift+Enter creates multiline input');
    const fileInput=panel.locator('input[type="file"][multiple]');await fileInput.setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from('Sample business source')});await panel.locator('.lourex-ai-attachment-chip').waitFor();assert.match(await panel.locator('.lourex-ai-attachment-chip').innerText(),/source\.txt/);
    const chats=panel.getByRole('button',{name:lang==='ar'?'المحادثات':'Chats',exact:true});if(await chats.count()){await chats.click();await panel.locator('.lourex-ai-thread-search').waitFor();assert.ok((await panel.locator('.lourex-ai-thread-search').boundingBox()).height>=39,'searchable conversation history');}
    const managerButton=panel.getByRole('button',{name:lang==='ar'?'الذاكرة والمهام':'Memory & Tasks',exact:true});await managerButton.waitFor();const managerButtonBox=await managerButton.boundingBox();assert.ok(managerButtonBox&&managerButtonBox.height>=(width<=720?43:33),'Memory & Tasks target');await managerButton.click();const manager=panel.locator('.lourex-ai-manager');await manager.waitFor();assert.match(await manager.innerText(),lang==='ar'?/الذاكرة الدائمة.*المهام والتذكيرات/s:/Durable memory.*Tasks & reminders/s);if(width<=720){const managerBox=await manager.boundingBox();assert.ok(managerBox&&managerBox.x<=1&&Math.abs(managerBox.width-width)<=2,'mobile Memory & Tasks manager is full width');}await manager.locator('.lourex-ai-manager-head > button').click();
    await bounds();await panel.locator('.lourex-ai-close').click();
  };
  await premium();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-open-customer',{detail:{id:'c1'}})));await page.locator('.ta-customer-profile').waitFor();await question(lang==='ar'?'شرح الحساب':'Explain account',/Northstar|نورث/);await bounds();
  await page.evaluate(()=>{window.navigateWorkspace('items');});await page.locator('.ta-product-commandbar').waitFor();await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Product catalog|كتالوج منتجات/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('lourex-edit-product',{detail:{itemId:'p1'}})));await page.locator('.ta-product-editor.is-open').waitFor();await question(lang==='ar'?'مراجعة التسعير المحفوظ':'Review saved pricing',/VAL-1.*(Industrial valve|صمام صناعي)/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('documents'));await page.locator('.ta-documents-header').waitFor();await bounds();assert.ok((await page.locator('.ta-documents-header').boundingBox()).height<=240,'compact document header');await page.getByRole('button',{name:lang==='ar'?'إنشاء من ملف':'Create from file',exact:true}).click();await page.locator('.lourex-ai-inbox').waitFor();assert.match(await page.locator('.lourex-ai-inbox').innerText(),/Customer quotation|طلب عرض سعر/);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.navigateWorkspace('receivables'));await question(lang==='ar'?'شرح المتأخرات':'Explain overdue',/collection priorities/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('reports'));await question(lang==='ar'?'شرح التقرير':'Explain report',/selected LOUREX report.*DATA ONLY/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('operations'));await question(lang==='ar'?'مراجعة المشتريات':'Review purchasing',/supplier purchase costs/);await bounds();
  await page.evaluate(()=>window.navigateWorkspace('editor'));await question(lang==='ar'?'مراجعة مع AI':'Review with AI',/QUO-QA-1.*explain totals/);await bounds();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'context, memory manager and attachment selection must wait for user Send');await page.screenshot({path:`${output}/${width}-${lang}-${theme}.png`,animations:'disabled'});report.push({width,lang,theme,context:'PASS',premiumConversation:'PASS',memoryTasks:'PASS',captureRoutes:'PASS',providerCalls:requests.length});await page.close();
 }}finally{await browser.close();}writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(`Contextual AI + premium conversation + Memory & Tasks: ${report.length} bounded, review-first ${safari?'WebKit':'Chromium'} workspace paths PASS.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
