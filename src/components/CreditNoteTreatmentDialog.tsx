import type {LourexDocument} from '../types.js';
import {createCreditNoteDraft,type CreditNoteTreatment} from '../lib/document-lifecycle.js';
import {calculateTotals,decimalToScaled,formatMoney} from '../lib/money.js';
import {t} from '../lib/i18n.js';
import {Button,Input,Modal,Select,Textarea} from './UI.js';

interface Props {
  source:LourexDocument;
  available:string;
  onClose:()=>void;
  onCreate:(amount:string,treatment:CreditNoteTreatment)=>Promise<void>;
}
interface State {mode:''|CreditNoteTreatment['mode'];reason:string;amount:string;busy:boolean;error:string;}
export class CreditNoteTreatmentDialog extends React.Component<Props,State>{
  state:State={mode:'',reason:'',amount:this.props.available,busy:false,error:''};
  private preview=():LourexDocument=>{
    if(!this.state.mode)throw new Error(t('Select the VAT treatment.','اختر المعالجة الضريبية.'));
    if(decimalToScaled(this.state.amount,2)>decimalToScaled(this.props.available,2))
      throw new Error(t('Credit exceeds the remaining invoice balance.','الإشعار يتجاوز الرصيد المتبقي للفاتورة.'));
    return createCreditNoteDraft(this.props.source,'PREVIEW',this.state.amount,{mode:this.state.mode,reason:this.state.reason});
  };
  private submit=async()=>{
    if(this.state.busy)return;
    try{
      this.preview();
      this.setState({busy:true,error:''});
      await this.props.onCreate(this.state.amount,{mode:this.state.mode as CreditNoteTreatment['mode'],reason:this.state.reason.trim()});
    }catch(error){
      this.setState({busy:false,error:error instanceof Error?error.message:String(error)});
    }
  };
  render():any{
    let preview:LourexDocument|undefined,previewError='';
    if(this.state.mode&&this.state.reason.trim()){
      try{preview=this.preview();}catch(error){previewError=error instanceof Error?error.message:String(error);}
    }
    const totals=preview?calculateTotals(preview.items,preview.adjustments):null;
    const error=this.state.error||previewError;
    const net=totals?decimalToScaled(totals.grandTotal,2)-decimalToScaled(totals.tax,2):0n;
    const netAmount=`${net/100n}.${(net%100n).toString().padStart(2,'0')}`;
    return <Modal open title={t('Credit note VAT treatment','المعالجة الضريبية للإشعار الدائن')}
      onClose={()=>{if(!this.state.busy)this.props.onClose();}}
      footer={<div className="modal-footer-actions">
        <Button disabled={this.state.busy} onClick={this.props.onClose}>{t('Cancel','إلغاء')}</Button>
        <Button variant="primary" disabled={!preview||this.state.busy} onClick={this.submit}>{t('Create draft','إنشاء مسودة')}</Button>
      </div>}>
      <div className="field-stack" dir={this.props.source.language==='ar'?'rtl':undefined}>
        <p>{this.props.source.number} — {t('Remaining balance','الرصيد المتبقي')}: {formatMoney(this.props.available,this.props.source.currency)}</p>
        <label><span>{t('Gross credit amount','مبلغ الإشعار شامل الضريبة')}</span>
          <Input inputMode="decimal" value={this.state.amount} disabled={this.state.busy}
            onChange={(event:any)=>this.setState({amount:event.target.value,error:''})}/></label>
        <label><span>{t('VAT treatment','المعالجة الضريبية')}</span>
          <Select value={this.state.mode} disabled={this.state.busy} onChange={(event:any)=>this.setState({mode:event.target.value,error:''})}>
            <option value="">{t('Select treatment…','اختر المعالجة…')}</option>
            <option value="invoice-tax">{t('Sales reduction — use invoice tax','تخفيض بيع — تطبيق ضريبة الفاتورة')}</option>
            <option value="keep-vat">{t('Keep VAT unchanged — accounting review required','دون تعديل الضريبة — يتطلب مراجعة محاسبية')}</option>
          </Select></label>
        <p className="field-hint">{this.state.mode==='keep-vat'
          ?t('Use only when the approved accounting treatment leaves VAT unchanged. This does not claim bad-debt tax relief.','يستخدم فقط عندما تقضي المعالجة المحاسبية المعتمدة بعدم تعديل الضريبة. لا يمثل مطالبة بإعفاء ضريبي للديون المعدومة.')
          :t('For an agreed sales reduction or return, review the source invoice tax and local requirements. Stock returns are recorded separately.','لتخفيض بيع متفق عليه أو مرتجع، راجع ضريبة الفاتورة ومتطلبات الشركة المحلية. تسجل إعادة المخزون بشكل منفصل.')}</p>
        <label><span>{t('Reason','السبب')}</span>
          <Textarea maxLength={1000} value={this.state.reason} disabled={this.state.busy}
            onChange={(event:any)=>this.setState({reason:event.target.value,error:''})}/></label>
        {totals?<output data-credit-preview="true" aria-live="polite">
          {t('Net','القيمة قبل الضريبة')}: {formatMoney(netAmount,this.props.source.currency)}<br/>
          {t('VAT reduction','تخفيض الضريبة')}: {formatMoney(totals.tax,this.props.source.currency)}<br/>
          {t('Receivable reduction','تخفيض الذمم')}: {formatMoney(totals.grandTotal,this.props.source.currency)}
        </output>:null}
        {error?<p role="alert">{error}</p>:null}
        <p className="field-hint">{t('Creates a draft for review. Balances and VAT change only after issue.','تنشأ مسودة للمراجعة. لا تتغير الأرصدة والضريبة إلا بعد الإصدار.')}</p>
      </div>
    </Modal>;
  }
}
