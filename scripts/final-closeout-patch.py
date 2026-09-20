from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

# Product Library: canonical quick-create listener, contextual product actions,
# and progressive disclosure for secondary catalog fields.
path = 'src/components/ProductLibraryWorkspace.tsx'
s = read(path)
s = once(s,
"  onDelete:(item:SavedItem)=>Promise<void>;\n}",
"  onDelete:(item:SavedItem)=>Promise<void>;\n  onInspectInventory?:(item:SavedItem)=>void;\n  onInspectPurchases?:(item:SavedItem)=>void;\n}", 'product props')
s = once(s,
"  componentDidMount():void{document.addEventListener('pointerdown',this.closeMenus);document.addEventListener('keydown',this.closeMenusOnEscape);}\n  componentWillUnmount():void{document.removeEventListener('pointerdown',this.closeMenus);document.removeEventListener('keydown',this.closeMenusOnEscape);}",
"  componentDidMount():void{document.addEventListener('pointerdown',this.closeMenus);document.addEventListener('keydown',this.closeMenusOnEscape);window.addEventListener('lourex-open-product-editor',this.handleQuickCreate);}\n  componentWillUnmount():void{document.removeEventListener('pointerdown',this.closeMenus);document.removeEventListener('keydown',this.closeMenusOnEscape);window.removeEventListener('lourex-open-product-editor',this.handleQuickCreate);}\n  private handleQuickCreate=()=>this.newItem();", 'product event lifecycle')
s = once(s,
"                    <button type=\"button\" role=\"menuitem\" onClick={()=>this.beginEdit(item)}><Icon name=\"edit\"/><span>{t('Edit','تعديل')}</span></button>\n                    <button type=\"button\" role=\"menuitem\" onClick={()=>this.beginSelection(item.id)}><Icon name=\"check\"/><span>{t('Select','تحديد')}</span></button>",
"                    {this.props.onInspectInventory?<button type=\"button\" role=\"menuitem\" onClick={()=>{this.setState({rowMenuId:null});this.props.onInspectInventory?.(item);}}><Icon name=\"items\"/><span>{t('Stock History','سجل المخزون')}</span></button>:null}\n                    {this.props.onInspectPurchases?<button type=\"button\" role=\"menuitem\" onClick={()=>{this.setState({rowMenuId:null});this.props.onInspectPurchases?.(item);}}><Icon name=\"backup\"/><span>{t('Purchase History','سجل المشتريات')}</span></button>:null}\n                    <button type=\"button\" role=\"menuitem\" onClick={()=>this.beginEdit(item)}><Icon name=\"edit\"/><span>{t('Edit','تعديل')}</span></button>\n                    <button type=\"button\" role=\"menuitem\" onClick={()=>this.beginSelection(item.id)}><Icon name=\"check\"/><span>{t('Select','تحديد')}</span></button>", 'product row actions')
section_start = s.index('              <section className="product-editor-section"><div className="product-editor-section-title"><span>02</span>')
section_end_marker = '\n\n              <section className="product-editor-section"><div className="product-editor-section-title"><span>03</span>'
section_end = s.index(section_end_marker, section_start)
section = s[section_start:section_end]
wrapped = "              <details className=\"product-more-details\" open={Boolean(edit.category||(edit.tags??[]).length||edit.hsCode||edit.origin)}>\n                <summary><span>+</span><strong>{t('More Details','تفاصيل إضافية')}</strong><small>{t('Category, tags, HS code and origin','التصنيف والوسوم ورمز HS والمنشأ')}</small></summary>\n" + section.replace('              <section', '                <section', 1) + "\n              </details>"
s = s[:section_start] + wrapped + s[section_end:]
write(path, s)

