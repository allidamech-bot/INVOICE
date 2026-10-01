from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} anchors, found {found}: {old[:120]!r}")
    p.write_text(text.replace(old, new))

# App integration.
path='src/app/App.tsx'
replace(path,
"import type { AppSettings, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord, UiLanguage, VaultPayload } from '../types.js';",
"import type { AppSettings, CompanySettings, Customer, DocumentKind, EncryptedVaultRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, RecurringTarget, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, UiLanguage, VaultPayload } from '../types.js';")
replace(path,
"import { inventoryMovementIsManual, postPurchase, reverseManualInventoryMovement, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';",
"import { createPurchase, inventoryMovementIsManual, postPurchase, reverseManualInventoryMovement, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';")
replace(path,
"import { documentUsesCommercialDefaults } from '../lib/document-kinds.js';",
"import { documentUsesCommercialDefaults } from '../lib/document-kinds.js';\nimport { assertRecurringWorkflow, completeRecurringRun, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, recurringWorkflowDue } from '../lib/recurring-workflows.js';\nimport { RecurringWorkflowsManager } from '../components/RecurringWorkflowsManager.js';")
replace(path,
"  catalogLauncher:CatalogLauncher; catalogSourceId:string;\n}",
"  catalogLauncher:CatalogLauncher; catalogSourceId:string;\n  recurringOpen:boolean; recurringFilter:'all'|RecurringTarget; recurringSourceDocumentId:string; recurringSourcePurchaseId:string;\n}")
replace(path,
"cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:''};",
"cloudSyncMessage:'',catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''};")
replace(path,
"  private accountTransitionRunning=false;",
"  private accountTransitionRunning=false;\n  private recurringProcessRunning=false;")
replace(path,
"this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'home',editorDoc:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();});",
"this.setState({loading:false,firstRun:false,unlocked:true,key:resumed.key,vault,screen:'home',editorDoc:null,uiLanguage,publicLogo,cloudUser:null,cloudLinked:false,cloudSyncState:'local',cloudSyncMessage:''},()=>{this.resetAutoLock();void this.initializeConfiguredCloud();void this.processDueRecurringWorkflows(false);});")
replace(path,
"catalogLauncher:'',catalogSourceId:''},resolve));",
"catalogLauncher:'',catalogSourceId:'',recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''},resolve));")
replace(path,
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);});",
"this.setState({unlocked:true,key:result.key,vault,screen:'home',editorDoc:null},()=>{this.resetAutoLock();this.scheduleCloudSync(220);void this.processDueRecurringWorkflows(false);});")
replace(path,
"this.setState({unlocked:false,key:null,vault:null,editorDoc:null,screen:'home',settingsOpen:false,newMenu:false});",
"this.setState({unlocked:false,key:null,vault:null,editorDoc:null,screen:'home',settingsOpen:false,newMenu:false,recurringOpen:false,recurringFilter:'all',recurringSourceDocumentId:'',recurringSourcePurchaseId:''});")

