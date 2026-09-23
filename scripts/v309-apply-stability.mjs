import {readFile,writeFile} from 'node:fs/promises';

async function patch(path,fn){
  const before=await readFile(path,'utf8');
  const after=fn(before);
  if(after===before)throw new Error(`v309 patch made no change: ${path}`);
  await writeFile(path,after);
}
function replaceExact(source,from,to,label){
  if(!source.includes(from))throw new Error(`v309 anchor missing: ${label}`);
  return source.replace(from,to);
}

await patch('src/components/DraftDocumentEditor.tsx',source=>replaceExact(
  source,
  "  componentWillUnmount():void{if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);if(this.state.saveState!=='saved'&&!this.state.saving)void this.props.onSave(structuredClone(this.state.doc),true).catch(()=>undefined);}",
  "  componentDidMount():void{document.documentElement.setAttribute('data-lourex-document-editor',this.state.doc.id||'draft');}\n  componentWillUnmount():void{document.documentElement.removeAttribute('data-lourex-document-editor');if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);if(this.state.saveState!=='saved'&&!this.state.saving)void this.props.onSave(structuredClone(this.state.doc),true).catch(()=>undefined);}",
  'draft editor lifecycle guard'
));

await patch('src/cloud/firebase.ts',source=>{
  source=replaceExact(
    source,
    "    if(document.querySelector('.editor-screen,.operations-page,.product-library-pro.editor-open'))return true;",
    "    if(document.documentElement.hasAttribute('data-lourex-document-editor')||document.querySelector('.editor-screen,.operations-page,.product-library-pro.editor-open'))return true;",
    'cloud inline editor guard'
  );
  source=replaceExact(
    source,
    "    const finish=(value:CloudUser|null)=>{if(settled)return;settled=true;if(off)off();try{if(value)sessionStorage.removeItem('lourex-auth-just-signed-in');}catch{}resolve(value);};",
    "    const finish=(value:CloudUser|null)=>{if(settled)return;settled=true;if(off)off();resolve(value);};",
    'fresh-login marker ownership'
  );
  return source;
});

await patch('src/app/index.tsx',source=>{
  source=replaceExact(
    source,
    "      setActiveAccountUid(user.uid);\n      accountWasAuthenticated=true;\n      return;",
    "      if(!selectedStorageUid){\n        // Firebase can restore a persisted account after the public gateway has\n        // already mounted on slow Safari/WebKit startup. Never let setup/PIN\n        // writes continue in the public database: switch to the UID database and\n        // rehydrate the app from that account boundary first.\n        if(signOutTransitionRunning)return;\n        signOutTransitionRunning=true;\n        accountWasAuthenticated=true;\n        void (async()=>{\n          try{setActiveAccountUid(user.uid);await activateAccountStorage(user.uid);}\n          finally{window.location.reload();}\n        })();\n        return;\n      }\n      setActiveAccountUid(user.uid);\n      accountWasAuthenticated=true;\n      return;",
    'late Firebase account storage activation'
  );
  source=replaceExact(
    source,
    "window.addEventListener('lourex-cloud-applied',()=>{\n  if(reloadUnsafeWorkspaceOpen())return;\n  rememberWorkspaceBeforeAutomaticReload();\n  window.location.reload();\n});",
    "let cloudAppliedReloadTimer:number|undefined;\nwindow.addEventListener('lourex-cloud-applied',()=>{\n  if(reloadUnsafeWorkspaceOpen())return;\n  if(cloudAppliedReloadTimer)window.clearTimeout(cloudAppliedReloadTimer);\n  // A document click can race the final cloud callback by a few milliseconds.\n  // Re-check after React has had a chance to mount the editor before reloading.\n  cloudAppliedReloadTimer=window.setTimeout(()=>{\n    cloudAppliedReloadTimer=undefined;\n    if(reloadUnsafeWorkspaceOpen())return;\n    rememberWorkspaceBeforeAutomaticReload();\n    window.location.reload();\n  },360);\n});",
    'deferred cloud-applied reload guard'
  );
  return source;
});

