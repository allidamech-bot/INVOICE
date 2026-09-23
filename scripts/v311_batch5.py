from pathlib import Path

# Shared navigation helper used by shell and nested workspaces.
Path('src/lib/workspace-dirty.ts').write_text("""import { t } from './i18n.js';

export function workspaceHasUnsavedChanges():boolean{
  return typeof document!=='undefined'&&document.documentElement.hasAttribute('data-lourex-workspace-dirty');
}

export function confirmWorkspaceDeparture():boolean{
  return !workspaceHasUnsavedChanges()||window.confirm(t('Leave this page? Unsaved changes will be lost.','مغادرة هذه الصفحة؟ سيتم فقدان التعديلات غير المحفوظة.'));
}
""")

# App central navigation consumes the shared helper.
p=Path('src/app/App.tsx'); s=p.read_text()
import_anchor="import {"
# Add import near i18n import via known line.
needle="import { getUiLanguage, setUiLanguage, t } from '../lib/i18n.js';"
if needle in s:
    s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
else:
    # fallback current import shape
    needle2="import { setUiLanguage, t } from '../lib/i18n.js';"
    if needle2 not in s: raise SystemExit('App i18n import anchor missing')
    s=s.replace(needle2,needle2+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
s=s.replace("  private inlineWorkspaceHasUnsavedChanges=():boolean=>document.documentElement.hasAttribute('data-lourex-workspace-dirty');\n  private confirmInlineWorkspaceDeparture=():boolean=>!this.inlineWorkspaceHasUnsavedChanges()||window.confirm(t('Leave this page? Unsaved changes will be lost.','مغادرة هذه الصفحة؟ سيتم فقدان التعديلات غير المحفوظة.'));\n","")
s=s.replace("!this.confirmInlineWorkspaceDeparture()","!confirmWorkspaceDeparture()")
p.write_text(s)

# Nested finance tabs must not unmount an unsaved expense editor.
p=Path('src/components/FinanceWorkspace.tsx'); s=p.read_text()
needle="import { t } from '../lib/i18n.js';"
if needle not in s: raise SystemExit('Finance import anchor missing')
s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
old="""  const [tab,setTab]=React.useState<Tab>('receivables');"""
new="""  const [tab,setTab]=React.useState<Tab>('receivables');\n  const changeTab=(next:Tab)=>{if(next===tab)return;if(!confirmWorkspaceDeparture())return;setTab(next);};"""
s=s.replace(old,new,1)
s=s.replace("<DomainWorkspaceTabs value={tab} onChange={setTab}","<DomainWorkspaceTabs value={tab} onChange={changeTab}",1)
p.write_text(s)

# Products/inventory nested tabs use the same guard.
p=Path('src/components/ProductsInventoryWorkspace.tsx'); s=p.read_text()
needle="import { t } from '../lib/i18n.js';"
if needle not in s: raise SystemExit('Products workspace import anchor missing')
s=s.replace(needle,needle+"\nimport { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",1)
old="""  const [historyItem,setHistoryItem]=React.useState<SavedItem|null>(null);"""
new="""  const [historyItem,setHistoryItem]=React.useState<SavedItem|null>(null);\n  const changeTab=(value:Tab)=>{if(value===tab)return;if(!confirmWorkspaceDeparture())return;setTab(value);if(value==='inventory')setFocusItemId('');};"""
s=s.replace(old,new,1)
s=s.replace("<DomainWorkspaceTabs value={tab} onChange={(value)=>{setTab(value);if(value==='inventory')setFocusItemId('');}}","<DomainWorkspaceTabs value={tab} onChange={changeTab}",1)
# Inspect Inventory also respects dirty product edits.
s=s.replace("onInspectInventory={(item)=>{setFocusItemId(item.id);setTab('movements');}}","onInspectInventory={(item)=>{if(!confirmWorkspaceDeparture())return;setFocusItemId(item.id);setTab('movements');}}",1)
p.write_text(s)

# Operations: precise dirty state and guarded editor replacement/tab changes.
p=Path('src/components/OperationsPage.tsx'); s=p.read_text()
old="""  private hasUnsavedWorkspaceInput=():boolean=>Boolean(this.state.supplierEdit||this.state.purchaseEdit||this.state.expenseEdit||this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim());"""
new="""  private hasUnsavedWorkspaceInput=():boolean=>{\n    const supplier=this.state.supplierEdit;const supplierBase=supplier?this.props.suppliers.find(item=>item.id===supplier.id):undefined;\n    const supplierDirty=Boolean(supplier&&(!supplierBase||JSON.stringify(supplier)!==JSON.stringify(supplierBase)));\n    const purchase=this.state.purchaseEdit;const purchaseBase=purchase?this.props.purchases.find(item=>item.id===purchase.id):undefined;\n    const purchaseDirty=Boolean(purchase&&purchase.status==='draft'&&(!purchaseBase||JSON.stringify(purchase)!==JSON.stringify(purchaseBase)));\n    const expense=this.state.expenseEdit;const expenseBase=expense?this.props.expenses.find(item=>item.id===expense.id):undefined;\n    const expenseDirty=Boolean(expense&&(!expenseBase||JSON.stringify(expense)!==JSON.stringify(expenseBase)));\n    const movementDirty=Boolean(this.state.movementQuantity.trim()||this.state.movementNote.trim()||this.state.movementCost.trim());\n    return supplierDirty||purchaseDirty||expenseDirty||movementDirty;\n  };\n  private confirmDiscardCurrent=():boolean=>!this.hasUnsavedWorkspaceInput()||window.confirm(t('Discard the unsaved changes and continue?','تجاهل التعديلات غير المحفوظة والمتابعة؟'));\n  private changeTab=(tab:Tab)=>{if(tab===this.state.tab)return;if(!this.confirmDiscardCurrent())return;this.setState({tab,search:'',error:'',supplierEdit:null,purchaseEdit:null,expenseEdit:null});};\n  private startSupplier=(supplier?:Supplier)=>{if(!this.confirmDiscardCurrent())return;this.setState({supplierEdit:supplier?structuredClone(supplier):createSupplier(),purchaseEdit:null,expenseEdit:null,error:''});};\n  private startExpense=(expense?:ExpenseRecord)=>{if(!this.confirmDiscardCurrent())return;this.setState({expenseEdit:expense?structuredClone(expense):createExpense(this.props.defaultCurrency),supplierEdit:null,purchaseEdit:null,error:''});};\n  private viewPurchase=(purchase:PurchaseRecord)=>{if(!this.confirmDiscardCurrent())return;this.setState({purchaseEdit:structuredClone(purchase),supplierEdit:null,expenseEdit:null,error:''});};"""
if old not in s: raise SystemExit('operations dirty anchor missing')
s=s.replace(old,new,1)
old="""  private handleQuickPurchase=()=>{if(this.props.mode!=='purchasing'&&this.props.mode!=='all')return;this.setState({tab:'purchases',search:'',error:''},this.newPurchase);};\n  private handleQuickExpense=()=>{if(this.props.mode!=='finance'&&this.props.mode!=='all')return;this.setState({tab:'expenses',expenseEdit:createExpense(this.props.defaultCurrency),search:'',error:''});};"""
new="""  private handleQuickPurchase=()=>{if(this.props.mode!=='purchasing'&&this.props.mode!=='all'||!this.confirmDiscardCurrent())return;this.setState({tab:'purchases',search:'',error:'',supplierEdit:null,expenseEdit:null,purchaseEdit:null},()=>this.newPurchase(true));};\n  private handleQuickExpense=()=>{if(this.props.mode!=='finance'&&this.props.mode!=='all'||!this.confirmDiscardCurrent())return;this.setState({tab:'expenses',expenseEdit:createExpense(this.props.defaultCurrency),supplierEdit:null,purchaseEdit:null,search:'',error:''});};"""
if old not in s: raise SystemExit('operations quick anchor missing')
s=s.replace(old,new,1)
old="""  private newPurchase=()=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,error:''});};"""
new="""  private newPurchase=(confirmed=false)=>{if(this.mutationInFlight||(!confirmed&&!this.confirmDiscardCurrent()))return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,error:''});};"""
s=s.replace(old,new,1)
old="""  private newPurchaseForSupplier=(supplier:Supplier)=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,supplier.defaultCurrency||this.props.defaultCurrency);purchase.supplierSnapshot=supplierSnapshotFrom(supplier);purchase.currency=supplier.defaultCurrency||purchase.currency;purchase.items=[createPurchaseItem()];this.setState({tab:'purchases',purchaseEdit:purchase,search:'',error:''});};"""
new="""  private newPurchaseForSupplier=(supplier:Supplier)=>{if(this.mutationInFlight||!this.confirmDiscardCurrent())return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,supplier.defaultCurrency||this.props.defaultCurrency);purchase.supplierSnapshot=supplierSnapshotFrom(supplier);purchase.currency=supplier.defaultCurrency||purchase.currency;purchase.items=[createPurchaseItem()];this.setState({tab:'purchases',purchaseEdit:purchase,supplierEdit:null,expenseEdit:null,search:'',error:''});};"""
s=s.replace(old,new,1)
old="""  private showSupplierPurchaseHistory=(supplier:Supplier)=>this.setState({tab:'purchases',purchaseEdit:null,search:supplierLabel(supplier),error:''});"""
new="""  private showSupplierPurchaseHistory=(supplier:Supplier)=>{if(!this.confirmDiscardCurrent())return;this.setState({tab:'purchases',purchaseEdit:null,supplierEdit:null,expenseEdit:null,search:supplierLabel(supplier),error:''});};"""
s=s.replace(old,new,1)
# Route editor-launch buttons through guarded helpers.
s=s.replace("onClick={()=>this.setState({supplierEdit:createSupplier(),error:''})}","onClick={()=>this.startSupplier()}",1)
s=s.replace("onClick={()=>this.setState({supplierEdit:{...s},error:''})}","onClick={()=>this.startSupplier(s)}",1)
s=s.replace("onClick={this.newPurchase}","onClick={()=>this.newPurchase()}",1)
s=s.replace("onClick={()=>this.setState({purchaseEdit:JSON.parse(JSON.stringify(p)),error:''})}","onClick={()=>this.viewPurchase(p)}",1)
s=s.replace("onClick={()=>this.setState({expenseEdit:createExpense(this.props.defaultCurrency),error:''})}","onClick={()=>this.startExpense()}",1)
s=s.replace("onClick={()=>this.setState({expenseEdit:{...e},error:''})}","onClick={()=>this.startExpense(e)}",1)
s=s.replace("onClick={()=>this.setState({tab,search:'',error:''})}","onClick={()=>this.changeTab(tab)}",1)
p.write_text(s)

print('v311 batch 5 applied')
