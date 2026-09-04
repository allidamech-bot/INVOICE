import type { InvoiceSettlementPlan, LourexDocument, PaymentMethod, PaymentTermPreset } from '../types.js';
import { addDaysIso, todayIso } from '../lib/id.js';
import { calculateTotals, decimalToScaled, formatMoney, isDecimalInput } from '../lib/money.js';
import { t } from '../lib/i18n.js';
import { Button, Field, Input, Modal, Select, Textarea } from './UI.js';

interface Props {
  open:boolean;
  source:LourexDocument;
  paymentTermPresets:PaymentTermPreset[];
  onClose:()=>void;
  onConfirm:(plan:InvoiceSettlementPlan)=>Promise<void>;
}
interface State {
  mode:InvoiceSettlementPlan['mode'];
  termId:string;
  customDueDate:string;
  paymentAmount:string;
  paymentDate:string;
  paymentMethod:PaymentMethod;
  paymentReference:string;
  paymentNotes:string;
  working:boolean;
  error:string;
}

export class InvoiceConversionModal extends React.Component<Props,State>{
  state:State=this.initialState();

  private initialState():State{
    const credit=this.props?.paymentTermPresets?.find(item=>item.days===30)||this.props?.paymentTermPresets?.find(item=>item.days>0);
    return {mode:'due-on-receipt',termId:credit?.id||'custom',customDueDate:addDaysIso(todayIso(),30),paymentAmount:'',paymentDate:todayIso(),paymentMethod:'bank-transfer',paymentReference:'',paymentNotes:'',working:false,error:''};
  }

  componentDidUpdate(prevProps:Props):void{
    if((!prevProps.open&&this.props.open)||prevProps.source.id!==this.props.source.id)this.setState(this.initialState());
  }

  private total=()=>calculateTotals(this.props.source.items,this.props.source.adjustments).grandTotal;
  private creditPresets=()=>this.props.paymentTermPresets.filter(item=>item.days>0);
  private dueDate=():string=>{
    if(this.state.mode==='paid'||this.state.mode==='due-on-receipt')return todayIso();
    const preset=this.props.paymentTermPresets.find(item=>item.id===this.state.termId);
    return preset?addDaysIso(todayIso(),preset.days):this.state.customDueDate;
  };
  private paymentTerms=():string=>{
    if(this.state.mode==='paid')return t('Paid in full','مدفوعة بالكامل');
    if(this.state.mode==='due-on-receipt')return t('Due on receipt','مستحقة عند الاستلام');
    return this.props.paymentTermPresets.find(item=>item.id===this.state.termId)?.label||t('Custom due date','تاريخ استحقاق مخصص');
  };
  private choose=(mode:InvoiceSettlementPlan['mode'])=>this.setState({mode,error:'',paymentAmount:mode==='paid'?this.total():mode==='partial'?this.state.paymentAmount:''});

  private submit=async()=>{
    const total=this.total();
    const dueDate=this.dueDate();
    if((this.state.mode==='on-account'||this.state.mode==='partial')&&!dueDate){this.setState({error:t('Choose an invoice due date.','اختر تاريخ استحقاق الفاتورة.')});return;}
    let paymentAmount='';
    if(this.state.mode==='paid')paymentAmount=total;
    if(this.state.mode==='partial'){
      if(!isDecimalInput(this.state.paymentAmount)||decimalToScaled(this.state.paymentAmount,2)<=0n){this.setState({error:t('Enter a valid partial payment amount.','أدخل مبلغ دفعة جزئية صالحًا.')});return;}
      if(decimalToScaled(this.state.paymentAmount,2)>=decimalToScaled(total,2)){this.setState({error:t('Partial payment must be less than the invoice total. Choose Paid in Full for the full amount.','يجب أن تكون الدفعة الجزئية أقل من إجمالي الفاتورة. اختر مدفوعة بالكامل للمبلغ الكامل.')});return;}
      paymentAmount=this.state.paymentAmount;
    }
    const plan:InvoiceSettlementPlan={mode:this.state.mode,dueDate,paymentTermPresetId:(this.state.mode==='on-account'||this.state.mode==='partial')&&this.state.termId!=='custom'?this.state.termId:'',paymentTerms:this.paymentTerms(),paymentAmount,paymentDate:(this.state.mode==='paid'||this.state.mode==='partial')?this.state.paymentDate:'',paymentMethod:this.state.paymentMethod,paymentReference:this.state.paymentReference.trim(),paymentNotes:this.state.paymentNotes.trim()};
    this.setState({working:true,error:''});
    try{await this.props.onConfirm(plan);this.setState({working:false});}
    catch(e){this.setState({working:false,error:e instanceof Error?e.message:t('Unable to create invoice.','تعذر إنشاء الفاتورة.')});}
  };

