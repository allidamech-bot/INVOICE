import { readFile, writeFile } from 'node:fs/promises';

async function patch(path,changes){
  let text=await readFile(path,'utf8');
  for(const [from,to] of changes){
    const count=text.split(from).length-1;
    if(count!==1)throw new Error(`${path}: expected one match, found ${count}: ${from.slice(0,100)}`);
    text=text.replace(from,to);
  }
  await writeFile(path,text);
}

await patch('src/types.ts',[
  ["export type PaymentMethod = 'cash' | 'bank-transfer' | 'card' | 'cheque' | 'other';\n",`export type PaymentMethod = 'cash' | 'bank-transfer' | 'card' | 'cheque' | 'other';
export type PurchaseStatus = 'draft' | 'posted' | 'reversed';
export type InventoryMovementType = 'opening' | 'purchase' | 'purchase-reversal' | 'issue' | 'adjustment';
`],
  [`export interface Customer {\n`, `export interface Supplier {
  id: string;
  createdAt: string;
  updatedAt: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
  defaultCurrency: string;
  paymentTerms: string;
  notes: string;
}

export interface SupplierSnapshot {
  sourceSupplierId: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
}

export interface PurchaseItem {
  id: string;
  savedItemId: string;
  sku: string;
  descriptionEn: string;
  descriptionAr: string;
  quantity: string;
  unit: string;
  unitCost: string;
  landedUnitCost: string;
  previousUnitCost: string;
  previousCostCurrency: string;
}

export interface PurchaseRecord {
  id: string;
  number: string;
  date: string;
  supplierSnapshot: SupplierSnapshot | null;
  currency: string;
  items: PurchaseItem[];
  freight: string;
  duty: string;
  otherCosts: string;
  notes: string;
  status: PurchaseStatus;
  postedAt: string;
  reversedAt: string;
  reverseReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  supplierId: string;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementRecord {
  id: string;
  itemId: string;
  itemNameEn: string;
  itemNameAr: string;
  sku: string;
  date: string;
  type: InventoryMovementType;
  quantity: string;
  unitCost: string;
  currency: string;
  sourceId: string;
  sourceNumber: string;
  note: string;
  createdAt: string;
}

export interface Customer {
`],
  [`  customers: Customer[];\n  documents: LourexDocument[];\n`, `  customers: Customer[];
  suppliers: Supplier[];
  purchases: PurchaseRecord[];
  expenses: ExpenseRecord[];
  inventoryMovements: InventoryMovementRecord[];
  documents: LourexDocument[];
`]
]);

await patch('src/lib/defaults.ts',[
  [`// v10 adds commercial controls, bank choices and customer credit policy.\nexport const APP_SCHEMA_VERSION = 10;`, `// v10 adds commercial controls, bank choices and customer credit policy.
// v11 adds encrypted suppliers, purchases, expenses and inventory ledger records.
export const APP_SCHEMA_VERSION = 11;`],
  [`return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [] };`, `return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], suppliers: [], purchases: [], expenses: [], inventoryMovements: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [] };`]
]);

await patch('src/storage/vault-merge.ts',[
  [`    customers:mergeRecords(base.customers,intended.customers,latest.customers),\n    documents:mergeRecords(base.documents,intended.documents,latest.documents),`, `    customers:mergeRecords(base.customers,intended.customers,latest.customers),
    suppliers:mergeRecords(base.suppliers,intended.suppliers,latest.suppliers),
    purchases:mergeRecords(base.purchases,intended.purchases,latest.purchases),
    expenses:mergeRecords(base.expenses,intended.expenses,latest.expenses),
    inventoryMovements:mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements),
    documents:mergeRecords(base.documents,intended.documents,latest.documents),`]
]);

