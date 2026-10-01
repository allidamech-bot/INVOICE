from pathlib import Path


def replace(path:str,old:str,new:str,count:int=1):
    p=Path(path);text=p.read_text();found=text.count(old)
    if found<count: raise SystemExit(f'Missing anchor in {path}: {old[:120]!r} found={found}')
    p.write_text(text.replace(old,new,count))

# --- types ---
path='src/types.ts'
replace(path,"export type InventoryMovementType = 'opening' | 'purchase' | 'purchase-reversal' | 'issue' | 'adjustment';","export type InventoryMovementType = 'opening' | 'purchase' | 'purchase-reversal' | 'issue' | 'adjustment' | 'transfer-out' | 'transfer-in';")
replace(path,"export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';","export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\nexport type TreasuryAccountKind = 'cash' | 'bank';\nexport type TreasuryEntryType = 'opening-balance' | 'deposit' | 'withdrawal' | 'transfer' | 'collection' | 'supplier-payment' | 'reconciliation';\nexport type TreasurySourceType = 'manual' | 'customer-payment' | 'supplier-payment';")
replace(path,"  note: string;\n  createdAt: string;\n}\n\nexport interface Customer", "  note: string;\n  transferId?: string;\n  fromBranchId?: string;\n  toBranchId?: string;\n  createdAt: string;\n}\n\nexport interface Customer")
insert="""
export interface TreasuryAccountRecord extends WorkspaceScopeFields {
  id: string;
  label: string;
  kind: TreasuryAccountKind;
  currency: string;
  bankAccountId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryLedgerEntry extends WorkspaceScopeFields {
  id: string;
  type: TreasuryEntryType;
  date: string;
  amount: string;
  currency: string;
  fromAccountId: string;
  toAccountId: string;
  sourceType: TreasurySourceType;
  sourceId: string;
  reference: string;
  notes: string;
  reconciledAt: string;
  voidedAt: string;
  voidReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRateRecord extends WorkspaceScopeFields {
  id: string;
  date: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  sourceLabel: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransferRecord extends WorkspaceScopeFields {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  itemId: string;
  itemNameEn: string;
  itemNameAr: string;
  sku: string;
  quantity: string;
  date: string;
  note: string;
  createdAt: string;
}

"""
replace(path,"export interface VaultPayload {",insert+"export interface VaultPayload {")
replace(path,"  inventoryMovements: InventoryMovementRecord[];\n  workspaces: WorkspaceRecord[];","  inventoryMovements: InventoryMovementRecord[];\n  inventoryTransfers: InventoryTransferRecord[];\n  treasuryAccounts: TreasuryAccountRecord[];\n  treasuryEntries: TreasuryLedgerEntry[];\n  exchangeRates: ExchangeRateRecord[];\n  workspaces: WorkspaceRecord[];")

# --- defaults/schema ---
path='src/lib/defaults.ts'
replace(path,"// v20 adds encrypted multi-company workspaces and branch-scoped operational ledgers.\nexport const APP_SCHEMA_VERSION = 20;","// v20 adds encrypted multi-company workspaces and branch-scoped operational ledgers.\n// v21 adds real treasury ledger accounts/entries, dated FX rates and auditable stock transfers.\nexport const APP_SCHEMA_VERSION = 21;")
replace(path,"purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], workspaces:","purchases: [], supplierPayments: [], expenses: [], inventoryMovements: [], inventoryTransfers: [], treasuryAccounts: [], treasuryEntries: [], exchangeRates: [], workspaces:")

# --- workspace scopes ---
path='src/lib/workspaces.ts'
replace(path,"export const COMPANY_SCOPED_KEYS=['customers','suppliers','savedItems'] as const;","export const COMPANY_SCOPED_KEYS=['customers','suppliers','savedItems','exchangeRates','inventoryTransfers'] as const;")
replace(path,"export const BRANCH_SCOPED_KEYS=['purchases','supplierPayments','expenses','inventoryMovements','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const;","export const BRANCH_SCOPED_KEYS=['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const;")

