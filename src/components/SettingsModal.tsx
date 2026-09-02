import type { AppSettings, AutoLockMinutes, CompanySettings } from '../types.js';
import { cleanImageDataUrl, fileToDataUrl, fileToRawDataUrl } from '../lib/files.js';
import type { CompanyAssetKind } from '../lib/files.js';
import { repairLogoDataUrl } from '../lib/logo-repair.js';
import { rebuildLogoWithoutBackgroundDataUrl } from '../lib/logo-rebuild.js';
import { t } from '../lib/i18n.js';
import { validateCommercialCompany } from '../lib/commercial-controls.js';
import { CommercialControlsSettings } from './CommercialControlsSettings.js';
import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea, Icon } from './UI.js';

interface Props {
  open:boolean; company:CompanySettings; appSettings:AppSettings; onClose:()=>void;
  onSaveCompany:(company:CompanySettings)=>Promise<void>; onSaveAppSettings:(settings:AppSettings)=>Promise<void>;
  onChangePin:(currentPin:string,newPin:string)=>Promise<void>; onLock:()=>void;
  onBackup:(pin:string)=>Promise<void>; onRestore:(file:File,pin:string)=>Promise<void>;
}
interface State {
  tab:'company'|'commercial'|'documents'|'security'|'backup'; company:CompanySettings; appSettings:AppSettings; busy:boolean; cleaningAssets:boolean; message:string; error:string;
  savedSection:'company'|'documents'|null; currentPin:string; newPin:string; confirmPin:string; backupPin:string; restorePin:string; restoreFile:File|null; confirmRestore:boolean; confirmClose:boolean;
  companyInitial:string; documentsInitial:string;
  logoOriginalDataUrl:string; logoCleanedDataUrl:string; logoRebuiltDataUrl:string; logoMode:'auto'|'rebuild'|'original';
}

type AssetField='logoDataUrl'|'signatureDataUrl'|'stampDataUrl';