await patch('src/storage/vault.ts',[
  [`const DOCUMENT_EVENT_TYPES = new Set(['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted']);\n`, `const DOCUMENT_EVENT_TYPES = new Set(['created','issued','reissued','revision-started','revision-discarded','voided','credit-note-created','payment-recorded','payment-deleted','converted']);
const PURCHASE_STATUSES = new Set(['draft','posted','reversed']);
const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);
`],
  [`  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({`, `  migrated.suppliers = Array.isArray((vault as any).suppliers) ? (vault as any).suppliers.map((supplier:any)=>({
    id:stringValue(supplier?.id),createdAt:stringValue(supplier?.createdAt,nowIso()),updatedAt:stringValue(supplier?.updatedAt,supplier?.createdAt?stringValue(supplier.createdAt):nowIso()),
    nameEn:stringValue(supplier?.nameEn),nameAr:stringValue(supplier?.nameAr),contactPerson:stringValue(supplier?.contactPerson),address:stringValue(supplier?.address),city:stringValue(supplier?.city),country:stringValue(supplier?.country),phone:stringValue(supplier?.phone),email:stringValue(supplier?.email),vatTaxNumber:stringValue(supplier?.vatTaxNumber),commercialRegistration:stringValue(supplier?.commercialRegistration),defaultCurrency:cleanCurrency(supplier?.defaultCurrency,migrated.appSettings.smartDefaults.currency||'USD'),paymentTerms:stringValue(supplier?.paymentTerms),notes:stringValue(supplier?.notes)
  })) : [];

  migrated.purchases = Array.isArray((vault as any).purchases) ? (vault as any).purchases.map((purchase:any)=>({
    id:stringValue(purchase?.id),number:stringValue(purchase?.number),date:stringValue(purchase?.date),supplierSnapshot:purchase?.supplierSnapshot&&typeof purchase.supplierSnapshot==='object'?{
      sourceSupplierId:stringValue(purchase.supplierSnapshot.sourceSupplierId),nameEn:stringValue(purchase.supplierSnapshot.nameEn),nameAr:stringValue(purchase.supplierSnapshot.nameAr),contactPerson:stringValue(purchase.supplierSnapshot.contactPerson),address:stringValue(purchase.supplierSnapshot.address),city:stringValue(purchase.supplierSnapshot.city),country:stringValue(purchase.supplierSnapshot.country),phone:stringValue(purchase.supplierSnapshot.phone),email:stringValue(purchase.supplierSnapshot.email),vatTaxNumber:stringValue(purchase.supplierSnapshot.vatTaxNumber),commercialRegistration:stringValue(purchase.supplierSnapshot.commercialRegistration)
    }:null,currency:cleanCurrency(purchase?.currency,migrated.appSettings.smartDefaults.currency||'USD'),items:Array.isArray(purchase?.items)?purchase.items.map((item:any)=>({
      id:stringValue(item?.id),savedItemId:stringValue(item?.savedItemId),sku:stringValue(item?.sku),descriptionEn:stringValue(item?.descriptionEn),descriptionAr:stringValue(item?.descriptionAr),quantity:stringValue(item?.quantity,'0'),unit:stringValue(item?.unit,'PCS'),unitCost:stringValue(item?.unitCost,'0'),landedUnitCost:stringValue(item?.landedUnitCost),previousUnitCost:stringValue(item?.previousUnitCost),previousCostCurrency:stringValue(item?.previousCostCurrency).trim().toUpperCase()
    })):[],freight:stringValue(purchase?.freight,'0.00'),duty:stringValue(purchase?.duty,'0.00'),otherCosts:stringValue(purchase?.otherCosts,'0.00'),notes:stringValue(purchase?.notes),status:PURCHASE_STATUSES.has(purchase?.status)?purchase.status:'draft',postedAt:stringValue(purchase?.postedAt),reversedAt:stringValue(purchase?.reversedAt),reverseReason:stringValue(purchase?.reverseReason),createdAt:stringValue(purchase?.createdAt,nowIso()),updatedAt:stringValue(purchase?.updatedAt,purchase?.createdAt?stringValue(purchase.createdAt):nowIso())
  })) : [];

  migrated.expenses = Array.isArray((vault as any).expenses) ? (vault as any).expenses.map((expense:any)=>({
    id:stringValue(expense?.id),date:stringValue(expense?.date),category:stringValue(expense?.category,'General'),description:stringValue(expense?.description),amount:stringValue(expense?.amount,'0'),currency:cleanCurrency(expense?.currency,migrated.appSettings.smartDefaults.currency||'USD'),supplierId:stringValue(expense?.supplierId),reference:stringValue(expense?.reference),notes:stringValue(expense?.notes),createdAt:stringValue(expense?.createdAt,nowIso()),updatedAt:stringValue(expense?.updatedAt,expense?.createdAt?stringValue(expense.createdAt):nowIso())
  })) : [];

  migrated.inventoryMovements = Array.isArray((vault as any).inventoryMovements) ? (vault as any).inventoryMovements.map((movement:any)=>({
    id:stringValue(movement?.id),itemId:stringValue(movement?.itemId),itemNameEn:stringValue(movement?.itemNameEn),itemNameAr:stringValue(movement?.itemNameAr),sku:stringValue(movement?.sku),date:stringValue(movement?.date),type:INVENTORY_MOVEMENT_TYPES.has(movement?.type)?movement.type:'adjustment',quantity:stringValue(movement?.quantity,'0'),unitCost:stringValue(movement?.unitCost),currency:stringValue(movement?.currency).trim().toUpperCase(),sourceId:stringValue(movement?.sourceId),sourceNumber:stringValue(movement?.sourceNumber),note:stringValue(movement?.note),createdAt:stringValue(movement?.createdAt,nowIso())
  })) : [];

  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({`],
  [`  unique(migrated.customers.map(c => c.id), 'customer');\n  unique(migrated.documents.map(d => d.id), 'document');`, `  unique(migrated.customers.map(c => c.id), 'customer');
  unique(migrated.suppliers.map(s => s.id), 'supplier');
  unique(migrated.purchases.map(p => p.id), 'purchase');
  unique(migrated.expenses.map(e => e.id), 'expense');
  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');
  unique(migrated.documents.map(d => d.id), 'document');`]
]);