# Operations: quick create, contextual supplier purchasing and explicit
# inventory-balance vs movement views while reusing the same accounting logic.
path = 'src/components/OperationsPage.tsx'
s = read(path)
s = once(s,
"  mode?:OperationsWorkspaceMode;\n  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];items:SavedItem[];defaultCurrency:string;",
"  mode?:OperationsWorkspaceMode;inventoryView?:'all'|'balances'|'movements';focusItemId?:string;\n  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];items:SavedItem[];defaultCurrency:string;", 'operations props')
s = once(s,
"  componentDidUpdate(prev:Props):void{\n    if(prev.mode===this.props.mode)return;\n    const allowed=tabsForMode(this.props.mode);\n    if(!allowed.includes(this.state.tab))this.setState({tab:firstTab(this.props.mode),search:'',error:''});\n  }",
"  componentDidMount():void{window.addEventListener('lourex-create-purchase',this.handleQuickPurchase);window.addEventListener('lourex-open-expense-editor',this.handleQuickExpense);this.applyFocusedItem();}\n  componentWillUnmount():void{window.removeEventListener('lourex-create-purchase',this.handleQuickPurchase);window.removeEventListener('lourex-open-expense-editor',this.handleQuickExpense);}\n  componentDidUpdate(prev:Props):void{\n    if(prev.mode!==this.props.mode){const allowed=tabsForMode(this.props.mode);if(!allowed.includes(this.state.tab))this.setState({tab:firstTab(this.props.mode),search:'',error:''});}\n    if(prev.focusItemId!==this.props.focusItemId)this.applyFocusedItem();\n  }\n  private applyFocusedItem=()=>{const id=this.props.focusItemId;if(!id)return;const item=this.props.items.find(entry=>entry.id===id);if(!item)return;this.setState({search:item.sku||item.descriptionEn||item.descriptionAr,movementItemId:item.id,error:''});};\n  private handleQuickPurchase=()=>{if(this.props.mode!=='purchasing'&&this.props.mode!=='all')return;this.setState({tab:'purchases',search:'',error:''},this.newPurchase);};\n  private handleQuickExpense=()=>{if(this.props.mode!=='finance'&&this.props.mode!=='all')return;this.setState({tab:'expenses',expenseEdit:createExpense(this.props.defaultCurrency),search:'',error:''});};", 'operations lifecycle')
s = once(s,
"  private newPurchase=()=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,error:''});};",
"  private newPurchase=()=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,this.props.defaultCurrency);purchase.items=[createPurchaseItem()];this.setState({purchaseEdit:purchase,error:''});};\n  private newPurchaseForSupplier=(supplier:Supplier)=>{if(this.mutationInFlight)return;const purchase=createPurchase(this.props.purchases,this.props.suppliers,supplier.defaultCurrency||this.props.defaultCurrency);purchase.supplierSnapshot=supplierSnapshotFrom(supplier);purchase.currency=supplier.defaultCurrency||purchase.currency;purchase.items=[createPurchaseItem()];this.setState({tab:'purchases',purchaseEdit:purchase,search:'',error:''});};\n  private showSupplierPurchaseHistory=(supplier:Supplier)=>this.setState({tab:'purchases',purchaseEdit:null,search:supplierLabel(supplier),error:''});", 'operations supplier helpers')
s = once(s,
"<div className=\"row-actions\"><button disabled={this.state.busy} onClick={()=>this.setState({supplierEdit:{...s},error:''})}>{t('Edit','تعديل')}</button><button disabled={this.state.busy} className=\"danger-link\" onClick={()=>void this.deleteSupplier(s)}>{t('Delete','حذف')}</button></div>",
"<div className=\"row-actions\"><button disabled={this.state.busy} onClick={()=>this.newPurchaseForSupplier(s)}>{t('New Purchase','شراء جديد')}</button><button disabled={this.state.busy} onClick={()=>this.showSupplierPurchaseHistory(s)}>{t('Purchase History','سجل المشتريات')}</button><button disabled={this.state.busy} onClick={()=>this.setState({supplierEdit:{...s},error:''})}>{t('Edit','تعديل')}</button><button disabled={this.state.busy} className=\"danger-link\" onClick={()=>void this.deleteSupplier(s)}>{t('Delete','حذف')}</button></div>", 'supplier contextual actions')
start = s.index('  private renderInventory():any{')
end = s.index('\n\n  render():any{', start)
old_method = s[start:end]
old_method = once(old_method,
"    const balances=inventoryBalances(this.props.items,this.props.inventoryMovements).filter(row=>this.visible(row.item.sku??'',row.item.descriptionEn,row.item.descriptionAr,row.quantity));const movements=[...this.props.inventoryMovements].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).slice(0,80);\n    return <div className=\"inventory-workspace\"><section className=\"inventory-balances\">",
"    const view=this.props.inventoryView??'all';\n    const balances=inventoryBalances(this.props.items,this.props.inventoryMovements).filter(row=>this.visible(row.item.sku??'',row.item.descriptionEn,row.item.descriptionAr,row.quantity));const movements=[...this.props.inventoryMovements].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)).slice(0,80).filter(m=>this.visible(m.sku||'',m.itemNameEn||'',m.itemNameAr||'',m.sourceNumber||'',m.note||''));\n    return <div className={`inventory-workspace inventory-view-${view}`}>{view!=='movements'?<section className=\"inventory-balances\">", 'inventory view start')
old_method = once(old_method, "</div></section>\n      <section className=\"inventory-entry\">", "</div></section>:null}\n      {view!=='balances'?<><section className=\"inventory-entry\">", 'inventory view middle')
old_method = once(old_method, "</div></section>\n    </div>;\n  }", "</div></section></>:null}\n    </div>;\n  }", 'inventory view end')
s = s[:start] + old_method + s[end:]
write(path, s)

