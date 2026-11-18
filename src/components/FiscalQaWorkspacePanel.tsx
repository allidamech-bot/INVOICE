import {fiscalQaClientEnabled,requestFiscalQa,fiscalQaNextAction} from '../lib/fiscal-qa-client.js';
import type {FiscalQaCommand,FiscalQaStatus} from '../lib/fiscal-qa-client.js';
import {t} from '../lib/i18n.js';
import {Button,Field,Input} from './UI.js';
interface Props{workspaceId:string;}
interface State{busy:boolean;status:FiscalQaStatus|null;otp:string;error:string;}
function stateLabel(state:string):string{
  switch(state){
    case 'checking':return t('Compliance checks in progress','فحوصات الامتثال جارية');
    case 'checks-complete':return t('Compliance checks complete','اكتملت فحوصات الامتثال');
    case 'restart-required':return t('Review required before restarting','تلزم مراجعة قبل إعادة البدء');
    case 'operational-request-held':return t('Certificate request held for reconciliation','طلب الشهادة معلق للمطابقة');
    case 'operational-recorded':return t('Certificate recorded; activation pending','حُفظت الشهادة؛ التفعيل معلق');
    default:return t('Not registered','غير مسجلة');
  }
}
export class FiscalQaWorkspacePanel extends React.Component<Props,State>{
  state:State={busy:false,status:null,otp:'',error:''};
  private pending:AbortController|null=null;
  componentWillUnmount(){this.pending?.abort();this.pending=null;}
  componentDidUpdate(prev:Props){if(prev.workspaceId!==this.props.workspaceId){this.pending?.abort();this.pending=null;this.setState({busy:false,status:null,otp:'',error:''});}}
  private run=async(command:FiscalQaCommand)=>{
    if(this.pending||!fiscalQaClientEnabled())return;
    const controller=new AbortController(),workspaceId=this.props.workspaceId;
    this.pending=controller;this.setState({busy:true,status:null,otp:'',error:''});
    const current=()=>this.pending===controller&&!controller.signal.aborted&&workspaceId===this.props.workspaceId;
    try{
      const result=await requestFiscalQa(workspaceId,command,controller.signal);
      const status=command.operation==='inspect'?result:await requestFiscalQa(workspaceId,{operation:'inspect'},controller.signal);
      if(current())this.setState({status});
    }catch{if(current())this.setState({error:t('Result not confirmed. Refresh status before continuing; do not repeat an interrupted certificate request.','لم تتأكد النتيجة. حدّث الحالة قبل المتابعة؛ لا تكرر طلب شهادة انقطع الاتصال أثناءه.')});}
    finally{if(current()){this.pending=null;this.setState({busy:false});}}
  };
  render():any{
    if(!fiscalQaClientEnabled())return null;
    const s=this.state.status,o=s?.onboarding,action=s?fiscalQaNextAction(s):null;
    const yesNo=(v:boolean)=>v?t('Available in test','متاح في الاختبار'):t('Not available','غير متاح');
    return <article className="commercial-row-card" aria-label={t('Fiscal simulation','محاكاة الفوترة')} aria-busy={this.state.busy}>
      <header><strong>{t('ZATCA · isolated test environment','ZATCA · بيئة اختبار معزولة')}</strong></header>
      <p className="commercial-empty-note">{t('Test data only. Real taxpayer transactions are disabled.','بيانات اختبار فقط. المعاملات الفعلية للمكلفين معطّلة.')}</p>
      <Button icon="refresh" disabled={this.state.busy} onClick={()=>void this.run({operation:'inspect'})}>{this.state.busy?t('Working…','جارٍ التنفيذ…'):t('Refresh connection status','تحديث حالة الربط')}</Button>
      {this.state.error?<p role="alert">{this.state.error}</p>:null}
      {s?<div>
        <div role="status" aria-live="polite"><p>{t('Invoicing unit','وحدة الفوترة')}: <strong>{s.unitActive?t('Test active','نشطة في الاختبار'):t('Inactive','غير نشطة')}</strong></p>
        <p>{t('Registration','التسجيل')}: <strong>{s.enrollmentHeld?t('Request held for reconciliation','طلب معلق للمطابقة'):stateLabel(o?.state||'')}</strong></p>
        <p>{t('Compliance documents','مستندات الامتثال')}: <strong>{o?o.passed+' / '+o.required:'—'}</strong></p>
        <p>{t('Registration commands','أوامر التسجيل')}: {yesNo(s.capabilities.enrollment)}</p>
        <p>{t('Invoice preparation','تجهيز الفاتورة')}: {yesNo(s.capabilities.preparation)}</p>
        <p>{t('Authority submission','الإرسال للهيئة')}: {yesNo(s.capabilities.submission)}</p></div>
        {action==='enroll'?<div className="form-grid"><Field label={t('Test activation OTP','رمز تفعيل الاختبار')}><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" value={this.state.otp} onChange={(e:any)=>this.setState({otp:String(e.target.value).replace(/\D/g,'').slice(0,6)})}/></Field>
        <Button disabled={this.state.busy||!/^\d{6}$/.test(this.state.otp)} onClick={()=>void this.run({operation:'enroll',otp:this.state.otp})}>{t('Request compliance certificate','طلب شهادة الامتثال')}</Button></div>:null}
        {action==='check'&&o?<Button disabled={this.state.busy} onClick={()=>void this.run({operation:'check',expectedVersion:o.version})}>{t('Run next compliance check','تشغيل فحص الامتثال التالي')}</Button>:null}
        {action==='operational'&&o?<Button disabled={this.state.busy} onClick={()=>void this.run({operation:'operational',expectedVersion:o.version})}>{t('Request operational certificate','طلب شهادة التشغيل')}</Button>:null}
        {s.enrollmentHeld?<p role="alert">{t('An earlier request is unresolved. Contact the administrator to reconcile it before continuing.','يوجد طلب سابق غير محسوم. يجب على المسؤول مطابقته قبل المتابعة.')}</p>:null}
        {!s.capabilities.enrollment?<p className="commercial-empty-note">{t('Registration is blocked until the official verification services are configured.','التسجيل محظور حتى تهيئة خدمات التحقق الرسمية.')}</p>:null}
      </div>:null}
    </article>;
  }
}