await patch('src/lib/operations.ts',[
  [`return {id:makeId('purchase-item'),savedItemId:item?.id??'',sku:item?.sku??'',descriptionEn:item?.descriptionEn??'',descriptionAr:item?.descriptionAr??'',quantity:'1',unit:item?.unit||'PCS',unitCost:item?.lastUnitCost??'',landedUnitCost:''};`, `return {id:makeId('purchase-item'),savedItemId:item?.id??'',sku:item?.sku??'',descriptionEn:item?.descriptionEn??'',descriptionAr:item?.descriptionAr??'',quantity:'1',unit:item?.unit||'PCS',unitCost:item?.lastUnitCost??'',landedUnitCost:'',previousUnitCost:item?.lastUnitCost??'',previousCostCurrency:item?.lastCostCurrency??''};`],
  [`  const at=nowIso();\n  const posted={...allocateLandedCost(purchase),status:'posted' as const,postedAt:at,updatedAt:at};`, `  const at=nowIso();
  const savedById=new Map(savedItems.map(item=>[item.id,item]));
  const withPrior={...purchase,items:purchase.items.map(line=>{const saved=savedById.get(line.savedItemId);return {...line,previousUnitCost:saved?.lastUnitCost??line.previousUnitCost??'',previousCostCurrency:saved?.lastCostCurrency??line.previousCostCurrency??''};})};
  const posted={...allocateLandedCost(withPrior),status:'posted' as const,postedAt:at,updatedAt:at};`],
  [`export function reversePurchase(purchase:PurchaseRecord,reason:string,existingMovements:InventoryMovementRecord[]=[]):{purchase:PurchaseRecord;movements:InventoryMovementRecord[]}{\n  if(purchase.status!=='posted')throw new Error('Only posted purchases can be reversed.');\n  if(!reason.trim())throw new Error('A reversal reason is required.');\n  if(existingMovements.some(m=>m.sourceId===purchase.id&&m.type==='purchase-reversal'))throw new Error('This purchase has already been reversed.');\n  const at=nowIso();\n  const reversed={...purchase,status:'reversed' as const,reversedAt:at,reverseReason:reason.trim(),updatedAt:at};\n  const movements=purchase.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(purchase,item,'purchase-reversal',trimFixed(fixed(-decimalToScaled(item.quantity,4),4)),reason.trim()));\n  return {purchase:reversed,movements};\n}`, `export function reversePurchase(purchase:PurchaseRecord,reason:string,existingMovements:InventoryMovementRecord[]=[],savedItems:SavedItem[]=[]):{purchase:PurchaseRecord;movements:InventoryMovementRecord[];savedItems:SavedItem[]}{
  if(purchase.status!=='posted')throw new Error('Only posted purchases can be reversed.');
  if(!reason.trim())throw new Error('A reversal reason is required.');
  if(existingMovements.some(m=>m.sourceId===purchase.id&&m.type==='purchase-reversal'))throw new Error('This purchase has already been reversed.');
  const at=nowIso();
  const reversed={...purchase,status:'reversed' as const,reversedAt:at,reverseReason:reason.trim(),updatedAt:at};
  const movements=purchase.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(purchase,item,'purchase-reversal',trimFixed(fixed(-decimalToScaled(item.quantity,4),4)),reason.trim()));
  const lines=new Map(purchase.items.filter(line=>line.savedItemId).map(line=>[line.savedItemId,line]));
  const restored=savedItems.map(item=>{const line=lines.get(item.id);if(!line)return item;const current=(item.lastUnitCost??'').trim(),landed=(line.landedUnitCost||line.unitCost).trim();if(current!==landed||item.lastCostCurrency!==purchase.currency)return item;return {...item,lastUnitCost:line.previousUnitCost||'',lastCostCurrency:line.previousCostCurrency||'',updatedAt:at};});
  return {purchase:reversed,movements,savedItems:restored};
}`]
]);