export class SettingsModal extends React.Component<Props,State> {
  constructor(props:Props){
    super(props);
    const company=structuredClone(props.company);
    const appSettings=structuredClone(props.appSettings);
    this.state={tab:'company',company,appSettings,busy:false,cleaningAssets:false,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',backupPin:'',restorePin:'',restoreFile:null,confirmRestore:false,confirmClose:false,companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'auto'};
  }
  componentDidUpdate(prev:Props):void{
    if(this.props.open&&!prev.open){
      const company=structuredClone(this.props.company);
      const appSettings=structuredClone(this.props.appSettings);
      this.setState({company,appSettings,busy:false,cleaningAssets:false,message:'',error:'',savedSection:null,currentPin:'',newPin:'',confirmPin:'',backupPin:'',restorePin:'',restoreFile:null,confirmRestore:false,confirmClose:false,companyInitial:JSON.stringify(company),documentsInitial:JSON.stringify(appSettings),logoOriginalDataUrl:'',logoCleanedDataUrl:'',logoRebuiltDataUrl:'',logoMode:'auto'},()=>void this.prepareExistingAssets(company));
    }
  }
  private hasUnsavedSettings=()=>JSON.stringify(this.state.company)!==this.state.companyInitial||JSON.stringify(this.state.appSettings)!==this.state.documentsInitial;
  private requestClose=()=>{if(this.state.busy||this.state.cleaningAssets)return;if(this.hasUnsavedSettings()){this.setState({confirmClose:true});return;}this.props.onClose();};
  private discardAndClose=()=>this.setState({confirmClose:false},this.props.onClose);
  private setCompany=(key:keyof CompanySettings,value:any)=>this.setState({company:{...this.state.company,[key]:value},savedSection:null,message:'',error:''});
  private setBank=(key:keyof CompanySettings['bank'],value:string)=>this.setState({company:{...this.state.company,bank:{...this.state.company.bank,[key]:value}},savedSection:null,message:'',error:''});
  private setNumbering=(key:keyof AppSettings['numbering'],value:any)=>this.setState({appSettings:{...this.state.appSettings,numbering:{...this.state.appSettings.numbering,[key]:value}},savedSection:null,message:'',error:''});
  private assetKind=(field:AssetField):CompanyAssetKind=>field==='logoDataUrl'?'logo':field==='signatureDataUrl'?'signature':'stamp';
  private cleanCompanyAssets=async(company:CompanySettings):Promise<CompanySettings>=>{
    const [signatureDataUrl,stampDataUrl]=await Promise.all([
      cleanImageDataUrl(company.signatureDataUrl,'signature'),
      cleanImageDataUrl(company.stampDataUrl,'stamp')
    ]);
    return {...company,signatureDataUrl,stampDataUrl};
  };
  private prepareExistingAssets=async(source:CompanySettings)=>{
    if(!this.props.open)return;
    this.setState({cleaningAssets:true});
    const [cleaned,repairedLogo]=await Promise.all([this.cleanCompanyAssets(source),repairLogoDataUrl(source.logoDataUrl)]);
    if(!this.props.open){this.setState({cleaningAssets:false});return;}
    this.setState(state=>{
      const company={...state.company};
      let changed=false,logoChanged=false;
      const hasSavedLogo=Boolean(source.logoDataUrl&&!source.logoDataUrl.includes('lourex-logo.svg'));
      const logoOriginalDataUrl=hasSavedLogo?source.logoDataUrl:state.logoOriginalDataUrl;
      const logoCleanedDataUrl=hasSavedLogo?repairedLogo:state.logoCleanedDataUrl;
      const logoRebuiltDataUrl='';
      let logoMode:State['logoMode']=hasSavedLogo&&repairedLogo===source.logoDataUrl?'original':state.logoMode;
      if(source.logoDataUrl&&state.company.logoDataUrl===source.logoDataUrl&&repairedLogo!==source.logoDataUrl){
        company.logoDataUrl=repairedLogo;logoMode='auto';changed=true;logoChanged=true;
      }
      const fields:AssetField[]=['signatureDataUrl','stampDataUrl'];
      for(const field of fields){
        if(state.company[field]===source[field]&&cleaned[field]!==source[field]){company[field]=cleaned[field];changed=true;}
      }
      const message=logoChanged?t('The saved logo was re-cleaned. If any background remains, use Recreate logo without background.','تمت إعادة تنظيف الشعار المحفوظ. إذا بقيت أي خلفية استخدم خيار إعادة إنشاء الشعار بدون خلفية.'):changed?t('Signature and stamp backgrounds cleaned. Review the previews and save.','تم تنظيف خلفية التوقيع والختم. راجع المعاينات ثم اضغط حفظ.'):state.message;
      return {company,logoOriginalDataUrl,logoCleanedDataUrl,logoRebuiltDataUrl,logoMode,cleaningAssets:false,savedSection:changed?null:state.savedSection,message,error:''};
    });
  };
  private upload=async(field:AssetField,file?:File)=>{
    if(!file)return;
    this.setState({cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      if(field==='logoDataUrl'){
        const original=await fileToRawDataUrl(file);
        const firstPass=await cleanImageDataUrl(original,'logo');
        const cleaned=await repairLogoDataUrl(firstPass);
        this.setState(state=>({company:{...state.company,logoDataUrl:cleaned},logoOriginalDataUrl:original,logoCleanedDataUrl:cleaned,logoRebuiltDataUrl:'',logoMode:'auto',cleaningAssets:false,savedSection:null,message:t('Logo prepared. If any background remains, use Recreate logo without background.','تم تجهيز الشعار. إذا بقيت أي خلفية استخدم خيار إعادة إنشاء الشعار بدون خلفية.'),error:''}));
        return;
      }
      const data=await fileToDataUrl(file,4*1024*1024,this.assetKind(field));
      this.setState(state=>({company:{...state.company,[field]:data},cleaningAssets:false,savedSection:null,message:t('Background cleaned automatically. Save to apply it to documents.','تم تنظيف الخلفية تلقائيًا. اضغط حفظ لتطبيقها على المستندات.'),error:''}));
    }catch(e){this.setState({cleaningAssets:false,error:e instanceof Error?e.message:t('Image upload failed.','فشل رفع الصورة.')});}
  };
  private rebuildLogo=async()=>{
    const source=this.state.logoOriginalDataUrl||this.state.company.logoDataUrl;
    if(!source||source.includes('lourex-logo.svg')){this.setState({error:t('Upload or save a company logo first.','ارفع أو احفظ شعار الشركة أولًا.')});return;}
    this.setState({cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      const rebuilt=await rebuildLogoWithoutBackgroundDataUrl(source);
      if(!rebuilt||rebuilt===source){
        this.setState({cleaningAssets:false,error:t('The logo could not be reconstructed reliably. Try uploading the original image again.','تعذر إعادة إنشاء الشعار بشكل موثوق. جرّب رفع الصورة الأصلية مرة أخرى.')});
        return;
      }
      this.setState(state=>({company:{...state.company,logoDataUrl:rebuilt},logoRebuiltDataUrl:rebuilt,logoMode:'rebuild',cleaningAssets:false,savedSection:null,message:t('Transparent logo recreated. Review the preview, then press Save to use it on documents.','تمت إعادة إنشاء الشعار بدون خلفية. راجع المعاينة ثم اضغط حفظ لاستخدامه في المستندات.'),error:''}));
    }catch(e){this.setState({cleaningAssets:false,error:e instanceof Error?e.message:t('Unable to recreate the logo.','تعذر إعادة إنشاء الشعار.')});}
  };
  private setLogoMode=(logoMode:State['logoMode'])=>{
    const source=logoMode==='auto'?this.state.logoCleanedDataUrl:logoMode==='rebuild'?this.state.logoRebuiltDataUrl:this.state.logoOriginalDataUrl;
    if(!source)return;
    const message=logoMode==='auto'?t('Enhanced automatic logo cleanup selected.','تم اختيار التنظيف التلقائي المحسّن للشعار.'):logoMode==='rebuild'?t('Recreated transparent logo selected.','تم اختيار الشعار المعاد إنشاؤه بدون خلفية.'):t('Original logo selected with no background processing.','تم اختيار الشعار الأصلي بدون معالجة للخلفية.');
    this.setState(state=>({logoMode,company:{...state.company,logoDataUrl:source},savedSection:null,message,error:''}));
  };
  private saveCompany=async()=>{
    if(!this.state.company.nameEn.trim()&&!this.state.company.nameAr.trim()){this.setState({error:t('Company name is required.','اسم الشركة مطلوب.')});return;}
    const commercialError=validateCommercialCompany(this.state.company);if(commercialError){this.setState({error:commercialError});return;}
    this.setState({busy:true,cleaningAssets:true,error:'',message:'',savedSection:null});
    try{
      const company=await this.cleanCompanyAssets(this.state.company);
      await this.props.onSaveCompany(company);
      this.setState({company,companyInitial:JSON.stringify(company),busy:false,cleaningAssets:false,savedSection:'company',message:t('Company settings saved. Logo artwork is preserved.','تم حفظ إعدادات الشركة مع الحفاظ على تفاصيل الشعار.')});
    }catch(e){this.setState({busy:false,cleaningAssets:false,error:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')});}
  };
  private saveDocuments=async()=>{
    this.setState({busy:true,error:'',message:'',savedSection:null});
    try{await this.props.onSaveAppSettings(this.state.appSettings);this.setState({busy:false,documentsInitial:JSON.stringify(this.state.appSettings),savedSection:'documents',message:t('Document settings saved.','تم حفظ إعدادات المستندات.')});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')});}
  };
  private changeInterfaceLanguage=async(value:AppSettings['uiLanguage'])=>{
    const previous=this.state.appSettings;
    const next={...previous,uiLanguage:value};
    this.setState({appSettings:next,error:'',message:'',savedSection:null});
    try{await this.props.onSaveAppSettings(next);this.setState({documentsInitial:JSON.stringify(next),savedSection:'documents'});}
    catch(e){this.setState({appSettings:previous,error:e instanceof Error?e.message:t('Unable to change interface language.','تعذر تغيير لغة الواجهة.')});}
  };
  private changeAutoLock=async(value:AutoLockMinutes)=>{
    const previous=this.state.appSettings;
    const next={...previous,autoLockMinutes:value};
    this.setState({appSettings:next,error:'',message:'',savedSection:null});
    try{await this.props.onSaveAppSettings(next);this.setState({documentsInitial:JSON.stringify(next),message:t('Auto-lock setting saved.','تم حفظ إعداد القفل التلقائي.')});}
    catch(e){this.setState({appSettings:previous,error:e instanceof Error?e.message:t('Unable to save auto-lock setting.','تعذر حفظ إعداد القفل التلقائي.')});}
  };
  private changePin=async()=>{if(!/^\d{4,12}$/.test(this.state.newPin)){this.setState({error:t('New PIN must contain 4–12 digits.','يجب أن يتكون رمز PIN الجديد من 4 إلى 12 رقمًا.')});return;}if(this.state.newPin!==this.state.confirmPin){this.setState({error:t('New PIN confirmation does not match.','تأكيد رمز PIN الجديد غير مطابق.')});return;}this.setState({busy:true,error:'',message:'',savedSection:null});try{await this.props.onChangePin(this.state.currentPin,this.state.newPin);this.setState({busy:false,message:t('PIN changed and local data re-encrypted.','تم تغيير رمز PIN وإعادة تشفير البيانات المحلية.'),currentPin:'',newPin:'',confirmPin:''});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to change PIN.','تعذر تغيير رمز PIN.')});}};
  private backup=async()=>{this.setState({busy:true,error:'',message:'',savedSection:null});try{await this.props.onBackup(this.state.backupPin);this.setState({busy:false,message:t('Encrypted backup created.','تم إنشاء نسخة احتياطية مشفّرة.'),backupPin:''});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Backup failed.','فشل إنشاء النسخة الاحتياطية.')});}};
  private restore=async()=>{if(!this.state.restoreFile){this.setState({error:t('Choose a LOUREX backup file first.','اختر ملف نسخة احتياطية لـ LOUREX أولًا.')});return;}this.setState({busy:true,error:'',message:'',savedSection:null});try{await this.props.onRestore(this.state.restoreFile,this.state.restorePin);this.setState({busy:false,message:t('Backup restored successfully.','تمت استعادة النسخة الاحتياطية بنجاح.'),restorePin:'',restoreFile:null,confirmRestore:false});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Restore failed.','فشلت الاستعادة.')});}};
  private saveButton(section:'company'|'documents'):any{
    const saved=this.state.savedSection===section;
    const processing=section==='company'&&this.state.cleaningAssets;
    return <Button icon={saved?'check':'save'} variant="primary" disabled={this.state.busy||processing} onClick={section==='company'?this.saveCompany:this.saveDocuments}>{processing?t('Cleaning images…','جارٍ معالجة الصور…'):this.state.busy?t('Saving…','جارٍ الحفظ…'):saved?t('Saved','تم الحفظ'):t('Save','حفظ')}</Button>;
  }

  render():any{
    const c=this.state.company,s=this.state.appSettings;const hasCompanyLogo=Boolean(c.logoDataUrl&&!c.logoDataUrl.includes('lourex-logo.svg'));
    return <Modal open={this.props.open} title={t('Settings','الإعدادات')} size="xl" onClose={this.requestClose}><div className="settings-layout"><nav className="settings-tabs">{([['company',t('Company','الشركة')],['commercial',t('Commercial','تجاري')],['documents',t('Documents','المستندات')],['security',t('Security','الأمان')],['backup',t('Backup','النسخ الاحتياطي')]] as const).map(([id,label])=><button type="button" key={id} className={this.state.tab===id?'active':''} onClick={()=>this.setState({tab:id,error:'',message:'',savedSection:null})}>{label}</button>)}</nav><div className="settings-panel">
    {this.state.tab==='company'?<div><div className="settings-title"><div><p className="eyebrow">{t('Company','الشركة')}</p><h3>{t('Company details','بيانات الشركة')}</h3></div>{this.saveButton('company')}</div><div className="settings-section"><div className="form-grid two">
      <Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input value={c.nameEn} onChange={(e:any)=>this.setCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input dir="rtl" value={c.nameAr} onChange={(e:any)=>this.setCompany('nameAr',e.target.value)}/></Field>
      <Field label={t('Address English','العنوان بالإنجليزية')}><Input value={c.addressEn} onChange={(e:any)=>this.setCompany('addressEn',e.target.value)}/></Field><Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={c.addressAr} onChange={(e:any)=>this.setCompany('addressAr',e.target.value)}/></Field>
      <Field label={t('City','المدينة')}><Input value={c.city} onChange={(e:any)=>this.setCompany('city',e.target.value)}/></Field><Field label={t('Country','الدولة')}><Input value={c.country} onChange={(e:any)=>this.setCompany('country',e.target.value)}/></Field>
      <Field label={t('Phone','الهاتف')}><Input value={c.phone} onChange={(e:any)=>this.setCompany('phone',e.target.value)}/></Field><Field label={t('Email','البريد الإلكتروني')}><Input type="email" value={c.email} onChange={(e:any)=>this.setCompany('email',e.target.value)}/></Field>
      <Field label={t('Website','الموقع الإلكتروني')}><Input value={c.website} onChange={(e:any)=>this.setCompany('website',e.target.value)}/></Field><Field label={t('VAT Number','رقم ضريبة القيمة المضافة')}><Input value={c.vatNumber} onChange={(e:any)=>this.setCompany('vatNumber',e.target.value)}/></Field>
      <Field label={t('Tax Number','الرقم الضريبي')}><Input value={c.taxNumber} onChange={(e:any)=>this.setCompany('taxNumber',e.target.value)}/></Field><Field label={t('Commercial Registration','السجل التجاري')}><Input value={c.commercialRegistration} onChange={(e:any)=>this.setCompany('commercialRegistration',e.target.value)}/></Field>
    </div><div className="asset-settings"><div className="asset-control logo-asset-control"><label><span>{t('Logo','الشعار')}</span><div className="asset-preview">{hasCompanyLogo?<img src={c.logoDataUrl} alt={t('Logo','الشعار')}/>:<Icon name="upload"/>}</div><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>this.upload('logoDataUrl',e.target.files?.[0])}/></label>{this.state.logoOriginalDataUrl?<><div className="logo-mode-switch" role="group" aria-label={t('Logo processing','معالجة الشعار')}><button type="button" className={this.state.logoMode==='auto'?'active':''} onClick={()=>this.setLogoMode('auto')}>{t('Auto clean','تنظيف تلقائي')}</button><button type="button" className={this.state.logoMode==='original'?'active':''} onClick={()=>this.setLogoMode('original')}>{t('Original','الأصلي')}</button></div><button type="button" className={`logo-rebuild-action ${this.state.logoMode==='rebuild'?'active':''}`} disabled={this.state.cleaningAssets||this.state.busy} onClick={()=>void this.rebuildLogo()}>{this.state.cleaningAssets?t('Recreating logo…','جارٍ إعادة إنشاء الشعار…'):t('Recreate logo without background','إعادة إنشاء الشعار بدون خلفية')}</button>{this.state.logoRebuiltDataUrl&&this.state.logoMode!=='rebuild'?<button type="button" className="logo-rebuild-restore" onClick={()=>this.setLogoMode('rebuild')}>{t('Use recreated version','استخدام النسخة المعاد إنشاؤها')}</button>:null}</>:null}</div><label><span>{t('Signature','التوقيع')}</span><div className="asset-preview">{c.signatureDataUrl?<img src={c.signatureDataUrl} alt={t('Signature','التوقيع')}/>:<Icon name="upload"/>}</div><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>this.upload('signatureDataUrl',e.target.files?.[0])}/></label><label><span>{t('Stamp','الختم')}</span><div className="asset-preview">{c.stampDataUrl?<img src={c.stampDataUrl} alt={t('Stamp','الختم')}/>:<Icon name="upload"/>}</div><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>this.upload('stampDataUrl',e.target.files?.[0])}/></label></div><p className={`asset-clean-hint ${this.state.cleaningAssets?'is-cleaning':''}`}><Icon name={this.state.cleaningAssets?'refresh':'check'}/><span>{this.state.cleaningAssets?t('Processing company images…','جارٍ معالجة صور الشركة…'):t('Auto clean is conservative. Recreate logo without background is the stronger option for stubborn dark/gray remnants.','التنظيف التلقائي محافظ. خيار إعادة إنشاء الشعار بدون خلفية هو الحل الأقوى لبقايا الخلفية السوداء أو الرمادية العنيدة.')}</span></p></div>
    <div className="settings-section"><h4>{t('Bank details','بيانات البنك')}</h4><div className="form-grid two"><Field label={t('Bank Name','اسم البنك')}><Input value={c.bank.bankName} onChange={(e:any)=>this.setBank('bankName',e.target.value)}/></Field><Field label={t('Account Name','اسم الحساب')}><Input value={c.bank.accountName} onChange={(e:any)=>this.setBank('accountName',e.target.value)}/></Field><Field label="IBAN"><Input value={c.bank.iban} onChange={(e:any)=>this.setBank('iban',e.target.value)}/></Field><Field label="SWIFT / BIC"><Input value={c.bank.swift} onChange={(e:any)=>this.setBank('swift',e.target.value)}/></Field><Field label={t('Bank Currency','عملة البنك')}><Input value={c.bank.currency} onChange={(e:any)=>this.setBank('currency',e.target.value.toUpperCase())}/></Field></div></div>
    <div className="settings-section"><h4>{t('Language & defaults','اللغة والإعدادات الافتراضية')}</h4><div className="form-grid two"><Field label={t('Interface Language','لغة الواجهة')}><Select value={s.uiLanguage||'en'} onChange={(e:any)=>void this.changeInterfaceLanguage(e.target.value as AppSettings['uiLanguage'])}><option value="en">English</option><option value="ar">العربية</option></Select></Field><Field label={t('Default Currency','العملة الافتراضية')}><Input value={c.defaultCurrency} onChange={(e:any)=>this.setCompany('defaultCurrency',e.target.value.toUpperCase())}/></Field><Field label={t('Default Document Language','لغة المستند الافتراضية')}><Select value={c.defaultLanguage} onChange={(e:any)=>this.setCompany('defaultLanguage',e.target.value)}><option value="en">English</option><option value="ar">العربية</option><option value="bilingual">{t('Arabic + English','العربية + الإنجليزية')}</option></Select></Field><Field label={t('Default Payment Terms','شروط الدفع الافتراضية')}><Input value={c.defaultPaymentTerms} onChange={(e:any)=>this.setCompany('defaultPaymentTerms',e.target.value)}/></Field><Field label={t('Default Incoterm','شرط التجارة الافتراضي')}><Input value={c.defaultIncoterm} onChange={(e:any)=>this.setCompany('defaultIncoterm',e.target.value)}/></Field><Field label={t('Default Delivery Time','مدة التسليم الافتراضية')}><Input value={c.defaultDeliveryTime} onChange={(e:any)=>this.setCompany('defaultDeliveryTime',e.target.value)}/></Field><Field label={t('Default Validity (days)','مدة الصلاحية الافتراضية (أيام)')}><Input type="number" min="0" max="3650" step="1" value={String(c.defaultValidityDays)} onChange={(e:any)=>this.setCompany('defaultValidityDays',Math.min(3650,Math.max(0,Math.trunc(Number(e.target.value)||0))))}/></Field><Field label={t('Default Footer Text','نص التذييل الافتراضي')} className="span-2"><Input value={c.defaultFooterText} onChange={(e:any)=>this.setCompany('defaultFooterText',e.target.value)}/></Field><Field label={t('Default Notes','الملاحظات الافتراضية')} className="span-2"><Textarea rows="3" value={c.defaultNotes} onChange={(e:any)=>this.setCompany('defaultNotes',e.target.value)}/></Field></div></div></div>:null}

    {this.state.tab==='commercial'?<div><div className="settings-title"><div><p className="eyebrow">{t('Commercial','تجاري')}</p><h3>{t('Commercial controls','الضوابط التجارية')}</h3></div>{this.saveButton('company')}</div><CommercialControlsSettings company={c} onChange={company=>this.setState({company,savedSection:null,message:'',error:''})}/></div>:null}

    {this.state.tab==='documents'?<div><div className="settings-title"><div><p className="eyebrow">{t('Documents','المستندات')}</p><h3>{t('Numbering','الترقيم')}</h3></div>{this.saveButton('documents')}</div><div className="settings-section"><div className="form-grid two"><Field label={t('Proforma Prefix','بادئة الفاتورة المبدئية')}><Input value={s.numbering.proformaPrefix} onChange={(e:any)=>this.setNumbering('proformaPrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field><Field label={t('Invoice Prefix','بادئة الفاتورة')}><Input value={s.numbering.invoicePrefix} onChange={(e:any)=>this.setNumbering('invoicePrefix',e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8))}/></Field></div><div className="numbering-preview"><span>{s.numbering.proformaPrefix || 'PI'}-YYYY-0001</span><span>{s.numbering.invoicePrefix || 'INV'}-YYYY-0001</span></div><p className="settings-note">{t('Document sequences only move forward. Deleted numbers are never automatically reused.','تسلسل أرقام المستندات يتحرك للأمام فقط، ولا تتم إعادة استخدام الأرقام المحذوفة تلقائيًا.')}</p></div></div>:null}

    {this.state.tab==='security'?<div><div className="settings-title"><div><p className="eyebrow">{t('Security','الأمان')}</p><h3>{t('Local access','الدخول المحلي')}</h3></div></div><div className="settings-section"><h4>{t('Auto Lock','القفل التلقائي')}</h4><Field label={t('Lock after inactivity','القفل بعد عدم النشاط')}><Select value={String(s.autoLockMinutes)} onChange={(e:any)=>void this.changeAutoLock(Number(e.target.value) as AutoLockMinutes)}><option value="0">{t('Never','أبدًا')}</option><option value="5">{t('5 minutes','5 دقائق')}</option><option value="15">{t('15 minutes','15 دقيقة')}</option><option value="30">{t('30 minutes','30 دقيقة')}</option></Select></Field><Button icon="lock" onClick={this.props.onLock}>{t('Lock App','قفل التطبيق')}</Button></div><div className="settings-section"><h4>{t('Change PIN','تغيير رمز PIN')}</h4><div className="form-grid one"><Field label={t('Current PIN','رمز PIN الحالي')}><Input inputMode="numeric" type="password" value={this.state.currentPin} onChange={(e:any)=>this.setState({currentPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('New PIN','رمز PIN الجديد')}><Input inputMode="numeric" type="password" value={this.state.newPin} onChange={(e:any)=>this.setState({newPin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('Confirm New PIN','تأكيد رمز PIN الجديد')}><Input inputMode="numeric" type="password" value={this.state.confirmPin} onChange={(e:any)=>this.setState({confirmPin:e.target.value.replace(/\D/g,'')})}/></Field></div><Button variant="primary" disabled={this.state.busy} onClick={this.changePin}>{t('Change PIN','تغيير رمز PIN')}</Button><p className="settings-note">{t('Changing the PIN decrypts the current vault in memory and atomically re-encrypts it with a new salt and key.','عند تغيير رمز PIN يتم فك تشفير الخزنة في الذاكرة ثم إعادة تشفيرها آمنًا بمفتاح وملح جديدين.')}</p></div></div>:null}

    {this.state.tab==='backup'?<div><div className="settings-title"><div><p className="eyebrow">{t('Data Safety','حماية البيانات')}</p><h3>{t('Backup / Restore','نسخ احتياطي / استعادة')}</h3></div></div><div className="backup-cards"><section className="backup-card"><span className="backup-icon"><Icon name="backup"/></span><h4>{t('Backup Data','نسخ البيانات احتياطيًا')}</h4><p>{t('Creates one encrypted .lourex-backup file containing company settings, customers, documents, numbering and preferences.','ينشئ ملف .lourex-backup مشفّرًا واحدًا يحتوي إعدادات الشركة والعملاء والمستندات والترقيم والتفضيلات.')}</p><Field label={t('Current PIN','رمز PIN الحالي')}><Input inputMode="numeric" type="password" value={this.state.backupPin} onChange={(e:any)=>this.setState({backupPin:e.target.value.replace(/\D/g,'')})}/></Field><Button variant="primary" disabled={this.state.busy||!this.state.backupPin} onClick={this.backup}>{t('Backup Data','إنشاء نسخة احتياطية')}</Button></section><section className="backup-card danger-zone"><span className="backup-icon"><Icon name="restore"/></span><h4>{t('Restore Backup','استعادة نسخة احتياطية')}</h4><p>{t('Validated restore replaces the current encrypted local vault. Existing data is not merged.','الاستعادة بعد التحقق تستبدل الخزنة المحلية المشفّرة الحالية، ولا يتم دمج البيانات الموجودة.')}</p><label className="file-picker"><input type="file" accept=".lourex-backup,application/json" onChange={(e:any)=>this.setState({restoreFile:e.target.files?.[0]??null})}/><span>{this.state.restoreFile?.name||t('Choose backup file','اختر ملف النسخة الاحتياطية')}</span></label><Field label={t('Backup PIN / Password','رمز PIN / كلمة مرور النسخة')}><Input inputMode="numeric" type="password" value={this.state.restorePin} onChange={(e:any)=>this.setState({restorePin:e.target.value.replace(/\D/g,'')})}/></Field><Button variant="danger" disabled={this.state.busy||!this.state.restoreFile||!this.state.restorePin} onClick={()=>this.setState({confirmRestore:true})}>{t('Restore Data','استعادة البيانات')}</Button></section></div></div>:null}
    {this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}{this.state.error?<div className="settings-message error" role="alert">{this.state.error}</div>:null}
  </div></div><ConfirmDialog open={this.state.confirmRestore} title={t('Restore data?','استعادة البيانات؟')} message={t('This will replace the current local data. The backup file is validated before it is written.','سيتم استبدال البيانات المحلية الحالية. يتم التحقق من ملف النسخة الاحتياطية قبل كتابته.')} confirmLabel={t('Restore','استعادة')} onCancel={()=>this.setState({confirmRestore:false})} onConfirm={()=>{this.setState({confirmRestore:false});void this.restore();}}/><ConfirmDialog open={this.state.confirmClose} title={t('Discard unsaved settings?','تجاهل الإعدادات غير المحفوظة؟')} message={t('You have unsaved company or document settings. Discard them and close Settings?','لديك إعدادات شركة أو مستندات غير محفوظة. هل تريد تجاهلها وإغلاق الإعدادات؟')} confirmLabel={t('Discard','تجاهل')} onCancel={()=>this.setState({confirmClose:false})} onConfirm={this.discardAndClose}/></Modal>;
  }
}
