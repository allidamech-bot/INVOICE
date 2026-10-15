// Full source Excel upload fixture (85 rows), with an intentionally lossy
// stubbed AI supplier extraction. Actual worksheet parsing, Controller staging
// and scoped storage are real. No production credentials or external AI calls.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
async function run(engine,name){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',err=>errors.push(String(err)));
  await page.addInitScript(()=>{window.firebase={apps:[{}],auth:()=>({currentUser:{uid:'isolated-controller-qa',getIdToken:async()=>'fixture-token'},onAuthStateChanged:()=>()=>{}})};});
  let supplierCalls=0;
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),body=route.request().postDataJSON();
   if(url.pathname==='/api/ai-inbox'&&!body.mode)
    return route.fulfill({json:{classification:{route:'supplier_purchase',documentType:'supplier_offer',confidence:0.99,reason:'Supplier XLSX QA'}}});
   if(url.pathname==='/api/supplier-document-ai'){
    supplierCalls++;
    // Simulate an AI returning only the first row. The complete XLSX sheet,
    // not this lossy model result, MUST control the final working quotation.
    return route.fulfill({json:{draft:{supplierName:'Fixture Supplier',currency:'USD',
      paymentTerms:'Do not copy to customer',items:[
       {sku:'WHOLESALE-001',descriptionEn:'Wholesale product 001',quantity:'2',unit:'CTN',unitCost:'10.00'}
      ]}}});
   }
   return route.fulfill({status:503,json:{code:'AI_NOT_CONFIGURED'}});
  });
  await page.goto('http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=en&theme=dark',{waitUntil:'networkidle'});
  await page.addScriptTag({url:'/dist/vendor/xlsx.full.min.js'});
  await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
  async function installPinlessFixture(){
   await page.evaluate(async()=>{
    const uid='isolated-controller-qa';
    const [{activateAccountStorage,getPlainWorkspace,savePlainWorkspace,getAccountAssistantCacheKey},
     {emptyVault},{blankCustomer},{registerWorkspaceSessionReader,registerVaultMutationBridge},
     {scopeVaultForExternalMutation,applyWorkspaceScope,mergeScopedVault},{mergeVaultIntent},
     {appendAuditEventsForVaultDiff}]=await Promise.all([
      import('/dist/src/storage/db.js'),import('/dist/src/lib/defaults.js'),
      import('/dist/src/components/CustomersPage.js'),import('/dist/src/storage/vault-mutation-bridge.js'),
      import('/dist/src/lib/workspaces.js'),import('/dist/src/storage/vault-merge.js'),
      import('/dist/src/lib/audit-diff.js')]);
    await activateAccountStorage(uid);
    const existing=await getPlainWorkspace();
    if(!existing){
     const vault=emptyVault();vault.company.nameEn='Isolated Controller QA';
     vault.customers=[{...blankCustomer(),id:'qa-buyer',workspaceId:'default',branchId:'main',companyNameEn:'QA Buyer'}];
     await savePlainWorkspace(uid,vault,null,null);
    }
    // Mirror the production bridge rather than invoking the retired PIN vault.
    registerWorkspaceSessionReader(async()=>{
     const record=await getPlainWorkspace();
     return record?{key:await getAccountAssistantCacheKey(uid),vault:structuredClone(record.payload)}:null;
    });
    let queue=Promise.resolve();
    registerVaultMutationBridge(mutation=>{
     const job=queue.then(async()=>{
      const record=await getPlainWorkspace();
      if(!record)throw new Error('Scoped test workspace disappeared before mutation.');
      const scoped=scopeVaultForExternalMutation(record.payload);
      const intended=applyWorkspaceScope(scoped,mutation(scoped));
      const validated=mergeVaultIntent(scoped,intended,scoped);
      const next=mergeScopedVault(record.payload,appendAuditEventsForVaultDiff(scoped,validated));
      await savePlainWorkspace(uid,next,record.baseCloudRevision,record.baseCloudSha256);
      return next;
     });
     queue=job.then(()=>undefined,()=>undefined);
     return job;
    });
    window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));
   });
  }

  await installPinlessFixture();
  await page.locator('.lourex-ai-launcher').click();
  const panel=page.locator('#lourex-ai-panel[data-workspace-ready="true"]');await panel.waitFor();
  const bytes=await page.evaluate(()=>{
   const rows=[['SKU','Description','Quantity','Unit','Unit Cost','Currency'],
    ...Array.from({length:85},(_,i)=>['WHOLESALE-'+String(i+1).padStart(3,'0'),
     'Wholesale product '+String(i+1).padStart(3,'0'),2,'CTN',10,'USD'])];
   const book=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Wholesale Costs');
   return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
  });
  await panel.locator('input[type=file][multiple]').setInputFiles({
    name:'supplier-unit-cost-85.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer:Buffer.from(bytes)
  });
  const message='حوّل فاتورة المورد إلى عرض سعر وأضف 3% على الأسعار';
  const prev=await panel.locator('.lourex-ai-message.user').count();
  await panel.locator('textarea').fill(message);
  await panel.locator('.lourex-ai-send').click();
  await page.waitForFunction(old=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.user').length>old
    && document.querySelector('#lourex-ai-panel .lourex-ai-send')?.getAttribute('data-turn-pending')==='false',
    prev,{timeout:45000});
  const card=panel.locator('.lxw-chat-document');
  await card.waitFor({timeout:45000});
  assert.equal(supplierCalls,1,'real file passed through supplier extraction endpoint');
  await card.locator('summary').click();
  const text=await card.innerText();
  assert.match(text,/85/,'all 85 source rows survive lossy AI extraction');
  assert.match(text,/1,?751\.00/,'exact 3% markup on 85 × 2 × 10.00 costs');
  assert.equal(await card.getByLabel('Draft customer',{exact:true}).inputValue(),'');
  assert.equal(await card.getByRole('button',{name:'Generate PDF preview',exact:true}).isDisabled(),true,
    'no buyer, so the quote cannot be approved or exported yet');
  const count=await page.evaluate(async()=> (await(await import('/dist/src/storage/vault.js')).resumeVaultSession()).vault.documents.length);
  assert.equal(count,0,'conversion and markup must not save any document');
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': real supplier XLSX 85 source rows, explicit Unit Cost, deliberately partial AI response, complete quotation with 3% markup, unsaved and buyer-gated. Live provider NOT tested.');
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit');})().catch(err=>{console.error(err);process.exitCode=1});
