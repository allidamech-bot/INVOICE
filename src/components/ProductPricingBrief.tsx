import { buildProductPricingContext, type ProductPricingInsight } from '../lib/product-pricing-intelligence.js';
import { todayIso } from '../lib/id.js';
import { t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';

export function ProductPricingBrief(props:{itemId:string;updatedAt:string}):any{
  const [row,setRow]=React.useState<ProductPricingInsight|null>(null);
  React.useEffect(()=>{let active=true;setRow(null);void resumeVaultSession().then(session=>{
    if(!active||!session)return;
    const result=buildProductPricingContext(session.vault,'',todayIso(),props.itemId).rows.find(item=>item.id===props.itemId);
    if(active)setRow(result??null);
  }).catch(()=>{if(active)setRow(null);});return()=>{active=false;};},[props.itemId,props.updatedAt]);
  if(!row)return null;
  return <div className="lx-product-pricing-brief"><strong>{t('Saved pricing signals','مؤشرات التسعير المحفوظ')}</strong><small>{t('Calculated by LOUREX; unsaved edits excluded.','يحسبها LOUREX؛ لا تشمل التعديلات غير المحفوظة.')}</small>
    <dl><div><dt>{t('Margin','الهامش')}</dt><dd><bdi>{row.currentMarginPercent?`${row.currentMarginPercent}%`:'—'}</bdi></dd></div><div><dt>{t('Cost change','تغير التكلفة')}</dt><dd><bdi>{row.costChangePercent?`${row.costChangePercent}%`:'—'}</bdi></dd></div><div><dt>{t('Missing fields','حقول ناقصة')}</dt><dd>{row.missing.length}</dd></div></dl>
    {row.pricingHealth==='currency-mismatch'?<p>{t('Cost and sale currencies differ; margin is unavailable.','تختلف عملتا التكلفة والبيع؛ الهامش غير متاح.')}</p>:row.pricingHealth==='below-cost'?<p>{t('Saved sale price is below cost.','سعر البيع المحفوظ أقل من التكلفة.')}</p>:null}
    {row.duplicateWith?<p>{t('Possible duplicate: review before changing this product.','تكرار محتمل: راجع قبل تعديل هذا الصنف.')}</p>:null}
  </div>;
}
