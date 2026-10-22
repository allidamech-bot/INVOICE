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
  // A customer list must remain available without losing an UNSAVED 85-line
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
   const preview=card.getByRole('button',{name:'Generate PDF preview',exact:true});
   // With 85 expanded items, reach the action by scrolling the actual chat
   // viewport as an iPhone user would. Never force-click an offscreen element.
   // Exercise a deliberate user wheel scroll, not script-level scrollTop
   // assignment. LOUREX intentionally follows the latest turn until actual
   // scrolling input occurs; programmatic scrolling is reset to the bottom.
   for(let attempt=0;attempt<12;attempt++){
    const target=await preview.evaluate(node=>{
     const scroll=node.closest('.lourex-ai-messages');
     if(!scroll)throw Error('The Controller has no scrollable conversation');
     const action=node.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
     const desired=viewport.top+Math.min(160,viewport.height/2);
     return{needed:Math.round(action.top-desired),mouseX:viewport.left+viewport.width/2,
       mouseY:viewport.top+viewport.height/2,
       inView:action.top>=viewport.top+2&&action.bottom<=viewport.bottom-2};
    });
    if(target.inView)break;
    await page.mouse.move(target.mouseX,target.mouseY);
    await page.mouse.wheel(0,Math.max(-1200,Math.min(1200,target.needed)));
    await page.waitForTimeout(75);
   }
   const geometry=await preview.evaluate(node=>{
    const rect=node.getBoundingClientRect(),panel=node.closest('.lourex-ai-messages');
    const region=panel?.getBoundingClientRect();
    return{top:Math.round(rect.top),bottom:Math.round(rect.bottom),viewport:innerHeight,
      left:Math.round(rect.left),right:Math.round(rect.right),viewportWidth:innerWidth,
      chatTop:region?Math.round(region.top):null,chatBottom:region?Math.round(region.bottom):null,
      chatLeft:region?Math.round(region.left):null,chatRight:region?Math.round(region.right):null,
      scrollTop:panel?.scrollTop??null,scrollHeight:panel?.scrollHeight??null,
      scrollLeft:panel?.scrollLeft??null,scrollWidth:panel?.scrollWidth??null,
      enabled:!node.disabled};
   });
   assert.ok(geometry.enabled&&geometry.top>=0&&geometry.bottom<=geometry.viewport&&geometry.left>=0&&geometry.right<=geometry.viewportWidth,
      'PDF preview must be reachable by real viewport scrolling: '+JSON.stringify(geometry));
   console.log('Controller PDF action geometry '+name+': '+JSON.stringify(geometry));
   await preview.click({timeout:10000});
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
  // Chat text can request a review, but never authorizes a write. The
  // user-owned Save draft button approves the displayed exact revision.
  assert.equal(await count(),0,'chat request alone cannot persist a draft');
  const saveButton=card.getByRole('button',{name:'Save draft',exact:true});
  assert.equal(await saveButton.isEnabled(),true,'the reviewed draft must have an explicit Save action');
  await saveButton.click();
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
  assert.equal(saved.second[0].count,85);
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
  console.log('PASS '+name+': XLSX 85 lines → real multipage PDF/download → model-plan fixture edit → undo/redo → new PDF → refusal/no save → reviewed single save → reload/no duplicate. Live provider NOT tested.');
 }finally{await browser.close();}
}
(async()=>{await run(webkit,'WebKit');await run(chromium,'Chromium');})().catch(e=>{console.error(e);process.exitCode=1});
