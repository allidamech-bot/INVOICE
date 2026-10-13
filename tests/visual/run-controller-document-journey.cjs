// Real browser + XLSX + PDF bytes + IndexedDB writers. No production access.
// Provider translation is deliberately stubbed; this is NOT a live-model test.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
async function run(engine,name){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.firebase={apps:[{}],auth:()=>({currentUser:{uid:'isolated-controller-qa',getIdToken:async()=>'fixture-token'},onAuthStateChanged:()=>()=>{}})};});
  await page.route('**/api/**',async route=>{
   const body=route.request().postDataJSON();
   if(body?.mode==='working-draft-plan'){
    const row=body.draft.rows[2];
    return route.fulfill({json:{plan:{action:'edit',artifactId:body.draft.id,revision:body.draft.revision,question:'',operations:[{lineId:row.id,field:'unitPrice',value:'26',evidence:'26'}]}}});
   }
   return route.fulfill({status:503,json:{code:'AI_NOT_CONFIGURED'}});
  });
  await page.goto('http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=en&theme=dark',{waitUntil:'networkidle'});
  for(const file of ['vendor/html2canvas.min.js','vendor/jspdf.umd.min.js','ios-print-bridge.js','vendor/xlsx.full.min.js'])await page.addScriptTag({url:'/dist/'+file});
  await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
  await page.evaluate(async()=>{
   const [{setupVault},{emptyVault},{establishSession},{blankCustomer}]=await Promise.all([
    import('/dist/src/storage/vault.js'),import('/dist/src/lib/defaults.js'),import('/dist/src/storage/session.js'),import('/dist/src/components/CustomersPage.js')]);
   const vault=emptyVault();vault.company.nameEn='Isolated Controller QA';
   vault.customers=[{...blankCustomer(),id:'qa-buyer',workspaceId:'default',branchId:'main',companyNameEn:'QA Buyer'}];
   const {key}=await setupVault('2468',vault);if(!await establishSession(key))throw Error('No test session');
   window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid:'qa'}}));
  });
  await page.locator('.lourex-ai-launcher').click();
  const panel=page.locator('#lourex-ai-panel[data-workspace-ready="true"]');await panel.waitFor();
  const bytes=await page.evaluate(()=>{
   const matrix=[['Product','Quantity','Unit','Unit Price','Currency'],...Array.from({length:85},(_,i)=>['Product '+(i+1),2,'CTN',10,'USD'])];
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(matrix),'Products');return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
  });
  await panel.locator('input[type=file][multiple]').setInputFiles({name:'controller-85.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)});
  async function say(text){
   const oldCount=await panel.locator('.lourex-ai-message.user').count();
   const input=panel.locator('textarea');await input.fill(text);await panel.locator('.lourex-ai-send').click();
   // Local revision commands do not use the model streaming spinner.
   // Wait for the full controller turn and its state update before inspecting the draft.
   await page.waitForFunction(previous=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.user').length>previous
     && document.querySelector('#lourex-ai-panel .lourex-ai-send')?.getAttribute('data-turn-pending')==='false',oldCount,{timeout:45000});
   await page.waitForFunction(()=>!document.querySelector('#lourex-ai-panel .lourex-ai-send.is-stop'),null,{timeout:45000});
  }
  await say('Convert this file to a quotation');
  const card=panel.locator('.lxw-chat-document');await card.waitFor({timeout:45000});
  await card.getByLabel('Draft customer',{exact:true}).selectOption('qa-buyer');
  await card.locator('summary').click();
  assert.match(await card.innerText(),/85/);assert.match(await card.innerText(),/1,?700\.00/);
  const count=()=>page.evaluate(async()=> (await(await import('/dist/src/storage/vault.js')).resumeVaultSession()).vault.documents.length);
  assert.equal(await count(),0);
  async function pdf(){
   await card.getByRole('button',{name:'Generate PDF · no save',exact:true}).click();
   const link=card.getByRole('link',{name:'Download PDF',exact:true});await link.waitFor({timeout:90000});
   const href=await link.getAttribute('href');
   const result=await page.evaluate(async href=>{
    const bytes=new Uint8Array(await(await fetch(href)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {size:bytes.length,header:binary.slice(0,5),pages:(binary.match(/\/Type\s*\/Page\b/g)||[]).length};
   },href);
   assert.equal(result.header,'%PDF-');assert.ok(result.size>10000);assert.ok(result.pages>1);
   const download=page.waitForEvent('download');await link.click();assert.equal(await(await download).failure(),null);
   return href;
  }
  const firstPdf=await pdf();
  await say('Could you put 26 on the third product please?');
  await page.waitForFunction(()=>document.querySelector('.lxw-chat-document')?.textContent.includes('1732.00')||document.querySelector('.lxw-chat-document')?.textContent.includes('1,732.00'));
  assert.equal(await card.locator('a[download]').count(),0,'old PDF must be invalidated');
  await say('undo');assert.match(await card.innerText(),/1,?700\.00/);
  assert.ok(Number(await card.getAttribute('data-artifact-revision'))>1,'undo must advance the tracked draft revision');
  await say('redo');assert.match(await card.innerText(),/1,?732\.00/);
  assert.notEqual(await pdf(),firstPdf);
  await say('save this draft');
  await panel.getByRole('button',{name:'Decline',exact:true}).click();
  await page.waitForTimeout(300);assert.equal(await count(),0);await card.waitFor();
  await say('save this draft');
  await panel.locator('.lxw-inline-approval').getByRole('button',{name:'Review details',exact:true}).click();
  await panel.getByRole('button',{name:'I reviewed this draft',exact:true}).click();
  await panel.getByRole('button',{name:'Approve draft',exact:true}).click();
  await page.waitForFunction(async()=> (await(await import('/dist/src/storage/vault.js')).resumeVaultSession()).vault.documents.length===1,null,{timeout:30000});
  const saved=await page.evaluate(async()=> (await(await import('/dist/src/storage/vault.js')).resumeVaultSession()).vault.documents[0]);
  assert.equal(saved.items.length,85);assert.equal(saved.items[2].unitPrice,'26');
  await page.reload({waitUntil:'networkidle'});assert.equal(await count(),1,'reload must not execute twice');
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': XLSX 85 lines → real multipage PDF/download → model-plan fixture edit → undo/redo → new PDF → refusal/no save → reviewed single save → reload/no duplicate. Live provider NOT tested.');
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit');})().catch(e=>{console.error(e);process.exitCode=1});
