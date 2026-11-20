import {currentCloudUser} from '../cloud/firebase.js';
import {fiscalProductionProfileClientEnabled} from '../lib/fiscal-production-profile-client.js';
import {requestProductionEnrollment,productionEnrollmentNextAction} from '../lib/fiscal-production-enrollment-client.js';
import type {ProductionEnrollmentStatus,ProductionEnrollmentCommand} from '../lib/fiscal-production-enrollment-client.js';
import {t} from '../lib/i18n.js';
import {Button,Field,Input,Select} from './UI.js';
interface Props{workspaceId:string;}
interface State{busy:boolean;uid:string;status:ProductionEnrollmentStatus|null;selected:string;requestBranch:string;functionalityMap:'1000'|'0100'|'1100';businessCategory:string;otp:string;error:string;}
const labels:Record<string,[string,string]>={'not-started':['Not connected','غير مرتبطة'],'checking':['Compliance checks in progress','فحوصات الامتثال جارية'],'checks-complete':['Compliance checks complete','اكتملت فحوصات الامتثال'],'restart-required':['Review required','تحتاج مراجعة'],'operational-request-held':['Certificate request held','طلب الشهادة معلق'],'operational-recorded':['Certificate recorded','حُفظت شهادة التشغيل'],'unavailable':['Verification unavailable','التحقق غير متاح']};
const initial=():State=>({busy:false,uid:'',status:null,selected:'',requestBranch:'',functionalityMap:'1100',businessCategory:'',otp:'',error:''});
export class FiscalProductionEnrollmentPanel extends React.Component<Props,State>{
 state:State=initial();
 private pending:AbortController|null=null;
 componentDidMount(){void this.run({operation:'enrollment-status'});}
 componentWillUnmount(){this.pending?.abort();this.pending=null;}
 componentDidUpdate(prev:Props){if(prev.workspaceId!==this.props.workspaceId){this.pending?.abort();this.pending=null;this.setState(initial(),()=>void this.run({operation:'enrollment-status'}));}}
 private run=async(action:ProductionEnrollmentCommand)=>{
   if(this.pending||!fiscalProductionProfileClientEnabled())return;
   const controller=new AbortController(),uid=currentCloudUser()?.uid||'',workspaceId=this.props.workspaceId;
   this.pending=controller;
   const previous=this.state.uid===uid?this.state.selected:'';
   this.setState({busy:true,uid,status:null,selected:'',otp:'',error:''});
   const current=()=>this.pending===controller&&uid===currentCloudUser()?.uid&&workspaceId===this.props.workspaceId;
   const timer=window.setTimeout(()=>controller.abort(),90000);
   try{
     const result=await requestProductionEnrollment(workspaceId,action,controller.signal);
     const status=action.operation==='enrollment-status'?result:await requestProductionEnrollment(workspaceId,{operation:'enrollment-status'},controller.signal);
     if(current()&&status)this.setState({status,selected:status.units.some(x=>x.egsId===previous)?previous:status.units.length===1?status.units[0].egsId:''});
   }catch{if(current())this.setState({error:t('Connection status could not be confirmed. Refresh before proceeding. Do not repeat an interrupted certificate request.','تعذر تأكيد حالة الربط. حدّث الحالة قبل المتابعة ولا تكرر طلب شهادة انقطع الاتصال أثناءه.')});}
   finally{window.clearTimeout(timer);if(this.pending===controller){this.pending=null;this.setState({busy:false});}}
 };
 render():any{
   if(!fiscalProductionProfileClientEnabled())return null;
   const own=this.state.uid===currentCloudUser()?.uid,s=own?this.state.status:null,u=s?.units.find(x=>x.egsId===this.state.selected),action=u&&s?productionEnrollmentNextAction(s,u):null;
   return <div aria-label={t('Official ZATCA connection','الربط الرسمي مع هيئة الزكاة والضريبة والجمارك')} aria-busy={this.state.busy}>
    <p><strong>{t('Official ZATCA connection','الربط الرسمي مع ZATCA')}</strong></p>
    <Button icon="refresh" disabled={this.state.busy} onClick={()=>void this.run({operation:'enrollment-status'})}>{this.state.busy?t('Working…','جارٍ التنفيذ…'):t('Refresh connection status','تحديث حالة الربط')}</Button>
    {own&&this.state.error?<p role="alert">{this.state.error}</p>:null}
    {s?<div>
      {!s.available?<p role="status">{t('The secure registration service is not configured yet. Do not generate an OTP.','خدمة التسجيل الآمنة غير مهيأة حاليًا. لا تستخرج رمز التفعيل الآن.')}</p>:!s.registeredUnits?<p role="status">{t('No verified invoicing unit is registered for this company. Complete the company verification and unit setup first.','لا توجد وحدة فوترة متحقق منها لهذه المنشأة. أكمل التحقق من المنشأة وتجهيز وحدة الفوترة أولًا.')}</p>:null}
      {s.branches.some(b=>b.state==='pending')?<div role="status">{s.branches.filter(b=>b.state==='pending').map(b=><p key={b.branchId}>{b.label}: {t('Registration request received · awaiting verification','تم استلام طلب التسجيل · بانتظار التحقق')}</p>)}</div>:null}
      {s.profileVersion>0&&s.branches.some(b=>b.state==='not-requested')?<div className="form-grid">
        <Field label={t('Branch for registration','الفرع المراد تسجيله')}><Select value={this.state.requestBranch} disabled={this.state.busy} onChange={(e:any)=>this.setState({requestBranch:String(e.target.value)})}><option value="">{t('Choose branch','اختر الفرع')}</option>{s.branches.filter(b=>b.state==='not-requested').map(b=><option key={b.branchId} value={b.branchId}>{b.label}</option>)}</Select></Field>
        <Field label={t('Invoice types','أنواع الفواتير')}><Select value={this.state.functionalityMap} disabled={this.state.busy} onChange={(e:any)=>{const v=String(e.target.value);if(v==='1000'||v==='0100'||v==='1100')this.setState({functionalityMap:v});}}><option value="1100">{t('Standard and simplified','ضريبية ومبسطة')}</option><option value="1000">{t('Standard','ضريبية')}</option><option value="0100">{t('Simplified','مبسطة')}</option></Select></Field>
        <Field label={t('Registered business activity','النشاط التجاري المسجل')}><Input value={this.state.businessCategory} maxLength={250} disabled={this.state.busy} onChange={(e:any)=>this.setState({businessCategory:String(e.target.value)})}/></Field>
        <Button variant="primary" disabled={this.state.busy||!s.branches.some(b=>b.branchId===this.state.requestBranch&&b.state==='not-requested')||!this.state.businessCategory.trim()} onClick={()=>void this.run({operation:'enrollment-request',branchId:this.state.requestBranch,expectedProfileVersion:s.profileVersion,functionalityMap:this.state.functionalityMap,businessCategory:this.state.businessCategory.trim()})}>{t('Request registration','طلب تسجيل المنشأة')}</Button>
      </div>:null}
      {s.units.length>1?<Field label={t('Invoicing unit','وحدة الفوترة')}><Select value={this.state.selected} disabled={this.state.busy} onChange={(e:any)=>this.setState({selected:String(e.target.value),otp:''})}><option value="">{t('Select invoicing unit','اختر وحدة الفوترة')}</option>{s.units.map(x=><option key={x.egsId} value={x.egsId}>{x.branchId+' · '+x.egsId}</option>)}</Select></Field>:null}
      {u?<div role="status">
        <p>{t('Invoicing unit','وحدة الفوترة')}: <strong>{u.unitActive?t('Activated','مفعّلة'):t(...labels[u.state])}</strong></p>
        <p>{t('Compliance checks','فحوصات الامتثال')}: {u.required?u.passed+' / '+u.required:'—'}</p>
        {u.enrollmentHeld?<p role="alert">{t('A held request requires reconciliation. Do not submit again.','هناك طلب معلق يحتاج إلى مطابقة. لا تعد الإرسال.')}</p>:null}
      </div>:null}
      {action==='enrollment-begin'&&u?<div>
        <p>{t('Sign in to FATOORA as this taxpayer, choose Onboard new solution unit/device, generate an OTP for this unit, then enter it below.','سجّل الدخول إلى بوابة فاتورة بحساب هذه المنشأة، واختر تسجيل وحدة فوترة جديدة، ثم استخرج رمز التفعيل لهذه الوحدة وأدخله هنا.')}</p>
        <a href="https://fatoora.zatca.gov.sa/" target="_blank" rel="noopener noreferrer">{t('Official FATOORA portal','بوابة فاتورة الرسمية')}</a>
        <Field label={t('Activation code (OTP)','رمز التفعيل (OTP)')}><Input type="password" autoComplete="off" inputMode="numeric" dir="ltr" maxLength={6} value={this.state.otp} disabled={this.state.busy} onChange={(e:any)=>this.setState({otp:String(e.target.value).replace(/\D/g,'').slice(0,6)})}/></Field>
        <Button variant="primary" disabled={this.state.busy||!/^\d{6}$/.test(this.state.otp)} onClick={()=>void this.run({operation:action,egsId:u.egsId,otp:this.state.otp})}>{t('Connect company','ربط المنشأة')}</Button>
      </div>:null}
      {u&&action&&action!=='enrollment-begin'?<Button variant="primary" disabled={this.state.busy} onClick={()=>void this.run({operation:action,egsId:u.egsId,expectedVersion:u.version})}>{action==='enrollment-check'?t('Run next compliance check','تشغيل فحص الامتثال التالي'):action==='enrollment-operational'?t('Request operational certificate','طلب شهادة التشغيل'):t('Verify and activate unit','التحقق وتفعيل الوحدة')}</Button>:null}
      <p className="commercial-empty-note">{s.issuanceEnabled?t('The official issuance service is configured and an invoicing unit is active. Each invoice must still pass its own verification.','خدمة الإصدار الرسمي مهيأة وتوجد وحدة فوترة مفعلة. تبقى كل فاتورة خاضعة للتحقق الخاص بها.'):t('Official invoice issuance is not ready. Complete connection and secure service configuration.','الإصدار الرسمي غير جاهز. أكمل الربط وتهيئة الخدمة الآمنة.')}</p>
    </div>:null}
   </div>;
 }
}
