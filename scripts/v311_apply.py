from pathlib import Path

# 1) Cloud runtime: background freshness may notify, but never pull/reload.
p=Path('src/app/App.tsx'); s=p.read_text()
old="""  private handleRemoteCloudNewer=()=>{if(!this.state.cloudUser||!this.state.cloudLinked||this.state.cloudSyncState==='conflict'||this.state.screen==='editor'||this.state.settingsOpen||this.state.cloudModal||this.vaultReplacing)return;void this.cloudSyncNow().catch(()=>undefined);};"""
new="""  private announceRemoteCloudUpdate=()=>{if(!this.state.cloudUser||!this.state.cloudLinked||this.state.cloudSyncState==='conflict')return;this.deferRemoteCloud();try{window.dispatchEvent(new Event('lourex-cloud-refresh-available'));}catch{}};\n  private handleRemoteCloudNewer=()=>{if(!this.state.cloudUser||!this.state.cloudLinked||this.state.cloudSyncState==='conflict')return;this.announceRemoteCloudUpdate();};"""
if old not in s: raise SystemExit('App remote-newer handler anchor not found')
s=s.replace(old,new,1)
old="""  private deferRemoteCloud=()=>this.setState({cloudSyncState:'queued',cloudSyncMessage:t('Newer cloud data is waiting. Close the editor or dialog to apply it safely.','توجد بيانات سحابية أحدث بانتظار الاستعادة. أغلق المحرر أو النافذة لتطبيقها بأمان.')});"""
new="""  private deferRemoteCloud=()=>this.setState({cloudSyncState:'queued',cloudSyncMessage:t('Newer cloud data is available. Apply it when you are ready.','توجد بيانات سحابية أحدث. طبّقها عندما تكون جاهزًا.')});"""
if old not in s: raise SystemExit('App deferRemoteCloud anchor not found')
s=s.replace(old,new,1)
s=s.replace("if(result==='remote-changed'){this.deferRemoteCloud();window.setTimeout(this.handleRemoteCloudNewer,0);return;}","if(result==='remote-changed'){this.announceRemoteCloudUpdate();return;}")
old="""        if(this.state.screen==='editor'||this.state.settingsOpen||this.state.cloudModal)return;\n        void this.cloudSyncNow().catch(()=>undefined);"""
new="""        if(this.state.screen==='editor'||this.state.settingsOpen||this.state.cloudModal)return;\n        this.scheduleCloudSync(220);"""
if old not in s: raise SystemExit('configured cloud auto-sync anchor not found')
s=s.replace(old,new,1)
old="""this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();if(this.state.cloudUser&&this.state.cloudLinked)void this.cloudSyncNow().catch(()=>undefined);else this.scheduleCloudSync(220);});"""
new="""this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);});"""
if old not in s: raise SystemExit('unlock auto-pull anchor not found')
s=s.replace(old,new,1)
p.write_text(s)