  render():any{
    if(!this.props.open)return null;
    const total=this.total();
    const needsCreditTerms=this.state.mode==='on-account'||this.state.mode==='partial';
    const needsPayment=this.state.mode==='paid'||this.state.mode==='partial';
    const dueDate=this.dueDate();
    return <Modal open={this.props.open} title={t('Create Invoice from Quote','إنشاء فاتورة من عرض السعر')} size="lg" onClose={this.state.working?()=>undefined:this.props.onClose} footer={<div className="modal-footer-actions"><Button disabled={this.state.working} onClick={this.props.onClose}>{t('Cancel','إلغاء')}</Button><Button icon="invoice" variant="primary" disabled={this.state.working} onClick={()=>void this.submit()}>{this.state.working?t('Creating…','جارٍ الإنشاء…'):t('Create Invoice','إنشاء الفاتورة')}</Button></div>}>
      <div className="invoice-conversion-modal">
        <header className="conversion-summary"><div><span>{t('Quote','عرض السعر')}</span><strong>{this.props.source.number}</strong></div><div><span>{t('Invoice total','إجمالي الفاتورة')}</span><strong>{formatMoney(total,this.props.source.currency)}</strong></div></header>
        <section><div className="conversion-section-heading"><h3>{t('How will this invoice be settled?','كيف سيتم سداد هذه الفاتورة؟')}</h3><p>{t('Choose the commercial settlement now. The invoice will open as a draft for review before issue.','اختر طريقة السداد التجارية الآن. ستُفتح الفاتورة كمسودة للمراجعة قبل الإصدار.')}</p></div>
          <div className="settlement-choice-grid">
            <button type="button" className={this.state.mode==='paid'?'active':''} onClick={()=>this.choose('paid')}><strong>{t('Paid in Full','مدفوعة بالكامل')}</strong><span>{t('Record the full payment automatically when the invoice is issued.','تسجيل كامل الدفعة تلقائيًا عند إصدار الفاتورة.')}</span></button>
            <button type="button" className={this.state.mode==='partial'?'active':''} onClick={()=>this.choose('partial')}><strong>{t('Partial Payment','دفعة جزئية')}</strong><span>{t('Record a deposit now and leave the remaining balance due.','تسجيل دفعة مقدمة وترك الرصيد المتبقي مستحقًا.')}</span></button>
            <button type="button" className={this.state.mode==='on-account'?'active':''} onClick={()=>this.choose('on-account')}><strong>{t('On Account / Credit','آجل')}</strong><span>{t('Set a future due date with no payment recorded yet.','تحديد تاريخ استحقاق مستقبلي بدون تسجيل دفعة حاليًا.')}</span></button>
            <button type="button" className={this.state.mode==='due-on-receipt'?'active':''} onClick={()=>this.choose('due-on-receipt')}><strong>{t('Due on Receipt','مستحق عند الاستلام')}</strong><span>{t('The invoice is due immediately, but remains unpaid until a receipt is recorded.','الفاتورة مستحقة فورًا وتبقى غير مدفوعة حتى تسجيل دفعة.')}</span></button>
          </div>
        </section>
        {needsCreditTerms?<section className="conversion-fields"><div className="conversion-section-heading"><h3>{t('Credit terms','شروط الأجل')}</h3></div><div className="form-grid two compact-grid"><Field label={t('Payment terms','شروط الدفع')}><Select value={this.state.termId} onChange={(e:any)=>this.setState({termId:e.target.value,error:''})}>{this.creditPresets().map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">{t('Custom due date','تاريخ مخصص')}</option></Select></Field><Field label={t('Due date','تاريخ الاستحقاق')}><Input type="date" value={dueDate} disabled={this.state.termId!=='custom'} onChange={(e:any)=>this.setState({customDueDate:e.target.value,error:''})}/></Field></div></section>:null}
        {needsPayment?<section className="conversion-fields"><div className="conversion-section-heading"><h3>{this.state.mode==='paid'?t('Payment details','تفاصيل الدفع'):t('Deposit details','تفاصيل الدفعة المقدمة')}</h3></div><div className="form-grid two compact-grid">{this.state.mode==='partial'?<Field label={t(`Amount (${this.props.source.currency})`,`المبلغ (${this.props.source.currency})`)}><Input inputMode="decimal" value={this.state.paymentAmount} onChange={(e:any)=>this.setState({paymentAmount:e.target.value,error:''})}/></Field>:<Field label={t('Amount','المبلغ')}><Input value={formatMoney(total,this.props.source.currency)} disabled/></Field>}<Field label={t('Payment date','تاريخ الدفع')}><Input type="date" value={this.state.paymentDate} onChange={(e:any)=>this.setState({paymentDate:e.target.value,error:''})}/></Field><Field label={t('Method','الوسيلة')}><Select value={this.state.paymentMethod} onChange={(e:any)=>this.setState({paymentMethod:e.target.value as PaymentMethod})}><option value="cash">{t('Cash','نقدي')}</option><option value="bank-transfer">{t('Bank transfer','تحويل بنكي')}</option><option value="card">{t('Card','بطاقة')}</option><option value="cheque">{t('Cheque','شيك')}</option><option value="other">{t('Other','أخرى')}</option></Select></Field><Field label={t('Reference','المرجع')}><Input value={this.state.paymentReference} placeholder={t('Transfer / receipt reference','مرجع التحويل / الإيصال')} onChange={(e:any)=>this.setState({paymentReference:e.target.value})}/></Field></div><Field label={t('Notes','ملاحظات')}><Textarea rows={2} value={this.state.paymentNotes} onChange={(e:any)=>this.setState({paymentNotes:e.target.value})}/></Field><p className="conversion-payment-note">{t('The payment is queued safely and is recorded only when the invoice becomes Final, so draft edits remain auditable.','يتم تجهيز الدفعة بأمان ولا تُسجل محاسبيًا إلا عند جعل الفاتورة نهائية، حتى تبقى تعديلات المسودة قابلة للتدقيق.')}</p></section>:null}
        <div className="conversion-result-strip"><span>{t('Due date','تاريخ الاستحقاق')}</span><strong>{dueDate}</strong><span>{t('Payment terms','شروط الدفع')}</span><strong>{this.paymentTerms()}</strong></div>
        {this.state.error?<p className="conversion-error" role="alert">{this.state.error}</p>:null}
      </div>
    </Modal>;
  }
}
