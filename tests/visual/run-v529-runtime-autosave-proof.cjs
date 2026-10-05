const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const {readFileSync,writeFileSync,unlinkSync,mkdirSync}=require('node:fs');

const output='visual-qa-output/v529-runtime-autosave-proof';
const emitted='dist/src/app/index.js';
const qaModule='dist/src/app/index-v529-runtime-proof.js';

function exposeAdaptiveRuntime(){
  let source=readFileSync(emitted,'utf8');
  const appOwner=/const\s+App\s*=\s*AdaptiveCloudApp\s*;/;
  const startOwner=/void\s+start\(\)\s*;/;
  assert.equal((source.match(appOwner)||[]).length,1,'production runtime must contain one AdaptiveCloudApp owner');
  assert.equal((source.match(startOwner)||[]).length,1,'production runtime must contain one auto-start call');
  source=source.replace(appOwner,'export { AdaptiveCloudApp }; const App = AdaptiveCloudApp;');
  source=source.replace(startOwner,'/* v529 QA: auto-start suppressed; runtime class exported above. */');
  writeFileSync(qaModule,source);
}

(async()=>{
  mkdirSync(output,{recursive:true});
  exposeAdaptiveRuntime();
  const browser=await webkit.launch({headless:true});
  try{
    const context=await browser.newContext({
      viewport:{width:390,height:844},
      hasTouch:true,
      isMobile:true,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    });
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error)));
    await page.goto('http://127.0.0.1:4173/tests/visual/v529-runtime-autosave-proof.html',{waitUntil:'load'});

    const proof=await page.evaluate(async()=>{
      const [runtime,defaults,documents,vaultStorage,db,workspaces]=await Promise.all([
        import('/dist/src/app/index-v529-runtime-proof.js'),
        import('/dist/src/lib/defaults.js'),
        import('/dist/src/lib/documents.js'),
        import('/dist/src/storage/vault.js'),
        import('/dist/src/storage/db.js'),
        import('/dist/src/lib/workspaces.js')
      ]);

      let full=defaults.emptyVault();
      const scoped=workspaces.scopeVault(full);
      const doc=documents.createBlankDocument('proforma','PI-2026-0529',scoped.company);
      doc.items=[{...doc.items[0],descriptionEn:'Runtime autosave proof',descriptionAr:'إثبات الحفظ التلقائي',quantity:'1',unit:'PCS',unitPrice:'25.00'}];
      const intended={...scoped,documents:[doc]};
      full=workspaces.applyWorkspaceScope(full,intended);

      const setup=await vaultStorage.setupVault('2468',full);
      const before=await db.getEncryptedVault();
      if(!before)throw new Error('QA encrypted Vault baseline missing.');

      const app=new runtime.AdaptiveCloudApp({});
      app.setState=(update,callback)=>{
        const patch=typeof update==='function'?update(app.state,app.props):update;
        if(patch)app.state={...app.state,...patch};
        if(typeof callback==='function')callback();
      };
      app.state={...app.state,loading:false,firstRun:false,unlocked:true,key:setup.key,vault:full,screen:'editor',editorDoc:doc,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''};
      app.vaultWriteTail=Promise.resolve(full);

      const edited={...doc,number:'PI-2026-0529-A',updatedAt:new Date(Date.now()+1000).toISOString()};
      await app.saveDocument(edited,true);

      const afterAuto=await db.getEncryptedVault();
      const checkpoint=await db.getRecord('document-autosave');
      const inMemory=workspaces.scopeVault(app.state.vault).documents.find(row=>row.id===doc.id)||null;

      app.closeEditor();
      const deadline=Date.now()+5000;
      let afterCloseCheckpoint=await db.getRecord('document-autosave');
      while(afterCloseCheckpoint&&Date.now()<deadline){
        await new Promise(resolve=>setTimeout(resolve,25));
        afterCloseCheckpoint=await db.getRecord('document-autosave');
      }
      while(app.state.screen==='editor'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
      const afterClose=await db.getEncryptedVault();

      return{
        before:{updatedAt:before.updatedAt,cipher:before.cipher},
        afterAuto:afterAuto?{updatedAt:afterAuto.updatedAt,cipher:afterAuto.cipher}:null,
        checkpoint:checkpoint?{id:checkpoint.id,documentId:checkpoint.documentId,documentNumber:checkpoint.documentNumber,documentUpdatedAt:checkpoint.documentUpdatedAt,cipherChars:String(checkpoint.cipher||'').length}:null,
        inMemoryNumber:inMemory?.number||'',
        afterCloseCheckpoint:Boolean(afterCloseCheckpoint),
        afterClose:afterClose?{updatedAt:afterClose.updatedAt,cipher:afterClose.cipher}:null,
        finalScreen:app.state.screen,
        finalEditor:Boolean(app.state.editorDoc)
      };
    });

    assert.deepEqual(pageErrors,[],'production runtime emitted browser errors');
    assert.ok(proof.checkpoint,'automatic draft save must create the encrypted per-document checkpoint');
    assert.equal(proof.checkpoint.id,'document-autosave');
    assert.equal(proof.checkpoint.documentNumber,'PI-2026-0529-A');
    assert.ok(proof.checkpoint.cipherChars>0,'checkpoint must contain encrypted payload bytes');
    assert.equal(proof.inMemoryNumber,'PI-2026-0529-A','in-memory Vault must immediately reflect the edited draft');
    assert.ok(proof.afterAuto,'encrypted Vault must remain readable after autosave');
    assert.equal(proof.afterAuto.updatedAt,proof.before.updatedAt,'automatic draft save must not rewrite the full encrypted Vault');
    assert.equal(proof.afterAuto.cipher,proof.before.cipher,'automatic draft save must leave full-vault ciphertext untouched');
    assert.equal(proof.afterCloseCheckpoint,false,'normal editor close must flush and clear the document checkpoint');
    assert.ok(proof.afterClose,'full encrypted Vault must exist after close');
    assert.notEqual(proof.afterClose.cipher,proof.before.cipher,'editor close must fold the checkpoint into full encrypted Vault persistence');
    assert.equal(proof.finalScreen,'documents','editor closes only after durability flush completes');
    assert.equal(proof.finalEditor,false,'editor document must be released after durability flush');

    writeFileSync(`${output}/report.json`,JSON.stringify(proof,null,2));
    console.log('v529 production-runtime autosave proof passed: draft edit -> encrypted document checkpoint only; editor close -> full Vault flush.');
    await context.close();
  }finally{
    await browser.close();
    try{unlinkSync(qaModule);}catch{}
  }
})().catch(error=>{try{unlinkSync(qaModule);}catch{};console.error(error);process.exitCode=1;});
