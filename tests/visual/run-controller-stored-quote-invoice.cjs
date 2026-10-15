// Real built Controller UI in isolated Chromium/WebKit + IndexedDB.
// No production connection. Provider calls are blocked; conversion must be local.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const ORIGIN='http://127.0.0.1:4173';
async function run(engine,name){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],external=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{
   window.firebase={apps:[{}],auth:()=>({currentUser:{
    uid:'isolated-stored-quote-e2e',getIdToken:async()=>'fixture-token'},
    onAuthStateChanged:()=>()=>{}})};
  });
  await page.route('**/api/**',route=>{
   external.push(route.request().url());
   return route.fulfill({status:503,json:{code:'AI_NOT_CONFIGURED'}});
  });
  await page.goto(ORIGIN+'/tests/visual/contextual-ai-batch4.html?lang=en&theme=dark',{waitUntil:'networkidle'});
  await page.locator('[data-lourex-proactive-assistant-mount]').waitFor({state:'attached'});
  const quoteNumber=await page.evaluate(async()=>{
   const uid='isolated-stored-quote-e2e';
   const [{activateAccountStorage,getPlainWorkspace,savePlainWorkspace,getAccountAssistantCacheKey},
    {emptyVault,customerSnapshotFrom},{blankCustomer},{createBlankDocument,validateDocument},
    {registerWorkspaceSessionReader,registerVaultMutationBridge},
    {scopeVaultForExternalMutation,applyWorkspaceScope,mergeScopedVault},
    {mergeVaultIntent},{appendAuditEventsForVaultDiff}]=await Promise.all([
     import('/dist/src/storage/db.js'),import('/dist/src/lib/defaults.js'),
     import('/dist/src/components/CustomersPage.js'),import('/dist/src/lib/documents.js'),
     import('/dist/src/storage/vault-mutation-bridge.js'),
     import('/dist/src/lib/workspaces.js'),import('/dist/src/storage/vault-merge.js'),
     import('/dist/src/lib/audit-diff.js')]);
   await activateAccountStorage(uid);
   let record=await getPlainWorkspace();
   if(!record){
    const vault=emptyVault(),now=new Date().toISOString();
    vault.company.nameEn='Isolated Stored Quotation QA';
    const buyer={...blankCustomer(),id:'qa-stored-buyer',workspaceId:'default',branchId:'main',
       companyNameEn:'QA Buyer',createdAt:now,updatedAt:now};
    vault.customers=[buyer];
    const quote=createBlankDocument('proforma','QUO-'+new Date().getFullYear()+'-0091',vault.company);
    quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(buyer);
    quote.items=[
      {...quote.items[0],id:'saved-line-1',descriptionEn:'Red Bull 250 ml',descriptionAr:'ريد بول',quantity:'10',unit:'CTN',unitPrice:'24.50',unitCost:'15.00'},
      {...quote.items[0],id:'saved-line-2',descriptionEn:'Monster 500 ml',descriptionAr:'مونستر',quantity:'7',unit:'CTN',unitPrice:'22.00',unitCost:'12.00'}
    ];
    quote.adjustments.shippingEnabled=true;quote.adjustments.shipping='30';
    quote.terms.remarks='Source commercial terms';
    if(Object.keys(validateDocument(quote)).length)throw new Error('Invalid source quote fixture: '+JSON.stringify(validateDocument(quote)));
    vault.documents=[quote];
    await savePlainWorkspace(uid,vault,null,null);
   }
   registerWorkspaceSessionReader(async()=>{
    const fresh=await getPlainWorkspace();
    return fresh?{key:await getAccountAssistantCacheKey(uid),vault:structuredClone(fresh.payload)}:null;
   });
   let queue=Promise.resolve();
   registerVaultMutationBridge(mutation=>{
    const job=queue.then(async()=>{
     const existing=await getPlainWorkspace();
     const scoped=scopeVaultForExternalMutation(existing.payload);
     const proposed=applyWorkspaceScope(scoped,mutation(scoped));
     const checked=mergeVaultIntent(scoped,proposed,scoped);
     const next=mergeScopedVault(existing.payload,appendAuditEventsForVaultDiff(scoped,checked));
     await savePlainWorkspace(uid,next,existing.baseCloudRevision,existing.baseCloudSha256);
     return next;
    });
    queue=job.then(()=>undefined,()=>undefined);
    return job;
   });
   window.dispatchEvent(new CustomEvent('lourex-account-transition-complete',{detail:{uid}}));
   return (await getPlainWorkspace()).payload.documents[0].number;
  });
  const records=()=>page.evaluate(async()=>{
   const {resumeVaultSession}=await import('/dist/src/storage/vault.js');
   const r=await resumeVaultSession();
   return {documents:r.vault.documents.map(d=>({id:d.id,number:d.number,kind:d.kind,status:d.status,source:d.convertedFromId,
      prices:d.items.map(item=>item.unitPrice),quantities:d.items.map(item=>item.quantity),
      shipping:d.adjustments.shipping,remarks:d.terms.remarks,customer:d.customerSnapshot?.sourceCustomerId})),
     conversions:r.vault.documentEvents.filter(e=>e.type==='converted').length,
     payments:r.vault.payments.length,movements:r.vault.inventoryMovements.length};
  });
  await page.locator('.lourex-ai-launcher').click();
  const panel=page.locator('#lourex-ai-panel[data-workspace-ready="true"]');await panel.waitFor();
  async function say(text){
   const count=await panel.locator('.lourex-ai-message.user').count();
   await panel.locator('textarea').fill(text);
   await panel.locator('.lourex-ai-send').click();
   await page.waitForFunction(previous=>document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.user').length>previous
     &&document.querySelector('#lourex-ai-panel .lourex-ai-send')?.getAttribute('data-turn-pending')==='false',count,{timeout:45000});
   await page.waitForFunction(()=>!document.querySelector('#lourex-ai-panel .lourex-ai-send.is-stop'),null,{timeout:45000});
  }
  await say('Create invoice from quotation');
  assert.equal(await panel.locator('.lourex-ai-tool-approval').count(),0,'no source number = no approval');
  assert.equal((await records()).documents.length,1);
  await say('Create invoice from quotation '+quoteNumber);
  const approval=panel.locator('.lourex-ai-tool-approval');await approval.waitFor({timeout:30000});
  const preview=approval.locator('.lourex-ai-invoice-preview');
  await preview.waitFor();
  assert.equal(await preview.locator('.lourex-ai-invoice-preview-line').count(),9,'every source line and approval condition must be shown');
  assert.match(await preview.innerText(),/Red Bull 250 ml \| 10 CTN \| 24\.50 USD/);
  assert.match(await preview.innerText(),/Monster 500 ml \| 7 CTN \| 22\.00 USD/);
  assert.match(await preview.innerText(),/Source terms, adjustments and tax settings/);
  assert.equal(await approval.getByRole('button',{name:'Approve & apply'}).isDisabled(),true,
    'review acknowledgement must precede saving the invoice');
  await approval.getByRole('button',{name:'I reviewed this action'}).click();
  assert.equal(await approval.getByRole('button',{name:'Approve & apply'}).isEnabled(),true);
  assert.equal((await records()).documents.length,1,'preview must not save');
  await approval.getByRole('button',{name:'Dismiss'}).click();
  assert.equal((await records()).documents.length,1,'reject must not save');
  await say('Create invoice from quotation '+quoteNumber);
  await approval.waitFor();
  await approval.getByRole('button',{name:'I reviewed this action'}).click();
  await approval.getByRole('button',{name:'Approve & apply'}).click();
  try{
   await panel.locator('.lourex-ai-created-artifact').waitFor({timeout:40000});
  }catch(error){
   const diagnostics=await page.evaluate(async()=>{
    const {resumeVaultSession}=await import('/dist/src/storage/vault.js');
    const current=await resumeVaultSession();
    return {saved:(current?.vault.documents||[]).map(x=>({number:x.number,kind:x.kind,source:x.convertedFromId})),
      error:document.querySelector('#lourex-ai-panel .lourex-ai-error')?.textContent||'',
      transcript:[...document.querySelectorAll('#lourex-ai-panel .lourex-ai-message.assistant')].map(x=>x.textContent?.slice(-350)).slice(-4),
      approvals:document.querySelectorAll('#lourex-ai-panel .lourex-ai-tool-approval').length};
   });
   throw new Error('No invoice artifact after reviewed approval: '+JSON.stringify(diagnostics)+'; '+String(error));
  }
  const after=await records();
  assert.equal(after.documents.length,2,'exactly one invoice draft must persist');
  const quote=after.documents.find(d=>d.number===quoteNumber);
  const invoice=after.documents.find(d=>d.kind==='invoice');
  assert.ok(quote&&invoice);
  assert.equal(invoice.source,quote.id);
  assert.equal(invoice.status,'draft');
  assert.deepEqual(invoice.prices,quote.prices);assert.deepEqual(invoice.quantities,quote.quantities);
  assert.equal(invoice.shipping,'30');assert.match(invoice.remarks,/Based on Quotation/);
  assert.equal(after.conversions,1);assert.equal(after.payments,0);assert.equal(after.movements,0);
  assert.match(await panel.locator('.lourex-ai-created-artifact').innerText(),new RegExp(invoice.number));
  assert.equal(await panel.locator('.lourex-ai-created-artifact').getByRole('button',{name:'Open invoice'}).count(),1);
  await page.reload({waitUntil:'networkidle'});
  // Read actual saved IndexedDB without invoking an AI or re-running approval.
  const persisted=await page.evaluate(async()=>{
   const [{activateAccountStorage,getPlainWorkspace}]=await Promise.all([
    import('/dist/src/storage/db.js')]);
   await activateAccountStorage('isolated-stored-quote-e2e');
   const r=await getPlainWorkspace();return r.payload.documents.map(x=>({number:x.number,source:x.convertedFromId}));
  });
  assert.equal(persisted.length,2,'reload never duplicates an approved invoice');
  assert.equal(persisted.find(x=>x.number===invoice.number)?.source,quote.id);
  assert.deepEqual(errors,[]);
  assert.equal(external.length,0,'stored quote conversion must not call a hosted AI provider');
  console.log('PASS '+name+': issued saved quote → full source preview → dismiss/no save → signed approval → linked invoice artifact → IndexedDB reload, no provider calls.');
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'Chromium');await run(webkit,'WebKit');})().catch(error=>{console.error(error);process.exitCode=1;});
