import type { AppSettings, CompanySettings } from '../types.js';
import { fileToRawDataUrl } from '../lib/files.js';
import { rebuildLogoWithoutBackgroundDataUrl } from '../lib/logo-rebuild.js';
import { t } from '../lib/i18n.js';
import { validateCommercialCompany } from '../lib/commercial-controls.js';
import { consumeSettingsScope, type SettingsScope } from '../lib/settings-scope.js';
import type { CloudUser } from '../cloud/firebase.js';
import { CommercialControlsSettings } from './CommercialControlsSettings.js';
import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea, Icon } from './UI.js';

interface Props {
  open:boolean; company:CompanySettings; appSettings:AppSettings; onClose:()=>void;
  onSaveCompany:(company:CompanySettings)=>Promise<void>; onSaveAppSettings:(settings:AppSettings)=>Promise<void>;
  onChangePin:(currentPin:string,newPin:string)=>Promise<void>; onLock:()=>void;
  cloudUser:CloudUser|null; onCloudRestore:()=>Promise<void>; onCloudSignOut:()=>Promise<void>;
  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>;
}

type AssetField='logoDataUrl'|'signatureDataUrl'|'stampDataUrl';
type AssetMode='rebuild'|'original';

interface State {
  scope:SettingsScope;
  tab:'company'|'commercial'|'documents'|'security'; company:CompanySettings; appSettings:AppSettings; busy:boolean; cleaningAssets:boolean; processingAsset:AssetField|null; message:string; error:string;
  savedSection:'company'|'documents'|null; currentPin:string; newPin:string; confirmPin:string; confirmClose:boolean; confirmCloudRestore:boolean;
  accountAction:''|'restore'|'signout'; companyInitial:string; documentsInitial:string;
  logoOriginalDataUrl:string; logoCleanedDataUrl:string; logoRebuiltDataUrl:string; logoMode:'auto'|'rebuild'|'original';
  signatureOriginalDataUrl:string; signatureRebuiltDataUrl:string; signatureMode:AssetMode;
  stampOriginalDataUrl:string; stampRebuiltDataUrl:string; stampMode:AssetMode;
}

const MAX_COMPANY_ASSET_BYTES=4*1024*1024;
const COMPANY_ASSET_TYPES=/^image\/(png|webp|jpeg)$/i;

