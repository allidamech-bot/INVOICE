import {currentCloudUser} from '../cloud/firebase.js';
import {fiscalProductionProfileClientEnabled,requestProductionProfile} from '../lib/fiscal-production-profile-client.js';
import type {ProductionProfileCommand,ProductionProfileDetails,ProductionProfileStatus,SellerIdScheme} from '../lib/fiscal-production-profile-client.js';
import {t} from '../lib/i18n.js';
import {Button,Field,Input,Select} from './UI.js';
import {FiscalProductionEnrollmentPanel} from './FiscalProductionEnrollmentPanel.js';
type Props={workspaceId:string;commercialRegistration:string;};
type State={busy:boolean;uid:string;status:ProductionProfileStatus|null;details:ProductionProfileDetails;error:string;};
const blank=(cr:string):ProductionProfileDetails=>({street:'',district:'',buildingNumber:'',postalCode:'',sellerIdScheme:cr.trim()?'CRN':'700',otherSellerId:''});
const errorText=(code:string)=>code==='FISCAL_COMPANY_SYNC_REQUIRED'?t('Synchronize the company through the existing cloud workspace first.','زامن بيانات المنشأة عبر مساحة العمل السحابية أولًا.'):code==='FISCAL_PROFILE_STALE'?t('The saved profile changed. Refresh before editing.','تغير الملف المحفوظ. حدّث الحالة قبل التعديل.'):code==='FISCAL_COMPANY_INCOMPLETE'||code==='FISCAL_SELLER_ID_REQUIRED'?t('Review the original company identity fields first.','راجع حقول هوية المنشأة الأصلية أولًا.'):code==='FISCAL_PROFILE_LOCKED'?t('The profile requires administrator review.','يتطلب الملف مراجعة المسؤول.'):t('The result could not be confirmed. Refresh the profile before continuing.','تعذر تأكيد النتيجة. حدّث الملف قبل المتابعة.');
export class FiscalProductionProfilePanel extends React.Component<Props,State>{
  state:State={busy:false,uid:'',status:null,details:blank(this.props.commercialRegistration),error:''};
  private pending:AbortController|null=null;
  componentWillUnmount(){this.pending?.abort();this.pending=null;}
  componentDidUpdate(prev:Props){if(prev.workspaceId!==this.props.workspaceId||prev.commercialRegistration!==this.props.commercialRegistration){this.pending?.abort();this.pending=null;this.setState({busy:false,uid:'',status:null,details:blank(this.props.commercialRegistration),error:''});}}
  private run=async(command:ProductionProfileCommand)=>{
    if(this.pending||!fiscalProductionProfileClientEnabled())return;
    const uid=currentCloudUser()?.uid||'',workspaceId=this.props.workspaceId,controller=new AbortController();this.pending=controller;
    this.setState({busy:true,uid,status:null,details:blank(this.props.commercialRegistration),error:''});
    const current=()=>this.pending===controller&&uid===currentCloudUser()?.uid&&workspaceId===this.props.workspaceId;
    const timer=window.setTimeout(()=>controller.abort(),20000);
    try{const status=await requestProductionProfile(workspaceId,command,controller.signal);if(current())this.setState({status,details:status.details??blank(this.props.commercialRegistration)});}
    catch(e){if(current())this.setState({error:errorText(e instanceof Error?e.message:'')});}
    finally{window.clearTimeout(timer);if(this.pending===controller){this.pending=null;this.setState({busy:false});}}
  };
  private setField=(key:keyof ProductionProfileDetails,value:string)=>this.setState(state=>({details:{...state.details,[key]:value}}));
  render():any{
    if(!fiscalProductionProfileClientEnabled())return null;
    const own=this.state.uid===currentCloudUser()?.uid,s=own?this.state.status:null,d=this.state.details,cr=Boolean(this.props.commercialRegistration.trim()),ready=!!s&&Object.values(s.checks).every(Boolean),scheme=cr?'CRN':d.sellerIdScheme==='CRN'?'700':d.sellerIdScheme;
    const details:ProductionProfileDetails={...d,sellerIdScheme:scheme as SellerIdScheme,otherSellerId:scheme==='CRN'?'':d.otherSellerId};
    const complete=ready&&Boolean(d.street.trim()&&d.district.trim())&&/^\d{4}$/.test(d.buildingNumber)&&/^\d{5}$/.test(d.postalCode)&&(scheme==='CRN'||/^[A-Za-z0-9]{1,80}$/.test(d.otherSellerId.trim()));
    return <div aria-label={t('Company fiscal registration','تسجيل الملف الضريبي للمنشأة')} aria-busy={this.state.busy}>
      <p><strong>{t('Company fiscal registration','تسجيل الملف الضريبي للمنشأة')}</strong></p>
      <p className="commercial-empty-note">{t('Complete the existing company profile, then save the structured national address. Tax eligibility, certificate issuance and official activation are separate verified steps.','أكمل ملف المنشأة الحالي ثم احفظ العنوان الوطني المفصل. التحقق من الخضوع وإصدار الشهادة والتفعيل الرسمي مراحل مستقلة.')}</p>
      <Button icon="refresh" disabled={this.state.busy} onClick={()=>void this.run({operation:'inspect'})}>{this.state.busy?t('Working…','جارٍ التنفيذ…'):t('Refresh fiscal profile','تحديث الملف الضريبي')}</Button>
      {own&&this.state.error?<p role="alert">{this.state.error}</p>:null}
      {s?<div>
        <p role="status">{t('Profile status','حالة الملف')}: <strong>{s.state==='pending-verification'?t('Saved · awaiting verification','محفوظ · بانتظار التحقق'):s.state==='profile-changed'?t('Company identity changed · save again','تغيرت هوية المنشأة · أعد الحفظ'):t('Not registered','غير مسجل')}</strong></p>
        <p>{t('Applicable tax regime','النظام الضريبي المنطبق')}: {t('Not verified','غير متحقق منه')}</p>
        {!ready?<p className="commercial-empty-note">{t('The published company country, Arabic legal name, VAT number format and city must be complete.','يجب إكمال دولة المنشأة والاسم القانوني بالعربية وصيغة الرقم الضريبي والمدينة في الملف المنشور.')}</p>:null}
        <div className="form-grid">
          <Field label={t('Street name','اسم الشارع')}><Input disabled={!ready||this.state.busy} value={d.street} maxLength={250} onChange={(e:any)=>this.setField('street',e.target.value)}/></Field>
          <Field label={t('District','الحي')}><Input disabled={!ready||this.state.busy} value={d.district} maxLength={250} onChange={(e:any)=>this.setField('district',e.target.value)}/></Field>
          <Field label={t('Building number','رقم المبنى')}><Input disabled={!ready||this.state.busy} dir="ltr" inputMode="numeric" value={d.buildingNumber} maxLength={4} onChange={(e:any)=>this.setField('buildingNumber',String(e.target.value).replace(/\D/g,'').slice(0,4))}/></Field>
          <Field label={t('Postal code','الرمز البريدي')}><Input disabled={!ready||this.state.busy} dir="ltr" inputMode="numeric" value={d.postalCode} maxLength={5} onChange={(e:any)=>this.setField('postalCode',String(e.target.value).replace(/\D/g,'').slice(0,5))}/></Field>
          {cr?<p>{t('Seller identification: commercial registration from the existing company profile.','معرّف البائع: السجل التجاري من ملف المنشأة الحالي.')}</p>:<>
            <Field label={t('Seller identifier type','نوع معرّف البائع')}><Select disabled={!ready||this.state.busy} value={scheme} onChange={(e:any)=>this.setField('sellerIdScheme',e.target.value)}><option value="MOM">{t('Municipal license','رخصة البلدية')}</option><option value="MLS">{t('HRSD license','رخصة الموارد البشرية')}</option><option value="700">{t('Unified number (700)','الرقم الموحد (700)')}</option><option value="SAG">{t('Investment license','رخصة الاستثمار')}</option><option value="OTH">{t('Other identification','معرّف آخر')}</option></Select></Field>
            <Field label={t('Seller identifier','معرّف البائع')}><Input disabled={!ready||this.state.busy} dir="ltr" value={d.otherSellerId} maxLength={80} onChange={(e:any)=>this.setField('otherSellerId',e.target.value)}/></Field>
          </>}
        </div>
        <Button variant="primary" disabled={!complete||this.state.busy} onClick={()=>void this.run({operation:'save',expectedVersion:s.version,details})}>{t('Save fiscal profile','حفظ الملف الضريبي')}</Button>
      </div>:null}
      {s?.state==='pending-verification'&&ready?<FiscalProductionEnrollmentPanel key={this.props.workspaceId+'-'+s.version} workspaceId={this.props.workspaceId}/>:<p className="commercial-empty-note">{t('Complete and save the company profile before connecting to the authority.','أكمل ملف المنشأة واحفظه قبل الربط بالهيئة.')}</p>}
    </div>;
  }
}