# 2) Draft Studio: stable save contract + departure protection.
p=Path('src/components/DraftDocumentEditor.tsx'); s=p.read_text()
if 'private departureFlushQueued=false;' not in s:s=s.replace("  private revision=0;","  private revision=0;\n  private departureFlushQueued=false;",1)
old="""  componentDidMount():void{document.documentElement.setAttribute('data-lourex-document-editor',this.state.doc.id||'draft');}\n  componentWillUnmount():void{document.documentElement.removeAttribute('data-lourex-document-editor');if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);if(this.state.saveState!=='saved'&&!this.state.saving)void this.props.onSave(structuredClone(this.state.doc),true).catch(()=>undefined);}\n"""
new="""  componentDidMount():void{\n    document.documentElement.setAttribute('data-lourex-document-editor',this.state.doc.id||'draft');\n    document.addEventListener('visibilitychange',this.handleVisibilityChange);\n    window.addEventListener('beforeunload',this.handleBeforeUnload);\n    window.addEventListener('pagehide',this.handlePageHide);\n  }\n  componentWillUnmount():void{\n    document.removeEventListener('visibilitychange',this.handleVisibilityChange);\n    window.removeEventListener('beforeunload',this.handleBeforeUnload);\n    window.removeEventListener('pagehide',this.handlePageHide);\n    if(document.documentElement.getAttribute('data-lourex-document-editor')===(this.state.doc.id||'draft'))document.documentElement.removeAttribute('data-lourex-document-editor');\n    if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);\n    this.flushPendingSnapshot();\n  }\n  private handleVisibilityChange=()=>{if(document.visibilityState!=='hidden'||this.state.saveState==='saved')return;if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);void this.save(true);};\n  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(this.state.saveState==='saved'&&!this.state.saving)return;this.flushPendingSnapshot();event.preventDefault();event.returnValue='';};\n  private handlePageHide=()=>this.flushPendingSnapshot();\n  private flushPendingSnapshot=()=>{\n    if(this.departureFlushQueued||this.state.saveState==='saved'&&!this.state.saving)return;\n    this.departureFlushQueued=true;\n    if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);\n    const snapshot=structuredClone(this.state.doc);\n    void this.props.onSave(snapshot,true).catch(()=>{this.departureFlushQueued=false;});\n  };\n"""
if old not in s: raise SystemExit('Draft lifecycle anchor not found')
s=s.replace(old,new,1)
old="""  private mutate=(fn:(doc:LourexDocument)=>LourexDocument)=>{\n    this.props.onEditActivity?.();\n    this.revision+=1;"""
new="""  private mutate=(fn:(doc:LourexDocument)=>LourexDocument)=>{\n    this.props.onEditActivity?.();\n    this.departureFlushQueued=false;\n    this.revision+=1;"""
if old not in s: raise SystemExit('Draft mutate anchor not found')
s=s.replace(old,new,1)
old="""  private saveAndClose=async()=>{if(this.state.saveState==='saved'){this.props.onClose();return;}await this.save(true);if(!this.state.error)this.props.onClose();};\n  private output=async(mode:'print'|'pdf'|'share')=>{\n    if(this.state.outputBusy)return;\n    if(this.state.saveState!=='saved')await this.save(true);\n    const doc=structuredClone(this.state.doc);\n    if(!doc.number.trim()||!doc.issueDate)return;\n    try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}\n    this.setState({outputBusy:true,error:'',mobilePreview:false});\n    try{await this.props.onPrint(doc,mode);}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to prepare document.','تعذر تجهيز المستند.')});}\n    finally{this.setState({outputBusy:false});}\n  };"""
new="""  private persistStable=async():Promise<LourexDocument|null>=>{\n    if(this.autosaveTimer)window.clearTimeout(this.autosaveTimer);\n    while(this.state.saving)await new Promise<void>(resolve=>window.setTimeout(resolve,40));\n    for(;;){\n      const doc=structuredClone(this.state.doc);\n      if(!doc.number.trim()){this.setState({error:t('Document number is required.','رقم المستند مطلوب.'),saveState:'unsaved'});return null;}\n      if(!doc.issueDate){this.setState({error:t('Document date is required.','تاريخ المستند مطلوب.'),saveState:'unsaved'});return null;}\n      const start=this.revision;\n      this.setState({saving:true,saveState:'saving',error:''});\n      try{await this.props.onSave(doc,true);}\n      catch(e){this.setState({saving:false,saveState:'unsaved',error:e instanceof Error?e.message:t('Unable to save document.','تعذر حفظ المستند.')});return null;}\n      if(start!==this.revision){this.setState({saving:false,saveState:'unsaved'});continue;}\n      this.departureFlushQueued=false;\n      this.setState({saving:false,saveState:'saved',error:''});\n      return doc;\n    }\n  };\n  private saveAndClose=async()=>{if(this.state.saveState==='saved'){this.props.onClose();return;}const saved=await this.persistStable();if(saved)this.props.onClose();};\n  private output=async(mode:'print'|'pdf'|'share')=>{\n    if(this.state.outputBusy)return;\n    const doc=this.state.saveState==='saved'?structuredClone(this.state.doc):await this.persistStable();\n    if(!doc)return;\n    try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}\n    this.setState({outputBusy:true,error:'',mobilePreview:false});\n    try{await this.props.onPrint(doc,mode);}catch(e){this.setState({error:e instanceof Error?e.message:t('Unable to prepare document.','تعذر تجهيز المستند.')});}\n    finally{this.setState({outputBusy:false});}\n  };"""
if old not in s: raise SystemExit('Draft save/output anchor not found')
s=s.replace(old,new,1)
p.write_text(s)

# 3) Draft Studio uses protected wrappers and remounts per document id.
p=Path('src/components/EditorPage.tsx'); s=p.read_text()
old="""    if(isLetterDocument(props.document))return <DraftDocumentEditor document={props.document} company={props.company} onClose={props.onClose} onSave={props.onSave} onPrint={props.onPrint} onEditActivity={props.onEditActivity}/>;"""
new="""    if(isLetterDocument(props.document))return <DraftDocumentEditor key={props.document.id} document={props.document} company={props.company} onClose={props.onClose} onSave={this.saveWithProtectedRetry} onPrint={this.printWithPreparedMode} onEditActivity={props.onEditActivity}/>;"""
if old not in s: raise SystemExit('Draft wrapper anchor not found')
p.write_text(s.replace(old,new,1))

