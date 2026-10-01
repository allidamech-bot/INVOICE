from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p=Path(path);text=p.read_text();found=text.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count} anchors, found {found}: {old[:120]!r}')
    p.write_text(text.replace(old,new))

# App integration
path='src/app/App.tsx'
replace(path,
"import type { AppSettings, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord, UiLanguage, VaultPayload } from '../types.js';",
"import type { AppSettings, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, RecurringTarget, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, UiLanguage, VaultPayload } from '../types.js';")
replace(path,
"import { inventoryMovementIsManual, postPurchase, reverseManualInventoryMovement, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';",
"import { inventoryMovementIsManual, nextPurchaseNumber, postPurchase, reverseManualInventoryMovement, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';")
replace(path,
"import { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';",
"import { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';\nimport { assertRecurringWorkflow, completeRecurringRun, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, recurringWorkflowDue } from '../lib/recurring-workflows.js';")
replace(path,
"import { GlobalSearch } from '../components/GlobalSearch.js';",
"import { GlobalSearch } from '../components/GlobalSearch.js';\nimport { RecurringWorkflowsManager } from '../components/RecurringWorkflowsManager.js';")
replace(path,
"  catalogLauncher:CatalogLauncher; catalogSourceId:string;\n}",
"  catalogLauncher:CatalogLauncher; catalogSourceId:string;\n  recurringOpen:boolean; recurringFilter:'all'|RecurringTarget; recurringSourceDocumentId:string; recurringSourcePurchaseId:string;\n}")
replace(path,
"cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:''};",
"cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''};")
# account transition reset
replace(path,
"catalogLauncher:'',catalogSourceId:''},resolve));",
"catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''},resolve));")