await patch('src/app/App.tsx',source=>{
  source=replaceExact(
    source,
    "  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy)return;this.documentCreateBusy=true;this.setState({newMenu:false});try{const {doc}=await this.reserveDocument(kind);await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:doc,newMenu:false},resolve));}catch(e){this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}finally{this.documentCreateBusy=false;}};",
    "  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy)return;this.documentCreateBusy=true;document.documentElement.setAttribute('data-lourex-document-editor','opening');this.setState({newMenu:false});try{const {doc}=await this.reserveDocument(kind);await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:doc,newMenu:false},resolve));}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}finally{this.documentCreateBusy=false;}};",
    'new document opening guard'
  );
  source=replaceExact(
    source,
    "  private newDocumentForCustomer=async(kind:DocumentKind,customer:Customer)=>{try{const {doc}=await this.reserveDocument(kind);const prepared=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,this.requireVault().company);await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:prepared,newMenu:false},resolve));}catch(e){throw e instanceof Error?e:new Error(t('Unable to create document.','تعذر إنشاء المستند.'));}};",
    "  private newDocumentForCustomer=async(kind:DocumentKind,customer:Customer)=>{document.documentElement.setAttribute('data-lourex-document-editor','opening');try{const {doc}=await this.reserveDocument(kind);const prepared=applyCustomerCommercialDefaults({...doc,customerSnapshot:customerSnapshotFrom(customer)},customer,this.requireVault().company);await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:prepared,newMenu:false},resolve));}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');throw e instanceof Error?e:new Error(t('Unable to create document.','تعذر إنشاء المستند.'));}};",
    'customer document opening guard'
  );
  source=replaceExact(
    source,
    "  private openDocument=async(doc:LourexDocument)=>{try{await this.waitForProtectedDataOperation();this.setState({screen:'editor',editorDoc:structuredClone(doc)});}catch(e){this.showToast(e instanceof Error?e.message:t('Unable to open document.','تعذر فتح المستند.'),'error');}};",
    "  private openDocument=async(doc:LourexDocument)=>{document.documentElement.setAttribute('data-lourex-document-editor','opening');try{await this.waitForProtectedDataOperation();this.setState({screen:'editor',editorDoc:structuredClone(doc)});}catch(e){document.documentElement.removeAttribute('data-lourex-document-editor');this.showToast(e instanceof Error?e.message:t('Unable to open document.','تعذر فتح المستند.'),'error');}};",
    'existing document opening guard'
  );
  return source;
});

await patch('index.html',source=>replaceExact(
  source,
  '  <link rel="stylesheet" href="./styles/v308-document-studio.css?v=308" data-lourex-v308="true" />',
  '  <link rel="stylesheet" href="./styles/v308-document-studio.css?v=308" data-lourex-v308="true" />\n  <link rel="stylesheet" href="./styles/v309-draft-pin-stability.css?v=309" data-lourex-v309="true" />',
  'v309 stylesheet registration'
));

await patch('scripts/v303-visual-cache-refresh.mjs',source=>{
  source=source.replace("const generations=['302','303','304','305','306','307'];","const generations=['302','303','304','305','306','307','308'];");
  source=source.replaceAll("lourex-invoice-v308","lourex-invoice-v309");
  source=source.replaceAll('pre-v308','pre-v309');
  source=source.replace("'./styles/v308-document-studio.css'];","'./styles/v308-document-studio.css','./styles/v309-draft-pin-stability.css'];");
  source=source.replace('v308 document studio cache generation ready.','v309 draft/PIN stability cache generation ready.');
  if(!source.includes("lourex-invoice-v309")||!source.includes("v309-draft-pin-stability.css"))throw new Error('v309 cache patch failed');
  return source;
});

console.log('[LOUREX v309] draft reload, PIN account scope and mobile scroll fixes applied.');