# --- vault migration ---
path='src/storage/vault.ts'
replace(path,"const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);","const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment','transfer-out','transfer-in']);")
replace(path,"sourceId:stringValue(movement?.sourceId),sourceNumber:stringValue(movement?.sourceNumber),note:stringValue(movement?.note),createdAt:stringValue(movement?.createdAt,nowIso())","sourceId:stringValue(movement?.sourceId),sourceNumber:stringValue(movement?.sourceNumber),note:stringValue(movement?.note),transferId:stringValue(movement?.transferId),fromBranchId:stringValue(movement?.fromBranchId),toBranchId:stringValue(movement?.toBranchId),createdAt:stringValue(movement?.createdAt,nowIso())")
anchor="""  migrated.inventoryMovements = Array.isArray((vault as any).inventoryMovements) ? (vault as any).inventoryMovements.map((movement:any)=>({
    id:stringValue(movement?.id),itemId:stringValue(movement?.itemId),itemNameEn:stringValue(movement?.itemNameEn),itemNameAr:stringValue(movement?.itemNameAr),sku:stringValue(movement?.sku),date:stringValue(movement?.date),type:INVENTORY_MOVEMENT_TYPES.has(movement?.type)?movement.type:'adjustment',quantity:stringValue(movement?.quantity,'0'),unitCost:stringValue(movement?.unitCost),currency:stringValue(movement?.currency).trim().toUpperCase(),sourceId:stringValue(movement?.sourceId),sourceNumber:stringValue(movement?.sourceNumber),note:stringValue(movement?.note),transferId:stringValue(movement?.transferId),fromBranchId:stringValue(movement?.fromBranchId),toBranchId:stringValue(movement?.toBranchId),createdAt:stringValue(movement?.createdAt,nowIso())
  })) : [];
"""
extra=anchor+"""
  migrated.inventoryTransfers = Array.isArray((vault as any).inventoryTransfers) ? (vault as any).inventoryTransfers.map((transfer:any)=>({
    id:stringValue(transfer?.id),workspaceId:stringValue(transfer?.workspaceId,'default')||'default',fromBranchId:stringValue(transfer?.fromBranchId),toBranchId:stringValue(transfer?.toBranchId),itemId:stringValue(transfer?.itemId),itemNameEn:stringValue(transfer?.itemNameEn),itemNameAr:stringValue(transfer?.itemNameAr),sku:stringValue(transfer?.sku),quantity:stringValue(transfer?.quantity,'0'),date:stringValue(transfer?.date),note:stringValue(transfer?.note),createdAt:stringValue(transfer?.createdAt,nowIso())
  })).filter((transfer:any)=>transfer.id&&transfer.fromBranchId&&transfer.toBranchId&&transfer.itemId) : [];
  migrated.treasuryAccounts = Array.isArray((vault as any).treasuryAccounts) ? (vault as any).treasuryAccounts.map((account:any)=>({
    id:stringValue(account?.id),label:stringValue(account?.label),kind:account?.kind==='bank'?'bank':'cash',currency:cleanCurrency(account?.currency,migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:stringValue(account?.bankAccountId),active:booleanValue(account?.active,true),createdAt:stringValue(account?.createdAt,nowIso()),updatedAt:stringValue(account?.updatedAt,account?.createdAt?stringValue(account.createdAt):nowIso())
  })).filter((account:any)=>account.id&&account.label) : [];
  migrated.treasuryEntries = Array.isArray((vault as any).treasuryEntries) ? (vault as any).treasuryEntries.map((entry:any)=>({
    id:stringValue(entry?.id),type:['opening-balance','deposit','withdrawal','transfer','collection','supplier-payment','reconciliation'].includes(String(entry?.type||''))?entry.type:'deposit',date:stringValue(entry?.date),amount:stringValue(entry?.amount,'0.00'),currency:cleanCurrency(entry?.currency,migrated.appSettings.smartDefaults.currency||'USD'),fromAccountId:stringValue(entry?.fromAccountId),toAccountId:stringValue(entry?.toAccountId),sourceType:['customer-payment','supplier-payment'].includes(String(entry?.sourceType||''))?entry.sourceType:'manual',sourceId:stringValue(entry?.sourceId),reference:stringValue(entry?.reference),notes:stringValue(entry?.notes),reconciledAt:stringValue(entry?.reconciledAt),voidedAt:stringValue(entry?.voidedAt),voidReason:stringValue(entry?.voidReason),createdAt:stringValue(entry?.createdAt,nowIso()),updatedAt:stringValue(entry?.updatedAt,entry?.createdAt?stringValue(entry.createdAt):nowIso())
  })).filter((entry:any)=>entry.id&&entry.date) : [];
  migrated.exchangeRates = Array.isArray((vault as any).exchangeRates) ? (vault as any).exchangeRates.map((rate:any)=>({
    id:stringValue(rate?.id),date:stringValue(rate?.date),baseCurrency:cleanCurrency(rate?.baseCurrency,'USD'),quoteCurrency:cleanCurrency(rate?.quoteCurrency,'USD'),rate:stringValue(rate?.rate,'1'),sourceLabel:stringValue(rate?.sourceLabel),notes:stringValue(rate?.notes),createdAt:stringValue(rate?.createdAt,nowIso()),updatedAt:stringValue(rate?.updatedAt,rate?.createdAt?stringValue(rate.createdAt):nowIso())
  })).filter((rate:any)=>rate.id&&rate.date&&rate.sourceLabel) : [];
"""
replace(path,anchor,extra)
replace(path,"(['customers','suppliers','savedItems'] as const).forEach(key=>restoreScope(key,false));","(['customers','suppliers','savedItems','exchangeRates','inventoryTransfers'] as const).forEach(key=>restoreScope(key,false));")
replace(path,"(['purchases','supplierPayments','expenses','inventoryMovements','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const).forEach(key=>restoreScope(key,true));","(['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const).forEach(key=>restoreScope(key,true));")
replace(path,"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');","  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.inventoryTransfers.map(t => t.id), 'inventory transfer');\n  unique(migrated.treasuryAccounts.map(a => a.id), 'treasury account');\n  unique(migrated.treasuryEntries.map(e => e.id), 'treasury entry');\n  unique(migrated.exchangeRates.map(r => r.id), 'exchange rate');")

