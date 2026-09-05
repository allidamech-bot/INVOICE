import type { AppSettings, CompanySettings } from '../types.js';
import { cleanImageDataUrl, fileToDataUrl, fileToRawDataUrl } from '../lib/files.js';
import type { CompanyAssetKind } from '../lib/files.js';
import { repairLogoDataUrl } from '../lib/logo-repair.js';
import { rebuildLogoWithoutBackgroundDataUrl } from '../lib/logo-rebuild.js';
import { t } from '../lib/i18n.js';
import { validateCommercialCompany } from '../lib/commercial-controls.js';
import type { CloudUser } from '../cloud/firebase.js';
import { CommercialControlsSettings } from './CommercialControlsSettings.js';
import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea, Icon } from './UI.js';

interface Props {
  open:boolean; company:CompanySettings; appSettings:AppSettings; onClose:()=>void;
  onSaveCompany:(company:CompanySettings)=>Promise<void>; onSaveAppSettings:(settings:AppSettings)=>Promise<void>;
  onChangePin:(currentPin:string,newPin:string)=>Promise<void>; onLock:()=>void;
  cloudUser:CloudUser|null; onCloudRestore:()=>Promise<void>; onCloudSignOut:()=>Promise<void>;
  // Retained only for compatibility with older App bundles. Manual backup/restore
  // controls are intentionally not rendered anymore.
  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>;
}
interface State {
  tab:'company'|'commercial'|'documents'|'security'; company:CompanySettings; appSettings:AppSettings; busy:boolean; cleaningAssets:boolean; message:string; error:string;
  savedSection:'company'|'documents'|null; currentPin:string; newPin:string; confirmPin:string; confirmClose:boolean; confirmCloudRestore:boolean;
  accountAction:''|'restore'|'signout'; companyInitial:string; documentsInitial:string;
  logoOriginalDataUrl:string; logoCleanedDataUrl:string; logoRebuiltDataUrl:string; logoMode:'auto'|'rebuild'|'original';
}

type AssetField='logoDataUrl'|'signatureDataUrl'|'stampDataUrl';
const MAX_COMPANY_ASSET_BYTES=4*1024*1024;
const COMPANY_ASSET_TYPES=/^image\/(png|webp|jpeg)$/i;