anchor="  private savePurchaseRecord=async(purchase:PurchaseRecord)=>{"
methods="""  private openRecurringManager=(filter:'all'|RecurringTarget='all',document?:LourexDocument|null,purchase?:PurchaseRecord|null)=>{if(this.state.screen==='editor'){this.showToast(t('Save and close the document before managing recurring workflows.','احفظ وأغلق المستند قبل إدارة المهام المتكررة.'),'error');return;}if(!confirmWorkspaceDeparture())return;this.setState({recurringOpen:true,recurringFilter:filter,recurringSourceDocumentId:document?.id||'',recurringSourcePurchaseId:purchase?.id||''});};
  private closeRecurringManager=()=>this.setState({recurringOpen:false,recurringSourceDocumentId:'',recurringSourcePurchaseId:''});
  private saveRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{assertRecurringWorkflow(workflow);const vault=this.requireVault();const recurringWorkflows=[...vault.recurringWorkflows];const index=recurringWorkflows.findIndex(item=>item.id===workflow.id);if(index>=0)recurringWorkflows[index]=workflow;else recurringWorkflows.push(workflow);await this.persist({...vault,recurringWorkflows});this.showToast(t('Recurring workflow saved.','تم حفظ المهمة المتكررة.'),'success');};
  private deleteRecurringWorkflow=async(workflow:RecurringWorkflowRecord)=>{const vault=this.requireVault();await this.persist({...vault,recurringWorkflows:vault.recurringWorkflows.filter(item=>item.id!==workflow.id)});this.showToast(t('Recurring workflow deleted. Generated drafts were kept.','تم حذف المهمة المتكررة مع الاحتفاظ بالمسودات المنشأة.'),'success');};
  private generateRecurringWorkflow=async(workflow:RecurringWorkflowRecord,notify=true)=>{const vault=this.requireVault();const current=vault.recurringWorkflows.find(item=>item.id===workflow.id);if(!current)throw new Error(t('Recurring workflow no longer exists.','المهمة المتكررة لم تعد موجودة.'));if(!recurringWorkflowDue(current))throw new Error(t('This recurring workflow is not due yet.','هذه المهمة المتكررة ليست مستحقة بعد.'));const scheduledFor=current.nextRunDate;if(current.target==='document'){const template=current.documentTemplate;if(!template)throw new Error(t('Recurring document template is missing.','قالب المستند المتكرر غير موجود.'));const numbered=nextDocumentNumber(vault,template.kind);const draft=materializeRecurringDocumentDraft(current,numbered.number,scheduledFor);const updated=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);await this.persist({...numbered.vault,documents:[...numbered.vault.documents,draft],recurringWorkflows:numbered.vault.recurringWorkflows.map(item=>item.id===updated.id?updated:item)});}else{const template=current.purchaseTemplate;if(!template)throw new Error(t('Recurring purchase template is missing.','قالب الشراء المتكرر غير موجود.'));const number=createPurchase(vault.purchases,vault.suppliers,template.currency||vault.appSettings.smartDefaults.currency||'USD').number;const draft=materializeRecurringPurchaseDraft(current,number,scheduledFor);const updated=completeRecurringRun(current,{id:draft.id,number:draft.number},scheduledFor);await this.persist({...vault,purchases:[...vault.purchases,draft],recurringWorkflows:vault.recurringWorkflows.map(item=>item.id===updated.id?updated:item)});}if(notify)this.showToast(t('Recurring draft created for review.','تم إنشاء المسودة المتكررة للمراجعة.'),'success');};
  private processDueRecurringWorkflows=async(notify=true):Promise<number>=>{if(this.recurringProcessRunning||!this.state.unlocked||!this.state.vault)return 0;this.recurringProcessRunning=true;let generated=0;try{for(let guard=0;guard<24;guard++){const due=this.requireVault().recurringWorkflows.filter(item=>recurringWorkflowDue(item)).sort((a,b)=>a.nextRunDate.localeCompare(b.nextRunDate))[0];if(!due)break;await this.generateRecurringWorkflow(due,false);generated+=1;}if(notify&&generated)this.showToast(t(`${generated} recurring draft${generated===1?'':'s'} created for review.`, `تم إنشاء ${generated} مسودة متكررة للمراجعة.`),'success');return generated;}catch(error){if(notify)this.showToast(error instanceof Error?error.message:t('Unable to generate recurring drafts.','تعذر إنشاء المسودات المتكررة.'),'error');return generated;}finally{this.recurringProcessRunning=false;}};
  private openRecurringGenerated=(target:RecurringTarget,id:string)=>{const vault=this.requireVault();this.closeRecurringManager();if(target==='document'){const doc=vault.documents.find(item=>item.id===id);if(doc)void this.openDocument(doc);return;}const purchase=vault.purchases.find(item=>item.id===id);if(!purchase)return;this.setState({screen:'operations',editorDoc:null},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-open-purchase',{detail:{id:purchase.id}})),0));};

"""
replace(path,anchor,methods+anchor)
replace(path,
"const operationsProps={suppliers:vault.suppliers,purchases:vault.purchases,supplierPayments:vault.supplierPayments,expenses:vault.expenses,inventoryMovements:vault.inventoryMovements,items:vault.savedItems,defaultCurrency,onOpenSupplierFinance:openSupplierFinance,onSaveSupplier:this.saveSupplier,onDeleteSupplier:this.deleteSupplier,onSavePurchase:this.savePurchaseRecord,onDeletePurchase:this.deletePurchaseRecord,onPostPurchase:this.postPurchaseRecord,onReversePurchase:this.reversePurchaseRecord,onSaveExpense:this.saveExpenseRecord,onDeleteExpense:this.deleteExpenseRecord,onSaveInventoryMovement:this.saveInventoryMovement,onDeleteInventoryMovement:this.deleteInventoryMovement};",
"const operationsProps={suppliers:vault.suppliers,purchases:vault.purchases,supplierPayments:vault.supplierPayments,expenses:vault.expenses,inventoryMovements:vault.inventoryMovements,items:vault.savedItems,defaultCurrency,onOpenSupplierFinance:openSupplierFinance,onOpenRecurringManager:()=>this.openRecurringManager('purchase'),onCreateRecurringPurchase:(purchase:PurchaseRecord)=>this.openRecurringManager('purchase',null,purchase),onSaveSupplier:this.saveSupplier,onDeleteSupplier:this.deleteSupplier,onSavePurchase:this.savePurchaseRecord,onDeletePurchase:this.deletePurchaseRecord,onPostPurchase:this.postPurchaseRecord,onReversePurchase:this.reversePurchaseRecord,onSaveExpense:this.saveExpenseRecord,onDeleteExpense:this.deleteExpenseRecord,onSaveInventoryMovement:this.saveInventoryMovement,onDeleteInventoryMovement:this.deleteInventoryMovement};")
replace(path,
"onCreateCreditNote={(doc)=>void this.createCreditNote(doc)} onOpenStatements={()=>navigate('receivables')}/>:null}",
"onCreateCreditNote={(doc)=>void this.createCreditNote(doc)} onOpenStatements={()=>navigate('receivables')} onOpenRecurring={()=>this.openRecurringManager('document')} onCreateRecurring={(doc)=>this.openRecurringManager('document',doc,null)}/>:null}")
replace(path,
"      <GlobalSearch documents={vault.documents} customers={vault.customers} items={vault.savedItems} suppliers={vault.suppliers} purchases={vault.purchases} language={activeLanguage} onNavigate={navigate} onOpenDocument={(doc)=>void this.openDocument(doc)} onNewDocument={(kind)=>void this.newDocument(kind)}/>",
"      <GlobalSearch documents={vault.documents} customers={vault.customers} items={vault.savedItems} suppliers={vault.suppliers} purchases={vault.purchases} language={activeLanguage} onNavigate={navigate} onOpenDocument={(doc)=>void this.openDocument(doc)} onNewDocument={(kind)=>void this.newDocument(kind)}/>\n      <RecurringWorkflowsManager open={this.state.recurringOpen} filter={this.state.recurringFilter} workflows={vault.recurringWorkflows} sourceDocument={vault.documents.find(item=>item.id===this.state.recurringSourceDocumentId)??null} sourcePurchase={vault.purchases.find(item=>item.id===this.state.recurringSourcePurchaseId)??null} onClose={this.closeRecurringManager} onSave={this.saveRecurringWorkflow} onDelete={this.deleteRecurringWorkflow} onGenerate={(workflow)=>this.generateRecurringWorkflow(workflow,true)} onOpenGenerated={this.openRecurringGenerated}/>")