# Customers: global quick create and statement shortcut into Finance.
path='src/components/CustomersPage.tsx'; s=read(path)
s=once(s,
"interface Props { customers: Customer[]; company:CompanySettings; onSave: (customer:Customer)=>Promise<void>; onDelete:(customer:Customer)=>Promise<void>; onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>; }",
"interface Props { customers: Customer[]; company:CompanySettings; onSave: (customer:Customer)=>Promise<void>; onDelete:(customer:Customer)=>Promise<void>; onNewDocument:(kind:DocumentKind,customer:Customer)=>Promise<void>; onViewStatement?:(customer:Customer)=>void; }", 'customer props')
s=once(s,"  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);}","  componentDidMount():void{this.mounted=true;document.addEventListener('keydown',this.handleKeyDown);window.addEventListener('lourex-create-customer',this.handleQuickCreate);}",'customer mount')
s=once(s,"  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);}","  componentWillUnmount():void{this.mounted=false;document.removeEventListener('keydown',this.handleKeyDown);window.removeEventListener('lourex-create-customer',this.handleQuickCreate);}\n  private handleQuickCreate=()=>this.newCustomer();",'customer unmount')
s=once(s,
"<div className=\"customer-profile-top-actions\"><Button icon=\"edit\" onClick={()=>this.beginEdit(customer)}>{t('Edit customer','تعديل العميل')}</Button><Button icon=\"proforma\"",
"<div className=\"customer-profile-top-actions\"><Button icon=\"edit\" onClick={()=>this.beginEdit(customer)}>{t('Edit customer','تعديل العميل')}</Button>{this.props.onViewStatement?<Button icon=\"file\" onClick={()=>this.props.onViewStatement?.(customer)}>{t('View Statement','عرض كشف الحساب')}</Button>:null}<Button icon=\"proforma\"",'customer statement top')
s=once(s,
"<section className=\"customer-profile-card customer-profile-quick-actions\"><header><h2>{t('Actions','الإجراءات')}</h2></header><button type=\"button\" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}>",
"<section className=\"customer-profile-card customer-profile-quick-actions\"><header><h2>{t('Actions','الإجراءات')}</h2></header>{this.props.onViewStatement?<button type=\"button\" onClick={()=>this.props.onViewStatement?.(customer)}><Icon name=\"file\"/><span>{t('View Statement','عرض كشف الحساب')}</span></button>:null}<button type=\"button\" disabled={this.state.busy||creatingAny} onClick={()=>void this.createDocument('proforma',customer)}>",'customer statement side')
write(path,s)

# Documents: contextual payment and credit-note actions in the canonical list.
path='src/components/DocumentsPage.tsx'; s=read(path)
s=once(s,"  onDelete: (doc:LourexDocument) => void;\n}","  onDelete: (doc:LourexDocument) => void;\n  onRecordPayment?: (doc:LourexDocument) => void;\n  onCreateCreditNote?: (doc:LourexDocument) => void;\n}",'documents props')
s=once(s,
"    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);",
"    const canConvert=Boolean(this.props.onConvert&&doc.kind==='proforma'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&!linkedInvoice);\n    const standardFinalInvoice=doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';\n    const canCollect=Boolean(this.props.onRecordPayment&&standardFinalInvoice&&invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status!=='paid');\n    const canCredit=Boolean(this.props.onCreateCreditNote&&standardFinalInvoice);",'document booleans')
s=once(s,
"      {canOutput?<><button type=\"button\" role=\"menuitem\" disabled={Boolean(this.state.outputId)}",
"      {canCollect?<button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onRecordPayment?.(doc))}><Icon name=\"invoice\"/>{t('Record Payment','تسجيل دفعة')}</button>:null}\n      {canCredit?<button type=\"button\" role=\"menuitem\" onClick={()=>this.runAction(()=>this.props.onCreateCreditNote?.(doc))}><Icon name=\"invoice\"/>{t('Create Credit Note','إنشاء إشعار دائن')}</button>:null}\n      {canOutput?<><button type=\"button\" role=\"menuitem\" disabled={Boolean(this.state.outputId)}",'document context buttons')
write(path,s)

