import type {PurchaseRecord,SupplierPaymentRecord} from '../types.js';
import {purchaseTotals} from '../lib/operations.js';
import {purchasePayableSummary} from '../lib/payables.js';
import {formatMoney} from '../lib/money.js';
import {displayDate} from '../lib/id.js';
import {getUiLanguage,isArabic,t} from '../lib/i18n.js';
import {Button,Modal} from './UI.js';

interface Props {purchase:PurchaseRecord|null;supplierPayments:SupplierPaymentRecord[];onClose:()=>void;}
/** A read-only record of an already posted purchase, never a second supplier invoice or stock posting. */
export class PostedPurchaseDocumentModal extends React.Component<Props>{
  componentDidMount(){window.addEventListener('afterprint',this.afterPrint);}
  componentWillUnmount(){window.removeEventListener('afterprint',this.afterPrint);document.body.classList.remove('printing-posted-purchase');}
  private afterPrint=()=>document.body.classList.remove('printing-posted-purchase');
  private print=()=>{if(this.props.purchase?.status!=='posted')return;document.body.classList.add('printing-posted-purchase');window.setTimeout(()=>{if(this.props.purchase?.status==='posted')window.print();else this.afterPrint();},40);}
  render():any{
    const p=this.props.purchase;if(!p||p.status!=='posted')return null;
    const arabic=isArabic(),s=p.supplierSnapshot,totals=purchaseTotals(p),payable=purchasePayableSummary(p,this.props.supplierPayments);
    const supplier=(arabic?s?.nameAr||s?.nameEn:s?.nameEn||s?.nameAr)||t('Supplier not specified','المورد غير محدد');
    const format=(value:string)=>formatMoney(value,p.currency);
    const summary=(label:string,value:string)=><div className="lx-posted-purchase-total"><span>{label}</span><strong><bdi>{format(value)}</bdi></strong></div>;
    return <Modal open title={t('Posted Purchase Record','سجل شراء مُرحّل')} size="xl" onClose={this.props.onClose} footer={<div className="ta-modal-actions"><Button onClick={this.props.onClose}>{t('Close','إغلاق')}</Button><Button icon="printer" variant="primary" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>}>
      <article className="lx-posted-purchase" data-posted-purchase dir={arabic?'rtl':'ltr'}>
        <header className="lx-posted-purchase-header"><div><small>LOUREX INVOICE</small><h2>{t('Posted Purchase','شراء مُرحّل')}</h2><strong data-purchase-number><bdi>{p.number}</bdi></strong></div><div className="lx-posted-purchase-status"><strong>{t('Posted','مُرحّل')}</strong><span>{t('Posting date','تاريخ الترحيل')} <bdi>{displayDate(p.postedAt.slice(0,10)||p.date,getUiLanguage())}</bdi></span></div></header>
        <section className="lx-posted-purchase-context">
          <div><small>{t('Supplier','المورد')}</small><strong>{supplier}</strong><small><bdi>{s?.sourceSupplierId||'—'}</bdi></small></div>
          <div><small>{t('Purchase date','تاريخ الشراء')}</small><strong><bdi>{displayDate(p.date,getUiLanguage())}</bdi></strong></div>
          <div><small>{t('Due date','الاستحقاق')}</small><strong><bdi>{displayDate(p.dueDate,getUiLanguage())}</bdi></strong></div>
          <div><small>{t('Currency','العملة')}</small><strong><bdi>{p.currency}</bdi></strong></div>
        </section>
        <div className="lx-posted-purchase-table-wrap"><table className="lx-posted-purchase-table"><thead><tr><th>{t('Item','الصنف')}</th><th>{t('SKU','رمز الصنف')}</th><th>{t('Quantity','الكمية')}</th><th>{t('Unit','الوحدة')}</th><th>{t('Unit cost','تكلفة الوحدة')}</th><th>{t('Landed unit cost','تكلفة الوحدة بعد الوصول')}</th></tr></thead><tbody>{p.items.map(item=><tr key={item.id}><td><strong>{(arabic?item.descriptionAr||item.descriptionEn:item.descriptionEn||item.descriptionAr)||'—'}</strong></td><td><bdi>{item.sku||'—'}</bdi></td><td><bdi>{item.quantity}</bdi></td><td><bdi>{item.unit}</bdi></td><td><bdi>{format(item.unitCost)}</bdi></td><td><bdi>{format(item.landedUnitCost||item.unitCost)}</bdi></td></tr>)}</tbody></table></div>
        <section className="lx-posted-purchase-totals">
          {summary(t('Items subtotal','إجمالي الأصناف'),totals.subtotal)}
          {summary(t('Freight','الشحن'),totals.freight)}
          {summary(t('Customs / Duty','الجمارك'),totals.duty)}
          {summary(t('Other landed costs','تكاليف وصول أخرى'),totals.other)}
          {summary(t('Posted purchase total','إجمالي الشراء المرحّل'),totals.landedTotal)}
          {summary(t('Paid to supplier','المدفوع للمورد'),payable.paid)}
          {summary(t('Remaining payable','المستحق المتبقي'),payable.remaining)}
        </section>
        {p.notes?<section className="lx-posted-purchase-notes"><strong>{t('Notes','ملاحظات')}</strong><p>{p.notes}</p></section>:null}
        <footer className="lx-posted-purchase-footer">{t('Internal record generated from a posted purchase; not a supplier-issued tax invoice. This copy does not post stock, create a payable, or record a payment.','سجل داخلي مستخرج من شراء مُرحّل، وليس فاتورة ضريبية صادرة من المورد. هذه النسخة لا ترحّل المخزون أو تنشئ مستحقًا أو تسجّل دفعة.')}</footer>
      </article>
    </Modal>;
  }
}
