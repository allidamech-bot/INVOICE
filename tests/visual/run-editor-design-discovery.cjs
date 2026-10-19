const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({headless:true});let cases=0;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.route('http://lourex.test/**',async route=>{
   const file=path.resolve(root,'.'+decodeURIComponent(new URL(route.request().url()).pathname));
   if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
   try{await route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
  });
  const {BUSINESS_DOCUMENT_CATALOG,documentBankAllowed}=await import(path.join(root,'dist/src/lib/document-kinds.js'));
  const kinds=process.env.LOUREX_EDITOR_KINDS?process.env.LOUREX_EDITOR_KINDS.split(','):BUSINESS_DOCUMENT_CATALOG.map(entry=>entry.kind);
  for(const kind of kinds)for(const lang of ['en','ar'])for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   const fixture=kind==='draft'?'obsidian-draft-editor.html':'v538-quote-editor-final-flow.html';
   await page.goto('http://lourex.test/tests/visual/'+fixture+'?'+new URLSearchParams({kind,lang}));
   if(kind==='statement-account'){
    const toolbar=page.locator('.statement-output-toolbar');await toolbar.waitFor({timeout:10000});
    assert.equal(await page.locator('.editor-discovery-card').count(),0,'statement has its own output workflow');
    assert.equal(await page.locator('.customer-statement-print .statement-output-toolbar').count(),0,'output controls stay outside printable statement');
    const bounds=await toolbar.boundingBox();assert.ok(bounds&&bounds.width>0&&bounds.width<=width,'statement action fits viewport');
    await toolbar.locator('button').click();await page.waitForFunction(()=>window.printEvents.length===1);
    await page.emulateMedia({media:'print'});assert.equal(await toolbar.isVisible(),false,'statement actions are excluded from print');await page.emulateMedia({media:'screen'});
    if(lang==='ar'&&width===390){const output=process.env.LOUREX_EDITOR_QA_OUTPUT||'/tmp/lourex-editor-design';await fs.mkdir(output,{recursive:true});await toolbar.screenshot({path:output+'/statement-output.png'});}
    assert.equal(errors.length,0,errors.join('\n'));cases++;continue;
   }
   const cards=page.locator('.editor-discovery-card');await cards.first().waitFor({timeout:10000});
   assert.equal(await cards.count(),2,`${kind}: template and appearance cards`);
   if(kind!=='draft'){
    const bankAllowed=documentBankAllowed(kind==='credit-note'?'invoice':kind,kind==='credit-note'?'credit-note':'standard');
    assert.equal(await page.locator('.editor-document-elements-bank select').count(),bankAllowed?1:0,`${kind}: bank controls follow document capabilities`);
    if(!bankAllowed)assert.doesNotMatch(await page.locator('.editor-document-elements-heading small').innerText(),/bank account|الحساب البنكي/i,'approval hint must match document');
    if(kind==='credit-note')assert.equal(await page.getByRole('button',{name:/Default invoice template|Set as invoice default|القالب الافتراضي للفاتورة|تعيين كافتراضي للفاتورة/}).count(),0,'credit note must not offer an invoice default');
   }
   for(let i=0;i<2;i++){
    const card=cards.nth(i),summary=card.locator(':scope > summary');
    const valid=await summary.evaluate(el=>{
     const r=el.getBoundingClientRect(),css=getComputedStyle(el),action=el.querySelector('.editor-discovery-action');
     return {height:r.height,width:r.width,cursor:css.cursor,action:Boolean(action?.textContent.trim()),scroll:el.scrollWidth,client:el.clientWidth};
    });assert.ok(valid.height>=48&&valid.width>0&&valid.cursor==='pointer'&&valid.action&&valid.scroll<=valid.client+1,`${kind}/${lang}/${width}: discoverable, readable summary ${JSON.stringify(valid)}`);
    await summary.focus();const wasOpen=await card.evaluate(el=>el.open);
    await page.keyboard.press('Enter');assert.equal(await card.evaluate(el=>el.open),!wasOpen,'native keyboard toggle');
    if(wasOpen)await summary.click();
    await summary.click();assert.equal(await card.evaluate(el=>el.open),false,'click closes card');
   }
   const template=page.locator('.editor-template-options.editor-discovery-card');
   await template.locator('summary').click();
   const choice=template.locator('.template-card').nth(1),selectedName=await choice.locator('.template-card-copy>b').innerText();
   await choice.click();
   assert.equal(await template.locator('.template-card.selected').count(),1,'template selection remains functional');
   assert.equal(await template.locator('.editor-discovery-name').innerText(),selectedName,'current template name follows selection');
   assert.equal(await page.locator('.editor-discovery-preview > svg.template-mini').count(),1,'lightweight current-template preview');
   if(kind==='proforma'&&lang==='ar'&&width===390){
    await template.locator('summary').click();
    const output=process.env.LOUREX_EDITOR_QA_OUTPUT||'/tmp/lourex-editor-design';await fs.mkdir(output,{recursive:true});
    await template.locator('..').screenshot({path:output+'/mobile-design.png'});
   }
   assert.equal(errors.length,0,errors.join('\n'));cases++;
  }
  console.log(`${cases} important-document discovery cases passed (Arabic/English; mobile/desktop).`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