# 4) More dialog keyboard focus contract.
p=Path('src/components/AppShell.tsx'); s=p.read_text()
old="""  componentDidUpdate(prev:Props):void{\n    if(prev.screen!==this.props.screen&&this.state.moreOpen)this.setState({moreOpen:false});\n  }\n\n  private handleKeyDown=(event:KeyboardEvent)=>{\n    if(event.key!=='Escape'||!this.state.moreOpen)return;\n    event.preventDefault();\n    this.setState({moreOpen:false});\n  };"""
new="""  componentDidUpdate(prevProps:Props,prevState:State):void{\n    if(prevProps.screen!==this.props.screen&&this.state.moreOpen){this.setState({moreOpen:false});return;}\n    if(!prevState.moreOpen&&this.state.moreOpen)window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('#mobile-more-sheet .mobile-more-close')?.focus({preventScroll:true}));\n    if(prevState.moreOpen&&!this.state.moreOpen&&prevProps.screen===this.props.screen)window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('button[aria-controls=\"mobile-more-sheet\"]')?.focus({preventScroll:true}));\n  }\n\n  private handleKeyDown=(event:KeyboardEvent)=>{\n    if(!this.state.moreOpen)return;\n    if(event.key==='Escape'){event.preventDefault();this.setState({moreOpen:false});return;}\n    if(event.key!=='Tab')return;\n    const sheet=document.getElementById('mobile-more-sheet');if(!sheet)return;\n    const focusable=Array.from(sheet.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex=\"-1\"])')).filter(node=>node.offsetParent!==null);\n    if(!focusable.length){event.preventDefault();return;}\n    const first=focusable[0]!,last=focusable[focusable.length-1]!;\n    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}\n    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}\n  };"""
if old not in s: raise SystemExit('More focus anchor not found')
p.write_text(s.replace(old,new,1))

# 5) Final active-system visual layer.
Path('src/styles/v311-quality-pass.css').write_text(r'''/* LOUREX v311 — system quality pass */
.app-recovery{background:#061820!important;color:#eefbfd!important}
.app-recovery>section{background:#0b2d35!important;border-color:rgba(69,181,190,.30)!important;box-shadow:0 22px 60px rgba(0,0,0,.28)!important}
.app-recovery button:first-of-type{background:#20c9d2!important;border-color:#20c9d2!important;color:#06242b!important}
.app-recovery button:not(:first-of-type){background:#0e3540!important;border-color:#295560!important;color:#eefbfd!important}
.app-recovery details{border-color:#214650!important}.app-recovery summary{color:#c0d5d9!important}.app-recovery pre{background:#071f26!important;color:#bcd0d4!important}
html body .pwa-update-toast,html body [data-lourex-cloud-refresh]{background:#0b3038!important;border:1px solid rgba(32,201,210,.38)!important;color:#effbfd!important;box-shadow:0 18px 42px rgba(0,0,0,.28)!important}
html body .pwa-update-toast :is(strong,small),html body [data-lourex-cloud-refresh] :is(strong,small){color:inherit!important;opacity:1!important}
html body .pwa-update-toast button,html body [data-lourex-cloud-refresh] button{background:#20c9d2!important;border-color:#20c9d2!important;color:#06242b!important;font-weight:900!important}
html body .lourex-ios-output-fallback{background:rgba(2,15,20,.82)!important;backdrop-filter:blur(8px)!important}
html body .lourex-ios-output-card{background:#0b3038!important;border:1px solid rgba(32,201,210,.34)!important;color:#eefbfd!important;box-shadow:0 24px 60px rgba(0,0,0,.32)!important}
html body .lourex-ios-output-card :is(strong,span){color:#eefbfd!important}
html body .lourex-ios-output-spinner{border-color:rgba(32,201,210,.18)!important;border-top-color:#20d3db!important}
html body .lourex-ios-output-primary{background:#20c9d2!important;border-color:#20c9d2!important;color:#06242b!important}
html body .lourex-ios-output-cancel{background:#103943!important;border-color:#2c5963!important;color:#eefbfd!important}
.app-ui .mobile-more-sheet :is(button,a):focus-visible{outline:3px solid rgba(32,211,219,.35)!important;outline-offset:2px!important}
@media(max-width:800px){.app-ui .mobile-more-sheet{overscroll-behavior:contain!important}.app-ui .mobile-more-sheet :is(button,.theme-control){min-height:44px}}
''')

p=Path('index.html'); s=p.read_text()
marker='  <link rel="stylesheet" href="./styles/v310-stability-contrast.css?v=310" data-lourex-v310="true" />'
if marker not in s: raise SystemExit('v310 index marker not found')
s=s.replace(marker,marker+'\n  <link rel="stylesheet" href="./styles/v311-quality-pass.css?v=311" data-lourex-v311="true" />',1)
p.write_text(s)

p=Path('scripts/v303-visual-cache-refresh.mjs'); s=p.read_text()
s=s.replace("const generations=['302','303','304','305','306','307','308','309'];","const generations=['302','303','304','305','306','307','308','309','310'];")
s=s.replace("const CACHE = 'lourex-invoice-v310';","const CACHE = 'lourex-invoice-v311';")
s=s.replace('pre-v310 cache generation','pre-v311 cache generation')
s=s.replace("!sw.includes(\"const CACHE = 'lourex-invoice-v310';\")","!sw.includes(\"const CACHE = 'lourex-invoice-v311';\")")
s=s.replace('promote the LOUREX PWA cache to v310','promote the LOUREX PWA cache to v311')
s=s.replace("'./styles/v310-stability-contrast.css'];","'./styles/v310-stability-contrast.css','./styles/v311-quality-pass.css'];")
s=s.replace('v310 stability cache generation ready','v311 quality cache generation ready')
p.write_text(s)

print('v311 first quality batch applied')
