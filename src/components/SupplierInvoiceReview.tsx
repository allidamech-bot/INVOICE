import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { matchedSupplierInvoices, supplierInvoiceLineBalances, type MatchSupplierInvoiceInput } from '../lib/supplier-invoice-flow.js';
import { compareMoneyStrings, decimalToScaled, isNonNegativeDecimalInput, lineTotal, normalizeDecimalInput } from '../lib/money.js';
import { todayIso } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  order:LourexDocument;
  events:DocumentEventRecord[];
  onMatch:(input:MatchSupplierInvoiceInput)=>Promise<void>;
}
interface State{
  invoiceReference:string;
  invoiceDate:string;
  dueDate:string;
  quantities:string[];
  unitPrices:string[];
  statedTotal:string;
  notes:string;
  confirmed:boolean;
  working:boolean;
  error:string;
}

export class SupplierInvoiceReview extends React.Component<Props,State>{
  state:State={
    invoiceReference:'',invoiceDate:todayIso(),dueDate:todayIso(),
    quantities:this.props.order.items.map(()=>''),
    unitPrices:this.props.order.items.map(item=>item.unitPrice),
    statedTotal:'',notes:'',confirmed:false,working:false,error:''
  };
  private busy=false;

  componentDidUpdate(prev:Props):void{
    if(prev.order.id!==this.props.order.id||prev.order.updatedAt!==this.props.order.updatedAt){
      this.setState({
        invoiceReference:'',invoiceDate:todayIso(),dueDate:todayIso(),
        quantities:this.props.order.items.map(()=>''),unitPrices:this.props.order.items.map(item=>item.unitPrice),
        statedTotal:'',notes:'',confirmed:false,error:''
      });
    }
  }

  private setLine=(field:'quantities'|'unitPrices',index:number,value:string)=>{
    this.setState(state=>({...state,[field]:state[field].map((old,i)=>i===index?value:old),confirmed:false,error:''}));
  };

  private match=async()=>{
    if(this.busy||!this.state.confirmed)return;
    this.busy=true;this.setState({working:true,error:''});
    try{
      await this.props.onMatch({
        purchaseOrderId:this.props.order.id,
        expectedPurchaseOrderUpdatedAt:this.props.order.updatedAt,
        invoiceReference:this.state.invoiceReference,
        invoiceDate:this.state.invoiceDate,
        dueDate:this.state.dueDate,
        quantities:[...this.state.quantities],unitPrices:[...this.state.unitPrices],
        statedTotal:this.state.statedTotal,notes:this.state.notes
      });
      this.setState({
        invoiceReference:'',invoiceDate:todayIso(),dueDate:todayIso(),
        quantities:this.props.order.items.map(()=>''),unitPrices:this.props.order.items.map(item=>item.unitPrice),
        statedTotal:'',notes:'',working:false,confirmed:false,error:''
      });
    }catch(error){
      this.setState({working:false,error:error instanceof Error?error.message:t('Supplier invoice could not be matched.','تعذرت مطابقة فاتورة المورد.')});
    }finally{this.busy=false;}
  };

  private previewTotal=():string=>{
    try{
      let cents=0n;
      for(let i=0;i<this.props.order.items.length;i++){
        const quantity=normalizeDecimalInput(this.state.quantities[i]||'0');
        const price=normalizeDecimalInput(this.state.unitPrices[i]||'');
        if(!isNonNegativeDecimalInput(quantity)||!isNonNegativeDecimalInput(price))return '—';
        cents+=decimalToScaled(lineTotal(quantity,price),2);
      }
      return `${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`;
    }catch{return '—';}
  };