# Documents integration.
path='src/components/DocumentsPage.tsx'
replace(path,
"import { secureShareEligible } from '../lib/secure-share.js';",
"import { secureShareEligible } from '../lib/secure-share.js';\nimport { recurringDocumentEligible } from '../lib/recurring-workflows.js';")
replace(path,
"  onOpenStatements?:()=>void;\n}",
"  onOpenStatements?:()=>void;\n  onOpenRecurring?:()=>void;\n  onCreateRecurring?:(doc:LourexDocument)=>void;\n}")
replace(path,
"      <button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name=\"copy\"/><span>{t('Duplicate','نسخ')}</span></button>",
"      <button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onDuplicate(doc))}><Icon name=\"copy\"/><span>{t('Duplicate','نسخ')}</span></button>\n      {this.props.onCreateRecurring&&recurringDocumentEligible(doc)?<button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onCreateRecurring?.(doc))}><Icon name=\"refresh\"/><span>{t('Make recurring','جعلها متكررة')}</span></button>:null}")
replace(path,
"<div className=\"ta-documents-header-actions\"><Button icon=\"edit\" onClick={()=>this.props.onNew('draft')}",
"<div className=\"ta-documents-header-actions\">{this.props.onOpenRecurring?<Button icon=\"refresh\" onClick={()=>this.props.onOpenRecurring?.()}>{t('Recurring','متكرر')}</Button>:null}<Button icon=\"edit\" onClick={()=>this.props.onNew('draft')}")

