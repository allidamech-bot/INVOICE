from pathlib import Path


def replace_once(path:str, old:str, new:str, label:str):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'{label} anchor missing')
    p.write_text(s.replace(old,new,1))

# App: one shared departure contract for every top-level navigation path.
p=Path('src/app/App.tsx'); s=p.read_text()
needle="import { setUiLanguage, t } from '../lib/i18n.js';"
if "workspace-dirty.js" not in s:
    if needle not in s: raise SystemExit('App i18n import anchor missing')
    s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
s=s.replace("  private inlineWorkspaceHasUnsavedChanges=():boolean=>document.documentElement.hasAttribute('data-lourex-workspace-dirty');\n  private confirmInlineWorkspaceDeparture=():boolean=>!this.inlineWorkspaceHasUnsavedChanges()||window.confirm(t('Leave this page? Unsaved changes will be lost.','مغادرة هذه الصفحة؟ سيتم فقدان التعديلات غير المحفوظة.'));\n","")
s=s.replace("this.confirmInlineWorkspaceDeparture()","confirmWorkspaceDeparture()")
p.write_text(s)

# Customers: expose dirty customer edits to the shell/nav guard and browser unload.
p=Path('src/components/CustomersPage.tsx'); s=p.read_text()
needle="import { validateCustomerCommercial } from '../lib/commercial-controls.js';"
if "workspace-dirty.js" not in s:
    if needle not in s: raise SystemExit('Customers import anchor missing')
    s=s.replace(needle,needle+"\nimport { setWorkspaceDirty } from '../lib/workspace-dirty.js';",1)
old="componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);window.addEventListener('lourex-create-customer',this.handleQuickCreate);}"
new="componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);window.addEventListener('lourex-create-customer',this.handleQuickCreate);window.addEventListener('beforeunload',this.handleBeforeUnload);this.syncDirtyMarker();}"
if old not in s: raise SystemExit('Customers componentDidMount anchor missing')
s=s.replace(old,new,1)
old="""    if(prevState.viewingId!==this.state.viewingId){
      if(this.state.viewingId)document.querySelector<HTMLButtonElement>('.customer-profile-back')?.focus();
      else Array.from(document.querySelectorAll<HTMLElement>('[data-customer-id]')).find(node=>node.dataset.customerId===prevState.viewingId)?.querySelector<HTMLButtonElement>('.customer-card-main')?.focus();
    }
  }
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);window.removeEventListener('lourex-create-customer',this.handleQuickCreate);}"
new="""    if(prevState.viewingId!==this.state.viewingId){
      if(this.state.viewingId)document.querySelector<HTMLButtonElement>('.customer-profile-back')?.focus();
      else Array.from(document.querySelectorAll<HTMLElement>('[data-customer-id]')).find(node=>node.dataset.customerId===prevState.viewingId)?.querySelector<HTMLButtonElement>('.customer-card-main')?.focus();
    }
    this.syncDirtyMarker();
  }
  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);window.removeEventListener('lourex-create-customer',this.handleQuickCreate);window.removeEventListener('beforeunload',this.handleBeforeUnload);setWorkspaceDirty('customers',false);}"
if old not in s: raise SystemExit('Customers lifecycle anchor missing')
s=s.replace(old,new,1)
old="  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);"
new="""  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);
  private syncDirtyMarker=()=>setWorkspaceDirty('customers',this.editingDirty());
  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(!this.editingDirty())return;event.preventDefault();event.returnValue='';};"""