# --- merge safety ---
path='src/storage/vault-merge.ts'
replace(path,"import { assertRecurringWorkflow } from '../lib/recurring-workflows.js';","import { assertRecurringWorkflow } from '../lib/recurring-workflows.js';\nimport { assertTreasuryAccount, assertTreasuryEntry } from '../lib/treasury-ledger.js';\nimport { assertExchangeRate } from '../lib/fx-rates.js';")
replace(path,"  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);","  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  guardConcurrentRecordChanges(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts,'Treasury account','Reopen Cash & Bank before saving this account.');\n  const treasuryAccounts=mergeRecords(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts);\n  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before changing this entry.');\n  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);\n  guardConcurrentRecordChanges(base.exchangeRates,intended.exchangeRates,latest.exchangeRates,'Exchange rate','Reopen FX before saving this rate.');\n  const exchangeRates=mergeRecords(base.exchangeRates,intended.exchangeRates,latest.exchangeRates);\n  const inventoryTransfers=mergeRecords(base.inventoryTransfers,intended.inventoryTransfers,latest.inventoryTransfers);")
replace(path,"  assertSupplierPaymentInvariant(purchases,suppliers,supplierPayments);","  assertSupplierPaymentInvariant(purchases,suppliers,supplierPayments);\n  for(const account of treasuryAccounts)assertTreasuryAccount(account);\n  for(const entry of treasuryEntries)assertTreasuryEntry(entry,treasuryAccounts);\n  for(const rate of exchangeRates)assertExchangeRate(rate);")
replace(path,"    inventoryMovements,\n    workspaces,","    inventoryMovements,\n    inventoryTransfers,\n    treasuryAccounts,\n    treasuryEntries,\n    exchangeRates,\n    workspaces,")