  render():any{
    const {order,events}=this.props;
    if(order.kind!=='purchase-order')return null;
    const invoices=matchedSupplierInvoices(order.id,events);
    const balances=supplierInvoiceLineBalances(order,events);
    const eligible=order.role==='standard'&&order.status==='final'&&order.lifecycleStatus!=='voided';
    const available=balances.some(item=>decimalToScaled(item.availableToMatch,4)>0n);
    const calculated=this.previewTotal();
    const totalMatches=calculated!=='—'&&compareMoneyStrings(this.state.statedTotal,calculated)===0;
    return <section className="ta-doc-panel" aria-label={t('Supplier invoice matching','مطابقة فاتورة المورد')}>
      <header><div><small>{t('Procurement • Batch 7','المشتريات • الدفعة السابعة')}</small><h2>{t('Supplier Invoice — 3-Way Match','فاتورة المورد — المطابقة الثلاثية')}</h2></div><span className="ta-doc-count-badge">{invoices.length}</span></header>
      <p>{t('Match the supplier bill to issued PO prices and physically received GRN quantities. Matching is an auditable review, not a payment or an inventory posting.','طابق فاتورة المورد مع أسعار أمر الشراء الصادر وكميات GRN المستلمة فعليًا. المطابقة مراجعة موثقة وليست دفعًا أو ترحيلًا للمخزون.')}</p>
      {balances.length?<div style={{display:'grid',gap:8,marginBlock:12}}>
        {balances.map((row,i)=>{
          const item=order.items[i];
          return <div key={row.purchaseOrderLineId} style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <strong>{i+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)}</strong>
            <span>{t('Received','المستلم')}: <bdi>{row.received}</bdi> · {t('Matched','المطابق')}: <bdi>{row.previouslyMatched}</bdi> · {t('Available','المتاح')}: <bdi>{row.availableToMatch}</bdi> {item?.unit}</span>
          </div>;
        })}
      </div>:null}
      {invoices.length?<div style={{display:'grid',gap:8,marginBlock:12}}>
        {invoices.map((invoice,i)=><div key={i} className="ta-doc-facts" style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <strong dir="auto">{invoice.invoiceReference}</strong><span>{invoice.invoiceDate}</span>
          <span><bdi>{invoice.total} {invoice.currency}</bdi></span>
          <small>{t('Matched / not posted','مطابقة / غير مرحّلة')}</small>
        </div>)}
      </div>:null}
      {!eligible?<p>{t('Issue the PO before matching a supplier invoice.','أصدر أمر الشراء أولًا قبل مطابقة فاتورة المورد.')}</p>:null}
      {eligible&&!available?<p>{t('No received, unbilled goods remain for this PO.','لا توجد كميات مستلمة غير مطابقة لفواتير على هذا الطلب.')}</p>:null}
      {eligible&&available?<div style={{display:'grid',gap:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:12}}>
          <Field label={t('Supplier invoice number','رقم فاتورة المورد')}>
            <Input maxLength={100} aria-label={t('Supplier invoice number','رقم فاتورة المورد')}
              value={this.state.invoiceReference} onChange={(e:any)=>this.setState({invoiceReference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Invoice date','تاريخ الفاتورة')}>
            <Input type="date" min={order.issueDate} max={todayIso()} aria-label={t('Invoice date','تاريخ الفاتورة')}
              value={this.state.invoiceDate} onChange={(e:any)=>this.setState({invoiceDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Payment due date','تاريخ استحقاق الدفع')}>
            <Input type="date" min={this.state.invoiceDate} aria-label={t('Payment due date','تاريخ استحقاق الدفع')}
              value={this.state.dueDate} onChange={(e:any)=>this.setState({dueDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        {balances.map((line,i)=>{
          const item=order.items[i],exhausted=decimalToScaled(line.availableToMatch,4)<=0n;
          return <div key={line.purchaseOrderLineId} style={{display:'grid',gap:6}}>
            <strong>{i+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)} · {t('Available','المتاح')} {line.availableToMatch} {item?.unit}</strong>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,175px),1fr))',gap:12}}>
              <Field label={t('Billed quantity','الكمية في الفاتورة')}>
                <Input inputMode="decimal" dir="ltr" disabled={exhausted}
                  aria-label={t(`Billed quantity line ${i+1}`,`كمية الفاتورة للبند ${i+1}`)}
                  value={this.state.quantities[i]||''}
                  placeholder="0" onChange={(e:any)=>this.setLine('quantities',i,e.target.value)}/>
              </Field>
              <Field label={t(`Supplier unit price (${order.currency})`,`سعر الوحدة للمورد (${order.currency})`)}>
                <Input inputMode="decimal" dir="ltr" disabled={exhausted}
                  aria-label={t(`Invoice unit price line ${i+1}`,`سعر فاتورة المورد للبند ${i+1}`)}
                  value={this.state.unitPrices[i]||''} onChange={(e:any)=>this.setLine('unitPrices',i,e.target.value)}/>
              </Field>
            </div>
          </div>;
        })}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:12}}>
          <Field label={t(`Actual invoice total (${order.currency})`,`إجمالي الفاتورة الفعلي (${order.currency})`)}>
            <Input dir="ltr" inputMode="decimal" aria-label={t('Actual supplier invoice total','إجمالي فاتورة المورد الفعلي')}
              value={this.state.statedTotal} onChange={(e:any)=>this.setState({statedTotal:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <div><small>{t('Calculated PO / GRN matched total','الإجمالي المحسوب من أمر الشراء والاستلام')}</small>
            <strong style={{display:'block',marginBlockStart:8}}><bdi>{calculated} {order.currency}</bdi></strong>
            {this.state.statedTotal&&calculated!=='—'&&!totalMatches?<small role="status">{t('Amounts differ — reconciliation required.','الإجماليان مختلفان — يلزم تسوية الفرق.')}</small>:null}
          </div>
        </div>
        <Field label={t('Supplier invoice notes (optional)','ملاحظات فاتورة المورد (اختياري)')}>
          <Textarea maxLength={500} rows={2} value={this.state.notes}
            onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',gap:10,alignItems:'flex-start'}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm three-way supplier invoice match','أؤكد المطابقة الثلاثية لفاتورة المورد')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I checked the original supplier invoice, PO prices, physical receipts and total. I understand this match does not create a payable or stock movement.','راجعت فاتورة المورد الأصلية وأسعار أمر الشراء والكميات المستلمة والإجمالي. أفهم أن هذه المطابقة لا تنشئ ذمة أو حركة مخزون.')}</span>
        </label>
        {this.state.error?<p role="alert" className="field-error">{this.state.error}</p>:null}
        <Button variant="primary" icon="check" disabled={this.state.working||!this.state.confirmed} onClick={()=>void this.match()}>
          {this.state.working?t('Matching invoice…','جارٍ مطابقة الفاتورة…'):t('Confirm invoice match','تأكيد مطابقة الفاتورة')}
        </Button>
      </div>:null}
    </section>;
  }
}