if old not in s: raise SystemExit('Customers editingDirty anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Finance: changing the nested finance tab must respect an open dirty expense editor.
p=Path('src/components/FinanceWorkspace.tsx'); s=p.read_text()
needle="import { t } from '../lib/i18n.js';"
if "workspace-dirty.js" not in s:
    if needle not in s: raise SystemExit('Finance import anchor missing')
    s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
old="  const [tab,setTab]=React.useState<Tab>('receivables');"
new="""  const [tab,setTab]=React.useState<Tab>('receivables');
  const changeTab=(next:Tab)=>{if(next===tab)return;if(!confirmWorkspaceDeparture())return;setTab(next);};"""
if old not in s: raise SystemExit('Finance tab state anchor missing')
s=s.replace(old,new,1)
s=s.replace("<DomainWorkspaceTabs value={tab} onChange={setTab}","<DomainWorkspaceTabs value={tab} onChange={changeTab}",1)
s=s.replace("const expense=()=>{setTab('expenses');window.setTimeout", "const expense=()=>{if(tab!=='expenses'&&!confirmWorkspaceDeparture())return;setTab('expenses');window.setTimeout",1)
s=s.replace("const payment=(event:Event)=>{const detail=(event as CustomEvent).detail;setTab('receivables');window.setTimeout", "const payment=(event:Event)=>{const detail=(event as CustomEvent).detail;if(tab!=='receivables'&&!confirmWorkspaceDeparture())return;setTab('receivables');window.setTimeout",1)
s=s.replace("const statement=(event:Event)=>{const detail=(event as CustomEvent).detail;setTab('receivables');window.setTimeout", "const statement=(event:Event)=>{const detail=(event as CustomEvent).detail;if(tab!=='receivables'&&!confirmWorkspaceDeparture())return;setTab('receivables');window.setTimeout",1)
p.write_text(s)

# Products/Inventory: do not unmount a dirty product editor when switching tabs or inspecting inventory.
p=Path('src/components/ProductsInventoryWorkspace.tsx'); s=p.read_text()
needle="import { t } from '../lib/i18n.js';"
if "workspace-dirty.js" not in s:
    if needle not in s: raise SystemExit('Products workspace import anchor missing')
    s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
old="  const [historyItem,setHistoryItem]=React.useState<SavedItem|null>(null);"
new="""  const [historyItem,setHistoryItem]=React.useState<SavedItem|null>(null);
  const changeTab=(value:Tab)=>{if(value===tab)return;if(!confirmWorkspaceDeparture())return;setTab(value);if(value==='inventory')setFocusItemId('');};"""
if old not in s: raise SystemExit('Products workspace state anchor missing')
s=s.replace(old,new,1)
s=s.replace("const create=()=>{setTab('products');window.setTimeout", "const create=()=>{if(tab!=='products'&&!confirmWorkspaceDeparture())return;setTab('products');window.setTimeout",1)
s=s.replace("<DomainWorkspaceTabs value={tab} onChange={(value)=>{setTab(value);if(value==='inventory')setFocusItemId('');}}","<DomainWorkspaceTabs value={tab} onChange={changeTab}",1)
s=s.replace("onInspectInventory={(item)=>{setFocusItemId(item.id);setTab('movements');}}","onInspectInventory={(item)=>{if(!confirmWorkspaceDeparture())return;setFocusItemId(item.id);setTab('movements');}}",1)
p.write_text(s)

# Operations: distinguish open/read-only from actually dirty edits, then guard editor replacement/tab changes.
p=Path('src/components/OperationsPage.tsx'); s=p.read_text()
needle="import { t } from '../lib/i18n.js';"
if "workspace-dirty.js" not in s:
    if needle not in s: raise SystemExit('Operations import anchor missing')
    s=s.replace(needle,needle+"\nimport { setWorkspaceDirty } from '../lib/workspace-dirty.js';",1)
old="componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('beforeunload',this.handleBeforeUnload);if(document.documentElement.getAttribute('data-lourex-workspace-dirty')==='operations')document.documentElement.removeAttribute('data-lourex-workspace-dirty');}"
new="componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('beforeunload',this.handleBeforeUnload);setWorkspaceDirty('operations',false);}"
if old not in s: raise SystemExit('Operations unmount anchor missing')
s=s.replace(old,new,1)
old="  private hasUnsavedWorkspaceInput=():boolean=>Boolean(this.state.supplierEdit||this.state.purchaseEdit||this.state.expenseEdit||this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim());\n  private syncDirtyMarker=()=>{const root=document.documentElement;if(this.hasUnsavedWorkspaceInput())root.setAttribute('data-lourex-workspace-dirty','operations');else if(root.getAttribute('data-lourex-workspace-dirty')==='operations')root.removeAttribute('data-lourex-workspace-dirty');};"
new="""  private hasUnsavedWorkspaceInput=():boolean=>{
    const supplier=this.state.supplierEdit;const supplierBase=supplier?this.props.suppliers.find(item=>item.id===supplier.id):undefined;
    const supplierDirty=Boolean(supplier&&(!supplierBase||JSON.stringify(supplier)!==JSON.stringify(supplierBase)));
    const purchase=this.state.purchaseEdit;const purchaseBase=purchase?this.props.purchases.find(item=>item.id===purchase.id):undefined;
    const purchaseDirty=Boolean(purchase&&purchase.status==='draft'&&(!purchaseBase||JSON.stringify(purchase)!==JSON.stringify(purchaseBase)));
    const expense=this.state.expenseEdit;const expenseBase=expense?this.props.expenses.find(item=>item.id===expense.id):undefined;
    const expenseDirty=Boolean(expense&&(!expenseBase||JSON.stringify(expense)!==JSON.stringify(expenseBase)));
    const movementDirty=Boolean(this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim());
    return supplierDirty||purchaseDirty||expenseDirty||movementDirty;
  };
  private syncDirtyMarker=()=>setWorkspaceDirty('operations',this.hasUnsavedWorkspaceInput());
  private confirmDiscardCurrent=():boolean=>!this.hasUnsavedWorkspaceInput()||window.confirm(t('Discard the unsaved changes and continue?','تجاهل التعديلات غير المحفوظة والمتابعة؟'));
  private closeEditors=()=>{if(!this.confirmDiscardCurrent())return;this.setState({supplierEdit:null,purchaseEdit:null,expenseEdit:null,error:''});};
  private changeTab=(tab:Tab)=>{if(tab===this.state.tab)return;if(!this.confirmDiscardCurrent())return;this.setState({tab,search:'',error:'',supplierEdit:null,purchaseEdit:null,expenseEdit:null});};
  private startSupplier=(supplier?:Supplier)=>{if(!this.confirmDiscardCurrent())return;this.setState({supplierEdit:supplier?structuredClone(supplier):createSupplier(),purchaseEdit:null,expenseEdit:null,error:''});};
  private startExpense=(expense?:ExpenseRecord)=>{if(!this.confirmDiscardCurrent())return;this.setState({expenseEdit:expense?structuredClone(expense):createExpense(this.props.defaultCurrency),supplierEdit:null,purchaseEdit:null,error:''});};
  private viewPurchase=(purchase:PurchaseRecord)=>{if(!this.confirmDiscardCurrent())return;this.setState({purchaseEdit:structuredClone(purchase),supplierEdit:null,expenseEdit:null,error:''});};"""
if old not in s: raise SystemExit('Operations dirty anchor missing')
s=s.replace(old,new,1)
old="  private handleQuickPurchase=()=>{if(this.props.mode!=='purchasing'&&this.props.mode!=='all')return;this.setState({tab:'purchases',search:'',error:''},this.newPurchase);};\n  private handleQuickExpense=()=>{if(this.props.mode!=='finance'&&this.props.mode!=='all')return;this.setState({tab:'expenses',expenseEdit:createExpense(this.props.defaultCurrency),search:'',error:''});};"
new="""  private handleQuickPurchase=()=>{if((this.props.mode!=='purchasing'&&this.props.mode!=='all')||!this.confirmDiscardCurrent())return;this.setState({tab:'purchases',search:'',error:'',supplierEdit:null,expenseEdit:null,purchaseEdit:null},()=>this.newPurchase(true));};
  private handleQuickExpense=()=>{if((this.props.mode!=='finance'&&this.props.mode!=='all')||!this.confirmDiscardCurrent())return;this.setState({tab:'expenses',expenseEdit:createExpense(this.props.defaultCurrency),supplierEdit:null,purchaseEdit:null,search:'',error:''});};"""
if old not in s: raise SystemExit('Operations quick anchor missing')
s=s.replace(old,new,1)
old="  private newPurchase=()=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,error:''});};"
new="  private newPurchase=(confirmed=false)=>{if(this.mutationInFlight||(!confirmed&&!this.confirmDiscardCurrent()))return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,error:''});};"
if old not in s: raise SystemExit('Operations newPurchase anchor missing')
s=s.replace(old,new,1)
old="  private newPurchaseForSupplier=(supplier:Supplier)=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,supplier.defaultCurrency||this.props.defaultCurrency);purchase.supplierSnapshot=supplierSnapshotFrom(supplier);purchase.currency=supplier.defaultCurrency||purchase.currency;purchase.items=[createPurchaseItem()];this.setState({tab:'purchases',purchaseEdit:purchase,search:'',error:''});};"
new="  private newPurchaseForSupplier=(supplier:Supplier)=>{if(this.mutationInFlight||!this.confirmDiscardCurrent())return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,supplier.defaultCurrency||this.props.defaultCurrency);purchase.supplierSnapshot=supplierSnapshotFrom(supplier);purchase.currency=supplier.defaultCurrency||purchase.currency;purchase.items=[createPurchaseItem()];this.setState({tab:'purchases',purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,search:'',error:''});};"
if old not in s: raise SystemExit('Operations newPurchaseForSupplier anchor missing')
s=s.replace(old,new,1)
old="  private showSupplierPurchaseHistory=(supplier:Supplier)=>this.setState({tab:'purchases',purchaseEdit:null,search:supplierLabel(supplier),error:''});"
new="  private showSupplierPurchaseHistory=(supplier:Supplier)=>{if(!this.confirmDiscardCurrent())return;this.setState({tab:'purchases',purchaseEdit:null,supplierEdit:null,expenseEdit:null,search:supplierLabel(supplier),error:''});};"
if old not in s: raise SystemExit('Operations purchase history anchor missing')
s=s.replace(old,new,1)
# Editor launch/replacement buttons.
s=s.replace("onClick={()=>this.setState({supplierEdit:createSupplier(),error:''})}","onClick={()=>this.startSupplier()}")
s=s.replace("onClick={()=>this.setState({supplierEdit:{...s},error:''})}","onClick={()=>this.startSupplier(s)}")
s=s.replace("onClick={this.newPurchase}","onClick={()=>this.newPurchase()}")
s=s.replace("onClick={()=>this.setState({purchaseEdit:JSON.parse(JSON.stringify(p)),error:''})}","onClick={()=>this.viewPurchase(p)}")
s=s.replace("onClick={()=>this.setState({expenseEdit:createExpense(this.props.defaultCurrency),error:''})}","onClick={()=>this.startExpense()}")
s=s.replace("onClick={()=>this.setState({expenseEdit:{...e},error:''})}","onClick={()=>this.startExpense(e)}")
s=s.replace("onClick={()=>this.setState({tab,search:'',error:''})}","onClick={()=>this.changeTab(tab)}")
# All user-driven closes/cancels go through the same loss-prevention guard.
s=s.replace("onClick={()=>this.setState({supplierEdit:null,error:''})}","onClick={this.closeEditors}")
s=s.replace("onClick={()=>this.setState({purchaseEdit:null,error:''})}","onClick={this.closeEditors}")
s=s.replace("onClick={()=>this.setState({expenseEdit:null,error:''})}","onClick={this.closeEditors}")
p.write_text(s)

print('v311 dirty guard patch applied')