# --- App imports + handlers + props ---
path='src/app/App.tsx'
replace(path,"ExpenseRecord, InventoryMovementRecord, LourexDocument", "ExpenseRecord, ExchangeRateRecord, InventoryMovementRecord, InventoryTransferRecord, LourexDocument")
replace(path,"SupplierPaymentRecord, TeamMemberRecord", "SupplierPaymentRecord, TeamMemberRecord, TreasuryAccountRecord, TreasuryLedgerEntry")
replace(path,"import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';","import { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';\nimport { assertTreasuryAccount, assertTreasuryEntry, markTreasuryEntryReconciled, voidTreasuryEntry } from '../lib/treasury-ledger.js';\nimport { assertExchangeRate } from '../lib/fx-rates.js';\nimport { createInventoryTransfer } from '../lib/stock-transfers.js';")
handler_anchor="  private deleteExpenseRecord=async(expense:ExpenseRecord)=>{const vault=this.requireVault();await this.persist({...vault,expenses:vault.expenses.filter(item=>item.id!==expense.id)});this.showToast(t('Expense deleted.','تم حذف المصروف.'),'success');};"
handlers=handler_anchor+"""
  private saveTreasuryAccount=async(account:TreasuryAccountRecord)=>{assertTreasuryAccount(account);const vault=this.requireVault();const accounts=[...vault.treasuryAccounts];const index=accounts.findIndex(item=>item.id===account.id);const next={...account,currency:account.currency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)accounts[index]=next;else accounts.push(next);await this.persist({...vault,treasuryAccounts:accounts});this.showToast(t('Treasury account saved.','تم حفظ حساب الخزينة.'),'success');};
  private saveTreasuryEntry=async(entry:TreasuryLedgerEntry)=>{const vault=this.requireVault();assertTreasuryEntry(entry,vault.treasuryAccounts);if(entry.sourceId&&vault.treasuryEntries.some(item=>item.id!==entry.id&&!item.voidedAt&&item.sourceType===entry.sourceType&&item.sourceId===entry.sourceId))throw new Error(t('This source record is already allocated in the treasury ledger.','تم تخصيص هذا السجل مسبقًا في دفتر الخزينة.'));const entries=[...vault.treasuryEntries];const index=entries.findIndex(item=>item.id===entry.id);if(index>=0){const before=entries[index];if(!before)throw new Error('Treasury entry not found.');if(before.type!==entry.type||before.amount!==entry.amount||before.currency!==entry.currency||before.fromAccountId!==entry.fromAccountId||before.toAccountId!==entry.toAccountId||before.sourceId!==entry.sourceId)throw new Error(t('Financial treasury entries are immutable. Void the entry and create a correction.','قيود الخزينة المالية غير قابلة للتعديل. ألغِ القيد وأنشئ تصحيحًا.'));entries[index]=entry;}else entries.push(entry);await this.persist({...vault,treasuryEntries:entries});this.showToast(t('Treasury entry recorded.','تم تسجيل قيد الخزينة.'),'success');};
  private voidTreasuryEntryRecord=async(entry:TreasuryLedgerEntry,reason:string)=>{const vault=this.requireVault();const current=vault.treasuryEntries.find(item=>item.id===entry.id);if(!current)throw new Error(t('Treasury entry not found.','قيد الخزينة غير موجود.'));const next=voidTreasuryEntry(current,reason);await this.persist({...vault,treasuryEntries:vault.treasuryEntries.map(item=>item.id===next.id?next:item)});this.showToast(t('Treasury entry voided with history preserved.','تم إلغاء قيد الخزينة مع الحفاظ على السجل.'),'success');};
  private reconcileTreasuryEntry=async(entry:TreasuryLedgerEntry,reconciled:boolean)=>{const vault=this.requireVault();const current=vault.treasuryEntries.find(item=>item.id===entry.id);if(!current)throw new Error(t('Treasury entry not found.','قيد الخزينة غير موجود.'));const next=markTreasuryEntryReconciled(current,reconciled);await this.persist({...vault,treasuryEntries:vault.treasuryEntries.map(item=>item.id===next.id?next:item)});};
  private saveExchangeRate=async(rate:ExchangeRateRecord)=>{assertExchangeRate(rate);const vault=this.requireVault();const rates=[...vault.exchangeRates];const index=rates.findIndex(item=>item.id===rate.id);const next={...rate,baseCurrency:rate.baseCurrency.trim().toUpperCase(),quoteCurrency:rate.quoteCurrency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)rates[index]=next;else rates.push(next);await this.persist({...vault,exchangeRates:rates});this.showToast(t('Exchange rate saved.','تم حفظ سعر الصرف.'),'success');};
  private deleteExchangeRate=async(rate:ExchangeRateRecord)=>{const vault=this.requireVault();await this.persist({...vault,exchangeRates:vault.exchangeRates.filter(item=>item.id!==rate.id)});this.showToast(t('Exchange rate deleted.','تم حذف سعر الصرف.'),'success');};
  private transferInventory=async(input:{fromBranchId:string;toBranchId:string;itemId:string;quantity:string;date:string;note:string})=>{await this.persistFullMutation(full=>{const workspaceId=full.appSettings.activeWorkspaceId;const item=full.savedItems.find(candidate=>candidate.id===input.itemId&&String(candidate.workspaceId||'default')===workspaceId);if(!item)throw new Error(t('Product not found in this workspace.','الصنف غير موجود في مساحة العمل الحالية.'));const result=createInventoryTransfer({workspaceId,fromBranchId:input.fromBranchId,toBranchId:input.toBranchId,item,quantity:input.quantity,date:input.date,note:input.note},full.branches,full.inventoryMovements);return{...full,inventoryTransfers:[...full.inventoryTransfers,result.transfer],inventoryMovements:[...full.inventoryMovements,...result.movements]};});this.showToast(t('Stock transfer recorded in both locations.','تم تسجيل تحويل المخزون في الموقعين.'),'success');};
"""
replace(path,handler_anchor,handlers)
replace(path,"    const activeBranchMeta=vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.id===vault.appSettings.activeBranchId)??vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.active);","    const activeBranchMeta=vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.id===vault.appSettings.activeBranchId)??vault.branches.find(item=>item.workspaceId===activeWorkspaceMeta?.id&&item.active);\n    const fullVault=this.state.vault??vault;\n    const workspaceInventoryMovements=fullVault.inventoryMovements.filter(item=>String(item.workspaceId||'default')===activeWorkspaceMeta?.id);\n    const workspaceInventoryTransfers=fullVault.inventoryTransfers.filter(item=>String(item.workspaceId||'default')===activeWorkspaceMeta?.id);")
replace(path,"{this.state.screen==='receivables'?<FinanceWorkspace customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company} onSavePayment={this.savePayment} onDeletePayment={this.deletePayment} onSaveSupplierPayment={this.saveSupplierPayment} onDeleteSupplierPayment={this.deleteSupplierPayment} {...operationsProps}/>:null}","{this.state.screen==='receivables'?<FinanceWorkspace customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company} treasuryAccounts={vault.treasuryAccounts} treasuryEntries={vault.treasuryEntries} exchangeRates={vault.exchangeRates} workspaceId={vault.appSettings.activeWorkspaceId} branchId={vault.appSettings.activeBranchId} onSaveTreasuryAccount={this.saveTreasuryAccount} onSaveTreasuryEntry={this.saveTreasuryEntry} onVoidTreasuryEntry={this.voidTreasuryEntryRecord} onReconcileTreasuryEntry={this.reconcileTreasuryEntry} onSaveExchangeRate={this.saveExchangeRate} onDeleteExchangeRate={this.deleteExchangeRate} onSavePayment={this.savePayment} onDeletePayment={this.deletePayment} onSaveSupplierPayment={this.saveSupplierPayment} onDeleteSupplierPayment={this.deleteSupplierPayment} {...operationsProps}/>:null}")
replace(path,"{this.state.screen==='items'?<ProductsInventoryWorkspace currency={defaultCurrency} onSaveItem={this.saveSavedItem} onSaveItems={this.saveSavedItemsBatch} onDeleteItem={this.deleteSavedItem} {...operationsProps}/>:null}","{this.state.screen==='items'?<ProductsInventoryWorkspace currency={defaultCurrency} branches={vault.branches.filter(item=>item.workspaceId===vault.appSettings.activeWorkspaceId)} activeWorkspaceId={vault.appSettings.activeWorkspaceId} activeBranchId={vault.appSettings.activeBranchId} workspaceInventoryMovements={workspaceInventoryMovements} inventoryTransfers={workspaceInventoryTransfers} onTransferInventory={this.transferInventory} onSaveItem={this.saveSavedItem} onSaveItems={this.saveSavedItemsBatch} onDeleteItem={this.deleteSavedItem} {...operationsProps}/>:null}")

