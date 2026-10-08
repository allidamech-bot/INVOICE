import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { matchSupplierInvoice, matchedSupplierInvoices, supplierInvoiceLineBalances, type MatchSupplierInvoiceInput } from '../lib/supplier-invoice-flow.js';
import { decimalToScaled, formatMoney } from '../lib/money.js';
import { todayIso } from '../lib/id.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, Field, Input, Textarea } from './UI.js';

interface Props{
  order:LourexDocument;
  events:DocumentEventRecord[];
  onMatch:(input:MatchSupplierInvoiceInput)=>Promise<void>;
}
interface State{
  reference:string;
  invoiceDate:string;
  quantities:string[];
  unitPrices:string[];
  notes:string;
  confirmed:boolean;
  busy:boolean;
  error:string;
}

export class SupplierInvoiceMatchReview extends React.Component<Props,State>{
  state:State={
    reference:'',invoiceDate:todayIso(),
    quantities:this.props.order.items.map(()=>''),
    unitPrices:this.props.order.items.map(line=>line.unitPrice),
    notes:'',confirmed:false,busy:false,error:''
  };
  private inFlight=false;
  componentDidUpdate(prev:Props):void{
    if(prev.order.id!==this.props.order.id||prev.order.updatedAt!==this.props.order.updatedAt){
      this.setState({reference:'',invoiceDate:todayIso(),quantities:this.props.order.items.map(()=>''),
        unitPrices:this.props.order.items.map(line=>line.unitPrice),notes:'',confirmed:false,error:''});
    }
  }
  private setQuantity=(index:number,value:string)=>{
    this.setState(state=>({quantities:state.quantities.map((x,i)=>i===index?value:x),confirmed:false,error:''}));
  };
  private setPrice=(index:number,value:string)=>{
    this.setState(state=>({unitPrices:state.unitPrices.map((x,i)=>i===index?value:x),confirmed:false,error:''}));
  };
  private submit=async()=>{
    if(this.inFlight||!this.state.confirmed)return;
    this.inFlight=true;
    this.setState({busy:true,error:''});
    try{
      await this.props.onMatch({
        purchaseOrderId:this.props.order.id,expectedPurchaseOrderUpdatedAt:this.props.order.updatedAt,
        reference:this.state.reference,invoiceDate:this.state.invoiceDate,
        quantities:[...this.state.quantities],unitPrices:[...this.state.unitPrices],notes:this.state.notes
      });
      this.setState({reference:'',invoiceDate:todayIso(),notes:'',quantities:this.props.order.items.map(()=>''),
        unitPrices:this.props.order.items.map(x=>x.unitPrice),confirmed:false,busy:false,error:''});
    }catch(e){
      this.setState({busy:false,error:e instanceof Error?e.message:t('Invoice matching failed.','فشلت مطابقة فاتورة المورد.')});
    }finally{this.inFlight=false;}
  };
  render():any{
    const {order,events}=this.props;
    if(order.kind!=='purchase-order')return null;
    const invoices=matchedSupplierInvoices(order.id,events);
    const balances=supplierInvoiceLineBalances(order,events);
    const eligible=order.role==='standard'&&order.status==='final'&&order.lifecycleStatus!=='voided';
    const available=balances.some(b=>decimalToScaled(b.availableToBill,4)>0n);
    return <section className="ta-doc-panel" aria-label={t('Supplier invoice three-way matching','مطابقة فاتورة المورد الثلاثية')}>
      <header><div><small>{t('Procurement • Batch 7','المشتريات • الدفعة السابعة')}</small><h2>{t('Supplier Invoice Matching','مطابقة فاتورة المورد')}</h2></div><span className="ta-doc-count-badge">{invoices.length}</span></header>
      <p>{t('Match supplier invoice lines against issued PO prices and physically received GRN quantities. This review does not create payables, post purchases or move stock.','طابق أصناف فاتورة المورد مع أسعار أمر الشراء الصادر والكميات المستلمة فعليًا في GRN. هذه المراجعة لا تنشئ ذممًا ولا ترحّل مشتريات أو مخزونًا.')}</p>
      {balances.length?<div style={{display:'grid',gap:9,marginBlock:12}}>
        {balances.map((balance,i)=>{
          const item=order.items[i];
          return <div key={balance.purchaseOrderLineId} style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap'}}>
            <strong>{i+1}. {isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr)}</strong>
            <span>{t('Received','المستلم')} <bdi>{balance.received}</bdi> · {t('Already matched','المطابق سابقًا')} <bdi>{balance.billed}</bdi> · {t('Available to match','المتبقي للمطابقة')} <bdi>{balance.availableToBill}</bdi> {item?.unit}</span>
          </div>;
        })}
      </div>:null}
      {invoices.length?<div style={{display:'grid',gap:8,marginBlock:12}}>
        {invoices.map((invoice,i)=><div key={i} className="ta-doc-facts" style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
          <strong dir="auto">{invoice.reference}</strong><span><bdi>{invoice.invoiceDate}</bdi></span>
          <span>{formatMoney(invoice.lineSubtotal,invoice.currency)} ({t('line subtotal','مجموع البنود')})</span>
          <span>{invoice.lines.map(line=>`${line.quantity} ${line.unit}`).join(' · ')}</span>
        </div>)}
      </div>:null}
      {!eligible?<p>{t('Issue the Purchase Order before matching the supplier invoice.','أصدر أمر الشراء قبل مطابقة فاتورة المورد.')}</p>:null}
      {eligible&&!available?<p>{t('There are no received and unmatched quantities. Confirm GRN first or review existing invoice matches.','لا توجد كميات مستلمة وغير مطابقة. أكد GRN أولًا أو راجع الفواتير المطابقة.')}</p>:null}
      {eligible&&available?<div style={{display:'grid',gap:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}}>
          <Field label={t('Supplier invoice reference','مرجع فاتورة المورد')}>
            <Input value={this.state.reference} maxLength={100} placeholder="INV-SUP-2026-01"
              aria-label={t('Supplier invoice reference','مرجع فاتورة المورد')}
              onChange={(e:any)=>this.setState({reference:e.target.value,confirmed:false,error:''})}/>
          </Field>
          <Field label={t('Supplier invoice date','تاريخ فاتورة المورد')}>
            <Input type="date" min={order.issueDate} max={todayIso()} value={this.state.invoiceDate}
              aria-label={t('Supplier invoice date','تاريخ فاتورة المورد')}
              onChange={(e:any)=>this.setState({invoiceDate:e.target.value,confirmed:false,error:''})}/>
          </Field>
        </div>
        {balances.map((balance,index)=>{
          const item=order.items[index],disabled=decimalToScaled(balance.availableToBill,4)<=0n;
          const description=isArabic()?(item?.descriptionAr||item?.descriptionEn):(item?.descriptionEn||item?.descriptionAr);
          return <div key={balance.purchaseOrderLineId} style={{display:'grid',gap:7}}>
            <strong>{index+1}. {description} — {t('PO unit price','سعر الوحدة بأمر الشراء')} <bdi>{balance.unitPrice} {order.currency}</bdi></strong>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,200px),1fr))',gap:10}}>
              <Field label={t('Invoiced quantity','الكمية المفوترة')}>
                <Input inputMode="decimal" dir="ltr" disabled={disabled} value={this.state.quantities[index]||''}
                  aria-label={t(`Invoice quantity for line ${index+1}`,`كمية الفاتورة للبند ${index+1}`)}
                  placeholder={t('0 if not invoiced','صفر إن لم تتم فوترته')}
                  onChange={(e:any)=>this.setQuantity(index,e.target.value)}/>
              </Field>
              <Field label={t('Supplier invoice unit price','سعر الوحدة بفاتورة المورد')}>
                <Input inputMode="decimal" dir="ltr" disabled={disabled} value={this.state.unitPrices[index]||''}
                  aria-label={t(`Supplier invoice price for line ${index+1}`,`سعر فاتورة المورد للبند ${index+1}`)}
                  onChange={(e:any)=>this.setPrice(index,e.target.value)}/>
              </Field>
            </div>
          </div>;
        })}
        <Field label={t('Supplier invoice notes (optional)','ملاحظات فاتورة المورد (اختياري)')}>
          <Textarea rows={2} maxLength={500} value={this.state.notes}
            onChange={(e:any)=>this.setState({notes:e.target.value,confirmed:false,error:''})}/>
        </Field>
        <label style={{display:'flex',alignItems:'flex-start',gap:10}}>
          <input type="checkbox" checked={this.state.confirmed}
            aria-label={t('Confirm PO GRN supplier invoice match','أؤكد مطابقة أمر الشراء والاستلام والفاتورة')}
            onChange={(e:any)=>this.setState({confirmed:e.target.checked,error:''})}/>
          <span>{t('I verified the supplier, invoice reference, currency, goods receipts, quantities and PO unit prices. Record the match only; do not post stock or payables.','راجعت المورد ومرجع الفاتورة والعملة ومحاضر الاستلام والكميات وأسعار أمر الشراء. سجل المطابقة فقط دون ترحيل المخزون أو الذمم.')}</span>
        </label>
        {this.state.error?<p className="field-error" role="alert">{this.state.error}</p>:null}
        <Button icon="check" variant="primary" disabled={this.state.busy||!this.state.confirmed} onClick={()=>void this.submit()}>
          {this.state.busy?t('Saving match…','جارٍ حفظ المطابقة…'):t('Confirm three-way match','تأكيد المطابقة الثلاثية')}
        </Button>
      </div>:null}
    </section>;
  }
}