anchor="  private convert=async(source:LourexDocument)=>{"
block="""  private openRecurringForDocument=(source:LourexDocument)=>this.setState({recurringOpen:true,recurringFilter:'document',recurringSourceDocumentId:source.id,recurringSourcePurchaseId:''});
  private openRecurringForPurchase=(source:PurchaseRecord)=>this.setState({recurringOpen:true,recurringFilter:'purchase',recurringSourceDocumentId:'',recurringSourcePurchaseId:source.id});
  private openRecurringManager=(filter:'all'|RecurringTarget)=>this.setState({recurringOpen:true,recurringFilter:filter,recurringSourceDocumentId:'',recurringSourcePurchaseId:''});
  private closeRecurringManager=()=>this.setState({recurringOpen:false,recurringSourceDocumentId:'',recurringSourcePurchaseId:''});
  private saveRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{assertRecurringWorkflow(workflow);const vault=this.requireVault();const recurringWorkflows=[...vault.recurringWorkflows];const index=recurringWorkflows.findIndex(item=>item.id===workflow.id);if(index>=0)recurringWorkflows[index]=workflow;else recurringWorkflows.push(workflow);await this.persist({...vault,recurringWorkflows});this.showToast(t('Recurring workflow saved.','تم حفظ المهمة المتكررة.'),'success');};
  private deleteRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{const vault=this.requireVault();if(!vault.recurringWorkflows.some(item=>item.id===workflow.id))throw new Error(t('Recurring workflow was not found.','لم يتم العثور على المهمة المتكررة.'));await this.persist({...vault,recurringWorkflows:vault.recurringWorkflows.filter(item=>item.id!==workflow.id)});this.showToast(t('Recurring workflow deleted. Generated drafts were preserved.','تم حذف المهمة المتكررة مع الاحتفاظ بالمسودات التي أُنشئت سابقًا.'),'success');};
  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{const vault=this.requireVault();const current=vault.recurringWorkflows.find(item=>item.id===workflow.id);if(!current)throw new Error(t('Recurring workflow was not found. Reopen the manager.','لم يتم العثور على المهمة المتكررة. أعد فتح المدير.'));assertRecurringWorkflow(current);if(!recurringWorkflowDue(current))throw new Error(t('This workflow is not due yet or is paused.','هذه المهمة غير مستحقة بعد أو أنها متوقفة.'));const scheduledFor=current.nextRunDate;if(current.target==='document'){const template=current.documentTemplate;if(!template)throw new Error('Recurring document template is missing.');const numbered=nextDocumentNumber(vault,template.kind);const draft=materializeRecurringDocumentDraft(current,numbered.number,scheduledFor);const completed=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);const recurringWorkflows=numbered.vault.recurringWorkflows.map(item=>item.id===current.id?completed:item);const documentEvents=[...numbered.vault.documentEvents,createDocumentEvent(draft,'created',t('Created as a recurring draft.','تم الإنشاء كمسودة متكررة.'))];await this.persist({...numbered.vault,documents:[...numbered.vault.documents,draft],documentEvents,recurringWorkflows});this.showToast(t(`Recurring draft ${draft.number} created.`,`تم إنشاء المسودة المتكررة ${draft.number}.`),'success');return;}const number=nextPurchaseNumber(vault.purchases,scheduledFor);const draft=materializeRecurringPurchaseDraft(current,number,scheduledFor);const completed=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);const recurringWorkflows=vault.recurringWorkflows.map(item=>item.id===current.id?completed:item);await this.persist({...vault,purchases:[...vault.purchases,draft],recurringWorkflows});this.showToast(t(`Recurring purchase draft ${draft.number} created.`,`تم إنشاء مسودة الشراء المتكررة ${draft.number}.`),'success');};
  private openRecurringGenerated=(target:RecurringTarget,id:string)=>{const vault=this.requireVault();this.closeRecurringManager();if(target==='document'){const doc=vault.documents.find(item=>item.id===id);if(doc)void this.openDocument(doc);return;}const purchase=vault.purchases.find(item=>item.id===id);if(!purchase)return;this.setState({screen:'operations'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-open-purchase',{detail:{id}})),0));};
"""
replace(path,anchor,block+anchor)
# operationsProps
replace(path,
"items:vault.savedItems,defaultCurrency,onOpenSupplierFinance:openSupplierFinance,",
"items:vault.savedItems,defaultCurrency,recurringWorkflows:vault.recurringWorkflows,onMakeRecurringPurchase:this.openRecurringForPurchase,onOpenRecurring:()=>this.openRecurringManager('purchase'),onOpenSupplierFinance:openSupplierFinance,")
# Documents props
replace(path,
"documentEvents={vault.documentEvents} onNew={(k)=>void this.newDocument(k)}",
"documentEvents={vault.documentEvents} recurringWorkflows={vault.recurringWorkflows} onMakeRecurring={this.openRecurringForDocument} onOpenRecurring={()=>this.openRecurringManager('document')} onNew={(k)=>void this.newDocument(k)}")
# Global manager after shell
replace(path,
"      </AppShell>\n      <GlobalSearch",
"      </AppShell>\n      <RecurringWorkflowsManager open={this.state.recurringOpen} filter={this.state.recurringFilter} workflows={vault.recurringWorkflows} sourceDocument={vault.documents.find(item=>item.id===this.state.recurringSourceDocumentId)??null} sourcePurchase={vault.purchases.find(item=>item.id===this.state.recurringSourcePurchaseId)??null} onClose={this.closeRecurringManager} onSave={this.saveRecurringWorkflow} onDelete={this.deleteRecurringWorkflow} onGenerate={this.generateRecurringWorkflow} onOpenGenerated={this.openRecurringGenerated}/>\n      <GlobalSearch")

# Documents workspace actions
path='src/components/DocumentsPage.tsx'
replace(path,
"import type { DocumentEventRecord, DocumentKind, LourexDocument, PaymentRecord, PaymentStatus } from '../types.js';",
"import type { DocumentEventRecord, DocumentKind, LourexDocument, PaymentRecord, PaymentStatus, RecurringWorkflowRecord } from '../types.js';")
replace(path,
"import { secureShareEligible } from '../lib/secure-share.js';",
"import { secureShareEligible } from '../lib/secure-share.js';\nimport { recurringDocumentEligible } from '../lib/recurring-workflows.js';")
replace(path,
"  documentEvents:DocumentEventRecord[];\n  onNew:(kind:DocumentKind)=>void;",
"  documentEvents:DocumentEventRecord[];\n  recurringWorkflows?:RecurringWorkflowRecord[];\n  onMakeRecurring?:(doc:LourexDocument)=>void;\n  onOpenRecurring?:()=>void;\n  onNew:(kind:DocumentKind)=>void;")
replace(path,
"      <button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name=\"copy\"/><span>{t('Duplicate','نسخ')}</span></button>",
"      <button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name=\"copy\"/><span>{t('Duplicate','نسخ')}</span></button>\n      {this.props.onMakeRecurring&&recurringDocumentEligible(doc)?<button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onMakeRecurring?.(doc))}><Icon name=\"calendar\"/><span>{t('Make recurring','جعلها متكررة')}</span></button>:null}")
replace(path,
"<div className=\"ta-documents-header-actions\"><Button icon=\"edit\" onClick={()=>this.props.onNew('draft')}",
"<div className=\"ta-documents-header-actions\">{this.props.onOpenRecurring?<Button onClick={()=>this.props.onOpenRecurring?.()}>{t('Recurring','المتكرر')}</Button>:null}<Button icon=\"edit\" onClick={()=>this.props.onNew('draft')}")

