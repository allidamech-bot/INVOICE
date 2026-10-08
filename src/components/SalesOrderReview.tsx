import type { DocumentEventRecord, LourexDocument, PaymentRecord } from '../types.js';
import { acceptedSalesOrders, type AcceptSalesOrderInput } from '../lib/sales-order-flow.js';
import { commercialTrackingFromEvents } from '../lib/commercial-flow.js';
import { salesOrderInvoiceProgress } from '../lib/sales-order-progress.js';
import { todayIso } from '../lib/id.js';
import { formatMoney } from '../lib/money.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  quotation:LourexDocument;
  events:DocumentEventRecord[];
  documents:LourexDocument[];
  payments:PaymentRecord[];
  onAccept:(input:AcceptSalesOrderInput)=>Promise<void>;
}
interface State{
  customerReference:string;
  orderDate:string;
  requestedDeliveryDate:string;
  notes:string;
  confirmed:boolean;
  busy:boolean;
  error:string;
}
export class SalesOrderReview extends React.Component<Props,State>{
  state:State={customerReference:'',orderDate:todayIso(),requestedDeliveryDate:todayIso(),
    notes:'',confirmed:false,busy:false,error:''};
  private inFlight=false;
  componentDidUpdate(prev:Props):void{
    if(prev.quotation.id!==this.props.quotation.id||prev.quotation.updatedAt!==this.props.quotation.updatedAt)
      this.setState({customerReference:'',orderDate:todayIso(),requestedDeliveryDate:todayIso(),notes:'',confirmed:false,busy:false,error:''});
  }
  private submit=async()=>{
    if(this.inFlight||!this.state.confirmed)return;
    this.inFlight=true;this.setState({busy:true,error:''});
    try{
      await this.props.onAccept({quotationId:this.props.quotation.id,
        expectedQuotationUpdatedAt:this.props.quotation.updatedAt,
        customerReference:this.state.customerReference,orderDate:this.state.orderDate,
        requestedDeliveryDate:this.state.requestedDeliveryDate,notes:this.state.notes});
      this.setState({customerReference:'',orderDate:todayIso(),requestedDeliveryDate:todayIso(),notes:'',confirmed:false,busy:false,error:''});
    }catch(error){this.setState({busy:false,error:error instanceof Error?error.message:t('Sales Order could not be accepted.','تعذّر اعتماد أمر البيع.')});}
    finally{this.inFlight=false;}
  };
  render():any{
    const {quotation,events}=this.props;
    if(quotation.role!=='standard'||(quotation.kind!=='proforma'&&quotation.kind!=='proforma-invoice'))return null;
    const orders=acceptedSalesOrders(quotation.id,events),tracking=commercialTrackingFromEvents(quotation.id,events);
    const eligible=quotation.status==='final'&&quotation.lifecycleStatus!=='voided'&&tracking.status==='accepted';
    return <section className="ta-doc-panel" aria-label={t('Sales Order acceptance','اعتماد أمر البيع')}>
      <header><div><small>{t('Sales • Batch 7','المبيعات • الدفعة السابعة')}</small><h2>{t('Sales Order','أمر البيع')}</h2></div><span className="ta-doc-count-badge">{orders.length}</span></header>
      <p>{t('Convert a customer-accepted quotation into a traceable Sales Order commitment without changing the existing invoice or financial ledger.','حوّل عرض السعر الذي قبله العميل إلى أمر بيع موثق دون تغيير الفواتير أو الحسابات الموجودة.')}</p>
      {orders.map(order=>{
        const progress=salesOrderInvoiceProgress(order,this.props.documents,events,this.props.payments);
        return <div key={order.salesOrderNumber} className="ta-doc-facts" style={{display:'grid',gap:8,marginBlock:12}}>
          <strong><bdi>{order.salesOrderNumber}</bdi></strong>
          <span>{t('Customer reference','مرجع العميل')}: <bdi>{order.customerReference||'—'}</bdi></span>
          <span>{t('Ordered','تاريخ الطلب')}: <bdi>{order.orderDate}</bdi> · {t('Requested delivery','التسليم المطلوب')}: <bdi>{order.requestedDeliveryDate}</bdi></span>
          <span>{t('Accepted quote','العرض المقبول')}: <bdi>{formatMoney(order.grandTotal,order.currency)}</bdi></span>
          {progress.lines.map((line,i)=><span key={line.salesOrderLineId}>
            {i+1}. {isArabic()?(order.lines[i]?.descriptionAr||order.lines[i]?.descriptionEn):(order.lines[i]?.descriptionEn||order.lines[i]?.descriptionAr)}
            {' · '}{t('Ordered','المطلوب')} <bdi>{line.ordered}</bdi>
            {' · '}{t('Delivered','المسلّم')} <bdi>{line.delivered}</bdi>
            {' · '}{t('Remaining','المتبقي')} <bdi>{line.remaining}</bdi> {order.lines[i]?.unit}
          </span>)}
          <span>{t('Confirmed delivery notes','سندات التسليم المؤكدة')}: <bdi>{progress.confirmedDeliveries}</bdi>
            {' · '}{t('No invoice draft','دون مسودة فاتورة')}: <bdi>{progress.unbilledDeliveries}</bdi>
          </span>
          <span>{t('Invoice drafts (not receivables)','مسودات الفواتير (ليست مستحقات)')}: <bdi>{progress.invoiceDrafts}</bdi>
            {' · '}{t('Issued invoices','فواتير صادرة')}: <bdi>{progress.invoicesIssued}</bdi>
          </span>
          <span>{t('Issued net of credits','صافي الفواتير بعد الإشعارات الدائنة')}: <bdi>{formatMoney(progress.netIssued,progress.currency)}</bdi>
            {' · '}{t('Credits','الإشعارات الدائنة')}: <bdi>{formatMoney(progress.credits,progress.currency)}</bdi>
            {' · '}{t('Collected','المحصّل')}: <bdi>{formatMoney(progress.collected,progress.currency)}</bdi>
            {' · '}{t('Outstanding','المتبقي للتحصيل')}: <bdi>{formatMoney(progress.outstanding,progress.currency)}</bdi>
          </span>
          <small>{t('Confirmed deliveries and invoicing are tracked separately from collections. Amounts are per issued invoice, not a second ledger or a direct comparison to the quote total.','التسليمات والفواتير والتحصيلات مراحل منفصلة. المبالغ محسوبة من الفواتير الصادرة فقط، وليست دفترًا ماليًا ثانيًا أو مقارنة مباشرة بإجمالي العرض.')}</small>
        </div>;
      })}
      {!orders.length&&!eligible?<p>{t('Mark the issued quotation as Accepted in Commercial Flow before recording its Sales Order.','سجّل قبول عرض السعر الصادر في المسار التجاري قبل اعتماد أمر البيع.')}</p>:null}
      {eligible&&!orders.length?<div style={{display:'grid',gap:12,marginBlock:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:10}}>
          <Field label={t('Customer PO reference (optional)','مرجع طلب العميل (اختياري)')}>
            <Input maxLength={100} value={this.state.customerReference}
              onChange={(e:any)=>this.setState({customerReference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Sales Order date','تاريخ أمر البيع')}>
            <Input type="date" min={quotation.issueDate} max={todayIso()} value={this.state.orderDate}
              onChange={(e:any)=>this.setState({orderDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Requested delivery date','تاريخ التسليم المطلوب')}>
            <Input type="date" min={this.state.orderDate} value={this.state.requestedDeliveryDate}
              onChange={(e:any)=>this.setState({requestedDeliveryDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        <strong>{t('Committed quotation items','بنود عرض السعر المعتمدة')}</strong>
        {quotation.items.map((line,i)=><div key={line.id} style={{display:'flex',gap:8,justifyContent:'space-between',flexWrap:'wrap'}}>
          <span>{i+1}. {isArabic()?(line.descriptionAr||line.descriptionEn):(line.descriptionEn||line.descriptionAr)}</span>
          <bdi>{line.quantity} {line.unit} × {line.unitPrice} {quotation.currency}</bdi>
        </div>)}
        <Field label={t('Order notes (optional)','ملاحظات الأمر (اختياري)')}>
          <Textarea value={this.state.notes} rows={2} maxLength={500} onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',alignItems:'flex-start',gap:10}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm accepted customer Sales Order','أؤكد قبول العميل لأمر البيع')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I verified the customer accepted this quotation, its prices, currency, quantities and delivery date. This action records the order only, without posting inventory, invoices or payments.','تحققت من قبول العميل لعرض السعر وأسعاره وعملته وكمياته وموعد تسليمه. يسجل هذا الإجراء أمر البيع فقط دون ترحيل مخزون أو فواتير أو مدفوعات.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button icon="check" variant="primary" disabled={!this.state.confirmed||this.state.busy} onClick={()=>void this.submit()}>
          {this.state.busy?t('Recording Sales Order…','جارٍ تسجيل أمر البيع…'):t('Accept Sales Order','اعتماد أمر البيع')}
        </Button>
      </div>:null}
    </section>;
  }
}
