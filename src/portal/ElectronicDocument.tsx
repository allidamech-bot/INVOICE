import type { LourexDocument } from '../types.js';
import { calculateTotals, formatMoney, lineTotal } from '../lib/money.js';
import { documentKindTitle, documentPriceOptional } from '../lib/document-kinds.js';
import { t } from '../lib/i18n.js';

/** Responsive view of the exact shared snapshot, using the accounting calculator. */
export function ElectronicDocument({document:doc}:{document:LourexDocument}):any{
  const ar=doc.language==='ar',totals=calculateTotals(doc.items,doc.adjustments),priced=!documentPriceOptional(doc.kind);
  const titles=documentKindTitle(doc.kind,doc.role),title=ar?titles.ar:titles.en;
  const rows=[
    [t('Subtotal','المجموع الفرعي'),totals.subtotal],
    ...(totals.discount!=='0.00'?[[t('Discount','الخصم'),`-${totals.discount}`]]:[]),
    ...(totals.shipping!=='0.00'?[[t('Shipping','الشحن'),totals.shipping]]:[]),
    ...(totals.otherCharges!=='0.00'?[[t('Other charges','رسوم أخرى'),totals.otherCharges]]:[]),
    ...(totals.tax!=='0.00'?[[t('Tax','الضريبة'),totals.tax]]:[])
  ];
  const terms=[
    [t('Validity','صلاحية العرض'),doc.terms.validity],
    [t('Payment terms','شروط الدفع'),doc.terms.paymentTerms],
    [t('Delivery','التسليم'),doc.terms.deliveryTime],
    [t('Incoterm','شروط التجارة'),doc.terms.incoterm],
    [t('Packing','التعبئة'),doc.terms.packing],
    [t('Port of loading','ميناء التحميل'),doc.terms.portOfLoading],
    [t('Destination','الوجهة'),doc.terms.finalDestination],
    [t('Country of origin','بلد المنشأ'),doc.terms.countryOfOrigin],
    [t('Remarks','ملاحظات'),doc.terms.remarks],
    [t('Notes','ملاحظات المستند'),doc.notes]
  ].filter(([,value])=>Boolean(value?.trim()));
  return <article className="lx-public-mobile-document" dir={ar?'rtl':'ltr'}>
    <div><p className="lx-electronic-caption">{t('Electronic document · Shared version','النسخة الإلكترونية · الإصدار المشارك')} {doc.revision||1}</p><h1>{title} <bdi>{doc.number}</bdi></h1></div>
    <h2>{t('Items','الأصناف')} <span>({doc.items.length})</span></h2>
    <ol className="lx-electronic-products">{doc.items.map((item,index)=><li key={item.id||index}>
      <strong><bdi>{ar?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)}</bdi></strong>
      {doc.language==='bilingual'&&item.descriptionAr?<small dir="rtl">{item.descriptionAr}</small>:null}
      <div className="lx-electronic-item-values"><span>{t('Quantity','الكمية')}: <bdi>{item.quantity} {item.unit}</bdi></span>{priced?<span>{t('Unit price','سعر الوحدة')}: <bdi>{formatMoney(item.unitPrice,doc.currency)}</bdi></span>:null}</div>
      {priced?<div className="lx-electronic-item-values"><span>{t('Line total','إجمالي الصنف')}</span><bdi><b>{formatMoney(lineTotal(item.quantity,item.unitPrice),doc.currency)}</b></bdi></div>:null}
      {doc.appearance.showPacking&&item.packing?<small>{t('Packing','التعبئة')}: <bdi>{item.packing}</bdi></small>:null}
      {doc.appearance.showHsCode&&item.hsCode?<small>HS: <bdi>{item.hsCode}</bdi></small>:null}
      {doc.appearance.showOrigin&&item.origin?<small>{t('Origin','المنشأ')}: <bdi>{item.origin}</bdi></small>:null}
    </li>)}</ol>
    {priced?<dl className="lx-electronic-totals">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{formatMoney(value||'0',doc.currency)}</bdi></dd></div>)}<div className="is-total"><dt>{t('Total','الإجمالي')}</dt><dd><bdi>{formatMoney(totals.grandTotal,doc.currency)}</bdi></dd></div></dl>:null}
    {terms.length?<section className="lx-electronic-terms"><h2>{t('Terms & details','الشروط والتفاصيل')}</h2>{terms.map(([label,value])=><div key={label}><strong>{label}</strong><p dir="auto">{value}</p></div>)}</section>:null}
    <p className="lx-electronic-caption">{t('This is the version shared with you. A later revision is issued as a new electronic copy.','هذا هو الإصدار الذي تمت مشاركته معك. يصدر أي تعديل لاحق كنسخة إلكترونية جديدة.')}</p>
  </article>;
}
