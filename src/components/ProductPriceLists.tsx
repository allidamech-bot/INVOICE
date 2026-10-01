import type { SavedItem } from '../types.js';
import { pricingPolicyFromItem } from '../lib/price-lists.js';
import { t } from '../lib/i18n.js';
import { Button, Icon, Input } from './UI.js';

interface Props{items:SavedItem[];currency:string;onEdit:(item:SavedItem)=>void;}
function name(item:SavedItem):string{return item.descriptionEn||item.descriptionAr||item.sku||t('Untitled product','صنف بلا اسم');}
function price(value:string,currency:string):string{return value?`${value} ${currency}`:'—';}
export function ProductPriceLists({items,currency,onEdit}:Props):any{
  const [query,setQuery]=React.useState('');
  const q=query.trim().toLowerCase();
  const rows=items.filter(item=>!item.archived).filter(item=>!q||[item.sku,item.descriptionEn,item.descriptionAr,item.category].some(value=>String(value??'').toLowerCase().includes(q)));
  return <section className="lx-price-lists">
    <header className="lx-price-lists-head"><div><span>{t('Commercial pricing','التسعير التجاري')}</span><h2>{t('Price Lists','قوائم الأسعار')}</h2><p>{t('Retail, wholesale and distributor prices stay attached to the product catalog. Existing issued documents are never rewritten.','تبقى أسعار التجزئة والجملة والموزع مرتبطة بكتالوج الأصناف، ولا يتم تعديل المستندات الصادرة سابقًا.')}</p></div><div className="lx-price-lists-stat"><small>{t('Products','الأصناف')}</small><strong>{rows.length}</strong></div></header>
    <label className="lx-price-lists-search"><Icon name="search"/><Input value={query} placeholder={t('Search products or SKU','ابحث عن صنف أو SKU')} onChange={(e:any)=>setQuery(e.target.value)}/></label>
    <div className="lx-price-lists-table" role="table">
      <div className="lx-price-lists-row is-head" role="row"><span>{t('Product','الصنف')}</span><span>{t('Retail','تجزئة')}</span><span>{t('Wholesale','جملة')}</span><span>{t('Distributor','موزع')}</span><span>{t('Margin floor','حد الهامش')}</span><span></span></div>
      {rows.map(item=>{const p=pricingPolicyFromItem(item),cur=item.lastCurrency||currency;return <div className="lx-price-lists-row" role="row" key={item.id}><span className="lx-price-product"><strong>{name(item)}</strong><small>{item.sku||t('No SKU','بدون SKU')}</small></span><span><bdi>{price(p.retail,cur)}</bdi></span><span><bdi>{price(p.wholesale,cur)}</bdi><small>{p.wholesaleMinQty?t(`MOQ ${p.wholesaleMinQty}`,`الحد ${p.wholesaleMinQty}`):''}</small></span><span><bdi>{price(p.distributor,cur)}</bdi><small>{p.distributorMinQty?t(`MOQ ${p.distributorMinQty}`,`الحد ${p.distributorMinQty}`):''}</small></span><span>{p.minimumMarginPercent?`${p.minimumMarginPercent}%`:'—'}</span><span><Button onClick={()=>onEdit(item)}>{t('Pricing Policy','سياسة التسعير')}</Button></span></div>;})}
      {!rows.length?<div className="lx-price-lists-empty"><Icon name="items"/><strong>{t('No products found','لم يتم العثور على أصناف')}</strong></div>:null}
    </div>
  </section>;
}
