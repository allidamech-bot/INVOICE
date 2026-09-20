import type { ExpenseRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier } from '../types.js';
import { t } from '../lib/i18n.js';
import { SavedItemsPage } from './SavedItemsPage.js';
import { OperationsPage } from './OperationsPage.js';
import { DomainWorkspaceTabs } from './DomainWorkspaceTabs.js';

interface Props{
  items:SavedItem[];currency:string;
  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];defaultCurrency:string;
  onSaveItem:(item:SavedItem)=>Promise<void>;onSaveItems:(items:SavedItem[])=>Promise<void>;onDeleteItem:(item:SavedItem)=>Promise<void>;
  onSaveSupplier:(supplier:Supplier)=>Promise<void>;onDeleteSupplier:(supplier:Supplier)=>Promise<void>;
  onSavePurchase:(purchase:PurchaseRecord)=>Promise<void>;onDeletePurchase:(purchase:PurchaseRecord)=>Promise<void>;onPostPurchase:(purchase:PurchaseRecord)=>Promise<void>;onReversePurchase:(purchase:PurchaseRecord,reason:string)=>Promise<void>;
  onSaveExpense:(expense:ExpenseRecord)=>Promise<void>;onDeleteExpense:(expense:ExpenseRecord)=>Promise<void>;
  onSaveInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;onDeleteInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;
}
type Tab='products'|'inventory';

export function ProductsInventoryWorkspace(props:Props):any{
  const [tab,setTab]=React.useState<Tab>('products');
  return <section className="domain-workspace products-inventory-workspace">
    <DomainWorkspaceTabs value={tab} onChange={setTab} ariaLabel={t('Products and inventory sections','أقسام المنتجات والمخزون')} options={[
      {id:'products',label:t('Products','المنتجات'),description:t('Catalog, pricing & import','الكتالوج والتسعير والاستيراد')},
      {id:'inventory',label:t('Inventory','المخزون'),description:t('Stock & movements','الأرصدة والحركات')}
    ]}/>
    {tab==='products'?<SavedItemsPage items={props.items} currency={props.currency} onSave={props.onSaveItem} onSaveMany={props.onSaveItems} onDelete={props.onDeleteItem}/>:<OperationsPage mode="inventory" suppliers={props.suppliers} purchases={props.purchases} expenses={props.expenses} inventoryMovements={props.inventoryMovements} items={props.items} defaultCurrency={props.defaultCurrency} onSaveSupplier={props.onSaveSupplier} onDeleteSupplier={props.onDeleteSupplier} onSavePurchase={props.onSavePurchase} onDeletePurchase={props.onDeletePurchase} onPostPurchase={props.onPostPurchase} onReversePurchase={props.onReversePurchase} onSaveExpense={props.onSaveExpense} onDeleteExpense={props.onDeleteExpense} onSaveInventoryMovement={props.onSaveInventoryMovement} onDeleteInventoryMovement={props.onDeleteInventoryMovement}/>} 
  </section>;
}