# Purchasing integration.
path='src/components/OperationsPage.tsx'
replace(path,
"  onOpenSupplierFinance?:(supplierId:string)=>void;",
"  onOpenSupplierFinance?:(supplierId:string)=>void;\n  onOpenRecurringManager?:()=>void;onCreateRecurringPurchase?:(purchase:PurchaseRecord)=>void;")
replace(path,
"componentDidMount():void{ensurePayablesStyles();window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.addEventListener('beforeunload',this.handleBeforeUnload);this.applyFocusedItem();this.syncDirtyMarker();}",
"componentDidMount():void{ensurePayablesStyles();window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.addEventListener('lourex-open-purchase',this.handleOpenPurchase as EventListener);window.addEventListener('beforeunload',this.handleBeforeUnload);this.applyFocusedItem();this.syncDirtyMarker();}")
replace(path,
"componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('beforeunload',this.handleBeforeUnload);setWorkspaceDirty('operations',false);}",
"componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);window.removeEventListener('lourex-open-purchase',this.handleOpenPurchase as EventListener);window.removeEventListener('beforeunload',this.handleBeforeUnload);setWorkspaceDirty('operations',false);}")
replace(path,
"  private supplierPayments=():SupplierPaymentRecord[]=>this.props.supplierPayments??[];",
"  private handleOpenPurchase=(event:Event)=>{const id=String((event as CustomEvent<{id?:string}>).detail?.id??'');const purchase=this.props.purchases.find(item=>item.id===id);if(!purchase||!this.confirmDiscardCurrent())return;const edit=structuredClone(purchase);this.editorBaseline={supplier:null,purchase:JSON.stringify(edit),expense:null};this.setState({tab:'purchases',purchaseEdit:edit,supplierEdit:null,supplierProfileId:'',expenseEdit:null,search:'',error:''});};\n  private supplierPayments=():SupplierPaymentRecord[]=>this.props.supplierPayments??[];")
old="""this.panelHead(t('Procurement','التوريد'),t('Purchases','المشتريات'),t('Post a purchase only when received. Posting creates stock receipt movements and a supplier payable in Finance.','رحّل الشراء عند الاستلام فقط؛ الترحيل ينشئ حركات استلام للمخزون ومستحقًا للمورد في المالية.'),<Button icon=\"plus\" variant=\"primary\" disabled={!this.props.suppliers.length||this.state.busy} onClick={()=>this.newPurchase()}>{t('New Purchase','شراء جديد')}</Button>)"""
new="""this.panelHead(t('Procurement','التوريد'),t('Purchases','المشتريات'),t('Post a purchase only when received. Posting creates stock receipt movements and a supplier payable in Finance.','رحّل الشراء عند الاستلام فقط؛ الترحيل ينشئ حركات استلام للمخزون ومستحقًا للمورد في المالية.'),<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{this.props.onOpenRecurringManager?<Button icon=\"refresh\" disabled={this.state.busy} onClick={()=>this.props.onOpenRecurringManager?.()}>{t('Recurring','متكرر')}</Button>:null}<Button icon=\"plus\" variant=\"primary\" disabled={!this.props.suppliers.length||this.state.busy} onClick={()=>this.newPurchase()}>{t('New Purchase','شراء جديد')}</Button></div>)"""
replace(path,old,new)
replace(path,
"<div className=\"ta-ops-row-actions\"><button disabled={this.state.busy} onClick={()=>this.viewPurchase(p)}>{t('View','عرض')}</button>",
"<div className=\"ta-ops-row-actions\"><button disabled={this.state.busy} onClick={()=>this.viewPurchase(p)}>{t('View','عرض')}</button>{p.status!=='reversed'&&this.props.onCreateRecurringPurchase?<button disabled={this.state.busy} onClick={()=>this.props.onCreateRecurringPurchase?.(p)}>{t('Recurring','متكرر')}</button>:null}")