# Receivables: Finance owns both statements and collection actions, reusing
# the existing validated InvoicePaymentsPanel.
path='src/components/ReceivablesPage.tsx'; s=read(path)
s=once(s,"import { customerReceivables, customerStatement, receivableCustomerId, receivablesByCurrency, type CustomerReceivableSummary } from '../lib/receivables.js';","import { customerReceivables, customerStatement, receivableCustomerId, receivablesByCurrency, type CustomerReceivableSummary } from '../lib/receivables.js';\nimport { invoicePaymentSummary } from '../lib/payments.js';",'receivable payment import')
s=once(s,"import { Button, Icon, IconButton, Input, Modal, Select } from './UI.js';","import { Button, Icon, IconButton, Input, Modal, Select } from './UI.js';\nimport { InvoicePaymentsPanel } from './InvoicePaymentsPanel.js';",'receivable panel import')
s=once(s,"interface Props{customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;}\ninterface State{query:string;filter:ReceivablesFilter;statementCustomerId:string;}","interface Props{customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;onSavePayment:(payment:PaymentRecord)=>Promise<void>;onDeletePayment:(payment:PaymentRecord)=>Promise<void>;}\ninterface State{query:string;filter:ReceivablesFilter;statementCustomerId:string;paymentInvoiceId:string;}",'receivable props/state')
s=once(s,"  state:State={query:'',filter:'open',statementCustomerId:''};","  state:State={query:'',filter:'open',statementCustomerId:'',paymentInvoiceId:''};\n  componentDidMount():void{window.addEventListener('lourex-finance-payment-open',this.handlePaymentOpen as EventListener);window.addEventListener('lourex-finance-statement-open',this.handleStatementOpen as EventListener);}\n  componentWillUnmount():void{window.removeEventListener('lourex-finance-payment-open',this.handlePaymentOpen as EventListener);window.removeEventListener('lourex-finance-statement-open',this.handleStatementOpen as EventListener);}\n  private collectibleInvoices=(customerId='')=>this.props.documents.filter(doc=>doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&(!customerId||receivableCustomerId(doc)===customerId)&&invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents).status!=='paid').sort((a,b)=>a.issueDate.localeCompare(b.issueDate)||a.number.localeCompare(b.number));\n  private handlePaymentOpen=(event:Event)=>{const invoiceId=(event as CustomEvent<{invoiceId?:string}>).detail?.invoiceId||'';const candidate=this.collectibleInvoices().find(doc=>doc.id===invoiceId)||this.collectibleInvoices()[0];if(candidate)this.setState({paymentInvoiceId:candidate.id});};\n  private handleStatementOpen=(event:Event)=>{const customerId=(event as CustomEvent<{customerId?:string}>).detail?.customerId||'';if(customerId)this.setState({statementCustomerId:customerId});};",'receivable lifecycle')
s=once(s,"    const overdueAccounts=customerReceivables(this.props.customers,this.props.documents,this.props.payments).filter(account=>account.hasOverdue).length;","    const overdueAccounts=customerReceivables(this.props.customers,this.props.documents,this.props.payments).filter(account=>account.hasOverdue).length;\n    const paymentDocument=this.props.documents.find(doc=>doc.id===this.state.paymentInvoiceId)||null;",'receivable payment doc')
old="<Button icon=\"file\" onClick={()=>this.setState({statementCustomerId:account.customerId})}>{t('Statement','كشف حساب')}</Button>"
new="<div className=\"receivable-account-actions\">{this.collectibleInvoices(account.customerId).length?<Button icon=\"invoice\" variant=\"primary\" onClick={()=>this.setState({paymentInvoiceId:this.collectibleInvoices(account.customerId)[0]!.id})}>{t('Record Payment','تسجيل دفعة')}</Button>:null}<Button icon=\"file\" onClick={()=>this.setState({statementCustomerId:account.customerId})}>{t('Statement','كشف حساب')}</Button></div>"
s=once(s,old,new,'receivable account actions')
s=once(s,
"      <CustomerStatementModal open={Boolean(this.state.statementCustomerId)} customerId={this.state.statementCustomerId} customers={this.props.customers} documents={this.props.documents} payments={this.props.payments} company={this.props.company} onClose={()=>this.setState({statementCustomerId:''})}/>",
"      <Modal open={Boolean(paymentDocument)} title={paymentDocument?t(`Collect ${paymentDocument.number}`,`تحصيل ${paymentDocument.number}`):t('Record Payment','تسجيل دفعة')} size=\"lg\" onClose={()=>this.setState({paymentInvoiceId:''})}>{paymentDocument?<InvoicePaymentsPanel document={paymentDocument} documents={this.props.documents} payments={this.props.payments} onSave={this.props.onSavePayment} onDelete={this.props.onDeletePayment}/>:null}</Modal>\n      <CustomerStatementModal open={Boolean(this.state.statementCustomerId)} customerId={this.state.statementCustomerId} customers={this.props.customers} documents={this.props.documents} payments={this.props.payments} company={this.props.company} onClose={()=>this.setState({statementCustomerId:''})}/>",'receivable payment modal')
write(path,s)