# --- FinanceWorkspace props/wiring ---
path='src/components/FinanceWorkspace.tsx'
replace(path,"import type { CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord } from '../types.js';","import type { CompanySettings, Customer, ExchangeRateRecord, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerEntry } from '../types.js';")
replace(path,"  customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;","  customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];company:CompanySettings;\n  treasuryAccounts:TreasuryAccountRecord[];treasuryEntries:TreasuryLedgerEntry[];exchangeRates:ExchangeRateRecord[];workspaceId:string;branchId:string;\n  onSaveTreasuryAccount:(account:TreasuryAccountRecord)=>Promise<void>;onSaveTreasuryEntry:(entry:TreasuryLedgerEntry)=>Promise<void>;onVoidTreasuryEntry:(entry:TreasuryLedgerEntry,reason:string)=>Promise<void>;onReconcileTreasuryEntry:(entry:TreasuryLedgerEntry,reconciled:boolean)=>Promise<void>;onSaveExchangeRate:(rate:ExchangeRateRecord)=>Promise<void>;onDeleteExchangeRate:(rate:ExchangeRateRecord)=>Promise<void>;")
replace(path,"{tab==='treasury'?<TreasuryPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} company={props.company} defaultCurrency={props.defaultCurrency}/>:tab==='fx'?<FxPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} defaultCurrency={props.defaultCurrency}/>","{tab==='treasury'?<TreasuryPage payments={props.payments} supplierPayments={props.supplierPayments} company={props.company} defaultCurrency={props.defaultCurrency} accounts={props.treasuryAccounts} entries={props.treasuryEntries} workspaceId={props.workspaceId} branchId={props.branchId} onSaveAccount={props.onSaveTreasuryAccount} onSaveEntry={props.onSaveTreasuryEntry} onVoidEntry={props.onVoidTreasuryEntry} onReconcileEntry={props.onReconcileTreasuryEntry}/>:tab==='fx'?<FxPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} rates={props.exchangeRates} workspaceId={props.workspaceId} defaultCurrency={props.defaultCurrency} onSaveRate={props.onSaveExchangeRate} onDeleteRate={props.onDeleteExchangeRate}/>")