await patch('src/app/App.tsx',[
  [`import type { AppSettings, CompanySettings, Customer, DocumentKind, LourexDocument, PaymentRecord, SavedItem, UiLanguage, VaultPayload } from '../types.js';`, `import type { AppSettings, CompanySettings, Customer, DocumentKind, ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem, Supplier, UiLanguage, VaultPayload } from '../types.js';`],
  [`import { applyCustomerCommercialDefaults, applyPaymentTermPreset, assertCustomerCreditLimit, paymentTermPresetById, paymentTermPresetByLabel } from '../lib/commercial-controls.js';\n`, `import { applyCustomerCommercialDefaults, applyPaymentTermPreset, assertCustomerCreditLimit, paymentTermPresetById, paymentTermPresetByLabel } from '../lib/commercial-controls.js';
import { inventoryMovementIsManual, postPurchase, reversePurchase, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';
`],
  [`import { ReportsPage } from '../components/ReportsPage.js';\nimport { SavedItemsPage } from '../components/SavedItemsPage.js';`, `import { ReportsPage } from '../components/ReportsPage.js';
import { OperationsPage } from '../components/OperationsPage.js';
import { SavedItemsPage } from '../components/SavedItemsPage.js';`],
  [`  screen:'documents'|'customers'|'receivables'|'reports'|'items'|'editor'; editorDoc:LourexDocument|null; settingsOpen:boolean; newMenu:boolean;`, `  screen:'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor'; editorDoc:LourexDocument|null; settingsOpen:boolean; newMenu:boolean;`],
  [`  private saveCustomer=async(customer:Customer)=>{const vault=this.requireVault();const index=vault.customers.findIndex(c=>c.id===customer.id);const customers=[...vault.customers];if(index>=0)customers[index]={...customer,updatedAt:new Date().toISOString()};else customers.push(customer);await this.persist({...vault,customers});};\n`, `  private saveCustomer=async(customer:Customer)=>{const vault=this.requireVault();const index=vault.customers.findIndex(c=>c.id===customer.id);const customers=[...vault.customers];if(index>=0)customers[index]={...customer,updatedAt:new Date().toISOString()};else customers.push(customer);await this.persist({...vault,customers});};
  private saveSupplier=async(supplier:Supplier)=>{const errors=validateSupplier(supplier);if(errors.length)throw new Error(errors[0]);const vault=this.requireVault();const suppliers=[...vault.suppliers];const index=suppliers.findIndex(item=>item.id===supplier.id);const next={...supplier,defaultCurrency:supplier.defaultCurrency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)suppliers[index]=next;else suppliers.push(next);await this.persist({...vault,suppliers});this.showToast(t('Supplier saved.','تم حفظ المورد.'),'success');};
  private deleteSupplier=async(supplier:Supplier)=>{const vault=this.requireVault();await this.persist({...vault,suppliers:vault.suppliers.filter(item=>item.id!==supplier.id)});this.showToast(t('Supplier deleted. Historical purchase snapshots were preserved.','تم حذف المورد مع الاحتفاظ بنسخ بياناته داخل المشتريات التاريخية.'),'success');};
  private savePurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);if(existing&&existing.status!=='draft')throw new Error(t('Posted or reversed purchases are read-only.','المشتريات المرحلة أو المعكوسة للقراءة فقط.'));const errors=validatePurchase(purchase,vault.savedItems);if(errors.length)throw new Error(errors[0]);if(vault.purchases.some(item=>item.id!==purchase.id&&item.number.trim().toLowerCase()===purchase.number.trim().toLowerCase()))throw new Error(t('Purchase number already exists.','رقم الشراء مستخدم بالفعل.'));const purchases=[...vault.purchases];const index=purchases.findIndex(item=>item.id===purchase.id);const next={...purchase,status:'draft' as const,currency:purchase.currency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)purchases[index]=next;else purchases.push(next);await this.persist({...vault,purchases});this.showToast(t('Purchase draft saved.','تم حفظ مسودة الشراء.'),'success');};
  private deletePurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current||current.status!=='draft')throw new Error(t('Only draft purchases can be deleted.','يمكن حذف مسودات الشراء فقط.'));if(vault.inventoryMovements.some(movement=>movement.sourceId===purchase.id))throw new Error(t('This purchase already has inventory history and cannot be deleted.','لهذا الشراء سجل مخزون ولا يمكن حذفه.'));await this.persist({...vault,purchases:vault.purchases.filter(item=>item.id!==purchase.id)});this.showToast(t('Purchase draft deleted.','تم حذف مسودة الشراء.'),'success');};
  private postPurchaseRecord=async(purchase:PurchaseRecord)=>{const vault=this.requireVault();const existing=vault.purchases.find(item=>item.id===purchase.id);if(existing&&existing.status!=='draft')throw new Error(t('Purchase is already posted or reversed.','الشراء مرحل أو معكوس بالفعل.'));if(vault.purchases.some(item=>item.id!==purchase.id&&item.number.trim().toLowerCase()===purchase.number.trim().toLowerCase()))throw new Error(t('Purchase number already exists.','رقم الشراء مستخدم بالفعل.'));const result=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);const purchases=[...vault.purchases];const index=purchases.findIndex(item=>item.id===purchase.id);if(index>=0)purchases[index]=result.purchase;else purchases.push(result.purchase);await this.persist({...vault,purchases,inventoryMovements:[...vault.inventoryMovements,...result.movements],savedItems:result.savedItems});this.showToast(t('Purchase posted and inventory received.','تم ترحيل الشراء واستلام المخزون.'),'success');};
  private reversePurchaseRecord=async(purchase:PurchaseRecord,reason:string)=>{const vault=this.requireVault();const current=vault.purchases.find(item=>item.id===purchase.id);if(!current)throw new Error(t('Purchase not found.','عملية الشراء غير موجودة.'));const result=reversePurchase(current,reason,vault.inventoryMovements,vault.savedItems);const purchases=vault.purchases.map(item=>item.id===current.id?result.purchase:item);await this.persist({...vault,purchases,inventoryMovements:[...vault.inventoryMovements,...result.movements],savedItems:result.savedItems});this.showToast(t('Purchase reversed with an audit-preserving stock reversal.','تم عكس الشراء مع الحفاظ على سجل تدقيق وحركة مخزون عكسية.'),'success');};
  private saveExpenseRecord=async(expense:ExpenseRecord)=>{const errors=validateExpense(expense);if(errors.length)throw new Error(errors[0]);const vault=this.requireVault();const expenses=[...vault.expenses];const index=expenses.findIndex(item=>item.id===expense.id);const next={...expense,currency:expense.currency.trim().toUpperCase(),updatedAt:new Date().toISOString()};if(index>=0)expenses[index]=next;else expenses.push(next);await this.persist({...vault,expenses});this.showToast(t('Expense saved.','تم حفظ المصروف.'),'success');};
  private deleteExpenseRecord=async(expense:ExpenseRecord)=>{const vault=this.requireVault();await this.persist({...vault,expenses:vault.expenses.filter(item=>item.id!==expense.id)});this.showToast(t('Expense deleted.','تم حذف المصروف.'),'success');};
  private saveInventoryMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement))throw new Error(t('Only manual inventory movements can be added here.','يمكن إضافة حركات المخزون اليدوية فقط من هنا.'));const vault=this.requireVault();if(vault.inventoryMovements.some(item=>item.id===movement.id))throw new Error(t('Inventory movement already exists.','حركة المخزون موجودة بالفعل.'));if(!vault.savedItems.some(item=>item.id===movement.itemId))throw new Error(t('Saved item not found.','الصنف المحفوظ غير موجود.'));await this.persist({...vault,inventoryMovements:[...vault.inventoryMovements,movement]});this.showToast(t('Inventory movement recorded.','تم تسجيل حركة المخزون.'),'success');};
  private deleteInventoryMovement=async(movement:InventoryMovementRecord)=>{if(!inventoryMovementIsManual(movement))throw new Error(t('Purchase inventory history must be reversed through the purchase.','يجب عكس سجل مخزون الشراء من عملية الشراء نفسها.'));const vault=this.requireVault();await this.persist({...vault,inventoryMovements:vault.inventoryMovements.filter(item=>item.id!==movement.id)});this.showToast(t('Manual inventory movement deleted.','تم حذف حركة المخزون اليدوية.'),'success');};
`],
  [`<button className={this.state.screen==='items'?'active':''} aria-current={this.state.screen==='items'?'page':undefined} onClick={()=>this.setState({screen:'items',editorDoc:null})}><Icon name="items"/>{t('Items','الأصناف')}</button></nav>`, `<button className={this.state.screen==='items'?'active':''} aria-current={this.state.screen==='items'?'page':undefined} onClick={()=>this.setState({screen:'items',editorDoc:null})}><Icon name="items"/>{t('Items','الأصناف')}</button><button className={this.state.screen==='operations'?'active':''} aria-current={this.state.screen==='operations'?'page':undefined} onClick={()=>this.setState({screen:'operations',editorDoc:null})}><Icon name="invoice"/>{t('Operations','العمليات')}</button></nav>`],
  [`{this.state.screen==='items'?<SavedItemsPage items={vault.savedItems} currency={vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD'} onSave={this.saveSavedItem} onSaveMany={this.saveSavedItemsBatch} onDelete={this.deleteSavedItem}/>:null}{this.state.screen==='editor'`, `{this.state.screen==='items'?<SavedItemsPage items={vault.savedItems} currency={vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD'} onSave={this.saveSavedItem} onSaveMany={this.saveSavedItemsBatch} onDelete={this.deleteSavedItem}/>:null}{this.state.screen==='operations'?<OperationsPage suppliers={vault.suppliers} purchases={vault.purchases} expenses={vault.expenses} inventoryMovements={vault.inventoryMovements} items={vault.savedItems} defaultCurrency={vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD'} onSaveSupplier={this.saveSupplier} onDeleteSupplier={this.deleteSupplier} onSavePurchase={this.savePurchaseRecord} onDeletePurchase={this.deletePurchaseRecord} onPostPurchase={this.postPurchaseRecord} onReversePurchase={this.reversePurchaseRecord} onSaveExpense={this.saveExpenseRecord} onDeleteExpense={this.deleteExpenseRecord} onSaveInventoryMovement={this.saveInventoryMovement} onDeleteInventoryMovement={this.deleteInventoryMovement}/>:null}{this.state.screen==='editor'`]
]);

