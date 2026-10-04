import type { ExpenseRecord, InventoryMovementRecord, PurchaseRecord, SavedItem, Supplier, WarehouseRecord } from '../types.js';
import { t } from '../lib/i18n.js';
import { confirmWorkspaceDeparture } from '../lib/workspace-dirty.js';
import { formatMoney } from '../lib/money.js';
import { inventoryBalances } from '../lib/operations.js';
import { ensurePricingStyles } from '../lib/pricing-style.js';
import { SavedItemsPage } from './SavedItemsPage.js';
import { ProductPriceLists } from './ProductPriceLists.js';
import { OperationsPage } from './OperationsPage.js';
import { DomainWorkspaceTabs } from './DomainWorkspaceTabs.js';
import { InventoryPlanningLive } from './InventoryPlanningLive.js';
import { WarehouseLocationsPage } from './WarehouseLocationsPage.js';
import { Button, Icon, Modal } from './UI.js';

interface Props{
  items:SavedItem[];currency:string;
  suppliers:Supplier[];purchases:PurchaseRecord[];expenses:ExpenseRecord[];inventoryMovements:InventoryMovementRecord[];warehouses:WarehouseRecord[];workspaceId:string;branchId:string;defaultCurrency:string;
  onSaveItem:(item:SavedItem)=>Promise<void>;onSaveItems:(items:SavedItem[])=>Promise<void>;onDeleteItem:(item:SavedItem)=>Promise<void>;
  onSaveSupplier:(supplier:Supplier)=>Promise<void>;onDeleteSupplier:(supplier:Supplier)=>Promise<void>;
  onSavePurchase:(purchase:PurchaseRecord)=>Promise<void>;onDeletePurchase:(purchase:PurchaseRecord)=>Promise<void>;onPostPurchase:(purchase:PurchaseRecord)=>Promise<void>;onReversePurchase:(purchase:PurchaseRecord,reason:string)=>Promise<void>;
  onSaveExpense:(expense:ExpenseRecord)=>Promise<void>;onDeleteExpense:(expense:ExpenseRecord)=>Promise<void>;
  onSaveInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;onDeleteInventoryMovement:(movement:InventoryMovementRecord)=>Promise<void>;
}
type Tab='products'|'prices'|'inventory'|'planning'|'locations'|'movements';
function itemName(item:SavedItem):string{return t(item.descriptionEn||item.descriptionAr||item.sku||'Product',item.descriptionAr||item.descriptionEn||item.sku||'منتج');}
function purchaseStatus(status:PurchaseRecord['status']):string{return status==='posted'?t('Posted','مرحل'):status==='reversed'?t('Reversed','معكوس'):t('Draft','مسودة');}
export function ProductsInventoryWorkspace(props:Props):any{
  const [tab,setTab]=React.useState<Tab>('products');const [focusItemId,setFocusItemId]=React.useState('');const [historyItem,setHistoryItem]=React.useState<SavedItem|null>(null);
  React.useEffect(()=>{ensurePricingStyles();},[]);
  const changeTab=(value:Tab)=>{if(value===tab)return;if(!confirmWorkspaceDeparture())return;setTab(value);if(value==='inventory')setFocusItemId('');};
  React.useEffect(()=>{const create=()=>{if(!confirmWorkspaceDeparture())return;setTab('products');window.setTimeout(()=>window.dispatchEvent(new Event('lourex-open-product-editor')),0);};window.addEventListener('lourex-create-product',create);return()=>window.removeEventListener('lourex-create-product',create);},[]);
  React.useEffect(()=>{
    const open=(event:Event)=>{const id=(event as CustomEvent<{id?:string}>).detail?.id;if(!props.items.some(row=>row.id===id)||!confirmWorkspaceDeparture())return;setTab('products');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-edit-product',{detail:{itemId:id}})),0);};
    window.addEventListener('lourex-open-product',open);return()=>window.removeEventListener('lourex-open-product',open);
  },[props.items]);
  const history=historyItem?props.purchases.filter(purchase=>purchase.items.some(line=>line.savedItemId===historyItem.id)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt)):[];
  const stockQuantities=React.useMemo(()=>new Map(inventoryBalances(props.items,props.inventoryMovements).map(row=>[row.item.id,row.quantity])),[props.items,props.inventoryMovements]);
  const operationsProps={suppliers:props.suppliers,purchases:props.purchases,expenses:props.expenses,inventoryMovements:props.inventoryMovements,items:props.items,defaultCurrency:props.defaultCurrency,onSaveSupplier:props.onSaveSupplier,onDeleteSupplier:props.onDeleteSupplier,onSavePurchase:props.onSavePurchase,onDeletePurchase:props.onDeletePurchase,onPostPurchase:props.onPostPurchase,onReversePurchase:props.onReversePurchase,onSaveExpense:props.onSaveExpense,onDeleteExpense:props.onDeleteExpense,onSaveInventoryMovement:props.onSaveInventoryMovement,onDeleteInventoryMovement:props.onDeleteInventoryMovement};
  const favorites=props.items.filter(item=>item.favorite).length,postedPurchases=props.purchases.filter(purchase=>purchase.status==='posted').length,movements=props.inventoryMovements.length;
  const openPricing=(item:SavedItem)=>{setTab('products');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-edit-product',{detail:{itemId:item.id,section:'pricing'}})),0);};
  return <section className="ta-products-workspace">
    <header className="ta-products-workspace-header"><div><span>{t('Products & inventory','المنتجات والمخزون')}</span><h1>{t('Products & Inventory','المنتجات والمخزون')}</h1><p>{t('Keep the reusable catalog, price lists, stock position, planning, locations and inventory movements in one operating workspace.','اجمع كتالوج الأصناف وقوائم الأسعار والرصيد والتخطيط ومواقع المخزون وحركات المخزون في مساحة تشغيل واحدة.')}</p></div>{tab!=='products'?<Button icon="plus" variant="primary" onClick={()=>window.dispatchEvent(new Event('lourex-create-product'))}>{t('New Product','صنف جديد')}</Button>:null}</header>
    <section className="ta-products-overview" aria-label={t('Products and inventory summary','ملخص المنتجات والمخزون')}><div><span className="ta-products-overview-icon"><Icon name="items"/></span><span><small>{t('Products','المنتجات')}</small><strong>{props.items.length}</strong><em>{t('Reusable catalog','الكتالوج القابل لإعادة الاستخدام')}</em></span></div><div><span className="ta-products-overview-icon"><Icon name="star"/></span><span><small>{t('Favorites','المفضلة')}</small><strong>{favorites}</strong><em>{t('Frequently used products','الأصناف المتكررة')}</em></span></div><div><span className="ta-products-overview-icon"><Icon name="backup"/></span><span><small>{t('Posted purchases','مشتريات مرحلة')}</small><strong>{postedPurchases}</strong><em>{t('Posted purchase records','سجلات شراء مرحلة')}</em></span></div><div><span className="ta-products-overview-icon"><Icon name="chart"/></span><span><small>{t('Movements','الحركات')}</small><strong>{movements}</strong><em>{t('Inventory movement records','سجلات حركة المخزون')}</em></span></div></section>
    <DomainWorkspaceTabs value={tab} onChange={changeTab} ariaLabel={t('Products and inventory sections','أقسام المنتجات والمخزون')} options={[{id:'products',label:t('Products','المنتجات'),description:t('Catalog, pricing & import','الكتالوج والتسعير والاستيراد')},{id:'prices',label:t('Price Lists','قوائم الأسعار'),description:t('Retail, wholesale & distributor','التجزئة والجملة والموزع')},{id:'inventory',label:t('Inventory','المخزون'),description:t('On-hand quantity & cost','الكمية المتوفرة والتكلفة')},{id:'planning',label:t('Planning','التخطيط'),description:t('Reorder signals & stock targets','إشارات إعادة الطلب ومستهدفات المخزون')},{id:'locations',label:t('Stock Locations','مواقع المخزون'),description:t('Warehouses, balances & transfers','المستودعات والأرصدة والتحويلات')},{id:'movements',label:t('Inventory Movements','حركات المخزون'),description:t('Receipts, issues & adjustments','الاستلام والإخراج والتسويات')}]}/>
    <div className="ta-products-workspace-body">
      {tab==='products'?<SavedItemsPage compactHeader items={props.items} stockQuantities={stockQuantities} currency={props.currency} onSave={props.onSaveItem} onSaveMany={props.onSaveItems} onDelete={props.onDeleteItem} onInspectInventory={(item)=>{if(!confirmWorkspaceDeparture())return;setFocusItemId(item.id);setTab('movements');}} onInspectPurchases={(item)=>setHistoryItem(item)}/>:null}
      {tab==='prices'?<ProductPriceLists items={props.items} currency={props.currency} onEdit={openPricing}/>:null}
      {tab==='inventory'?<OperationsPage mode="inventory" inventoryView="balances" focusItemId={focusItemId} {...operationsProps}/>:null}{tab==='planning'?<InventoryPlanningLive/>:null}{tab==='locations'?<WarehouseLocationsPage items={props.items} inventoryMovements={props.inventoryMovements} warehouses={props.warehouses} workspaceId={props.workspaceId} branchId={props.branchId}/>:null}{tab==='movements'?<OperationsPage mode="inventory" inventoryView="movements" focusItemId={focusItemId} {...operationsProps}/>:null}
    </div>
    <Modal open={Boolean(historyItem)} title={historyItem?t(`Purchase History — ${itemName(historyItem)}`,`سجل المشتريات — ${itemName(historyItem)}`):t('Purchase History','سجل المشتريات')} size="lg" onClose={()=>setHistoryItem(null)} footer={<div className="ta-product-history-footer"><Button onClick={()=>setHistoryItem(null)}>{t('Close','إغلاق')}</Button></div>}><div className="ta-product-purchase-history">{history.length?history.map(purchase=>{const lines=purchase.items.filter(line=>line.savedItemId===historyItem?.id);return <article key={purchase.id} className="ta-product-purchase-history-row"><div><strong>{purchase.number}</strong><span>{purchase.date} · {purchaseStatus(purchase.status)}</span></div><div>{lines.map(line=><span key={line.id}><b>{line.quantity} {line.unit}</b> · {line.unitCost?formatMoney(line.unitCost,purchase.currency):'—'}{line.landedUnitCost?` · ${t('Landed','وصول')} ${formatMoney(line.landedUnitCost,purchase.currency)}`:''}</span>)}</div></article>}):<div className="ta-product-history-empty"><span><Icon name="backup"/></span><h3>{t('No purchase history','لا يوجد سجل مشتريات')}</h3><p>{t('Purchases linked to this saved product will appear here.','ستظهر هنا المشتريات المرتبطة بهذا المنتج المحفوظ.')}</p></div>}</div></Modal>
  </section>;
}
