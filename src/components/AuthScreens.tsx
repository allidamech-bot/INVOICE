import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { t } from '../lib/i18n.js';
import { currentCloudUser, resolveCloudConflictWithLocal } from '../cloud/firebase.js';
import { getAccountVaultSecret, retireAccountVaultSecret } from '../cloud/account-access.js';
import { changePin } from '../storage/vault.js';
import { getSecurity } from '../storage/db.js';
import { verifyPin } from '../crypto/crypto.js';
import { ThemeControl } from './ThemeControl.js';

const MAX_SETUP_LOGO_BYTES=4*1024*1024;
const SETUP_LOGO_TYPES=/^image\/(png|webp|jpeg)$/i;
const PIN_PATTERN=/^\d{4,12}$/;

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface SetupState {
  company: CompanySettings;
  pin: string;
  confirmPin: string;
  error: string;
  busy: boolean;
  logoBusy: boolean;
}

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  private logoUploadId=0;
  state: SetupState = {
    company: this.props.initialCompany,
    pin:'',
    confirmPin:'',
    error: '',
    busy: false,
    logoBusy: false
  };

  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value }, error:'' });
  private pinValue=(value:string)=>value.replace(/\D/g,'').slice(0,12);
  private selectLogo = (input:HTMLInputElement):void => { const file=input.files?.[0]; input.value=''; void this.uploadLogo(file); };
  private uploadLogo = async (file?: File): Promise<void> => {
    if (!file) return;
    const uploadId=++this.logoUploadId;
    if(file.size>MAX_SETUP_LOGO_BYTES){this.setState({error:t('Image is too large. Use a file smaller than 4 MB.','حجم الصورة كبير جدًا. استخدم ملفًا أصغر من 4 ميجابايت.'),logoBusy:false});return;}
    if(!SETUP_LOGO_TYPES.test(file.type)){this.setState({error:t('Use a PNG, WebP, or JPEG image.','استخدم صورة بصيغة PNG أو WebP أو JPEG.'),logoBusy:false});return;}
    this.setState({error:'',logoBusy:true});
    try {
      const data = await fileToDataUrl(file,MAX_SETUP_LOGO_BYTES,'logo');
      if(uploadId!==this.logoUploadId)return;
      this.setState(state=>({company:{...state.company,logoDataUrl:data},error:'',logoBusy:false}));
    }
    catch {
      if(uploadId!==this.logoUploadId)return;
      this.setState({error:t('Unable to process this image. Try another PNG, WebP, or JPEG file.','تعذرت معالجة هذه الصورة. جرّب ملف PNG أو WebP أو JPEG آخر.'),logoBusy:false});
    }
  };
  private finish = async (): Promise<void> => {
    if(this.state.logoBusy||this.state.busy)return;
    if (!this.state.company.nameEn.trim() && !this.state.company.nameAr.trim()) {
      this.setState({ error: t('Company name is required.','اسم الشركة مطلوب.') });
      return;
    }
    if(!PIN_PATTERN.test(this.state.pin)){
      this.setState({error:t('Create a PIN containing 4–12 digits.','أنشئ رمز PIN مكوّنًا من 4 إلى 12 رقمًا.')});
      return;
    }
    if(this.state.pin!==this.state.confirmPin){
      this.setState({error:t('PIN confirmation does not match.','تأكيد رمز PIN غير مطابق.')});
      return;
    }
    const user=currentCloudUser();
    if(!user){this.setState({error:t('Your account session ended. Sign in again.','انتهت جلسة حسابك. سجّل الدخول مرة أخرى.')});return;}
    this.setState({ busy: true, error: '' });
    try {
      await this.props.onFinish(this.state.pin, this.state.company);
    }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Setup failed.','فشل الإعداد.'), busy: false }); }
  };
  private languageSwitch():any{return <div className="auth-utility-controls"><ThemeControl compact language={this.props.language}/><button type="button" className="auth-language-switch" disabled={this.state.busy||this.state.logoBusy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button></div>;}

  render(): any {
    const { company, pin, confirmPin, busy, logoBusy, error } = this.state;
    const signedIn=currentCloudUser();
    return <div className="auth-page"><div className="auth-card setup-card setup-card-v115 account-managed-setup">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-account-badge"><span>{t('Signed in','تم تسجيل الدخول')}</span><strong>{signedIn?.email||''}</strong></div>
      <div className="auth-section setup-essential-step"><p className="eyebrow">{t('WORKSPACE SETUP','إعداد مساحة العمل')}</p><h1>{t('Set up your protected workspace','جهّز مساحة عملك المحمية')}</h1><p className="subtle">{t('Your account identifies you. Your local PIN is the second lock that protects the encrypted LOUREX workspace on this device.','يحدد الحساب هويتك، بينما رمز PIN المحلي هو القفل الثاني الذي يحمي مساحة LOUREX المشفّرة على هذا الجهاز.')}</p><div className="account-managed-security-note pin-required-note" role="note"><strong>{t('Account + PIN protection','حماية الحساب + PIN')}</strong><span>{t('After signing in, LOUREX asks for this PIN before opening your business data. Keep it somewhere safe.','بعد تسجيل الدخول سيطلب LOUREX هذا الرمز قبل فتح بيانات أعمالك. احتفظ به في مكان آمن.')}</span></div><div className="form-grid two setup-company-essential-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={this.props.language!=='ar'} dir="ltr" value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={this.props.language==='ar'} dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field></div><div className="form-grid two setup-pin-grid"><Field label={t('Create PIN · 4–12 digits','إنشاء PIN · من 4 إلى 12 رقمًا')}><Input inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={pin} onChange={(e:any)=>this.setState({pin:this.pinValue(e.target.value),error:''})}/></Field><Field label={t('Confirm PIN','تأكيد PIN')}><Input inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={confirmPin} onChange={(e:any)=>this.setState({confirmPin:this.pinValue(e.target.value),error:''})}/></Field></div><label className="upload-tile setup-logo-tile"><span>{t('Company Logo · Optional','شعار الشركة · اختياري')}</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt={t('Company logo preview','معاينة شعار الشركة')}/><b>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):t('Tap to choose logo','اضغط لاختيار الشعار')}</b><input type="file" disabled={busy||logoBusy} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectLogo(e.currentTarget)}/></label><div className="setup-later-note"><strong>{t('You can start immediately','يمكنك البدء مباشرة')}</strong><span>{t('Address, tax, bank details, signature, stamp and document defaults remain available in Settings.','يبقى العنوان والضريبة وبيانات البنك والتوقيع والختم وإعدادات المستندات متاحة في الإعدادات.')}</span></div><Button className="setup-primary-action" variant="primary" disabled={busy||logoBusy} onClick={()=>void this.finish()}>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):busy?t('Preparing workspace…','جارٍ تجهيز مساحة العمل…'):t('Create protected workspace','إنشاء مساحة العمل المحمية')}</Button></div>
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; logoDataUrl:string; language:UiLanguage; onLanguageChange:(language:UiLanguage)=>Promise<void>; }
interface UnlockState { pin:string; confirmPin:string; error:string; busy:boolean; checking:boolean; migrateAccountSecret:boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { pin:'', confirmPin:'', error:'', busy:false, checking:true, migrateAccountSecret:false };
  private accountSecret='';

  componentDidMount():void{void this.detectSecurityMode();}

  private pinValue=(value:string)=>value.replace(/\D/g,'').slice(0,12);
  private detectSecurityMode=async():Promise<void>=>{
    this.setState({checking:true,error:''});
    try{
      const user=currentCloudUser();
      if(!user)throw new Error(t('Your account session ended. Sign in again.','انتهت جلسة حسابك. سجّل الدخول مرة أخرى.'));
      const security=await getSecurity();
      if(!security)throw new Error(t('Security settings are missing.','إعدادات الأمان غير موجودة.'));
      let secret:string|null=null;
      try{secret=await getAccountVaultSecret(user.uid);}catch{}
      if(secret){
        try{
          await verifyPin(secret,security);
          this.accountSecret=secret;
          this.setState({checking:false,migrateAccountSecret:true});
          return;
        }catch{}
      }
      this.setState({checking:false,migrateAccountSecret:false});
    }catch(error){
      this.setState({checking:false,error:error instanceof Error?error.message:t('Unable to prepare secure access.','تعذر تجهيز الوصول الآمن.')});
    }
  };

  private submit=async(e:any):Promise<void>=>{
    e.preventDefault();
    if(this.state.busy)return;
    const pin=this.state.pin;
    if(!PIN_PATTERN.test(pin)){this.setState({error:t('Enter a PIN containing 4–12 digits.','أدخل رمز PIN مكوّنًا من 4 إلى 12 رقمًا.')});return;}
    if(this.state.migrateAccountSecret&&pin!==this.state.confirmPin){this.setState({error:t('PIN confirmation does not match.','تأكيد رمز PIN غير مطابق.')});return;}
    this.setState({busy:true,error:''});
    try{
      if(this.state.migrateAccountSecret){
        if(!this.accountSecret)throw new Error(t('Secure upgrade data is unavailable. Reload and try again.','بيانات الترقية الآمنة غير متاحة. أعد تحميل الصفحة وحاول مجددًا.'));
        const user=currentCloudUser();
        if(!user)throw new Error(t('Your account session ended. Sign in again.','انتهت جلسة حسابك. سجّل الدخول مرة أخرى.'));
        await changePin(this.accountSecret,pin);
        // The user just proved ownership of the legacy account-key encrypted
        // workspace and explicitly chose a new PIN. Publish that re-keyed local
        // vault as the authoritative account copy even when an old sync anchor
        // is absent, then retire the historical automatic unlock secret.
        try{
          await resolveCloudConflictWithLocal(user.uid);
          await retireAccountVaultSecret(user.uid);
        }catch{}
        this.accountSecret='';
      }
      await this.props.onUnlock(pin);
    }catch(error){
      const message=error instanceof Error?error.message:t('Unable to open your workspace.','تعذر فتح مساحة العمل.');
      this.setState({busy:false,error:/wrong pin/i.test(message)?t('Incorrect PIN.','رمز PIN غير صحيح.'):message,pin:'',confirmPin:''});
    }
  };

  private languageSwitch():any{return <div className="auth-utility-controls"><ThemeControl compact language={this.props.language}/><button type="button" className="auth-language-switch" disabled={this.state.busy||this.state.checking} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button></div>;}

  render(): any {
    if(this.state.checking)return <div className="auth-page"><div className="auth-card unlock-card pin-unlock-card">{this.languageSwitch()}<Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Preparing secure access…','جارٍ تجهيز الوصول الآمن…')}</h1><p className="subtle">{t('Checking this workspace before asking for its PIN.','جارٍ التحقق من مساحة العمل قبل طلب رمز PIN الخاص بها.')}</p><span className="account-access-loader" aria-hidden="true"/>{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}</div></div>;
    const migrating=this.state.migrateAccountSecret;
    return <div className="auth-page"><form className="auth-card unlock-card pin-unlock-card" onSubmit={this.submit}>{this.languageSwitch()}<Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">{migrating?t('SECURITY UPGRADE','ترقية الأمان'):t('SECOND SECURITY STEP','خطوة الأمان الثانية')}</p><h1>{migrating?t('Create your LOUREX PIN','أنشئ رمز PIN الخاص بـ LOUREX'):t('Enter your LOUREX PIN','أدخل رمز PIN الخاص بـ LOUREX')}</h1><p className="subtle">{migrating?t('Your existing encrypted workspace used automatic account access. Create a private PIN now; from this point on, account sign-in alone cannot open your business data.','كانت مساحة عملك المشفّرة تستخدم الدخول التلقائي بالحساب. أنشئ رمز PIN خاصًا الآن؛ بعد ذلك لن يكفي تسجيل الدخول بالحساب وحده لفتح بيانات أعمالك.'):t('Your account is signed in. Enter the PIN to unlock the encrypted workspace on this device.','تم تسجيل الدخول إلى حسابك. أدخل رمز PIN لفتح مساحة العمل المشفّرة على هذا الجهاز.')}</p><div className="pin-lock-badge" role="note"><strong>{t('PIN required on every app start','PIN مطلوب عند كل فتح للتطبيق')}</strong><span>{t('Closing or reloading LOUREX locks access again.','إغلاق LOUREX أو إعادة تحميله يقفل الوصول من جديد.')}</span></div><Field label={migrating?t('Create PIN · 4–12 digits','إنشاء PIN · من 4 إلى 12 رقمًا'):t('PIN · 4–12 digits','PIN · من 4 إلى 12 رقمًا')}><Input autoFocus inputMode="numeric" autoComplete="off" maxLength="12" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:this.pinValue(e.target.value),error:''})}/></Field>{migrating?<Field label={t('Confirm PIN','تأكيد PIN')}><Input inputMode="numeric" autoComplete="off" maxLength="12" type="password" value={this.state.confirmPin} onChange={(e:any)=>this.setState({confirmPin:this.pinValue(e.target.value),error:''})}/></Field>:null}{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}<Button variant="primary" type="submit" disabled={this.state.busy||!this.state.pin||(migrating&&!this.state.confirmPin)}>{this.state.busy?t('Unlocking…','جارٍ فتح القفل…'):migrating?t('Create PIN & Unlock','إنشاء PIN وفتح القفل'):t('Unlock LOUREX','فتح LOUREX')}</Button><p className="security-note">{t('Your PIN is used to unlock the encrypted local vault and is not displayed inside the workspace.','يُستخدم رمز PIN لفتح الخزنة المحلية المشفّرة ولا يتم عرضه داخل مساحة العمل.')}</p></form></div>;
  }
}