export class SettingsModal extends React.Component<Props,State> {
  private assetPreparationId=0;
  constructor(props:Props){
    super(props);
    const company=structuredClone(props.company);
    const appSettings=structuredClone(props.appSettings);
    this.state={scope:'settings',tab:'company',company,appSettings,busy:false,cleaningAssets:false,processingAsset:null,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',confirmClose:false,confirmCloudRestore:false,accountAction:'',companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'original',signatureOriginalDataUrl:'',signatureRebuiltDataUrl:'',signatureMode:'original',stampOriginalDataUrl:'',stampRebuiltDataUrl:'',stampMode:'original'};
  }

  componentDidUpdate(prev:Props):void{
    if(!this.props.open&&prev.open)this.assetPreparationId+=1;
    if(this.props.open&&!prev.open){
      const scope=consumeSettingsScope();
      const company=structuredClone(this.props.company);
      const appSettings=structuredClone(this.props.appSettings);
      const preparationId=++this.assetPreparationId;
      this.setState({scope,tab:'company',company,appSettings,busy:false,cleaningAssets:false,processingAsset:null,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',confirmClose:false,confirmCloudRestore:false,accountAction:'',companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'original',signatureOriginalDataUrl:'',signatureRebuiltDataUrl:'',signatureMode:'original',stampOriginalDataUrl:'',stampRebuiltDataUrl:'',stampMode:'original'},()=>void this.prepareExistingAssets(company,preparationId));
    }
  }

  private hasUnsavedSettings=()=>JSON.stringify(this.state.company)!==this.state.companyInitial||JSON.stringify(this.state.appSettings)!==this.state.documentsInitial;
  private requestClose=()=>{if(this.hasUnsavedSettings()){this.setState({confirmClose:true});return;}this.props.onClose();};
  private discardAndClose=()=>this.setState({confirmClose:false},this.props.onClose);
  private setCompany=(key:keyof CompanySettings,value:any)=>this.setState({company:{...this.state.company,[key]:value},savedSection:null,message:'',error:''});
  private setBank=(key:keyof CompanySettings['bank'],value:string)=>this.setState({company:{...this.state.company,bank:{...this.state.company.bank,[key]:value}},savedSection:null,message:'',error:''});
  private setNumbering=(key:keyof AppSettings['numbering'],value:any)=>this.setState({appSettings:{...this.state.appSettings,numbering:{...this.state.appSettings.numbering,[key]:value}},savedSection:null,message:'',error:''});
  private setAutoLock=(value:AppSettings['autoLockMinutes'])=>this.setState({appSettings:{...this.state.appSettings,autoLockMinutes:value},savedSection:null,message:'',error:''});

  private prepareExistingAssets=async(source:CompanySettings,preparationId:number)=>{
    if(!this.props.open||preparationId!==this.assetPreparationId)return;
    const hasSavedLogo=Boolean(source.logoDataUrl&&!source.logoDataUrl.includes('lourex-logo.svg'));
    const logoOriginalDataUrl=hasSavedLogo?source.logoDataUrl:'';
    if(!this.props.open||preparationId!==this.assetPreparationId)return;
    this.setState({logoOriginalDataUrl,logoCleanedDataUrl:logoOriginalDataUrl,logoRebuiltDataUrl:'',logoMode:'original',signatureOriginalDataUrl:source.signatureDataUrl||'',signatureRebuiltDataUrl:'',signatureMode:'original',stampOriginalDataUrl:source.stampDataUrl||'',stampRebuiltDataUrl:'',stampMode:'original',cleaningAssets:false,processingAsset:null,error:''});
  };

  private selectAsset=(field:AssetField,input:HTMLInputElement)=>{const file=input.files?.[0];input.value='';void this.upload(field,file);};
  private clearAsset=(field:AssetField)=>{
    this.assetPreparationId+=1;
    const message=t('Artwork removed from this draft. Save changes to apply it.','تمت إزالة الصورة من هذه المسودة. احفظ التغييرات لتطبيقها.');
    if(field==='logoDataUrl')this.setState(state=>({company:{...state.company,logoDataUrl:''},logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
    else if(field==='signatureDataUrl')this.setState(state=>({company:{...state.company,signatureDataUrl:''},signatureOriginalDataUrl:'',signatureRebuiltDataUrl:'',signatureMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
    else this.setState(state=>({company:{...state.company,stampDataUrl:''},stampOriginalDataUrl:'',stampRebuiltDataUrl:'',stampMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
  };

  private upload=async(field:AssetField,file?:File)=>{
    if(!file)return;
    const preparationId=++this.assetPreparationId;
    if(file.size>MAX_COMPANY_ASSET_BYTES){this.setState({cleaningAssets:false,processingAsset:null,error:t('Image is too large. Use a file smaller than 4 MB.','حجم الصورة كبير جدًا. استخدم ملفًا أصغر من 4 ميجابايت.'),message:''});return;}
    if(!COMPANY_ASSET_TYPES.test(file.type)){this.setState({cleaningAssets:false,processingAsset:null,error:t('Use a PNG, WebP, or JPEG image.','استخدم صورة بصيغة PNG أو WebP أو JPEG.'),message:''});return;}
    this.setState({cleaningAssets:true,processingAsset:field,error:'',message:'',savedSection:null});
    try{
      const original=await fileToRawDataUrl(file);
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      const message=t('Original artwork preserved. Use AI Remove Background if you want a transparent version.','تم الحفاظ على الصورة الأصلية بدون حذف أي جزء منها. استخدم إزالة الخلفية بالذكاء الاصطناعي للحصول على نسخة شفافة.');
      if(field==='logoDataUrl')this.setState(state=>({company:{...state.company,logoDataUrl:original},logoOriginalDataUrl:original,logoCleanedDataUrl:original,logoRebuiltDataUrl:'',logoMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
      else if(field==='signatureDataUrl')this.setState(state=>({company:{...state.company,signatureDataUrl:original},signatureOriginalDataUrl:original,signatureRebuiltDataUrl:'',signatureMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
      else this.setState(state=>({company:{...state.company,stampDataUrl:original},stampOriginalDataUrl:original,stampRebuiltDataUrl:'',stampMode:'original',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
    }catch{
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      this.setState({cleaningAssets:false,processingAsset:null,error:t('Unable to process this image. Try another PNG, WebP, or JPEG file.','تعذرت معالجة هذه الصورة. جرّب ملف PNG أو WebP أو JPEG آخر.')});
    }
  };

  private rebuildAsset=async(field:AssetField)=>{
    const source=field==='logoDataUrl'?(this.state.logoOriginalDataUrl||this.state.company.logoDataUrl):field==='signatureDataUrl'?(this.state.signatureOriginalDataUrl||this.state.company.signatureDataUrl):(this.state.stampOriginalDataUrl||this.state.company.stampDataUrl);
    if(!source||(field==='logoDataUrl'&&source.includes('lourex-logo.svg'))){this.setState({error:t('Upload or save the original artwork first.','ارفع أو احفظ الصورة الأصلية أولًا.')});return;}
    const preparationId=++this.assetPreparationId;
    this.setState({cleaningAssets:true,processingAsset:field,error:'',message:'',savedSection:null});
    if(!this.props.open||preparationId!==this.assetPreparationId)return;
    try{
      const rebuilt=await rebuildLogoWithoutBackgroundDataUrl(source);
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      if(!rebuilt||rebuilt===source){this.setState({cleaningAssets:false,processingAsset:null,error:t('AI background removal did not produce a usable transparent image. Try uploading the original image again.','لم تنتج إزالة الخلفية بالذكاء الاصطناعي صورة شفافة صالحة. جرّب رفع الصورة الأصلية مرة أخرى.')});return;}
      const message=t('AI background removed. Review the preview, then press Save to use it on documents.','تمت إزالة الخلفية بالذكاء الاصطناعي. راجع المعاينة ثم اضغط حفظ لاستخدام الصورة في المستندات.');
      if(field==='logoDataUrl')this.setState(state=>({company:{...state.company,logoDataUrl:rebuilt},logoRebuiltDataUrl:rebuilt,logoMode:'rebuild',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
      else if(field==='signatureDataUrl')this.setState(state=>({company:{...state.company,signatureDataUrl:rebuilt},signatureRebuiltDataUrl:rebuilt,signatureMode:'rebuild',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
      else this.setState(state=>({company:{...state.company,stampDataUrl:rebuilt},stampRebuiltDataUrl:rebuilt,stampMode:'rebuild',cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
    }catch(e){
      if(!this.props.open||preparationId!==this.assetPreparationId)return;
      this.setState({cleaningAssets:false,processingAsset:null,error:e instanceof Error?e.message:t('Unable to remove the background with AI.','تعذرت إزالة الخلفية بالذكاء الاصطناعي.')});
    }
  };
  private rebuildLogo=async()=>{await this.rebuildAsset('logoDataUrl');};
  private rebuildSignature=async()=>{await this.rebuildAsset('signatureDataUrl');};
  private rebuildStamp=async()=>{await this.rebuildAsset('stampDataUrl');};

  private setLogoMode=(logoMode:State['logoMode'])=>{
    if(this.state.busy)return;
    const source=logoMode==='auto'?this.state.logoCleanedDataUrl:logoMode==='rebuild'?this.state.logoRebuiltDataUrl:this.state.logoOriginalDataUrl;
    if(!source)return;
    this.assetPreparationId+=1;
    const message=logoMode==='rebuild'?t('AI transparent logo selected.','تم اختيار نسخة الشعار الشفافة بالذكاء الاصطناعي.'):t('Original logo selected with no background processing.','تم اختيار الشعار الأصلي بدون أي معالجة للخلفية.');
    this.setState(state=>({logoMode,company:{...state.company,logoDataUrl:source},cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
  };
  private setSignatureMode=(signatureMode:AssetMode)=>{
    if(this.state.busy)return;
    const source=signatureMode==='rebuild'?this.state.signatureRebuiltDataUrl:this.state.signatureOriginalDataUrl;if(!source)return;
    this.assetPreparationId+=1;
    const message=signatureMode==='rebuild'?t('AI transparent signature selected.','تم اختيار نسخة التوقيع الشفافة بالذكاء الاصطناعي.'):t('Original signature selected.','تم اختيار التوقيع الأصلي.');
    this.setState(state=>({signatureMode,company:{...state.company,signatureDataUrl:source},cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
  };
  private setStampMode=(stampMode:AssetMode)=>{
    if(this.state.busy)return;
    const source=stampMode==='rebuild'?this.state.stampRebuiltDataUrl:this.state.stampOriginalDataUrl;if(!source)return;
    this.assetPreparationId+=1;
    const message=stampMode==='rebuild'?t('AI transparent stamp selected.','تم اختيار نسخة الختم الشفافة بالذكاء الاصطناعي.'):t('Original stamp selected.','تم اختيار الختم الأصلي.');
    this.setState(state=>({stampMode,company:{...state.company,stampDataUrl:source},cleaningAssets:false,processingAsset:null,savedSection:null,message,error:''}));
  };

  private saveCompany=async()=>{
    if(!this.state.company.nameEn.trim()&&!this.state.company.nameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    if(this.state.company.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.state.company.email.trim())){this.setState({error:t('Enter a valid company email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا للشركة أو اترك الحقل فارغًا.')});return;}
    const commercialError=validateCommercialCompany(this.state.company);if(commercialError){this.setState({error:commercialError});return;}
    const source=structuredClone(this.state.company);const sourceSnapshot=JSON.stringify(source);
    this.setState({busy:true,cleaningAssets:true,processingAsset:null,error:'',message:'',savedSection:null});
    try{
      const company=source;await this.props.onSaveCompany(company);
      this.setState(state=>{const unchanged=JSON.stringify(state.company)===sourceSnapshot;return {company:unchanged?company:state.company,companyInitial:JSON.stringify(company),busy:false,cleaningAssets:false,processingAsset:null,savedSection:unchanged?'company':null,message:unchanged?(state.scope==='account'?t('Account profile saved.','تم حفظ ملف الحساب.'):t('Settings saved. Artwork choice is preserved.','تم حفظ الإعدادات مع الحفاظ على اختيار الصور.')):t('Changes saved. Newer edits are still unsaved.','تم حفظ التغييرات، وما زالت التعديلات الأحدث غير محفوظة.')};});
    }catch(e){this.setState({busy:false,cleaningAssets:false,processingAsset:null,error:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')});}
  };

  private saveDocuments=async()=>{
    const settings=structuredClone(this.state.appSettings);const snapshot=JSON.stringify(settings);
    this.setState({busy:true,error:'',message:'',savedSection:null});
    try{await this.props.onSaveAppSettings(settings);this.setState(state=>{const unchanged=JSON.stringify(state.appSettings)===snapshot;return {busy:false,documentsInitial:snapshot,savedSection:unchanged?'documents':null,message:unchanged?t('Settings saved.','تم حفظ الإعدادات.'):t('Settings saved. Newer edits are still unsaved.','تم حفظ الإعدادات، وما زالت التعديلات الأحدث غير محفوظة.')};});}
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
      this.setState(state=>({busy:false,documentsInitial:JSON.stringify(nextPersisted),savedSection:JSON.stringify(state.appSettings)===JSON.stringify(nextPersisted)?'documents':null,message:t('Interface language updated immediately.','تم تحديث لغة الواجهة مباشرةً.')}));
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

  private lockNow=()=>{
    if(this.hasUnsavedSettings()){this.setState({error:t('Save or discard your pending settings before locking the app.','احفظ أو تجاهل تغييرات الإعدادات المعلقة قبل قفل التطبيق.')});return;}
    this.props.onLock();
  };

  private restoreFromCloud=async()=>{
    const user=this.props.cloudUser;
    if(!user){this.setState({confirmCloudRestore:false,error:t('Sign in to your LOUREX account first.','سجّل الدخول إلى حساب LOUREX أولًا.')});return;}
    await new Promise<void>(resolve=>this.setState({confirmCloudRestore:false,busy:true,accountAction:'restore',error:'',message:'',savedSection:null},resolve));
    try{await this.props.onCloudRestore();this.setState({message:t('Account data restored from the cloud.','تم استرجاع بيانات الحساب من السحابة.')});window.setTimeout(()=>window.location.reload(),220);}
    catch(e){this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to restore account data.','تعذر استرجاع بيانات الحساب.')}));}
  };

  private signOutFromCloud=async()=>{
    if(this.state.busy)return;
    this.setState({busy:true,accountAction:'signout',error:'',message:'',savedSection:null});
    try{await this.props.onCloudSignOut();this.setState({busy:false,accountAction:'',message:t('Signed out. Encrypted local data remains on this device.','تم تسجيل الخروج. تبقى البيانات المحلية المشفّرة على هذا الجهاز.')}));}
    catch(e){this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to sign out.','تعذر تسجيل الخروج.')}));}
  };

  private saveButton(section:'company'|'documents'):any{
    const saved=this.state.savedSection===section;
    const processing=section==='company'&&this.state.cleaningAssets;
    return <Button icon={saved?'check':'save'} variant="primary" disabled={this.state.busy||processing} onClick={section==='company'?this.saveCompany:this.saveDocuments}>{processing?t('Processing artwork…','جارٍ معالجة الصور…'):this.state.busy?t('Saving…','جارٍ الحفظ…'):saved?t('Saved','تم الحفظ'):t('Save','حفظ')}</Button>;
  }

  private artworkControl(field:AssetField,label:string,hasAsset:boolean):any{
    const c=this.state.company;
    const original=field==='logoDataUrl'?this.state.logoOriginalDataUrl:field==='signatureDataUrl'?this.state.signatureOriginalDataUrl:this.state.stampOriginalDataUrl;
    const rebuilt=field==='logoDataUrl'?this.state.logoRebuiltDataUrl:field==='signatureDataUrl'?this.state.signatureRebuiltDataUrl:this.state.stampRebuiltDataUrl;
    const mode=field==='logoDataUrl'?this.state.logoMode:field==='signatureDataUrl'?this.state.signatureMode:this.state.stampMode;
    const current=c[field];
    const processing=this.state.processingAsset===field;
    const setMode=(value:AssetMode)=>field==='logoDataUrl'?this.setLogoMode(value):field==='signatureDataUrl'?this.setSignatureMode(value):this.setStampMode(value);
    const rebuild=()=>field==='logoDataUrl'?this.rebuildLogo():field==='signatureDataUrl'?this.rebuildSignature():this.rebuildStamp();
    const removeText=field==='logoDataUrl'?t('Remove logo','إزالة الشعار'):field==='signatureDataUrl'?t('Remove signature','إزالة التوقيع'):t('Remove stamp','إزالة الختم');
    const chooseText=hasAsset?t('Replace image','استبدال الصورة'):t('Choose image','اختيار صورة');
    return <div className="ta-settings-asset"><label className="ta-settings-asset-upload"><span>{label}</span><div className="ta-settings-asset-preview">{hasAsset?<img src={current} alt={label}/>:<Icon name="upload"/>}</div><input type="file" aria-label={chooseText} disabled={this.state.busy||this.state.cleaningAssets} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectAsset(field,e.currentTarget)}/><span className="ta-settings-asset-trigger" aria-hidden="true"><Icon name="upload"/><span>{chooseText}</span></span></label>{original?<><div className="ta-settings-segmented" role="group" aria-label={t('Artwork processing','معالجة الصورة')}><button type="button" className={mode==='original'?'is-active':''} onClick={()=>setMode('original')}>{t('Original','الأصلي')}</button>{rebuilt?<button type="button" className={mode==='rebuild'?'is-active':''} onClick={()=>setMode('rebuild')}>{t('AI transparent','شفاف AI')}</button>:null}</div><button type="button" className="ta-settings-link-action" disabled={this.state.cleaningAssets||this.state.busy} onClick={()=>void rebuild()}>{processing?t('Removing background with AI…','جارٍ إزالة الخلفية بالذكاء الاصطناعي…'):t('AI Remove Background','إزالة الخلفية بالذكاء الاصطناعي')}</button>{rebuilt&&mode!=='rebuild'?<button type="button" className="ta-settings-link-action" onClick={()=>setMode('rebuild')}>{t('Use AI version','استخدام نسخة AI')}</button>:null}</>:null}{hasAsset?<button type="button" className="ta-settings-link-action is-danger" disabled={this.state.busy||this.state.cleaningAssets} onClick={()=>this.clearAsset(field)}>{removeText}</button>:null}</div>;
  }

  private pageHeader(kicker:string,title:string,description:string,action?:any):any{return <header className="ta-settings-page-header"><div><span>{kicker}</span><h3>{title}</h3><p>{description}</p></div>{action?<div className="ta-settings-page-action">{action}</div>:null}</header>;}
  private card(title:string,description:string,body:any,action?:any,className=''):any{return <section className={`ta-settings-card ${className}`}><header><div><h4>{title}</h4>{description?<p>{description}</p>:null}</div>{action?<div>{action}</div>:null}</header><div className="ta-settings-card-body">{body}</div></section>;}

  private accountProfile():any{
    const c=this.state.company;
    const account=this.props.cloudUser;
    const hasCompanyLogo=Boolean(c.logoDataUrl&&!c.logoDataUrl.includes('lourex-logo.svg'));
    return <div className="ta-settings-page ta-account-page">
      {this.pageHeader(t('Account','الحساب'),t('Company profile','ملف الشركة'),t('Company identity, contact and account access live here. Operational preferences stay in Settings.','هوية الشركة وبيانات التواصل والدخول إلى الحساب موجودة هنا، بينما تبقى تفضيلات التشغيل ضمن الإعدادات.'),this.saveButton('company'))}
      {this.card(t('Company logo','شعار الشركة'),t('This logo appears across the workspace and on documents.','يظهر هذا الشعار في مساحة العمل وعلى المستندات.'),<div className="ta-account-logo-grid">{this.artworkControl('logoDataUrl',t('Logo','الشعار'),hasCompanyLogo)}<div className="ta-account-summary"><strong>{c.nameAr||c.nameEn||t('Company profile','ملف الشركة')}</strong><span dir="ltr">{c.website||account?.email||t('Add your website and contact details below.','أضف الموقع وبيانات التواصل أدناه.')}</span></div></div>)}
      {this.card(t('Identity & contact','الهوية والتواصل'),'',<div className="form-grid two"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input dir="ltr" value={c.nameEn} onChange={(e:any)=>this.setCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input dir="rtl" value={c.nameAr} onChange={(e:any)=>this.setCompany('nameAr',e.target.value)}/></Field><Field label={t('Website','الموقع الإلكتروني')}><Input type="url" inputMode="url" autoComplete="url" dir="ltr" value={c.website} onChange={(e:any)=>this.setCompany('website',e.target.value)}/></Field><Field label={t('Phone','الهاتف')}><Input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={c.phone} onChange={(e:any)=>this.setCompany('phone',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" dir="ltr" value={c.email} onChange={(e:any)=>this.setCompany('email',e.target.value)}/></Field><Field label={t('City','المدينة')}><Input value={c.city} onChange={(e:any)=>this.setCompany('city',e.target.value)}/></Field><Field label={t('Address English','العنوان بالإنجليزية')}><Input dir="ltr" value={c.addressEn} onChange={(e:any)=>this.setCompany('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={c.addressAr} onChange={(e:any)=>this.setCompany('addressAr',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input value={c.country} onChange={(e:any)=>this.setCompany('country',e.target.value)}/></Field></div>)}
      {this.card(t('Legal & registration','البيانات القانونية والتسجيل'),t('Identifiers that belong to the company profile and may appear on documents.','المعرّفات القانونية التابعة لملف الشركة والتي قد تظهر على المستندات.'),<div className="form-grid two"><Field label={t('VAT Number','رقم ضريبة القيمة المضافة')}><Input dir="ltr" value={c.vatNumber} onChange={(e:any)=>this.setCompany('vatNumber',e.target.value)}/></Field><Field label={t('Tax Number','الرقم الضريبي')}><Input dir="ltr" value={c.taxNumber} onChange={(e:any)=>this.setCompany('taxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input dir="ltr" value={c.commercialRegistration} onChange={(e:any)=>this.setCompany('commercialRegistration',e.target.value)}/></Field></div>)}
      {this.card(t('Account access','الدخول إلى الحساب'),account?t('This is the account used to access this LOUREX workspace.','هذا هو الحساب المستخدم للدخول إلى مساحة LOUREX هذه.'):t('Sign in from the LOUREX account screen to connect this workspace.','سجّل الدخول من شاشة حساب LOUREX لربط مساحة العمل.'),<div className="ta-account-access"><span className={`ta-account-dot ${account?'is-online':'is-offline'}`}/><div><small>{account?t('Signed in','تم تسجيل الدخول'):t('LOUREX account','حساب LOUREX')}</small><strong dir="ltr">{account?.email||t('Not signed in','غير مسجل الدخول')}</strong><p><Icon name="check"/>{t('Signing out does not delete the encrypted data already stored on this device.','تسجيل الخروج لا يحذف البيانات المشفّرة المخزنة على هذا الجهاز.')}</p></div></div>)}
    </div>;
  }

  private workspacePreferences(c:CompanySettings,s:AppSettings):any{return <div className="ta-settings-page">
    {this.pageHeader(t('Workspace','مساحة العمل'),t('Workspace preferences','تفضيلات مساحة العمل'),t('Interface language and workspace-wide defaults. Company logo and profile details are managed from Account.','لغة الواجهة والإعدادات العامة لمساحة العمل. تتم إدارة شعار الشركة وبيانات الملف من الحساب.'),this.saveButton('company'))}
    {this.card(t('Interface & defaults','الواجهة والإعدادات العامة'),t('Interface language applies immediately. Other workspace defaults are saved with the Save button.','تُطبّق لغة الواجهة مباشرةً، بينما تُحفظ بقية إعدادات مساحة العمل بزر الحفظ.'),<div className="form-grid two"><Field label={t('Interface Language','لغة الواجهة')}><Select disabled={this.state.busy} value={s.uiLanguage||'en'} onChange={(e:any)=>void this.changeInterfaceLanguage(e.target.value as AppSettings['uiLanguage'])}><option value="en">English</option><option value="ar">العربية</option></Select></Field><Field label={t('Default Currency','العملة الافتراضية')}><Input dir="ltr" value={c.defaultCurrency} onChange={(e:any)=>this.setCompany('defaultCurrency',e.target.value.toUpperCase())}/></Field></div>)}
  </div>;}

  private documentSettings(c:CompanySettings,s:AppSettings):any{return <div className="ta-settings-page">
    {this.pageHeader(t('Documents','المستندات'),t('Document output & defaults','إخراج المستند والإعدادات الافتراضية'),t('Artwork, document language, validity, notes and numbering belong together here.','التوقيع والختم ولغة المستند والصلاحية والملاحظات والترقيم موجودة هنا معًا.'))}
    {this.card(t('Document artwork','صور المستند'),t('Signature and stamp belong to document output settings. Company logo and profile details are managed from Account.','التوقيع والختم من إعدادات إخراج المستند. أما شعار الشركة وبيانات الملف فتتم إدارتها من الحساب.'),<><div className="ta-settings-artwork-grid">{this.artworkControl('signatureDataUrl',t('Signature','التوقيع'),Boolean(c.signatureDataUrl))}{this.artworkControl('stampDataUrl',t('Stamp','الختم'),Boolean(c.stampDataUrl))}</div><p className={`ta-settings-note ${this.state.cleaningAssets?'is-busy':''}`}><Icon name={this.state.cleaningAssets?'refresh':'check'}/><span>{this.state.cleaningAssets?t('Processing document artwork…','جارٍ معالجة صور المستند…'):t('Original artwork is preserved unless you explicitly choose the AI transparent version.','يتم الحفاظ على الصورة الأصلية ما لم تختر النسخة الشفافة بالذكاء الاصطناعي صراحةً.')}</span></p></>,this.saveButton('company'))}
    {this.card(t('Document defaults','الإعدادات الافتراضية للمستند'),t('Defaults used when a new quotation, invoice or purchase order is created. Commercial terms are managed under Commercial.','إعدادات تُستخدم عند إنشاء عرض سعر أو فاتورة أو طلب شراء جديد. تتم إدارة الشروط التجارية ضمن «تجاري».'),<div className="form-grid two"><Field label={t('Default Document Language','لغة المستند الافتراضية')}><Select value={c.defaultLanguage} onChange={(e:any)=>this.setCompany('defaultLanguage',e.target.value)}><option value="en">English</option><option value="ar">العربية</option><option value="bilingual">{t('Arabic + English','العربية + الإنجليزية')}</option></Select></Field><Field label={t('Default Validity (days)','مدة الصلاحية الافتراضية (أيام)')}><Input type="number" min="0" max="3650" step="1" value={String(c.defaultValidityDays)} onChange={(e:any)=>this.setCompany('defaultValidityDays',Math.min(3650,Math.max(0,Math.trunc(Number(e.target.value)||0))))}/></Field><Field label={t('Default Footer Text','نص التذييل الافتراضي')} className="span-2"><Input value={c.defaultFooterText} onChange={(e:any)=>this.setCompany('defaultFooterText',e.target.value)}/></Field><Field label={t('Default Notes','الملاحظات الافتراضية')} className="span-2"><Textarea rows="3" value={c.defaultNotes} onChange={(e:any)=>this.setCompany('defaultNotes',e.target.value)}/></Field></div>,this.saveButton('company'))}
    {this.card(t('Numbering','الترقيم'),t('Control document prefixes while preserving independent forward-only sequences.','تحكم ببادئات المستندات مع الحفاظ على تسلسل مستقل يتحرك للأمام فقط.'),<><div className="form-grid two"><Field label={t('Quotation Prefix','بادئة عرض السعر')}><Input value={s.numbering.proformaPrefix} onChange={(e:any)=>this.setNumbering('proformaPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field><Field label={t('Invoice Prefix','بادئة الفاتورة')}><Input value={s.numbering.invoicePrefix} onChange={(e:any)=>this.setNumbering('invoicePrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field><Field label={t('Purchase Order Prefix','بادئة طلب الشراء')}><Input value={s.numbering.purchaseOrderPrefix||'PO'} onChange={(e:any)=>this.setNumbering('purchaseOrderPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field><Field label={t('Company Draft Prefix','بادئة مسودة الشركة')}><Input value={s.numbering.draftPrefix||'DR'} onChange={(e:any)=>this.setNumbering('draftPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field></div><div className="ta-numbering-preview"><span>{s.numbering.proformaPrefix || 'PI'}-YYYY-0001</span><span>{s.numbering.invoicePrefix || 'INV'}-YYYY-0001</span><span>{s.numbering.purchaseOrderPrefix || 'PO'}-YYYY-0001</span><span>{s.numbering.draftPrefix || 'DR'}-YYYY-0001</span></div><p className="ta-settings-note">{t('Document sequences only move forward. Deleted numbers are never automatically reused.','تسلسل أرقام المستندات يتحرك للأمام فقط، ولا تتم إعادة استخدام الأرقام المحذوفة تلقائيًا.')}</p></>,this.saveButton('documents'))}
  </div>;}

  private securitySettings(s:AppSettings,account:CloudUser|null):any{return <div className="ta-settings-page ta-security-page">
    {this.pageHeader(t('Security','الأمان'),t('Security & recovery','الأمان والاستعادة'),t('Session locking, device PIN and encrypted cloud recovery. Sign out is available from More.','قفل الجلسة ورمز PIN والاستعادة السحابية المشفّرة. تسجيل الخروج متاح من صفحة المزيد.'))}
    {this.card(t('Session protection','حماية الجلسة'),t('Choose how long an inactive trusted device stays unlocked, or lock this workspace immediately.','اختر مدة بقاء الجهاز الموثوق مفتوحًا عند عدم الاستخدام، أو اقفل مساحة العمل فورًا.'),<div className="form-grid two"><Field label={t('Auto Lock','القفل التلقائي')}><Select value={String(s.autoLockMinutes)} onChange={(e:any)=>this.setAutoLock(Number(e.target.value) as AppSettings['autoLockMinutes'])}><option value="0">{t('Never','أبدًا')}</option><option value="5">{t('After 5 minutes','بعد 5 دقائق')}</option><option value="15">{t('After 15 minutes','بعد 15 دقيقة')}</option><option value="30">{t('After 30 minutes','بعد 30 دقيقة')}</option></Select></Field><div className="ta-settings-inline-action"><Button variant="secondary" disabled={this.state.busy} onClick={this.lockNow}>{t('Lock Now','قفل الآن')}</Button></div></div>,this.saveButton('documents'))}
    {this.card(t('Encrypted backup & recovery','النسخ المشفّر والاستعادة'),account?t('Your encrypted workspace is protected automatically. Use recovery only when you intentionally need the cloud copy.','تتم حماية مساحة العمل المشفّرة تلقائيًا. استخدم الاستعادة فقط عندما تريد نسخة السحابة عن قصد.'):t('Sign in to your LOUREX account before using cloud recovery.','سجّل الدخول إلى حساب LOUREX قبل استخدام الاستعادة السحابية.'),<div className="ta-recovery-status"><span className={`ta-account-dot ${account?'is-online':'is-offline'}`}/><div><small>{account?t('Automatic protection active','الحماية التلقائية مفعّلة'):t('Cloud recovery unavailable','الاستعادة السحابية غير متاحة')}</small><strong>{account?.email||t('LOUREX account required','يتطلب حساب LOUREX')}</strong></div>{account?<Button variant="secondary" disabled={this.state.busy} onClick={()=>this.setState({confirmCloudRestore:true,error:'',message:''})}>{this.state.accountAction==='restore'?t('Restoring…','جارٍ الاسترجاع…'):t('Restore from Cloud','استرجاع من السحابة')}</Button>:null}</div>)}
    {this.card(t('Device PIN','رمز PIN للجهاز'),t('The PIN protects the encrypted vault on this device. Every account sign-in and every new page start or reload requires the PIN before the workspace opens. Auto Lock also protects an already-open session after inactivity.','يحمي رمز PIN الخزنة المشفّرة على هذا الجهاز. يتطلب كل تسجيل دخول للحساب وكل تشغيل جديد للصفحة أو إعادة تحميل إدخال PIN قبل فتح مساحة العمل. كما يحمي القفل التلقائي الجلسة المفتوحة بعد فترة من عدم النشاط.'),<><div className="form-grid one ta-pin-grid"><Field label={t('Current PIN','رمز PIN الحالي')}><Input inputMode="numeric" type="password" autoComplete="current-password" value={this.state.currentPin} onChange={(e:any)=>this.setState({currentPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('New PIN','رمز PIN الجديد')}><Input inputMode="numeric" type="password" autoComplete="new-password" value={this.state.newPin} onChange={(e:any)=>this.setState({newPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('Confirm New PIN','تأكيد رمز PIN الجديد')}><Input inputMode="numeric" type="password" autoComplete="new-password" value={this.state.confirmPin} onChange={(e:any)=>this.setState({confirmPin:e.target.value.replace(/\D/g,'')})}/></Field></div><div className="ta-settings-card-actions"><Button variant="primary" disabled={this.state.busy} onClick={this.changePin}>{t('Change PIN','تغيير رمز PIN')}</Button></div></>)}
  </div>;}

  render():any{
    const c=this.state.company,s=this.state.appSettings;
    const account=this.props.cloudUser;
    const accountScope=this.state.scope==='account';
    const tabItems=([['company',t('Workspace','مساحة العمل'),'settings',t('Language and defaults','اللغة والإعدادات')],['commercial',t('Commercial','تجاري'),'invoice',t('Banking and trade controls','البنوك وضوابط التجارة')],['documents',t('Documents','المستندات'),'file',t('Output and numbering','الإخراج والترقيم')],['security',t('Security','الأمان'),'lock',t('PIN and recovery','PIN والاستعادة')]] as const);
    return <Modal open={this.props.open} title={accountScope?t('Account','الحساب'):t('Settings','الإعدادات')} size="xl" onClose={this.requestClose}>
      <div className={`ta-settings-shell ${accountScope?'is-account':'is-settings'} ${this.state.accountAction==='restore'?'is-restoring':''}`}>
        {!accountScope?<aside className="ta-settings-sidebar"><div className="ta-settings-sidebar-head"><span>{t('LOUREX Invoice','LOUREX Invoice')}</span><strong>{t('Settings','الإعدادات')}</strong></div><nav className="ta-settings-nav" aria-label={t('Settings sections','أقسام الإعدادات')}>{tabItems.map(([id,label,icon,description])=><button type="button" key={id} className={this.state.tab===id?'is-active':''} aria-current={this.state.tab===id?'page':undefined} onClick={()=>this.setState({tab:id,error:'',message:'',savedSection:null})}><span className="ta-settings-nav-icon"><Icon name={icon}/></span><span><strong>{label}</strong><small>{description}</small></span></button>)}</nav></aside>:null}
        <main className="ta-settings-content">
          {accountScope?this.accountProfile():null}
          {!accountScope&&this.state.tab==='company'?this.workspacePreferences(c,s):null}
          {!accountScope&&this.state.tab==='commercial'?<div className="ta-settings-page ta-commercial-page">{this.pageHeader(t('Commercial','تجاري'),t('Commercial controls','الضوابط التجارية'),t('Banking, tax, payment terms, trade defaults and pricing controls.','إعدادات البنوك والضرائب وشروط الدفع والإعدادات التجارية والتسعير.'),this.saveButton('company'))}<section className="ta-settings-card ta-commercial-controls"><div className="ta-settings-card-body"><CommercialControlsSettings company={c} onChange={company=>this.setState({company,savedSection:null,message:'',error:''})}/></div></section></div>:null}
          {!accountScope&&this.state.tab==='documents'?this.documentSettings(c,s):null}
          {!accountScope&&this.state.tab==='security'?this.securitySettings(s,account):null}
          {this.state.message?<div className="ta-settings-toast is-success" role="status"><Icon name="check"/><span>{this.state.message}</span></div>:null}
          {this.state.error?<div className="ta-settings-toast is-error" role="alert"><Icon name="alert"/><span>{this.state.error}</span></div>:null}
        </main>
      </div>
      <ConfirmDialog open={this.state.confirmCloudRestore} title={t('Restore account data from cloud?','استرجاع بيانات الحساب من السحابة؟')} message={t('The signed-in account copy will replace the current encrypted local vault on this device. Use this only when you intentionally want the cloud account copy.','ستحل نسخة الحساب المسجل في السحابة محل الخزنة المحلية المشفّرة الحالية على هذا الجهاز. استخدم هذا فقط عندما تريد نسخة الحساب السحابية عن قصد.')} confirmLabel={t('Restore from Cloud','استرجاع من السحابة')} onCancel={()=>this.setState({confirmCloudRestore:false})} onConfirm={()=>void this.restoreFromCloud()}/>
      <ConfirmDialog open={this.state.confirmClose} title={accountScope?t('Discard unsaved account changes?','تجاهل تغييرات الحساب غير المحفوظة؟'):t('Discard unsaved settings?','تجاهل الإعدادات غير المحفوظة؟')} message={accountScope?t('You have unsaved company profile changes. Discard them and close Account?','لديك تغييرات غير محفوظة في ملف الشركة. هل تريد تجاهلها وإغلاق الحساب؟'):t('You have unsaved settings. Discard them and close Settings?','لديك إعدادات غير محفوظة. هل تريد تجاهلها وإغلاق الإعدادات؟')} confirmLabel={t('Discard','تجاهل')} onCancel={()=>this.setState({confirmClose:false})} onConfirm={this.discardAndClose}/>
    </Modal>;
  }
}
