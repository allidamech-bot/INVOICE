import type { DocumentEventRecord, LourexDocument } from '../types.js';
import {
  confirmedSalesDeliveries, deliverySalesOrderContext, salesDeliveryBalances,
  type ConfirmSalesDeliveryInput
} from '../lib/sales-delivery-flow.js';
import { todayIso } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  deliveryNote:LourexDocument;
  documents:LourexDocument[];
  events:DocumentEventRecord[];
  onConfirm:(input:ConfirmSalesDeliveryInput)=>Promise<void>;
  onCreateInvoice?:()=>void;
}
interface State{
  reference:string;
  deliveredDate:string;
  notes:string;
  confirmed:boolean;
  busy:boolean;
  error:string;
}
export class SalesDeliveryReview extends React.Component<Props,State>{
  state:State={reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:''};
  private inFlight=false;
  componentDidUpdate(prev:Props):void{
    if(prev.deliveryNote.id!==this.props.deliveryNote.id||prev.deliveryNote.updatedAt!==this.props.deliveryNote.updatedAt){
      this.setState({reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:''});
    }
  }
  private submit=async()=>{
    if(!this.state.confirmed||this.inFlight)return;
    this.inFlight=true;this.setState({busy:true,error:''});
    try{
      await this.props.onConfirm({
        deliveryNoteId:this.props.deliveryNote.id,
        expectedDeliveryNoteUpdatedAt:this.props.deliveryNote.updatedAt,
        deliveredDate:this.state.deliveredDate,reference:this.state.reference,notes:this.state.notes,confirmed:true
      });
      this.setState({reference:'',deliveredDate:todayIso(),notes:'',confirmed:false,busy:false,error:''});
    }catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Delivery confirmation failed.','فشل تأكيد التسليم.')});}
    finally{this.inFlight=false;}
  };
  render():any{
    const {deliveryNote,documents,events}=this.props;
    if(deliveryNote.kind!=='delivery-note')return null;
    const context=deliverySalesOrderContext(deliveryNote,documents,events);
    if(!context)return null;
    const proofs=confirmedSalesDeliveries(deliveryNote.id,events);
    const {order}=context;
    const balances=salesDeliveryBalances(order,events);
    const open=deliveryNote.role==='standard'&&deliveryNote.status==='final'
      &&deliveryNote.lifecycleStatus!=='voided'&&!proofs.length;
    return <section className="ta-doc-panel" aria-label={t('Sales delivery confirmation','تأكيد تسليم أمر البيع')}>
      <header><div><small>{t('Sales fulfillment • Batch 7','تسليم المبيعات • الدفعة السابعة')}</small>
        <h2>{t('Confirm physical delivery','تأكيد التسليم الفعلي')}</h2></div>
        <span className="ta-doc-count-badge">{proofs.length}</span></header>
      <p>{t('Confirm the actual goods on an issued Delivery Note against the accepted Sales Order. Evidence is immutable; this does not yet post stock movements or issue an invoice.','أكد البضاعة المسلّمة بسند تسليم صادر مقابل أمر البيع المعتمد. إثبات التسليم ثابت، ولا يُرحّل المخزون أو يصدر فاتورة تلقائيًا.')}</p>
      <p><strong>{t('Sales Order','أمر البيع')}: <bdi>{order.salesOrderNumber}</bdi></strong></p>
      {proofs.map(proof=><div key={proof.reference} className="ta-doc-facts" style={{display:'grid',gap:6,marginBlock:12}}>
        <strong>{t('Confirmed','مؤكد')}: <bdi>{proof.reference}</bdi></strong>
        <span>{t('Delivered on','تاريخ التسليم')}: <bdi>{proof.deliveredDate}</bdi></span>
        <span>{proof.lines.map(line=>`${line.quantity} ${line.unit}`).join(' · ')}</span>
      </div>)}
      {proofs.length===1&&this.props.onCreateInvoice?<div style={{display:'grid',gap:8,marginBlock:12}}>
        <p>{t('Prepare an invoice draft for exactly these confirmed quantities. Review prices, VAT, discounts and shipping before issuance. Nothing is posted or collected automatically.','جهّز مسودة فاتورة للكميات المؤكدة فقط. راجع الأسعار والضريبة والخصومات والشحن قبل الإصدار. لا تُرحّل أي مبالغ أو تحصيلات تلقائيًا.')}</p>
        <Button icon="invoice" variant="primary" onClick={()=>this.props.onCreateInvoice?.()}>{t('Create / open invoice draft','إنشاء / فتح مسودة فاتورة')}</Button>
      </div>:null}
      <div style={{display:'grid',gap:8,marginBlock:12}}>
        {balances.map((balance,i)=>{
          const item=order.lines[i];
          return <div key={balance.salesOrderLineId} style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap'}}>
            <strong>{i+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)}</strong>
            <span>{t('Ordered','المطلوب')} <bdi>{balance.ordered}</bdi> · {t('Confirmed','المسلّم')} <bdi>{balance.delivered}</bdi> · {t('Remaining','المتبقي')} <bdi>{balance.remaining}</bdi> {item?.unit}</span>
          </div>;
        })}
      </div>
      {deliveryNote.status!=='final'&&deliveryNote.lifecycleStatus!=='voided'?
        <p>{t('Issue this Delivery Note before recording physical delivery.','أصدر سند التسليم أولًا قبل تسجيل التسليم الفعلي.')}</p>:null}
      {open?<div style={{display:'grid',gap:12}}>
        <strong>{t('Items on this Delivery Note','الأصناف المدرجة في سند التسليم')}</strong>
        {deliveryNote.items.map((item,i)=><div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <span>{i+1}. {isArabic()?(item.descriptionAr||item.descriptionEn):(item.descriptionEn||item.descriptionAr)}</span>
          <bdi>{item.quantity} {item.unit}</bdi>
        </div>)}
        <p>{t('To record a smaller shipment, revise quantities on the delivery draft before issuing it. A confirmed note cannot be changed.','لتسجيل شحنة أصغر، عدّل كمياتها في مسودة سند التسليم قبل إصدارها. لا يمكن تغيير السند بعد تأكيده.')}</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:10}}>
          <Field label={t('Physical delivery reference','مرجع التسليم الفعلي')}>
            <Input maxLength={100} value={this.state.reference} placeholder="POD-2026-001"
              aria-label={t('Physical delivery reference','مرجع التسليم الفعلي')}
              onChange={(e:any)=>this.setState({reference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Physical delivery date','تاريخ التسليم الفعلي')}>
            <Input type="date" min={deliveryNote.issueDate} max={todayIso()} value={this.state.deliveredDate}
              aria-label={t('Physical delivery date','تاريخ التسليم الفعلي')}
              onChange={(e:any)=>this.setState({deliveredDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        <Field label={t('Receipt notes (optional)','ملاحظات الاستلام (اختياري)')}>
          <Textarea maxLength={500} rows={2} value={this.state.notes}
            onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',gap:10,alignItems:'flex-start'}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm physical delivery against Sales Order','أؤكد التسليم الفعلي مقابل أمر البيع')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I verified physical receipt, the customer, each delivered quantity and the Delivery Note. Save delivery evidence only without stock or accounting posting.','تحققت من التسليم الفعلي والعميل وكل كمية مسلّمة وسند التسليم. احفظ إثبات التسليم فقط دون ترحيل مخزون أو محاسبة.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button icon="check" variant="primary" disabled={!this.state.confirmed||this.state.busy} onClick={()=>void this.submit()}>
          {this.state.busy?t('Recording physical delivery…','جارٍ تسجيل التسليم الفعلي…'):t('Confirm delivered quantities','تأكيد الكميات المسلّمة')}
        </Button>
      </div>:null}
    </section>;
  }
}