# App: route references to their single canonical owners.
path='src/app/App.tsx'; s=read(path)
s=once(s,
"{this.state.screen==='documents'?<DocumentsPage documents={vault.documents} payments={vault.payments} onNew={(k)=>void this.newDocument(k)} onOpen={(d)=>void this.openDocument(d)} onDuplicate={(d)=>void this.duplicate(d)} onConvert={this.convert} onPrint={this.requestPrint} onDelete={(d)=>this.setState({deletingDoc:d})}/>:null}\n          {this.state.screen==='customers'?<CustomersPage customers={vault.customers} company={vault.company} onSave={this.saveCustomer} onDelete={this.deleteCustomer} onNewDocument={this.newDocumentForCustomer}/>:null}\n          {this.state.screen==='receivables'?<FinanceWorkspace customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company} {...operationsProps}/>:null}",
"{this.state.screen==='documents'?<DocumentsPage documents={vault.documents} payments={vault.payments} onNew={(k)=>void this.newDocument(k)} onOpen={(d)=>void this.openDocument(d)} onDuplicate={(d)=>void this.duplicate(d)} onConvert={this.convert} onPrint={this.requestPrint} onDelete={(d)=>this.setState({deletingDoc:d})} onRecordPayment={(doc)=>this.setState({screen:'receivables'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-payment',{detail:{invoiceId:doc.id}})),0))} onCreateCreditNote={(doc)=>void this.createCreditNote(doc)}/>:null}\n          {this.state.screen==='customers'?<CustomersPage customers={vault.customers} company={vault.company} onSave={this.saveCustomer} onDelete={this.deleteCustomer} onNewDocument={this.newDocumentForCustomer} onViewStatement={(customer)=>this.setState({screen:'receivables'},()=>window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-statement',{detail:{customerId:customer.id}})),0))}/>:null}\n          {this.state.screen==='receivables'?<FinanceWorkspace customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company} onSavePayment={this.savePayment} onDeletePayment={this.deletePayment} {...operationsProps}/>:null}",'app routing')
write(path,s)

# Global Search payment ownership must be Finance, not editor.
path='src/components/GlobalSearch.tsx'; s=read(path)
s=once(s,
"  private createPayment=(document:LourexDocument)=>{\n    this.close();\n    this.props.onOpenDocument(document);\n    window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-create-payment',{detail:{invoiceId:document.id}})),0);\n  };",
"  private createPayment=(document:LourexDocument)=>{\n    this.close();\n    this.props.onNavigate('receivables');\n    window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-finance-payment',{detail:{invoiceId:document.id}})),0);\n  };",'global finance payment')
write(path,s)

print('Final closeout patch applied successfully.')
