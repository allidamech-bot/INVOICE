import type { InventoryMovementRecord, SavedItem } from '../types.js';
import { inventoryBalances } from '../lib/operations.js';
import { t } from '../lib/i18n.js';

interface Props{
  items:SavedItem[];
  inventoryMovements:InventoryMovementRecord[];
}

function itemLabel(item:SavedItem):string{
  return t(item.descriptionEn||item.descriptionAr||item.sku||'Product',item.descriptionAr||item.descriptionEn||item.sku||'منتج');
}

function movementLabel(type:InventoryMovementRecord['type']):string{
  if(type==='opening')return t('Opening stock','رصيد افتتاحي');
  if(type==='purchase')return t('Purchase receipt','استلام شراء');
  if(type==='purchase-reversal')return t('Purchase reversal','عكس شراء');
  if(type==='issue')return t('Stock issue','إخراج مخزون');
  return t('Adjustment','تسوية');
}

export function StockLocationsPage(props:Props):any{
  const balances=React.useMemo(()=>inventoryBalances(props.items,props.inventoryMovements),[props.items,props.inventoryMovements]);
  const stocked=balances.filter(row=>row.quantityScaled>0n);
  const zero=balances.filter(row=>row.quantityScaled===0n);
  const negative=balances.filter(row=>row.quantityScaled<0n);
  const recent=[...props.inventoryMovements].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,30);

  return <section className="ta-operations-page lx-stock-locations-page">
    <header className="ta-page-header">
      <div>
        <span className="ta-page-kicker">{t('Warehouses & Stock Locations','المستودعات ومواقع المخزون')}</span>
        <h2>{t('Active branch stock location','موقع مخزون الفرع النشط')}</h2>
        <p>{t('Inventory is already isolated by the active branch. This view treats the current branch as the canonical stock location and shows only its scoped movement ledger.','المخزون معزول أصلًا حسب الفرع النشط. يعامل هذا العرض الفرع الحالي كموقع المخزون الأساسي ويعرض فقط دفتر الحركات الخاص به.')}</p>
      </div>
      <div className="ta-page-actions"><span className="ta-period-chip">{t('Branch-scoped inventory','مخزون معزول حسب الفرع')}</span></div>
    </header>

    <section className="ta-products-overview" aria-label={t('Stock location summary','ملخص موقع المخزون')}>
      <div><span><small>{t('Catalog items','أصناف الكتالوج')}</small><strong>{props.items.length}</strong><em>{t('Visible in this company workspace','ظاهرة في مساحة الشركة الحالية')}</em></span></div>
      <div><span><small>{t('In stock','متوفر')}</small><strong>{stocked.length}</strong><em>{t('Positive on-hand quantity','كمية متوفرة موجبة')}</em></span></div>
      <div><span><small>{t('Zero stock','رصيد صفري')}</small><strong>{zero.length}</strong><em>{t('No current on-hand quantity','لا توجد كمية متوفرة حاليًا')}</em></span></div>
      <div><span><small>{t('Negative stock','رصيد سالب')}</small><strong>{negative.length}</strong><em>{t('Requires operational review','يحتاج مراجعة تشغيلية')}</em></span></div>
    </section>

    <article className="ta-ops-list-card lx-location-stock-card">
      <header className="ta-ops-card-head"><div><span className="ta-page-kicker">{t('Current location','الموقع الحالي')}</span><h3>{t('On-hand by product','المتوفر حسب الصنف')}</h3><p>{t('Quantities are calculated from the active branch movement ledger, not from another company or branch.','يتم حساب الكميات من دفتر حركات الفرع النشط فقط، وليس من شركة أو فرع آخر.')}</p></div></header>
      {balances.length?<div className="ta-ops-list">{balances.map(row=><div className="ta-ops-row" key={row.item.id}><div><strong>{itemLabel(row.item)}</strong><small>{row.item.sku||t('No SKU','بدون SKU')} · {row.item.unit||'PCS'}</small></div><div><strong>{row.quantity} {row.item.unit||'PCS'}</strong><small>{row.quantityScaled<0n?t('Negative stock','رصيد سالب'):row.quantityScaled===0n?t('Out of stock','غير متوفر'):t('Available','متوفر')}</small></div></div>)}</div>:<div className="ta-empty-state"><strong>{t('No stock records yet','لا توجد سجلات مخزون بعد')}</strong><p>{t('Opening stock, purchases, issues and adjustments will appear here.','سيظهر هنا الرصيد الافتتاحي والمشتريات والإخراج والتسويات.')}</p></div>}
    </article>

    <article className="ta-ops-list-card lx-location-movements-card">
      <header className="ta-ops-card-head"><div><span className="ta-page-kicker">{t('Location activity','نشاط الموقع')}</span><h3>{t('Recent stock movements','أحدث حركات المخزون')}</h3></div></header>
      {recent.length?<div className="ta-ops-list">{recent.map(movement=><div className="ta-ops-row" key={movement.id}><div><strong>{movement.itemNameEn||movement.itemNameAr||movement.sku||t('Product','منتج')}</strong><small>{movementLabel(movement.type)} · {movement.date||'—'}{movement.sourceNumber?` · ${movement.sourceNumber}`:''}</small></div><div><strong>{movement.quantity}</strong><small>{movement.note||movement.sku||'—'}</small></div></div>)}</div>:<div className="ta-empty-state"><strong>{t('No movement activity yet','لا توجد حركات بعد')}</strong><p>{t('Inventory activity for the active branch will appear here automatically.','سيظهر نشاط مخزون الفرع النشط هنا تلقائيًا.')}</p></div>}
    </article>
  </section>;
}