await patch('index.html',[
  [`  <link rel="stylesheet" href="./styles/commercial-controls-v136.css" />\n  <link rel="stylesheet" href="./styles/performance-polish-v100.css" />`, `  <link rel="stylesheet" href="./styles/commercial-controls-v136.css" />
  <link rel="stylesheet" href="./styles/operations-v137.css" />
  <link rel="stylesheet" href="./styles/performance-polish-v100.css" />`]
]);

await patch('public/sw.js',[
  [`// v136 — commercial controls for pricing, tax, banks, payment terms and customer credit; retains v135 reporting.`, `// v137 — suppliers, purchases, expenses, landed cost and auditable inventory ledger; retains v136 commercial controls.`],
  [`// Legacy regression markers only; active runtime cache is v136: const CACHE = 'lourex-invoice-v101'; const CACHE = 'lourex-invoice-v120'; const CACHE = 'lourex-invoice-v131'; const CACHE = 'lourex-invoice-v132'; const CACHE = 'lourex-invoice-v133'; const CACHE = 'lourex-invoice-v134'; const CACHE = 'lourex-invoice-v135';\n// Runtime compatibility markers`, `// Legacy regression markers only; active runtime cache is v137: const CACHE = 'lourex-invoice-v101'; const CACHE = 'lourex-invoice-v120'; const CACHE = 'lourex-invoice-v131'; const CACHE = 'lourex-invoice-v132'; const CACHE = 'lourex-invoice-v133'; const CACHE = 'lourex-invoice-v134'; const CACHE = 'lourex-invoice-v135'; const CACHE = 'lourex-invoice-v136';
// Runtime compatibility markers`],
  [`const CACHE = 'lourex-invoice-v136';`, `const CACHE = 'lourex-invoice-v137';`],
  [`"./styles/commercial-controls-v136.css","./styles/performance-polish-v100.css"`, `"./styles/commercial-controls-v136.css","./styles/operations-v137.css","./styles/performance-polish-v100.css"`],
  [`"./src/components/ReportsPage.js","./src/components/CommercialControlsSettings.js"`, `"./src/components/ReportsPage.js","./src/components/OperationsPage.js","./src/components/CommercialControlsSettings.js"`],
  [`"./src/lib/reports.js","./src/lib/commercial-controls.js"`, `"./src/lib/reports.js","./src/lib/operations.js","./src/lib/commercial-controls.js"`]
]);

await patch('tests/operations-v137.test.mjs',[
  [`  const reversed=reversePurchase(posted.purchase,'Supplier invoice cancelled',posted.movements);`, `  const reversed=reversePurchase(posted.purchase,'Supplier invoice cancelled',posted.movements,posted.savedItems);`]
]);

console.log('Batch 8 operations integration applied.');
