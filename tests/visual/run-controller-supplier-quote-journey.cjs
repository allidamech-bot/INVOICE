// Full Controller supplier document → quote → revisions → PDF → reviewed save.
// Actual browser UI + TXT attachment + IndexedDB and PDF bytes. No production.
// Provider classification / extraction are deliberate stubs: NOT a live-model test.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
async function run(engine,name){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.firebase={apps:[{}],auth:()=>({currentUser:{uid:'isolated-controller-qa',getIdToken:async()=>'fixture-token'},onAuthStateChanged:()=>()=>{}})};});
  let extractionCalls=0;
  await page.route('**/api/**',async route=>{
   const body=route.request().postDataJSON();
   const url=new URL(route.request().url());
   if(url.pathname==='/api/ai-inbox'&&!body.mode)
     return route.fulfill({json:{classification:{route:'supplier_purchase',documentType:'supplier_offer',confidence:0.98,reason:'Fixture verifies supplier classification'}}});
   if(url.pathname==='/api/supplier-document-ai'){
    extractionCalls++;
    const items=Array.from({length:24},(_,i)=>({
     sku:'SUP-'+String(i+1).padStart(3,'0'),descriptionEn:'Supplier item '+String(i+1).padStart(3,'0'),
     descriptionAr:'',quantity:'2',unit:'CTN',unitCost:'10.00'
    }));
    return route.fulfill({json:{draft:{supplierName:'Fixture Supplier',supplierTaxId:'',
     documentNumber:'SO-TEST-001',date:'2026-10-15',currency:'USD',freight:'',duty:'',
     otherCosts:'',paymentTerms:'Supplier prepayment - must not copy',notes:'CONFIDENTIAL supplier terms',
     items}}});
   }
   return route.fulfill({status:503,json:{code:'AI_NOT_CONFIGURED'}});
  });
  await page.goto('http://127.0.0.1:4173/tests/visual/contextual-ai-batch4.html?lang=en&theme=dark',{waitUntil:'networkidle'});
  const pdfDependencies=['vendor/html2canvas.min.js','vendor/jspdf.umd.min.js','ios-print-bridge.js','vendor/xlsx.full.min.js'];
  for(const file of pdfDependencies)await page.addScriptTag({url:'/dist/'+file});
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
  const source=Array.from({length:24},(_,i)=>'SUP-'+String(i+1).padStart(3,'0')+' | Supplier item '+String(i+1).padStart(3,'0')+' | 2 CTN | USD 10.00').join('\n');
  await panel.locator('input[type=file][multiple]').setInputFiles({
    name:'supplier-offer-24.txt',mimeType:'text/plain',buffer:Buffer.from(source,'utf8')
  });
  async function say(text){
   const oldCount=await panel.locator('.lourex-ai-message.user').count();
   const input=panel.locator('textarea');await input.fill(text);await panel.locator('.lourex-ai-send').click();
   // Local revision commands do not use the model streaming spinner.
   // Wait for the full controller turn and its state update before inspecting the draft.
   await page.waitForFunction(previous=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.user').length>previous
     && document.querySelector('#lourex-ai-panel .lourex-ai-send')?.getAttribute('data-turn-pending')==='false',oldCount,{timeout:45000});
   await page.waitForFunction(()=>!document.querySelector('#lourex-ai-panel .lourex-ai-send.is-stop'),null,{timeout:45000});
  }
  await say('حوّل فاتورة المورد إلى عرض سعر بهامش ربح 20%');
  const card=panel.locator('.lxw-chat-document');await card.waitFor({timeout:45000});
  assert.equal(extractionCalls,1,'supplier extraction was requested from real attachment');
  await card.locator('summary').click();
  assert.match(await card.innerText(),/24/);
  assert.match(await card.innerText(),/600\.00/);
  assert.equal(await card.getByLabel('Draft customer',{exact:true}).inputValue(),'');
  assert.equal(await card.getByRole('button',{name:'Generate PDF preview',exact:true}).isDisabled(),true,
   'buyer is missing, so no PDF or save may happen');
  await say('عيّن العميل QA Buyer');
  assert.equal(await card.getByLabel('Draft customer',{exact:true}).inputValue(),'qa-buyer');
  assert.match(await card.innerText(),/600\.00/);
  await say('في نفس المسودة، أضف 3% على الأسعار');
  assert.match(await card.innerText(),/618\.24/);
  assert.equal(await card.getByRole('button',{name:'Generate PDF preview',exact:true}).isEnabled(),true);
  const count=()=>page.evaluate(async()=> (await(await import('/dist/src/storage/vault.js')).resumeVaultSession()).vault.documents.length);
  async function assistantMeta(){
   return page.evaluate(async()=>{
    const [{getAccountAssistantCacheKey},{loadAssistantState}]=await Promise.all([
      import('/dist/src/storage/db.js'),import('/dist/src/storage/assistant-store.js')]);
    const key=await getAccountAssistantCacheKey('isolated-controller-qa');
    const state=await loadAssistantState(key);
    return{current:state.currentBusinessThreadId,threads:state.threads.filter(t=>t.scope==='business').map(t=>({
      id:t.id,updatedAt:t.updatedAt,
      artifact:t.kernel?.artifact?{id:t.kernel.artifact.id,revision:t.kernel.artifact.revision,
        approvalId:t.kernel.artifact.proposal?.foundationApproval?.id||'',
        capability:t.kernel.artifact.proposal?.capability}:null,
      entity:t.kernel?.entity,
      receipts:(t.foundationReceipts||[]).map(r=>({id:r.id,state:r.state,action:r.action,
        resultId:r.resultId,draftId:r.draftId,draftRevision:r.draftRevision,
        payloadMatchesArtifact:Boolean(t.kernel?.artifact&&r.payload&&
         r.payload===JSON.stringify(t.kernel.artifact.proposal,(key,value)=>key==='foundationApproval'?undefined:value))}))
    }))};
   });
  }
  assert.equal(await count(),0);
  // A customer list must remain available without losing the UNSAVED 24-line
  // working quotation. Listing and checkbox selection are read-only.
  const workingArtifact=await card.getAttribute('data-artifact-id');
  await say('show all customers');
  const inDraftRecords=panel.locator('.lxw-records-picker');
  await inDraftRecords.waitFor({timeout:30000});
  assert.match(await inDraftRecords.innerText(),/QA Buyer/);
  assert.equal(await card.getAttribute('data-artifact-id'),workingArtifact);
  assert.equal(await count(),0,'reading customers while drafting must not persist');
  await inDraftRecords.locator('input[type=checkbox]').click();
  await page.waitForFunction(()=>document.querySelector('.lxw-records-picker header small')?.textContent.includes('1 selected'));
  assert.equal(await count(),0,'selecting customers while drafting must not persist');
  async function pdf(){
   await card.getByRole('button',{name:'Generate PDF preview',exact:true}).click();
   const link=card.getByRole('link',{name:'Download PDF',exact:true});await link.waitFor({timeout:90000});
   const href=await link.getAttribute('href');
   const result=await page.evaluate(async href=>{
    const bytes=new Uint8Array(await(await fetch(href)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {size:bytes.length,header:binary.slice(0,5),pages:(binary.match(/\/Type\s*\/Page\b/g)||[]).length};
   },href);
   assert.equal(result.header,'%PDF-');assert.ok(result.size>10000);assert.ok(result.pages>=1);
   const download=page.waitForEvent('download');await link.click();assert.equal(await(await download).failure(),null);
   return href;
  }
  const firstPdf=await pdf();
  await say('غيّر سعر الصنف 3 إلى 26');
  assert.match(await card.innerText(),/644\.48/,'single-line price edit must keep all 24 rows');
  assert.equal(await card.locator('a[download]').count(),0,'old PDF must be invalidated');
  await say('undo');assert.match(await card.innerText(),/618\.24/);
  assert.ok(Number(await card.getAttribute('data-artifact-revision'))>1,'undo must advance tracked draft revision');
  await say('redo');assert.match(await card.innerText(),/644\.48/);
  assert.notEqual(await pdf(),firstPdf);
  await say('save this draft');
  await panel.getByRole('button',{name:'Decline',exact:true}).click();
  await page.waitForTimeout(300);assert.equal(await count(),0);await card.waitFor();
  await say('save this draft');
  await card.getByRole('button',{name:'Approve and save quotation',exact:true}).click();
  await card.getByRole('button',{name:'I reviewed the full draft',exact:true}).click();
  await card.getByRole('button',{name:'Approve and save quotation',exact:true}).click();
  // The UI confirmation occurs after the transaction and its document artifact
  // are returned. An isolated one-off count can race another vault writer.
  await panel.locator('.lourex-ai-created-artifact').waitFor({timeout:30000});
  const saved=await page.evaluate(async()=>{
   const {resumeVaultSession}=await import('/dist/src/storage/vault.js');
   const first=await resumeVaultSession(),second=await resumeVaultSession();
   return {first:first?.vault.documents.map(d=>({id:d.id,count:d.items.length,price:d.items[2]?.unitPrice}))||[],
     second:second?.vault.documents.map(d=>({id:d.id,count:d.items.length,price:d.items[2]?.unitPrice}))||[],
     error:document.querySelector('.lourex-ai-error')?.textContent||''};
  });
  assert.equal(saved.first.length,1,'first durable vault read: '+JSON.stringify(saved));
  assert.equal(saved.second.length,1,'second durable vault read: '+JSON.stringify(saved));
  assert.equal(saved.first[0].id,saved.second[0].id,'saved document identity must remain stable');
  assert.equal(saved.second[0].count,24);
  assert.equal(saved.second[0].price,'26');
  const beforeReloadMeta=await assistantMeta();
  await page.reload({waitUntil:'networkidle'});
  // This isolated fixture manually injects the canonical PDF engine. A browser
  // reload discards those script tags; production's full application bootstrap
  // loads them itself, so restore the same dependencies before asserting PDF.
  for(const file of pdfDependencies)await page.addScriptTag({url:'/dist/'+file});
  assert.equal(await page.evaluate(()=>typeof window.__LOUREX_BUILD_CHAT_PDF__),'function','PDF engine must be reinitialized after browser reload');
  await installPinlessFixture();
  assert.equal(await count(),1,'reload must not execute twice');
  // The saved document identity, not a temporary PDF blob URL, survives reload.
  await page.locator('.lourex-ai-launcher').click();
  const reopened=page.locator('#lourex-ai-panel[data-workspace-ready="true"]');await reopened.waitFor();
  const restored=reopened.locator('.lxw-chat-document');await restored.waitFor({timeout:30000});
  const afterReloadMeta=await assistantMeta();
  assert.equal(await restored.getAttribute('data-artifact-id'),saved.second[0].id,
    'Restored document must match durable storage: '+JSON.stringify({beforeReloadMeta,afterReloadMeta}));
  assert.match(await restored.innerText(),/Saved/);
  await restored.getByRole('button',{name:'Generate PDF preview',exact:true}).click();
  try{
   await restored.getByRole('link',{name:'Download PDF',exact:true}).waitFor({timeout:45000});
  }catch(error){
   const details=await page.evaluate(()=>{
    const card=document.querySelector('#lourex-ai-panel .lxw-chat-document');
    return {cardId:card?.getAttribute('data-artifact-id'),error:card?.querySelector('[role=alert]')?.textContent,
      busy:card?.querySelector('.lxw-ai-pdf-actions button')?.textContent,
      pdfStage:Boolean(card?.querySelector('.lxw-ai-pdf-render-target')),
      pdfEngine:typeof window.__LOUREX_BUILD_CHAT_PDF__,
      assistantError:document.querySelector('.lourex-ai-error')?.textContent,
      cardText:card?.textContent?.slice(-1500)};
   });
   throw new Error('Saved document PDF not produced after reload: '+JSON.stringify(details)+'; '+String(error));
  }
  // A saved draft cannot shadow the subsequent in-chat business list. The
  // Controller must render a real selectable customer record after reload.
  await say('show all customers');
  const records=reopened.locator('.lxw-records-picker');
  await records.waitFor({timeout:30000});
  assert.match(await records.innerText(),/QA Buyer/);
  assert.equal(await records.locator('input[type=checkbox]').count(),1);
  await records.locator('input[type=checkbox]').click();
  await page.waitForFunction(()=>document.querySelector('.lxw-records-picker header small')?.textContent.includes('1 selected'));
  assert.equal(await count(),1,'record selection must not write a second document');
  await say('إلغاء التحديد');
  await page.waitForFunction(()=>document.querySelector('.lxw-records-picker header small')?.textContent.includes('0 selected'));
  assert.equal(await count(),1,'clearing the selection must not mutate documents');
  assert.deepEqual(errors,[]);
  console.log('PASS '+name+': supplier TXT 24 lines → supplier extraction stub → complete unsaved quote → buyer selection → 3% markup → real PDF/download → line edit → undo/redo → new PDF → decline/no save → reviewed single save → reload/no duplicate. Live AI provider NOT tested.');
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit');})().catch(e=>{console.error(e);process.exitCode=1});
