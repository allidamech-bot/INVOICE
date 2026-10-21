import type {PaymentVoucher} from '../lib/payment-voucher.js';
import {formatMoney} from '../lib/money.js';
import {displayDate} from '../lib/id.js';
import {getUiLanguage,isArabic,t} from '../lib/i18n.js';
import {Button,Modal} from './UI.js';

interface Props {voucher:PaymentVoucher|null;onClose:()=>void;}
function methodLabel(method:PaymentVoucher['method']){
  return method==='cash'?t('Cash','نقدًا')
    :method==='bank-transfer'?t('Bank transfer','تحويل بنكي')
    :method==='card'?t('Card','بطاقة')
    :method==='cheque'?t('Cheque','شيك')
    :t('Other','أخرى');
}
/** Evidence view: reads saved transactions; never creates a second receipt or ledger entry. */
export class PaymentVoucherModal extends React.Component<Props>{
  componentDidMount(){window.addEventListener('afterprint',this.afterPrint);}
  componentWillUnmount(){window.removeEventListener('afterprint',this.afterPrint);document.body.classList.remove('printing-payment-voucher');}
  private afterPrint=()=>document.body.classList.remove('printing-payment-voucher');
  private print=()=>{if(!this.props.voucher)return;document.body.classList.add('printing-payment-voucher');window.setTimeout(()=>{if(this.props.voucher)window.print();else this.afterPrint();},40);};
  render():any{
    const v=this.props.voucher;if(!v)return null;
    const receipt=v.kind==='customer-receipt',arabic=isArabic();
    const name=(arabic?v.partyNameAr||v.partyNameEn:v.partyNameEn||v.partyNameAr)||t('Not specified','غير محدد');
    const company=(arabic?v.companyNameAr||v.companyNameEn:v.companyNameEn||v.companyNameAr)||'LOUREX';
    const row=(title:string,value:string)=><div className="lx-payment-voucher-field"><span>{title}</span><strong><bdi>{value||'—'}</bdi></strong></div>;
    return <Modal open title={receipt?t('Customer Receipt Voucher','سند قبض عميل'):t('Supplier Payment Voucher','سند دفع مورد')} size="md" onClose={this.props.onClose}
      footer={<div className="ta-modal-actions"><Button onClick={this.props.onClose}>{t('Close','إغلاق')}</Button><Button variant="primary" icon="printer" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>}>
      <article className="lx-payment-voucher" data-payment-voucher data-voucher-kind={v.kind} dir={arabic?'rtl':'ltr'}>
        <header className="lx-payment-voucher-header">
          <div className="lx-payment-voucher-brand">{v.companyLogo?<img src={v.companyLogo} alt="" />:null}<div><strong>{company}</strong><small>{t('Recorded financial transaction','عملية مالية مسجلة')}</small></div></div>
          <div className="lx-payment-voucher-title"><h2>{receipt?t('Receipt Voucher','سند قبض'):t('Payment Voucher','سند دفع')}</h2><small>{t('Record ID','معرف السجل')}</small><bdi>{v.recordId}</bdi></div>
        </header>
        <div className="lx-payment-voucher-amount"><small>{receipt?t('Amount received','المبلغ المقبوض'):t('Amount paid','المبلغ المدفوع')}</small><strong data-voucher-amount><bdi>{formatMoney(v.amount,v.currency)}</bdi></strong></div>
        <section className="lx-payment-voucher-fields">
          {row(receipt?t('Received from','استلمنا من'):t('Paid to','دُفع إلى'),name)}
          {row(t('Payment date','تاريخ الدفعة'),displayDate(v.date,getUiLanguage()))}
          {row(receipt?t('Invoice number','رقم الفاتورة'):t('Posted purchase','عملية الشراء المرحلة'),v.sourceNumber)}
          {row(t('Method','طريقة الدفع'),methodLabel(v.method))}
          {row(t('Payment reference','مرجع الدفعة'),v.paymentReference)}
          {row(t('Currency','العملة'),v.currency)}
        </section>
        {v.notes?<section className="lx-payment-voucher-notes"><small>{t('Notes','ملاحظات')}</small><p>{v.notes}</p></section>:null}
        <footer className="lx-payment-voucher-disclaimer">{t('Generated from one recorded payment. This copy does not post or repeat a financial transaction.','تم إنشاء هذا السند من دفعة مسجلة واحدة. هذه النسخة لا تنشئ أو تكرر أي حركة مالية.')}</footer>
      </article>
    </Modal>;
  }
}
