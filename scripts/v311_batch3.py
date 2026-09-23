from pathlib import Path

# Operations workspace: expose real unsaved input to the shell and hard-navigation guard.
p=Path('src/components/OperationsPage.tsx'); s=p.read_text()
old="""  componentDidMount():void{window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);this.applyFocusedItem();}\n  componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);}\n  componentDidUpdate(prev:Props):void{\n    if(prev.mode!==this.props.mode){const allowed=tabsForMode(this.props.mode);if(!allowed.includes(this.state.tab))this.setState({tab:firstTab(this.props.mode),search:'',error:''});}\n    if(prev.focusItemId!==this.props.focusItemId)this.applyFocusedItem();\n  }"""
new="""  componentDidMount():void{window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.addEventListener('beforeunload',this.handleBeforeUnload);this.applyFocusedItem();this.syncDirtyMarker();}\n  componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('beforeunload',this.handleBeforeUnload);if(document.documentElement.getAttribute('data-lourex-workspace-dirty')==='operations')document.documentElement.removeAttribute('data-lourex-workspace-dirty');}\n  componentDidUpdate(prev:Props):void{\n    if(prev.mode!==this.props.mode){const allowed=tabsForMode(this.props.mode);if(!allowed.includes(this.state.tab))this.setState({tab:firstTab(this.props.mode),search:'',error:''});}\n    if(prev.focusItemId!==this.props.focusItemId)this.applyFocusedItem();\n    this.syncDirtyMarker();\n  }\n  private hasUnsavedWorkspaceInput=():boolean=>Boolean(this.state.supplierEdit||this.state.purchaseEdit||this.state.expenseEdit||this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim());\n  private syncDirtyMarker=()=>{const root=document.documentElement;if(this.hasUnsavedWorkspaceInput())root.setAttribute('data-lourex-workspace-dirty','operations');else if(root.getAttribute('data-lourex-workspace-dirty')==='operations')root.removeAttribute('data-lourex-workspace-dirty');};\n  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(!this.hasUnsavedWorkspaceInput())return;event.preventDefault();event.returnValue='';};"""
if old not in s: raise SystemExit('operations lifecycle anchor missing')
p.write_text(s.replace(old,new,1))

# Product editor: only mark the workspace dirty when its edit differs from the loaded snapshot.
p=Path('src/components/ProductLibraryWorkspace.tsx'); s=p.read_text()
old="""  componentDidMount():void{document.addEventListener('pointerdown',this.closeMenus);document.addEventListener('keydown',this.closeMenusOnEscape);window.addEventListener('lourex-open-product-editor',this.handleQuickCreate);}\n  componentWillUnmount():void{document.removeEventListener('pointerdown',this.closeMenus);document.removeEventListener('keydown',this.closeMenusOnEscape);window.removeEventListener('lourex-open-product-editor',this.handleQuickCreate);}\n  private handleQuickCreate=()=>this.newItem();"""
new="""  componentDidMount():void{document.addEventListener('pointerdown',this.closeMenus);document.addEventListener('keydown',this.closeMenusOnEscape);window.addEventListener('lourex-open-product-editor',this.handleQuickCreate);window.addEventListener('beforeunload',this.handleBeforeUnload);this.syncDirtyMarker();}\n  componentDidUpdate():void{this.syncDirtyMarker();}\n  componentWillUnmount():void{document.removeEventListener('pointerdown',this.closeMenus);document.removeEventListener('keydown',this.closeMenusOnEscape);window.removeEventListener('lourex-open-product-editor',this.handleQuickCreate);window.removeEventListener('beforeunload',this.handleBeforeUnload);if(document.documentElement.getAttribute('data-lourex-workspace-dirty')==='products')document.documentElement.removeAttribute('data-lourex-workspace-dirty');}\n  private handleQuickCreate=()=>this.newItem();"""
if old not in s: raise SystemExit('product lifecycle anchor missing')
s=s.replace(old,new,1)
old="""  private editingDirty=():boolean=>Boolean(this.state.editing&&(!this.state.editingInitial||JSON.stringify(this.state.editing)!==this.state.editingInitial));"""
new=old+"""\n  private syncDirtyMarker=()=>{const root=document.documentElement;if(this.editingDirty())root.setAttribute('data-lourex-workspace-dirty','products');else if(root.getAttribute('data-lourex-workspace-dirty')==='products')root.removeAttribute('data-lourex-workspace-dirty');};\n  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(!this.editingDirty())return;event.preventDefault();event.returnValue='';};"""
s=s.replace(old,new,1)
p.write_text(s)

# Central App navigation guard: every shell/search/AI route and document-open/create path uses one policy.
p=Path('src/app/App.tsx'); s=p.read_text()
anchor="""  private requireVault():VaultPayload{if(!this.state.vault)throw new Error(t('App is locked.','التطبيق مقفل.'));return this.state.vault;}"""
insert="""  private inlineWorkspaceHasUnsavedChanges=():boolean=>document.documentElement.hasAttribute('data-lourex-workspace-dirty');\n  private confirmInlineWorkspaceDeparture=():boolean=>!this.inlineWorkspaceHasUnsavedChanges()||window.confirm(t('Leave this page? Unsaved changes will be lost.','مغادرة هذه الصفحة؟ سيتم فقدان التعديلات غير المحفوظة.'));\n"""+anchor
if anchor not in s: raise SystemExit('App requireVault anchor missing')
s=s.replace(anchor,insert,1)
old="""  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy)return;this.documentCreateBusy=true;"""
new="""  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy||!this.confirmInlineWorkspaceDeparture())return;this.documentCreateBusy=true;"""
if old not in s: raise SystemExit('newDocument anchor missing')
s=s.replace(old,new,1)
old="""  private openDocument=async(doc:LourexDocument)=>{document.documentElement.setAttribute('data-lourex-document-editor','opening');"""
new="""  private openDocument=async(doc:LourexDocument)=>{if(!this.confirmInlineWorkspaceDeparture())return;document.documentElement.setAttribute('data-lourex-document-editor','opening');"""
if old not in s: raise SystemExit('openDocument anchor missing')
s=s.replace(old,new,1)
old="""    const navigate=(screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations')=>this.setState({screen,editorDoc:null,newMenu:false});"""
new="""    const navigate=(screen:'home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations')=>{if(screen===this.state.screen)return;if(!this.confirmInlineWorkspaceDeparture())return;this.setState({screen,editorDoc:null,newMenu:false});};"""
if old not in s: raise SystemExit('central navigate anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

print('v311 batch 3 applied')