export class SettingsModal extends React.Component<Props,State> {
  private assetPreparationId=0;
  constructor(props:Props){
    super(props);
    const company=structuredClone(props.company);
    const appSettings=structuredClone(props.appSettings);
    this.state={tab:'company',company,appSettings,busy:false,cleaningAssets:false,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',confirmClose:false,confirmCloudRestore:false,accountAction:'',companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'auto'};
  }
  componentDidUpdate(prev:Props):void{
    if(!this.props.open&&prev.open)this.assetPreparationId+=1;
    if(this.props.open&&!prev.open){
      const company=structuredClone(this.props.company);
      const appSettings=structuredClone(this.props.appSettings);
      const preparationId=++this.assetPreparationId;
      this.setState({company,appSettings,busy:false,cleaningAssets:false,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',confirmClose:false,confirmCloudRestore:false,accountAction:'',companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'auto'},()=>void this.prepareExistingAssets(company,preparationId));
    }
  }
  private hasUnsavedSettings=()=>JSON.stringify(this.state.company)!==this.state.companyInitial||JSON.stringify(this.state.appSettings)!==this.state.documentsInitial;
  private requestClose=()=>{if(this.hasUnsavedSettings()){this.setState({confirmClose:true});return;}this.props.onClose();};
  private discardAndClose=()=>this.setState({confirmClose:false},this.props.onClose);
  private setCompany=(key:keyof CompanySettings,value:any)=>this.setState({company:{...this.state.company,[key]:value},savedSection:null,message:'',error:''});
  private setBank=(key:keyof CompanySettings['bank'],value:string)=>this.setState({company:{...this.state.company,bank:{...this.state.company.bank,[key]:value}},savedSection:null,message:'',error:''});
  private setNumbering=(key:keyof AppSettings['numbering'],value:any)=>this.setState({appSettings:{...this.state.appSettings,numbering:{...this.state.appSettings.numbering,[key]:value}},savedSection:null,message:'',error:''});
  private assetKind=(field:AssetField):CompanyAssetKind=>field==='logoDataUrl'?'logo':field==='signatureDataUrl'?'signature':'stamp';
  private cleanCompanyAssets=async(company:CompanySettings):Promise<CompanySettings>=>{
    const [signatureDataUrl,stampDataUrl]=await Promise.all([cleanImageDataUrl(company.signatureDataUrl,'signature'),cleanImageDataUrl(company.stampDataUrl,'stamp')]);
    return {...company,signatureDataUrl,stampDataUrl};
  };
  private prepareExistingAssets=async(source:CompanySettings,preparationId:number)=>{
    if(!this.props.open||preparationId!==this.assetPreparationId)return;
    this.setState({cleaningAssets:true});
    const [cleaned,repairedLogo]=await Promise.all([this.cleanCompanyAssets(source),repairLogoDataUrl(source.logoDataUrl)]);
    if(!this.props.open||preparationId!==this.assetPreparationId)return;
    this.setState(state=>{
      const company={...state.company};
      let changed=false,logoChanged=false;
      const hasSavedLogo=Boolean(source.logoDataUrl&&!source.logoDataUrl.includes('lourex-logo.svg'));
      const logoOriginalDataUrl=hasSavedLogo?source.logoDataUrl:state.logoOriginalDataUrl;
      const logoCleanedDataUrl=hasSavedLogo?repairedLogo:state.logoCleanedDataUrl;
      const logoRebuiltDataUrl='';
      let logoMode:State['logoMode']=hasSavedLogo&&repairedLogo===source.logoDataUrl?'original':state.logoMode;
      if(source.logoDataUrl&&state.company.logoDataUrl===source.logoDataUrl&&repairedLogo!==source.logoDataUrl){company.logoDataUrl=repairedLogo;logoMode='auto';changed=true;logoChanged=true;}
      const fields:AssetField[]=['signatureDataUrl','stampDataUrl'];
      for(const field of fields){if(state.company[field]===source[field]&&cleaned[field]!==source[field]){company[field]=cleaned[field];changed=true;}}
      const message=logoChanged?t('The saved logo was re-cleaned. If any background remains, use Recreate logo without background.','تمت إعادة تنظيف الشعار المحفوظ. إذا بقيت أي خلفية استخدم خيار إعادة إنشاء الشعار بدون خلفية.'):changed?t('Signature and stamp backgrounds cleaned. Review the previews and save.','تم تنظيف خلفية التوقيع والختم. راجع المعاينات ثم اضغط حفظ.'):state.message;
      return {company,logoOriginalDataUrl,logoCleanedDataUrl,logoRebuiltDataUrl,logoMode,cleaningAssets:false,savedSection:changed?null:state.savedSection,message,error:''};
    });
  };
  private selectAsset=(field:AssetField,input:HTMLInputElement)=>{const file=input.files?.[0];input.value='';void this.upload(field,file);};
  private clearAsset=(field:AssetField)=>{
    this.assetPreparationId+=1;
    this.setState(state=>({...state,company:{...state.company,[field]:''},...(field==='logoDataUrl'?{logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'auto' as const}:{}),cleaningAssets:false,savedSection:null,message:t('Artwork removed from this draft. Save Company to apply the change.','تمت إزالة الصورة من هذه المسودة. اضغط حفظ الشركة لتطبيق التغيير.'),error:''}));
  };
  private upload=async(field:AssetField,file?:File)=>{
    if(!file)return;
    const preparationId=++this.assetPreparationId;
    if(file.size>MAX_COMPANY_ASSET_BYTES){this.setState({cleaningAssets:false,error:t('Image is too large. Use a file smaller than 4 MB.','حجم الصورة كبير جدًا. استخدم ملفًا أصغر من 4 ميجابايت.'),message:''});return;}
    if(!COMPANY_ASSET_TYPES.test(file.type)){this.setState({cleaningAssets:false,error:t('Use a PNG, WebP, or JPEG image.','استخدم صورة بصيغة PNG أو WebP أو JPEG.'),message:''});return;}
    this.setState({cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      if(field==='logoDataUrl'){
        const original=await fileToRawDataUrl(file);
        const firstPass=await cleanImageDataUrl(original,'logo');
        const cleaned=await repairLogoDataUrl(firstPass);
        if(!this.props.open||preparationId!==this.assetPreparationId)return;
        this.setState(state=>({company:{...state.company,logoDataUrl:cleaned},logoOriginalDataUrl:original,logoCleanedDataUrl:cleaned,logoRebuiltDataUrl:'',logoMode:'auto',cleaningAssets:false,savedSection:null,message:t('Logo prepared. If any background remains, use Recreate logo without background.','تم تجهيز الشعار. إذا بقيت أي خلفية استخدم خيار إعادة إنشاء الشعار بدون خلفية.'),error:''}));
        return;
      }
      const data=await fileToDataUrl(file,MAX_COMPANY_ASSET_BYTES,this.assetKind(field));
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      this.setState(state=>({company:{...state.company,[field]:data},cleaningAssets:false,savedSection:null,message:t('Background cleaned automatically. Save to apply it to documents.','تم تنظيف الخلفية تلقائيًا. اضغط حفظ لتطبيقها على المستندات.'),error:''}));
    }catch{
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      this.setState({cleaningAssets:false,error:t('Unable to process this image. Try another PNG, WebP, or JPEG file.','تعذرت معالجة هذه الصورة. جرّب ملف PNG أو WebP أو JPEG آخر.')});
    }
  };
  private rebuildLogo=async()=>{
    const source=this.state.logoOriginalDataUrl||this.state.company.logoDataUrl;
    if(!source||source.includes('lourex-logo.svg')){this.setState({error:t('Upload or save a company logo first.','ارفع أو احفظ شعار الشركة أولًا.')});return;}
    const preparationId=++this.assetPreparationId;
    this.setState({cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      const rebuilt=await rebuildLogoWithoutBackgroundDataUrl(source);
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      if(!rebuilt||rebuilt===source){this.setState({cleaningAssets:false,error:t('The logo could not be reconstructed reliably. Try uploading the original image again.','تعذر إعادة إنشاء الشعار بشكل موثوق. جرّب رفع الصورة الأصلية مرة أخرى.')});return;}
      this.setState(state=>({company:{...state.company,logoDataUrl:rebuilt},logoRebuiltDataUrl:rebuilt,logoMode:'rebuild',cleaningAssets:false,savedSection:null,message:t('Transparent logo recreated. Review the preview, then press Save to use it on documents.','تمت إعادة إنشاء الشعار بدون خلفية. راجع المعاينة ثم اضغط حفظ لاستخدامه في المستندات.'),error:''}));
    }catch(e){
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      this.setState({cleaningAssets:false,error:e instanceof Error?e.message:t('Unable to recreate the logo.','تعذر إعادة إنشاء الشعار.')});
    }
  };
  private setLogoMode=(logoMode:State['logoMode'])=>{
    if(this.state.busy)return;
    const source=logoMode==='auto'?this.state.logoCleanedDataUrl:logoMode==='rebuild'?this.state.logoRebuiltDataUrl:this.state.logoOriginalDataUrl;
    if(!source)return;
    this.assetPreparationId+=1;
    const message=logoMode==='auto'?t('Enhanced automatic logo cleanup selected.','تم اختيار التنظيف التلقائي المحسّن للشعار.'):logoMode==='rebuild'?t('Recreated transparent logo selected.','تم اختيار الشعار المعاد إنشاؤه بدون خلفية.'):t('Original logo selected with no background processing.','تم اختيار الشعار الأصلي بدون معالجة للخلفية.');
    this.setState(state=>({logoMode,company:{...state.company,logoDataUrl:source},cleaningAssets:false,savedSection:null,message,error:''}));
  };
  private saveCompany=async()=>{
    if(!this.state.company.nameEn.trim()&&!this.state.company.nameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    if(this.state.company.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.state.company.email.trim())){this.setState({error:t('Enter a valid company email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا للشركة أو اترك الحقل فارغًا.')});return;}
    const commercialError=validateCommercialCompany(this.state.company);if(commercialError){this.setState({error:commercialError});return;}
    const source=structuredClone(this.state.company);const sourceSnapshot=JSON.stringify(source);
    this.setState({busy:true,cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      const company=await this.cleanCompanyAssets(source);await this.props.onSaveCompany(company);
      this.setState(state=>{const unchanged=JSON.stringify(state.company)===sourceSnapshot;return {company:unchanged?company:state.company,companyInitial:JSON.stringify(company),busy:false,cleaningAssets:false,savedSection:unchanged?'company':null,message:unchanged?t('Company settings saved. Logo artwork is preserved.','تم حفظ إعدادات الشركة مع الحفاظ على تفاصيل الشعار.'):t('Company settings saved. Newer edits are still unsaved.','تم حفظ إعدادات الشركة، وما زالت التعديلات الأحدث غير محفوظة.')};});
    }catch(e){this.setState({busy:false,cleaningAssets:false,error:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')});}
  };
  private saveDocuments=async()=>{
    const settings=structuredClone(this.state.appSettings);const snapshot=JSON.stringify(settings);
    this.setState({busy:true,error:'',message:'',savedSection:null});
    try{await this.props.onSaveAppSettings(settings);this.setState(state=>{const unchanged=JSON.stringify(state.appSettings)===snapshot;return {busy:false,documentsInitial:snapshot,savedSection:unchanged?'documents':null,message:unchanged?t('Document settings saved.','تم حفظ إعدادات المستندات.'):t('Document settings saved. Newer edits are still unsaved.','تم حفظ إعدادات المستندات، وما زالت التعديلات الأحدث غير محفوظة.')};});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')});}
  };
  private changeInterfaceLanguage=async(value:AppSettings['uiLanguage'])=>{
    if(this.state.busy)return;
    const previous=this.state.appSettings;
    const persisted=JSON.parse(this.state.documentsInitial) as AppSettings;
    const next={...previous,uiLanguage:value};
    const nextPersisted={...persisted,uiLanguage:value};
    this.setState({appSettings:next,busy:true,error:'',message:'',savedSection:null});
    try{
      await this.props.onSaveAppSettings(nextPersisted);
      this.setState(state=>({busy:false,documentsInitial:JSON.stringify(nextPersisted),savedSection:JSON.stringify(state.appSettings)===JSON.stringify(nextPersisted)?'documents':null}));
    }catch(e){
      this.setState(state=>({appSettings:state.appSettings.uiLanguage===value?{...state.appSettings,uiLanguage:previous.uiLanguage}:state.appSettings,busy:false,error:e instanceof Error?e.message:t('Unable to change interface language.','تعذر تغيير لغة الواجهة.')}));
    }
  };
  private changePin=async()=>{
    if(!/^\d{4,12}$/.test(this.state.newPin)){this.setState({error:t('New PIN must contain 4–12 digits.','يجب أن يتكون رمز PIN الجديد من 4 إلى 12 رقمًا.')});return;}
    if(this.state.newPin!==this.state.confirmPin){this.setState({error:t('New PIN confirmation does not match.','تأكيد رمز PIN الجديد غير مطابق.')});return;}
    this.setState({busy:true,error:'',message:'',savedSection:null});
    try{await this.props.onChangePin(this.state.currentPin,this.state.newPin);this.setState({busy:false,message:t('PIN changed.','تم تغيير رمز PIN.'),currentPin:'',newPin:'',confirmPin:''});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to change PIN.','تعذر تغيير رمز PIN.')});}
  };
  private restoreFromCloud=async()=>{
    const user=this.props.cloudUser;
    if(!user){this.setState({confirmCloudRestore:false,error:t('Sign in to your LOUREX account first.','سجّل الدخول إلى حساب LOUREX أولًا.')});return;}
    this.setState({confirmCloudRestore:false,busy:true,accountAction:'restore',error:'',message:'',savedSection:null});
    try{
      await this.props.onCloudRestore();
      this.setState({message:t('Account data restored from the cloud.','تم استرجاع بيانات الحساب من السحابة.')});
      window.setTimeout(()=>window.location.reload(),220);
    }catch(e){this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to restore account data.','تعذر استرجاع بيانات الحساب.')});}
  };
  private signOutFromCloud=async()=>{
    if(this.state.busy)return;
    this.setState({busy:true,accountAction:'signout',error:'',message:'',savedSection:null});
    try{
      await this.props.onCloudSignOut();
      this.setState({busy:false,accountAction:'',message:t('Signed out. Encrypted local data remains on this device.','تم تسجيل الخروج. تبقى البيانات المحلية المشفّرة على هذا الجهاز.')});
    }catch(e){this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to sign out.','تعذر تسجيل الخروج.')});}
  };
  private saveButton(section:'company'|'documents'):any{
    const saved=this.state.savedSection===section;
    const processing=section==='company'&&this.state.cleaningAssets;
    return <Button icon={saved?'check':'save'} variant="primary" disabled={this.state.busy||processing} onClick={section==='company'?this.saveCompany:this.saveDocuments}>{processing?t('Cleaning images…','جارٍ معالجة الصور…'):this.state.busy?t('Saving…','جارٍ الحفظ…'):saved?t('Saved','تم الحفظ'):t('Save','حفظ')}</Button>;
  }

  render():any{
    const c=this.state.company,s=this.state.appSettings;
    const hasCompanyLogo=Boolean(c.logoDataUrl&&!c.logoDataUrl.includes('lourex-logo.svg'));
    const account=this.props.cloudUser;
    const tabItems=([['company',t('Company','الشركة'),'users'],['commercial',t('Commercial','تجاري'),'invoice'],['documents',t('Documents','المستندات'),'file'],['security',t('Account & Security','الحساب والأمان'),'lock']] as const);
    return <Modal open={this.props.open} title={t('Settings','الإعدادات')} size="xl" onClose={this.requestClose}>
      <div className="settings-layout settings-workspace-v2">
        <nav className="settings-tabs" aria-label={t('Settings sections','أقسام الإعدادات')}>{tabItems.map(([id,label,icon])=><button type="button" key={id} className={this.state.tab===id?'active':''} aria-current={this.state.tab===id?'page':undefined} onClick={()=>this.setState({tab:id,error:'',message:'',savedSection:null})}><Icon name={icon}/><span>{label}</span></button>)}</nav>
        <div className="settings-panel">
          {this.state.tab==='company'?<div className="settings-tab-page">
            <div className="settings-title"><div><p className="eyebrow">{t('Company','الشركة')}</p><h3>{t('Company details','بيانات الشركة')}</h3><p>{t('Identity, contact details, artwork, bank information and document defaults.','الهوية وبيانات التواصل والشعار والبنك وإعدادات المستندات الافتراضية.')}</p></div>{this.saveButton('company')}</div>
            <section className="settings-section"><h4>{t('Identity & contact','الهوية والتواصل')}</h4><div className="form-grid two">
              <Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input dir="ltr" value={c.nameEn} onChange={(e:any)=>this.setCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input dir="rtl" value={c.nameAr} onChange={(e:any)=>this.setCompany('nameAr',e.target.value)}/></Field>
              <Field label={t('Address English','العنوان بالإنجليزية')}><Input dir="ltr" value={c.addressEn} onChange={(e:any)=>this.setCompany('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={c.addressAr} onChange={(e:any)=>this.setCompany('addressAr',e.target.value)}/></Field>
              <Field label={t('City','المدينة')}><Input value={c.city} onChange={(e:any)=>this.setCompany('city',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input value={c.country} onChange={(e:any)=>this.setCompany('country',e.target.value)}/></Field>
              <Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={c.phone} onChange={(e:any)=>this.setCompany('phone',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" dir="ltr" value={c.email} onChange={(e:any)=>this.setCompany('email',e.target.value)}/></Field>
              <Field label={t('Website','الموقع الإلكتروني')}><Input type="url" inputMode="url" autoComplete="url" dir="ltr" value={c.website} onChange={(e:any)=>this.setCompany('website',e.target.value)}/></Field><Field label={t('VAT Number','رقم ضريبة القيمة المضافة')}><Input dir="ltr" value={c.vatNumber} onChange={(e:any)=>this.setCompany('vatNumber',e.target.value)}/></Field>
              <Field label={t('Tax Number','الرقم الضريبي')}><Input dir="ltr" value={c.taxNumber} onChange={(e:any)=>this.setCompany('taxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input dir="ltr" value={c.commercialRegistration} onChange={(e:any)=>this.setCompany('commercialRegistration',e.target.value)}/></Field>
            </div></section>
            <section className="settings-section company-artwork-section"><div className="settings-section-heading"><div><h4>{t('Company artwork','هوية الشركة البصرية')}</h4><p>{t('These images are cleaned locally before they are saved into encrypted company data.','تتم معالجة هذه الصور محليًا قبل حفظها داخل بيانات الشركة المشفّرة.')}</p></div></div><div className="asset-settings">
              <div className="asset-control logo-asset-control"><label><span>{t('Logo','الشعار')}</span><div className="asset-preview">{hasCompanyLogo?<img src={c.logoDataUrl} alt={t('Logo','الشعار')}/>:<Icon name="upload"/>}</div><input type="file" disabled={this.state.busy||this.state.cleaningAssets} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectAsset('logoDataUrl',e.currentTarget)}/></label>{this.state.logoOriginalDataUrl?<><div className="logo-mode-switch" role="group" aria-label={t('Logo processing','معالجة الشعار')}><button type="button" className={this.state.logoMode==='auto'?'active':''} onClick={()=>this.setLogoMode('auto')}>{t('Auto clean','تنظيف تلقائي')}</button><button type="button" className={this.state.logoMode==='original'?'active':''} onClick={()=>this.setLogoMode('original')}>{t('Original','الأصلي')}</button></div><button type="button" className={`logo-rebuild-action ${this.state.logoMode==='rebuild'?'active':''}`} disabled={this.state.cleaningAssets||this.state.busy} onClick={()=>void this.rebuildLogo()}>{this.state.cleaningAssets?t('Recreating logo…','جارٍ إعادة إنشاء الشعار…'):t('Recreate logo without background','إعادة إنشاء الشعار بدون خلفية')}</button>{this.state.logoRebuiltDataUrl&&this.state.logoMode!=='rebuild'?<button type="button" className="logo-rebuild-restore" onClick={()=>this.setLogoMode('rebuild')}>{t('Use recreated version','استخدام النسخة المعاد إنشاؤها')}</button>:null}</>:null}{hasCompanyLogo?<button type="button" className="logo-rebuild-restore asset-remove-action" disabled={this.state.busy||this.state.cleaningAssets} onClick={()=>this.clearAsset('logoDataUrl')}>{t('Remove logo','إزالة الشعار')}</button>:null}</div>
              <div className="asset-control"><label><span>{t('Signature','التوقيع')}</span><div className="asset-preview">{c.signatureDataUrl?<img src={c.signatureDataUrl} alt={t('Signature','التوقيع')}/>:<Icon name="upload"/>}</div><input type="file" disabled={this.state.busy||this.state.cleaningAssets} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectAsset('signatureDataUrl',e.currentTarget)}/></label>{c.signatureDataUrl?<button type="button" className="logo-rebuild-restore asset-remove-action" disabled={this.state.busy||this.state.cleaningAssets} onClick={()=>this.clearAsset('signatureDataUrl')}>{t('Remove signature','إزالة التوقيع')}</button>:null}</div>
              <div className="asset-control"><label><span>{t('Stamp','الختم')}</span><div className="asset-preview">{c.stampDataUrl?<img src={c.stampDataUrl} alt={t('Stamp','الختم')}/>:<Icon name="upload"/>}</div><input type="file" disabled={this.state.busy||this.state.cleaningAssets} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectAsset('stampDataUrl',e.currentTarget)}/></label>{c.stampDataUrl?<button type="button" className="logo-rebuild-restore asset-remove-action" disabled={this.state.busy||this.state.cleaningAssets} onClick={()=>this.clearAsset('stampDataUrl')}>{t('Remove stamp','إزالة الختم')}</button>:null}</div>
            </div><p className={`asset-clean-hint ${this.state.cleaningAssets?'is-cleaning':''}`}><Icon name={this.state.cleaningAssets?'refresh':'check'}/><span>{this.state.cleaningAssets?t('Processing company images…','جارٍ معالجة صور الشركة…'):t('Auto clean is conservative. Recreate logo without background is the stronger option for stubborn dark/gray remnants.','التنظيف التلقائي محافظ. خيار إعادة إنشاء الشعار بدون خلفية هو الحل الأقوى لبقايا الخلفية السوداء أو الرمادية العنيدة.')}</span></p></section>
            <section className="settings-section"><h4>{t('Bank details','بيانات البنك')}</h4><div className="form-grid two"><Field label={t('Bank Name','اسم البنك')}><Input value={c.bank.bankName} onChange={(e:any)=>this.setBank('bankName',e.target.value)}/></Field><Field label={t('Account Name','اسم الحساب')}><Input value={c.bank.accountName} onChange={(e:any)=>this.setBank('accountName',e.target.value)}/></Field><Field label="IBAN"><Input dir="ltr" value={c.bank.iban} onChange={(e:any)=>this.setBank('iban',e.target.value)}/></Field><Field label="SWIFT / BIC"><Input dir="ltr" value={c.bank.swift} onChange={(e:any)=>this.setBank('swift',e.target.value)}/></Field><Field label={t('Bank Currency','عملة البنك')}><Input dir="ltr" value={c.bank.currency} onChange={(e:any)=>this.setBank('currency',e.target.value.toUpperCase())}/></Field></div></section>
            <section className="settings-section"><h4>{t('Language & defaults','اللغة والإعدادات الافتراضية')}</h4><div className="form-grid two"><Field label={t('Interface Language','لغة الواجهة')}><Select disabled={this.state.busy} value={s.uiLanguage||'en'} onChange={(e:any)=>void this.changeInterfaceLanguage(e.target.value as AppSettings['uiLanguage'])}><option value="en">English</option><option value="ar">العربية</option></Select></Field><Field label={t('Default Currency','العملة الافتراضية')}><Input dir="ltr" value={c.defaultCurrency} onChange={(e:any)=>this.setCompany('defaultCurrency',e.target.value.toUpperCase())}/></Field><Field label={t('Default Document Language','لغة المستند الافتراضية')}><Select value={c.defaultLanguage} onChange={(e:any)=>this.setCompany('defaultLanguage',e.target.value)}><option value="en">English</option><option value="ar">العربية</option><option value="bilingual">{t('Arabic + English','العربية + الإنجليزية')}</option></Select></Field><Field label={t('Default Payment Terms','شروط الدفع الافتراضية')}><Input value={c.defaultPaymentTerms} onChange={(e:any)=>this.setCompany('defaultPaymentTerms',e.target.value)}/></Field><Field label={t('Default Incoterm','شرط التجارة الافتراضي')}><Input value={c.defaultIncoterm} onChange={(e:any)=>this.setCompany('defaultIncoterm',e.target.value)}/></Field><Field label={t('Default Delivery Time','مدة التسليم الافتراضية')}><Input value={c.defaultDeliveryTime} onChange={(e:any)=>this.setCompany('defaultDeliveryTime',e.target.value)}/></Field><Field label={t('Default Validity (days)','مدة الصلاحية الافتراضية (أيام)')}><Input type="number" min="0" max="3650" step="1" value={String(c.defaultValidityDays)} onChange={(e:any)=>this.setCompany('defaultValidityDays',Math.min(3650,Math.max(0,Math.trunc(Number(e.target.value)||0))))}/></Field><Field label={t('Default Footer Text','نص التذييل الافتراضي')} className="span-2"><Input value={c.defaultFooterText} onChange={(e:any)=>this.setCompany('defaultFooterText',e.target.value)}/></Field><Field label={t('Default Notes','الملاحظات الافتراضية')} className="span-2"><Textarea rows="3" value={c.defaultNotes} onChange={(e:any)=>this.setCompany('defaultNotes',e.target.value)}/></Field></div></section>
          </div>:null}

          {this.state.tab==='commercial'?<div className="settings-tab-page"><div className="settings-title"><div><p className="eyebrow">{t('Commercial','تجاري')}</p><h3>{t('Commercial controls','الضوابط التجارية')}</h3><p>{t('Reusable tax, payment, bank, credit and pricing controls.','ضوابط قابلة لإعادة الاستخدام للضريبة والدفع والبنوك والائتمان والتسعير.')}</p></div>{this.saveButton('company')}</div><CommercialControlsSettings company={c} onChange={company=>this.setState({company,savedSection:null,message:'',error:''})}/></div>:null}

          {this.state.tab==='documents'?<div className="settings-tab-page"><div className="settings-title"><div><p className="eyebrow">{t('Documents','المستندات')}</p><h3>{t('Numbering','الترقيم')}</h3><p>{t('Control document prefixes while preserving independent forward-only sequences.','تحكم ببادئات المستندات مع الحفاظ على تسلسل مستقل يتحرك للأمام فقط.')}</p></div>{this.saveButton('documents')}</div><section className="settings-section"><div className="form-grid two"><Field label={t('Proforma Prefix','بادئة الفاتورة المبدئية')}><Input value={s.numbering.proformaPrefix} onChange={(e:any)=>this.setNumbering('proformaPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field><Field label={t('Invoice Prefix','بادئة الفاتورة')}><Input value={s.numbering.invoicePrefix} onChange={(e:any)=>this.setNumbering('invoicePrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field></div><div className="numbering-preview"><span>{s.numbering.proformaPrefix || 'PI'}-YYYY-0001</span><span>{s.numbering.invoicePrefix || 'INV'}-YYYY-0001</span></div><p className="settings-note">{t('Document sequences only move forward. Deleted numbers are never automatically reused.','تسلسل أرقام المستندات يتحرك للأمام فقط، ولا تتم إعادة استخدام الأرقام المحذوفة تلقائيًا.')}</p></section></div>:null}

          {this.state.tab==='security'?<div className="settings-tab-page security-settings-page">
            <div className="settings-title"><div><p className="eyebrow">{t('Account & Security','الحساب والأمان')}</p><h3>{t('Account access','الدخول إلى الحساب')}</h3><p>{t('Cloud account, recovery and device PIN controls in one place.','الحساب السحابي والاستعادة ورمز PIN الخاص بالجهاز في مكان واحد.')}</p></div></div>
            <section className="settings-section settings-account-card"><div className="settings-account-status"><span className={`settings-account-dot ${account?'connected':'offline'}`}/><div><small>{account?t('Signed in','تم تسجيل الدخول'):t('Not signed in','غير مسجل الدخول')}</small><strong>{account?.email||t('LOUREX Cloud account','حساب LOUREX السحابي')}</strong><p>{account?t('Your encrypted LOUREX data syncs automatically to this account.','تتم مزامنة بيانات LOUREX المشفّرة تلقائيًا مع هذا الحساب.'):t('Use Account & Cloud from the main workspace to sign in.','استخدم الحساب والسحابة من مساحة العمل الرئيسية لتسجيل الدخول.')}</p></div></div>{account?<div className="settings-account-actions"><Button variant="secondary" disabled={this.state.busy} onClick={()=>this.setState({confirmCloudRestore:true,error:'',message:''})}>{this.state.accountAction==='restore'?t('Restoring…','جارٍ الاسترجاع…'):t('Restore from Cloud','استرجاع من السحابة')}</Button><Button className="settings-signout-button" disabled={this.state.busy} onClick={()=>void this.signOutFromCloud()}>{this.state.accountAction==='signout'?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</Button></div>:null}<p className="settings-note account-safety-note"><Icon name="check"/><span>{t('Signing out does not delete the encrypted data already stored on this device.','تسجيل الخروج لا يحذف البيانات المشفّرة المخزنة على هذا الجهاز.')}</span></p></section>
            <section className="settings-section device-security-section"><div className="settings-section-heading"><div><h4>{t('Device PIN','رمز PIN للجهاز')}</h4><p>{t('The PIN protects the encrypted vault on this device. Normal trusted-device use should not repeatedly ask for it.','يحمي رمز PIN الخزنة المشفّرة على هذا الجهاز، ولا يفترض أن يطلبه الاستخدام الطبيعي المتكرر على جهاز موثوق.')}</p></div></div><div className="form-grid one pin-change-grid"><Field label={t('Current PIN','رمز PIN الحالي')}><Input inputMode="numeric" type="password" autoComplete="current-password" value={this.state.currentPin} onChange={(e:any)=>this.setState({currentPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('New PIN','رمز PIN الجديد')}><Input inputMode="numeric" type="password" autoComplete="new-password" value={this.state.newPin} onChange={(e:any)=>this.setState({newPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('Confirm New PIN','تأكيد رمز PIN الجديد')}><Input inputMode="numeric" type="password" autoComplete="new-password" value={this.state.confirmPin} onChange={(e:any)=>this.setState({confirmPin:e.target.value.replace(/\D/g,'')})}/></Field></div><Button variant="primary" disabled={this.state.busy} onClick={this.changePin}>{t('Change PIN','تغيير رمز PIN')}</Button></section>
          </div>:null}

          {this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}
          {this.state.error?<div className="settings-message error" role="alert">{this.state.error}</div>:null}
        </div>
      </div>
      <ConfirmDialog open={this.state.confirmCloudRestore} title={t('Restore account data from cloud?','استرجاع بيانات الحساب من السحابة؟')} message={t('The signed-in account copy will replace the current encrypted local vault on this device. Use this only when you intentionally want the cloud account copy.','ستحل نسخة الحساب المسجل في السحابة محل الخزنة المحلية المشفّرة الحالية على هذا الجهاز. استخدم هذا فقط عندما تريد نسخة الحساب السحابية عن قصد.')} confirmLabel={t('Restore from Cloud','استرجاع من السحابة')} onCancel={()=>this.setState({confirmCloudRestore:false})} onConfirm={()=>void this.restoreFromCloud()}/>
      <ConfirmDialog open={this.state.confirmClose} title={t('Discard unsaved settings?','تجاهل الإعدادات غير المحفوظة؟')} message={t('You have unsaved company or document settings. Discard them and close Settings?','لديك إعدادات شركة أو مستندات غير محفوظة. هل تريد تجاهلها وإغلاق الإعدادات؟')} confirmLabel={t('Discard','تجاهل')} onCancel={()=>this.setState({confirmClose:false})} onConfirm={this.discardAndClose}/>
    </Modal>;
  }
}