import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { confirmedGoodsReceipts, goodsReceiptBalances, type ConfirmGoodsReceiptInput } from '../lib/goods-receipt-flow.js';
import { decimalToScaled } from '../lib/money.js';
import { todayIso } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  order:LourexDocument;
  events:DocumentEventRecord[];
  onConfirm:(input:ConfirmGoodsReceiptInput)=>Promise<void>;
}
interface State{
  reference:string;
  receivedDate:string;
  quantities:string[];
  notes:string;
  confirmed:boolean;
  working:boolean;
  error:string;
}
export class GoodsReceiptReview extends React.Component<Props,State>{
  state:State={reference:'',receivedDate:todayIso(),quantities:this.props.order.items.map(()=>''),notes:'',confirmed:false,working:false,error:''};
  private busy=false;

  componentDidUpdate(prev:Props):void{
    if(prev.order.id!==this.props.order.id||prev.order.updatedAt!==this.props.order.updatedAt){
      this.setState({reference:'',receivedDate:todayIso(),quantities:this.props.order.items.map(()=>''),notes:'',confirmed:false,error:''});
    }
  }

  private setQuantity=(index:number,value:string)=>{
    this.setState(state=>({quantities:state.quantities.map((raw,i)=>i===index?value:raw),confirmed:false,error:''}));
  };

  private submit=async()=>{
    if(this.busy||!this.state.confirmed)return;
    this.busy=true;
    this.setState({working:true,error:''});
    try{
      await this.props.onConfirm({
        purchaseOrderId:this.props.order.id,
        expectedPurchaseOrderUpdatedAt:this.props.order.updatedAt,
        reference:this.state.reference,
        receivedDate:this.state.receivedDate,
        quantities:[...this.state.quantities],
        notes:this.state.notes
      });
      this.setState({reference:'',receivedDate:todayIso(),notes:'',quantities:this.props.order.items.map(()=>''),working:false,confirmed:false,error:''});
    }catch(error){
      this.setState({working:false,error:error instanceof Error?error.message:t('Could not confirm receipt.','تعذر تأكيد الاستلام.')});
    }finally{this.busy=false;}
  };

  render():any{
    const {order,events}=this.props;
    if(order.kind!=='purchase-order')return null;
    const receipts=confirmedGoodsReceipts(order.id,events);
    const balances=goodsReceiptBalances(order,events);
    const eligible=order.role==='standard'&&order.status==='final'&&order.lifecycleStatus!=='voided';
    const remaining=balances.some(row=>decimalToScaled(row.remaining,4)>0n);
    const canRecord=eligible&&remaining;
    return <section className="ta-doc-panel" aria-label={t('Goods receipt register','سجل استلام البضاعة')}>
      <header><div><small>{t('Procurement • Batch 7','المشتريات • الدفعة السابعة')}</small><h2>{t('Goods Receipts (GRN)','استلام البضاعة (GRN)')}</h2></div><span className="ta-doc-count-badge">{receipts.length}</span></header>
      <p>{t('Reconcile actual deliveries against ordered quantities. Receipts are operational evidence only; inventory and supplier payables are not posted here.','طابق البضاعة المستلمة فعليًا مع الكميات المطلوبة. محاضر الاستلام إثبات تشغيلي فقط، ولا يترتب عليها ترحيل المخزون أو ذمم الموردين هنا.')}</p>
      {balances.length?<div style={{display:'grid',gap:6,marginBlock:'12px'}}>
        {balances.map((row,index)=>{
          const item=order.items[index];
          return <div key={row.purchaseOrderLineId} style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <strong>{index+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)}</strong>
            <span>{t('Ordered','المطلوب')}: <bdi>{row.ordered}</bdi> · {t('Received','المستلم')}: <bdi>{row.received}</bdi> · {t('Remaining','المتبقي')}: <bdi>{row.remaining}</bdi> {item?.unit}</span>
          </div>;
        })}
      </div>:null}
      {receipts.length?<div style={{display:'grid',gap:8,marginBlock:12}}>
        {receipts.map((receipt,i)=><div key={i} className="ta-doc-facts" style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <strong dir="auto">{receipt.reference}</strong><span><bdi>{receipt.receivedDate}</bdi></span>
          <span>{receipt.lines.map(line=>{
            const item=order.items.find(x=>x.id===line.purchaseOrderLineId);
            return `${item?.descriptionEn||item?.descriptionAr||line.purchaseOrderLineId}: ${line.quantity} ${line.unit}`;
          }).join(' · ')}</span>
        </div>)}
      </div>:null}
      {!eligible?<p>{t('Issue the Purchase Order before recording goods received.','أصدر أمر الشراء أولًا قبل تسجيل البضاعة المستلمة.')}</p>:null}
      {eligible&&!remaining?<p>{t('All ordered quantities have been recorded as received.','تم تسجيل استلام كامل كميات أمر الشراء.')}</p>:null}
      {canRecord?<div style={{display:'grid',gap:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}}>
          <Field label={t('Delivery / GRN reference','مرجع الاستلام / GRN')}>
            <Input aria-label={t('Delivery / GRN reference','مرجع الاستلام / GRN')} value={this.state.reference} maxLength={100}
              placeholder="GRN-2026-001" onChange={(e:any)=>this.setState({reference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Actual receipt date','تاريخ الاستلام الفعلي')}>
            <Input type="date" max={todayIso()} min={order.issueDate} aria-label={t('Actual receipt date','تاريخ الاستلام الفعلي')}
              value={this.state.receivedDate} onChange={(e:any)=>this.setState({receivedDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        {balances.map((row,index)=>{
          const item=order.items[index],exhausted=decimalToScaled(row.remaining,4)<=0n;
          return <Field key={row.purchaseOrderLineId} label={`${index+1}. ${isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)} · ${t('Remaining','المتبقي')} ${row.remaining} ${item?.unit||''}`}>
            <Input dir="ltr" inputMode="decimal" disabled={exhausted}
              aria-label={t(`Quantity received for line ${index+1}`,`الكمية المستلمة للبند ${index+1}`)}
              placeholder={t('Received quantity (0 if not received)','الكمية المستلمة (صفر إن لم تستلم)')}
              value={this.state.quantities[index]||''} onChange={(e:any)=>this.setQuantity(index,e.target.value)}/>
          </Field>;
        })}
        <Field label={t('Receiving notes (optional)','ملاحظات الاستلام (اختياري)')}>
          <Textarea rows={2} maxLength={500} value={this.state.notes}
            onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',alignItems:'flex-start',gap:10}}>
          <input type="checkbox" checked={this.state.confirmed}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}
            aria-label={t('Confirm goods physically received','أؤكد استلام البضاعة فعليًا')}/>
          <span>{t('I confirm these goods were physically received and the quantities are correct. This does not post inventory or approve a supplier bill.','أؤكد أن البضاعة استُلمت فعليًا وأن الكميات صحيحة. هذا لا يرحّل المخزون ولا يعتمد فاتورة المورد.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button variant="primary" icon="check" disabled={this.state.working||!this.state.confirmed} onClick={()=>void this.submit()}>
          {this.state.working?t('Recording goods receipt…','جارٍ تسجيل الاستلام…'):t('Confirm goods receipt','تأكيد استلام البضاعة')}
        </Button>
      </div>:null}
    </section>;
  }
}
