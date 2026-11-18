import type {LourexDocument} from '../types.js';
import {t} from '../lib/i18n.js';
import {fiscalDocumentNextAction,requestFiscalDocument} from '../lib/fiscal-document-client.js';
import type {FiscalDocumentState,FiscalDocumentAction,FiscalReviewFields} from '../lib/fiscal-document-client.js';
import {Button,Field,Input,Modal,Select} from './UI.js';
interface Props{document:LourexDocument;onPublish:(doc:LourexDocument)=>Promise<LourexDocument>;onClose:()=>void;}
interface State{busy:boolean;status:FiscalDocumentState|null;error:string;invoiceType:''|FiscalReviewFields['invoiceType'];supplyDate:string;paymentMeans:''|FiscalReviewFields['paymentMeans'];}
const labels:Record<string,[string,string]>={'not-reviewed':['Awaiting review','بانتظار المراجعة'],reviewed:['Reviewed','تمت المراجعة'],approved:['Approved, not issued','معتمدة داخليًا، لم تصدر'],queued:['Queued, not accepted','بانتظار الإرسال، لم تقبل بعد'],submitting:['Submission in progress','الإرسال جارٍ'],uncertain:['Requires reconciliation','تحتاج مطابقة'],retryable:['Requires authorized retry','تحتاج إعادة محاولة مصرح بها'],rejected:['Rejected','مرفوضة'],cleared:['Cleared in simulation','مقبولة في المحاكاة'],reported:['Reported in simulation','مبلّغ عنها في المحاكاة']};
export class FiscalIssueDialog extends React.Component<Props,State>{
  state:State={busy:false,status:null,error:'',invoiceType:'',supplyDate:'',paymentMeans:''};
  private pending:AbortController|null=null;
  private published:LourexDocument|null=null;
  componentDidMount(){void this.run({operation:'document-status'});}
  componentWillUnmount(){this.pending?.abort();this.pending=null;}
  private run=async(action:FiscalDocumentAction)=>{
    if(this.pending)return;const controller=new AbortController();this.pending=controller;this.setState({busy:true,error:''});
    try{
      if(!this.published)this.published=await this.props.onPublish(this.props.document);
      if(controller.signal.aborted)return;
      const doc=this.published,result=await requestFiscalDocument(doc,action,controller.signal);
      const status=action.operation==='document-status'?result:await requestFiscalDocument(doc,{operation:'document-status'},controller.signal);
      if(this.pending===controller&&!controller.signal.aborted)this.setState({status});
    }catch{if(this.pending===controller&&!controller.signal.aborted)this.setState({status:null,error:t('Fiscal action was not confirmed. Verify approved party profiles and cloud synchronization, then refresh status. Never repeat an uncertain submission.','لم يتأكد إجراء الفوترة. تحقق من ملفات الأطراف المعتمدة والمزامنة السحابية ثم حدّث الحالة. لا تكرر إرسالًا غير محسوم.')});}
    finally{if(this.pending===controller){this.pending=null;this.setState({busy:false});}}
  };
  render():any{
    const s=this.state.status,response=s?.response,receipt=response?.response,action=s?fiscalDocumentNextAction(s):null,l=s?labels[s.status]:null,ready=this.state.invoiceType&&this.state.supplyDate&&this.state.paymentMeans;
    return <Modal open={true} title={t('Saudi e-invoicing · test issuance','الفوترة السعودية · إصدار تجريبي')} onClose={()=>{if(!this.state.busy)this.props.onClose();}} footer={<Button disabled={this.state.busy} onClick={this.props.onClose}>{t('Close','إغلاق')}</Button>}>
      <div aria-busy={this.state.busy}><p>{t('This is an isolated simulation. The commercial invoice stays a draft; no accounting or stock movement is posted here.','هذه محاكاة معزولة. تبقى الفاتورة التجارية مسودة، ولا تُسجّل هنا قيود محاسبية أو حركة مخزون.')}</p>
      {this.state.busy?<p role="status">{t('Working…','جارٍ التنفيذ…')}</p>:null}
      {this.state.error?<p role="alert">{this.state.error}</p>:null}
      {l?<p role="status"><strong>{t(l[0],l[1])}</strong></p>:null}
      {response?<div className="commercial-row-card" aria-label={t('Authority response','استجابة الهيئة')}>
        <p>{response.mode==='clearance'?t('Clearance','الاعتماد'):t('Reporting','الإبلاغ')} · {t('Last updated','آخر تحديث')}: <time dateTime={response.updatedAt}>{new Date(response.updatedAt).toLocaleString()}</time></p>
        {response.reportingDeadline?<p>{t('Reporting deadline','مهلة الإبلاغ')}: <time dateTime={response.reportingDeadline}>{new Date(response.reportingDeadline).toLocaleString()}</time></p>:null}
        {response.overdue?<p role="alert">{t('Reporting deadline passed. Resolve this issue without resending automatically.','انتهت مهلة الإبلاغ. عالج الحالة دون إعادة إرسال تلقائية.')}</p>:null}
        {response.acceptedWithWarnings?<p role="status">{t('Accepted with warnings. Review the codes below.','مقبولة مع تحذيرات. راجع الرموز أدناه.')}</p>:null}
        {receipt?<div><p>{t('HTTP response','رمز الاستجابة')}: <strong dir="ltr">{receipt.httpStatus}</strong></p>
          {receipt.kind==='validation-errors'?<p role="alert">{t('Validation errors were returned. Final non-acceptance has not yet been confirmed.','وردت أخطاء تحقق. لم يتأكد الرفض النهائي بعد.')}</p>:null}
          {receipt.kind==='positive-response'&&s?.status!=='cleared'&&s?.status!=='reported'?<p>{t('Positive response stored; independent verification pending.','حُفظت استجابة إيجابية؛ التحقق المستقل معلق.')}</p>:null}
          {receipt.kind==='unresolved-response'?<p>{t('Unresolved response. Do not resend.','استجابة غير محسومة. لا تعاود الإرسال.')}</p>:null}
          {receipt.warningCount?<p>{t('Warnings','التحذيرات')}: {receipt.warningCount} {receipt.warningCodes.length?<span dir="ltr">{receipt.warningCodes.join(' · ')}</span>:null}</p>:null}
          {receipt.errorCount?<p>{t('Errors','الأخطاء')}: {receipt.errorCount} {receipt.errorCodes.length?<span dir="ltr">{receipt.errorCodes.join(' · ')}</span>:null}</p>:null}
        </div>:s?.status==='submitting'||s?.status==='uncertain'?<p>{t('No confirmed receipt is stored.','لا توجد استجابة مؤكدة محفوظة.')}</p>:null}
      </div>:null}
      {action==='review'?<div className="form-grid">
        <Field label={t('Invoice type','نوع الفاتورة')}><Select value={this.state.invoiceType} onChange={(e:any)=>this.setState({invoiceType:e.target.value})}><option value="">{t('Select type','اختر النوع')}</option><option value="standard">{t('Standard tax invoice','فاتورة ضريبية')}</option><option value="simplified">{t('Simplified tax invoice','فاتورة ضريبية مبسطة')}</option></Select></Field>
        <Field label={t('Supply date','تاريخ التوريد')}><Input type="date" value={this.state.supplyDate} max={this.props.document.issueDate} onChange={(e:any)=>this.setState({supplyDate:e.target.value})}/></Field>
        <Field label={t('Payment means','وسيلة الدفع')}><Select value={this.state.paymentMeans} onChange={(e:any)=>this.setState({paymentMeans:e.target.value})}><option value="">{t('Select payment means','اختر وسيلة الدفع')}</option><option value="10">{t('Cash','نقدًا')}</option><option value="30">{t('Credit transfer','تحويل بنكي')}</option><option value="42">{t('Payment to bank account','دفع إلى حساب بنكي')}</option><option value="48">{t('Card','بطاقة')}</option><option value="1">{t('Not defined','غير محددة')}</option></Select></Field>
        <Button variant="primary" disabled={this.state.busy||!ready} onClick={()=>{const {invoiceType,paymentMeans,supplyDate}=this.state;if(invoiceType&&paymentMeans&&supplyDate)void this.run({operation:'review',fields:{invoiceType,paymentMeans,supplyDate}});}}>{t('Verify saved invoice','تحقق من الفاتورة المحفوظة')}</Button>
      </div>:null}
      {action==='approve'?<Button variant="primary" disabled={this.state.busy} onClick={()=>void this.run({operation:'approve'})}>{t('Approve exact draft','اعتماد المسودة المطابقة')}</Button>:null}
      {action==='prepare'?<Button variant="primary" disabled={this.state.busy} onClick={()=>void this.run({operation:'prepare'})}>{t('Prepare verified invoice','تجهيز الفاتورة المتحققة')}</Button>:null}
      {action==='submit'&&s?.version?<Button variant="primary" disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'submit',expectedVersion:s.version});}}>{t('Submit in simulation','إرسال في المحاكاة')}</Button>:null}
      {action==='recover'&&s?.version?<Button disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'recover',expectedVersion:s.version});}}>{t('Recover interrupted attempt','استعادة محاولة منقطعة')}</Button>:null}
      {action==='reconcile'&&s?.version?<Button disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'reconcile',expectedVersion:s.version});}}>{t('Verify stored response without resending','تحقق من الاستجابة المحفوظة دون إعادة إرسال')}</Button>:null}
      {s&&!action&&!['cleared','reported'].includes(s.status)?<p className="commercial-empty-note">{t('Further action is unavailable until verification or reconciliation is complete.','الإجراء التالي غير متاح حتى اكتمال التحقق أو المطابقة.')}</p>:null}
      <Button icon="refresh" disabled={this.state.busy} onClick={()=>void this.run({operation:'document-status'})}>{t('Refresh status','تحديث الحالة')}</Button></div>
    </Modal>;
  }
}