# Ensure manager loads its scoped styles.
path='src/components/RecurringWorkflowsManager.tsx'
replace(path,
"import { assertRecurringWorkflow, createDocumentRecurringWorkflow, createPurchaseRecurringWorkflow, recurringCadenceLabel, recurringWorkflowDue } from '../lib/recurring-workflows.js';",
"import { assertRecurringWorkflow, createDocumentRecurringWorkflow, createPurchaseRecurringWorkflow, recurringCadenceLabel, recurringWorkflowDue } from '../lib/recurring-workflows.js';\nimport { ensureRecurringWorkflowStyles } from '../lib/recurring-workflows-style.js';")
replace(path,
"  const {open,filter,workflows,sourceDocument,sourcePurchase,onClose,onSave,onDelete,onGenerate,onOpenGenerated}=props;\n  const [form,setForm]",
"  const {open,filter,workflows,sourceDocument,sourcePurchase,onClose,onSave,onDelete,onGenerate,onOpenGenerated}=props;\n  React.useEffect(()=>{ensureRecurringWorkflowStyles();},[]);\n  const [form,setForm]")

# Add styles for the existing manager markup that are not covered by the base mobile rules.
p=Path('src/lib/recurring-workflows-style.ts')
text=p.read_text()
needle=".lx-recurring-empty{padding:24px 16px;text-align:center;border:1px dashed var(--border);border-radius:15px;color:var(--muted)}.lx-recurring-empty strong{display:block;color:var(--text);margin-bottom:4px}\n"
if needle not in text: raise SystemExit('style anchor missing')
extra=""".lx-recurring-form>header,.lx-recurring-list>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.lx-recurring-form>header small,.lx-recurring-list>header small{display:block;color:var(--muted);font-size:11px;font-weight:750}.lx-recurring-form>header h3,.lx-recurring-list>header h3{margin:3px 0 0;font-size:15px}.lx-recurring-fields{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(140px,.8fr) 90px minmax(150px,.8fr) minmax(150px,.8fr);gap:10px}.lx-recurring-fields label{display:grid;gap:6px}.lx-recurring-fields label>span{font-size:11px;font-weight:750;color:var(--muted)}.lx-recurring-card-main{min-width:0}.lx-recurring-card-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.lx-recurring-card-title>strong{font-size:14px}.lx-recurring-state{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;background:rgba(148,163,184,.14);color:var(--muted)}.lx-recurring-state.is-active{background:rgba(34,197,94,.10);color:#15803d}.lx-recurring-state.is-due{background:rgba(245,158,11,.12);color:#b45309}.lx-recurring-meta{display:flex;gap:8px 12px;flex-wrap:wrap;margin-top:7px;color:var(--muted);font-size:12px}.lx-recurring-last{margin-top:8px;border:0;background:transparent;color:var(--text);padding:0;font:inherit;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.lx-recurring-form>.btn{justify-self:end}\n"""
p.write_text(text.replace(needle,needle+extra))