# Purchasing workspace actions and generated draft opening
path='src/components/OperationsPage.tsx'
replace(path,
"import type { ExpenseRecord, InventoryMovementRecord, InventoryMovementType, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord } from '../types.js';",
"import type { ExpenseRecord, InventoryMovementRecord, InventoryMovementType, PurchaseRecord, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord } from '../types.js';")
replace(path,
"  onOpenSupplierFinance?:(supplierId:string)=>void;",
"  recurringWorkflows?:RecurringWorkflowRecord[];onMakeRecurringPurchase?:(purchase:PurchaseRecord)=>void;onOpenRecurring?:()=>void;\n  onOpenSupplierFinance?:(supplierId:string)=>void;")
replace(path,
"  componentDidMount():void{ensurePayablesStyles();window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);",
"  componentDidMount():void{ensurePayablesStyles();window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.addEventListener('lourex-open-purchase',this.handleOpenPurchase); ")
replace(path,
"  componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);",
"  componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('lourex-open-purchase',this.handleOpenPurchase);")
anchor="  private handleQuickPurchase=()=>{"
block="  private handleOpenPurchase=(event:Event)=>{const id=String((event as CustomEvent<{id?:string}>).detail?.id||'');const purchase=this.props.purchases.find(item=>item.id===id);if(!purchase||!this.confirmDiscardCurrent())return;this.setState({tab:'purchases',search:'',error:'',supplierEdit:null,supplierProfileId:'',expenseEdit:null},()=>this.viewPurchase(purchase));};\n"
replace(path,anchor,block+anchor)
replace(path,
"<Button icon=\"plus\" variant=\"primary\" disabled={!this.props.suppliers.length||this.state.busy} onClick={()=>this.newPurchase()}>{t('New Purchase','شراء جديد')}</Button>",
"<div className=\"lx-recurring-head-actions\">{this.props.onOpenRecurring?<Button onClick={()=>this.props.onOpenRecurring?.()}>{t('Recurring','المتكرر')}</Button>:null}<Button icon=\"plus\" variant=\"primary\" disabled={!this.props.suppliers.length||this.state.busy} onClick={()=>this.newPurchase()}>{t('New Purchase','شراء جديد')}</Button></div>")
replace(path,
"<div className=\"ta-ops-row-actions\"><button disabled={this.state.busy} onClick={()=>this.viewPurchase(p)}>{t('View','عرض')}</button>",
"<div className=\"ta-ops-row-actions\"><button disabled={this.state.busy} onClick={()=>this.viewPurchase(p)}>{t('View','عرض')}</button>{this.props.onMakeRecurringPurchase&&p.status!=='reversed'?<button disabled={this.state.busy} onClick={()=>this.props.onMakeRecurringPurchase?.(p)}>{t('Make recurring','تكرار')}</button>:null}")

# CSS entry
path='index.html'
replace(path,
'  <link rel="stylesheet" href="./styles/secure-share-batch11.css?v=463-1" data-lourex-secure-share-batch11="true" />',
'  <link rel="stylesheet" href="./styles/secure-share-batch11.css?v=463-1" data-lourex-secure-share-batch11="true" />\n  <link rel="stylesheet" href="./styles/recurring-workflows-batch12.css?v=464-1" data-lourex-recurring-batch12="true" />')
