import type {LourexDocument} from '../types.js';
import {t} from '../lib/i18n.js';
import {fiscalDocumentNextAction,requestFiscalDocument,fetchFiscalArtifact,fiscalDocumentEnvironment} from '../lib/fiscal-document-client.js';
import type {FiscalDocumentState,FiscalDocumentAction,FiscalReviewFields} from '../lib/fiscal-document-client.js';
import {Button,Field,Input,Modal,Select} from './UI.js';
interface Props{document:LourexDocument;onPublish:(doc:LourexDocument)=>Promise<LourexDocument>;onPosted?:(doc:LourexDocument)=>Promise<LourexDocument>;onClose:()=>void;}
interface State{busy:boolean;status:FiscalDocumentState|null;error:string;invoiceType:''|FiscalReviewFields['invoiceType'];supplyDate:string;paymentMeans:''|FiscalReviewFields['paymentMeans'];}
const labels:Record<string,[string,string]>={'not-reviewed':['Awaiting review','بانتظار المراجعة'],reviewed:['Reviewed','تمت المراجعة'],approved:['Approved, not issued','معتمدة داخليًا، لم تصدر'],queued:['Queued, not accepted','بانتظار الإرسال، لم تقبل بعد'],submitting:['Submission in progress','الإرسال جارٍ'],uncertain:['Requires reconciliation','تحتاج مطابقة'],retryable:['Requires authorized retry','تحتاج إعادة محاولة مصرح بها'],rejected:['Rejected','مرفوضة'],cleared:['Cleared in simulation','مقبولة في المحاكاة'],reported:['Reported in simulation','مبلّغ عنها في المحاكاة']};
export class FiscalIssueDialog extends React.Component<Props,State>{
  state:State={busy:false,status:null,error:'',invoiceType:'',supplyDate:'',paymentMeans:''};
  private pending:AbortController|null=null;
  private published:LourexDocument|null=null;
  private synchronized=false;
  componentDidMount(){void this.run({operation:'document-status'});}
  componentWillUnmount(){this.pending?.abort();this.pending=null;}
  private run=async(action:FiscalDocumentAction)=>{
    if(this.pending)return;const controller=new AbortController();this.pending=controller;this.setState({busy:true,error:''});
    try{
      if(!this.published)this.published=await this.props.onPublish(this.props.document);
      if(controller.signal.aborted)return;
      const doc=this.published,result=await requestFiscalDocument(doc,action,controller.signal);
      const status=action.operation==='document-status'?result:await requestFiscalDocument(doc,{operation:'document-status'},controller.signal);
      if(this.pending===controller&&!controller.signal.aborted){
        this.setState({status});
        if(status?.commercialPosted&&fiscalDocumentEnvironment(doc)==='production'&&!this.synchronized&&this.props.onPosted){
          try{this.published=await this.props.onPosted(doc);this.synchronized=true;}
          catch{if(this.pending===controller&&!controller.signal.aborted)this.setState({error:t('The invoice is posted on the server. Local synchronization is incomplete. Refresh status without sending again.','تم ترحيل الفاتورة على الخادم. المزامنة المحلية غير مكتملة. حدّث الحالة دون إعادة الإرسال.')});}
        }
      }
    }catch{if(this.pending===controller&&!controller.signal.aborted)this.setState({status:null,error:t('Fiscal action was not confirmed. Verify approved party profiles and cloud synchronization, then refresh status. Never repeat an uncertain submission.','لم يتأكد إجراء الفوترة. تحقق من ملفات الأطراف المعتمدة والمزامنة السحابية ثم حدّث الحالة. لا تكرر إرسالًا غير محسوم.')});}
    finally{if(this.pending===controller){this.pending=null;this.setState({busy:false});}}
  };
  private download=async(format:'xml'|'pdf')=>{
    if(this.pending||!this.published)return;
    const controller=new AbortController();this.pending=controller;this.setState({busy:true,error:''});
    try{
      const file=await fetchFiscalArtifact(this.published,format,controller.signal);
      if(this.pending!==controller||controller.signal.aborted)return;
      const url=URL.createObjectURL(file),anchor=window.document.createElement('a');
      anchor.href=url;anchor.download=file.name;anchor.rel='noopener';window.document.body.appendChild(anchor);
      try{anchor.click();}finally{anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
    }catch{if(this.pending===controller&&!controller.signal.aborted)this.setState({error:t('The verified artifact could not be retrieved.','تعذر استرداد المستند المتحقق منه.')});}
    finally{if(this.pending===controller){this.pending=null;this.setState({busy:false});}}
  };
  render():any{
    const live=fiscalDocumentEnvironment(this.props.document)==='production';
    const s=this.state.status,response=s?.response,receipt=response?.response,action=s?fiscalDocumentNextAction(s):null,l:[string,string]|null=s?(live&&s.status==='cleared'?['Cleared by ZATCA','اعتمدتها الهيئة']:live&&s.status==='reported'?['Reported to ZATCA','تم الإبلاغ عنها للهيئة']:(labels[s.status]??['Status unavailable','الحالة غير متاحة'])):null,ready=this.state.invoiceType&&this.state.supplyDate&&this.state.paymentMeans;
    return <Modal open={true} title={live?t('Saudi e-invoicing','الفوترة الإلكترونية السعودية'):t('Saudi e-invoicing · test issuance','الفوترة السعودية · إصدار تجريبي')} onClose={()=>{if(!this.state.busy)this.props.onClose();}} footer={<Button disabled={this.state.busy} onClick={this.props.onClose}>{t('Close','إغلاق')}</Button>}>
      <div aria-busy={this.state.busy}><p>{live?t('Official issuance requires an active verified unit and the protected server. Do not repeat an uncertain submission.','يتطلب الإصدار الرسمي وحدة فوترة مفعلة وخادمًا متحققًا منه. لا تكرر إرسالًا غير محسوم.'):t('This is an isolated simulation. Accepted ordinary domestic invoices can be posted to the protected workspace once.','هذه محاكاة معزولة. يمكن ترحيل الفاتورة المحلية العادية المقبولة مرة واحدة إلى مساحة العمل المحمية.')}</p>
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
      {action==='submit'&&s?.version?<Button variant="primary" disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'submit',expectedVersion:s.version});}}>{live?t('Submit to ZATCA','إرسال إلى الهيئة'):t('Submit in simulation','إرسال في المحاكاة')}</Button>:null}
      {action==='recover'&&s?.version?<Button disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'recover',expectedVersion:s.version});}}>{t('Recover interrupted attempt','استعادة محاولة منقطعة')}</Button>:null}
      {action==='reconcile'&&s?.version?<Button disabled={this.state.busy} onClick={()=>{if(s.version)void this.run({operation:'reconcile',expectedVersion:s.version});}}>{t('Verify stored response without resending','تحقق من الاستجابة المحفوظة دون إعادة إرسال')}</Button>:null}
      {s?.commercialPosted?<p role="status">{t('Posted to accounting and stock','تم الترحيل إلى المحاسبة والمخزون')}</p>:null}
      {s?.artifacts.xml&&!s.commercialPosted?<Button variant="primary" disabled={this.state.busy} onClick={()=>void this.run({operation:'post-sale'})}>{t('Post accepted invoice to accounting','ترحيل المستند المقبول محاسبياً')}</Button>:null}
      {s?.artifacts.xml?<div className="commercial-row-card"><strong>{t('Verified fiscal artifacts','المستندات الضريبية المتحقق منها')}</strong>
        <Button disabled={this.state.busy} icon="download" onClick={()=>void this.download('xml')}>{t('Download accepted XML','تنزيل XML المقبول')}</Button>
        {s.artifacts.pdf?<Button icon="download" disabled={this.state.busy} onClick={()=>void this.download('pdf')}>{t('Download verified PDF','تنزيل PDF المتحقق منه')}</Button>:<p>{t('PDF unavailable until independent PDF/A and signature verification is complete.','PDF غير متاح حتى اكتمال التحقق المستقل من PDF/A والتوقيع.')}</p>}
      </div>:null}
      {live&&s?.status==='not-reviewed'&&!s.capabilities.review?<p role="alert">{t('Official issuance is unavailable for this invoice. Check company registration and the invoicing unit in Settings.','الإصدار الرسمي غير متاح لهذه الفاتورة. تحقق من تسجيل المنشأة ووحدة الفوترة في الإعدادات.')}</p>:null}
      {s&&!action&&!['cleared','reported'].includes(s.status)?<p className="commercial-empty-note">{t('Further action is unavailable until verification or reconciliation is complete.','الإجراء التالي غير متاح حتى اكتمال التحقق أو المطابقة.')}</p>:null}
      <Button icon="refresh" disabled={this.state.busy} onClick={()=>void this.run({operation:'document-status'})}>{t('Refresh status','تحديث الحالة')}</Button></div>
    </Modal>;
  }
}