# --- ProductsInventoryWorkspace props/wiring ---
path='src/components/ProductsInventoryWorkspace.tsx'
replace(path,"import type { ExpenseRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';","import type { BranchRecord, ExpenseRecord, InventoryMovementRecord, InventoryTransferRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';")
replace(path,"  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];defaultCurrency:string;","  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];defaultCurrency:string;\n  branches:BranchRecord[];activeWorkspaceId:string;activeBranchId:string;workspaceInventoryMovements:InventoryMovementRecord[];inventoryTransfers:InventoryTransferRecord[];onTransferInventory:(input:{fromBranchId:string;toBranchId:string;itemId:string;quantity:string;date:string;note:string})=>Promise<void>;")
replace(path,"{tab==='inventory'?<OperationsPage mode=\"inventory\" inventoryView=\"balances\" focusItemId={focusItemId} {...operationsProps}/>:null}{tab==='planning'?<InventoryPlanningLive/>:null}{tab==='locations'?<StockLocationsPage items={props.items} inventoryMovements={props.inventoryMovements}/>:null}","{tab==='inventory'?<OperationsPage mode=\"inventory\" inventoryView=\"balances\" focusItemId={focusItemId} {...operationsProps}/>:null}{tab==='planning'?<InventoryPlanningLive/>:null}{tab==='locations'?<StockLocationsPage items={props.items} branches={props.branches} activeWorkspaceId={props.activeWorkspaceId} activeBranchId={props.activeBranchId} workspaceInventoryMovements={props.workspaceInventoryMovements} inventoryTransfers={props.inventoryTransfers} onTransfer={props.onTransferInventory}/>:null}")

print('Final roadmap schema/integration patch applied.')
