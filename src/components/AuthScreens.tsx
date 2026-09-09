import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { t } from '../lib/i18n.js';
import { currentCloudUser } from '../cloud/firebase.js';
import { getOrCreateAccountVaultSecret } from '../cloud/account-access.js';
import { changePin } from '../storage/vault.js';

const MAX_SETUP_LOGO_BYTES=4*1024*1024;
const SETUP_LOGO_TYPES=/^image\/(png|webp|jpeg)$/i;

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface SetupState {
  company: CompanySettings;
  error: string;
  busy: boolean;
  logoBusy: boolean;
}

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  private logoUploadId=0;
  state: SetupState = {
    company: this.props.initialCompany,
    error: '',
    busy: false,
    logoBusy: false
  };

  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value }, error:'' });
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
    const user=currentCloudUser();
    if(!user){this.setState({error:t('Your account session ended. Sign in again.','انتهت جلسة حسابك. سجّل الدخول مرة أخرى.')});return;}
    this.setState({ busy: true, error: '' });
    try {
      const accountSecret=await getOrCreateAccountVaultSecret(user.uid);
      await this.props.onFinish(accountSecret, this.state.company);
    }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Setup failed.','فشل الإعداد.'), busy: false }); }
  };
  private languageSwitch():any{return <button type="button" className="auth-language-switch" disabled={this.state.busy||this.state.logoBusy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;}

  render(): any {
    const { company, busy, logoBusy, error } = this.state;
    const signedIn=currentCloudUser();
    return <div className="auth-page"><div className="auth-card setup-card setup-card-v115 account-managed-setup">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-account-badge"><span>{t('Signed in','تم تسجيل الدخول')}</span><strong>{signedIn?.email||''}</strong></div>
      <div className="auth-section setup-essential-step"><p className="eyebrow">{t('WORKSPACE SETUP','إعداد مساحة العمل')}</p><h1>{t('Name your company','أدخل اسم شركتك')}</h1><p className="subtle">{t('LOUREX protects and saves your workspace automatically with your account. No separate access PIN is required.','يحمي LOUREX مساحة عملك ويحفظها تلقائيًا مع حسابك. لا يلزم رمز دخول PIN منفصل.')}</p><div className="account-managed-security-note" role="note"><strong>{t('One account, one sign-in','حساب واحد، تسجيل دخول واحد')}</strong><span>{t('Local encrypted storage and account backup run automatically in the background.','يعمل التخزين المحلي المشفّر والنسخ الاحتياطي للحساب تلقائيًا في الخلفية.')}</span></div><div className="form-grid two setup-company-essential-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={this.props.language!=='ar'} dir="ltr" value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={this.props.language==='ar'} dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field></div><label className="upload-tile setup-logo-tile"><span>{t('Company Logo · Optional','شعار الشركة · اختياري')}</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt={t('Company logo preview','معاينة شعار الشركة')}/><b>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):t('Tap to choose logo','اضغط لاختيار الشعار')}</b><input type="file" disabled={busy||logoBusy} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectLogo(e.currentTarget)}/></label><div className="setup-later-note"><strong>{t('You can start immediately','يمكنك البدء مباشرة')}</strong><span>{t('Address, tax, bank details, signature, stamp and document defaults remain available in Settings.','يبقى العنوان والضريبة وبيانات البنك والتوقيع والختم وإعدادات المستندات متاحة في الإعدادات.')}</span></div><Button className="setup-primary-action" variant="primary" disabled={busy||logoBusy} onClick={()=>void this.finish()}>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):busy?t('Preparing workspace…','جارٍ تجهيز مساحة العمل…'):t('Enter LOUREX','الدخول إلى LOUREX')}</Button></div>
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; logoDataUrl:string; language:UiLanguage; onLanguageChange:(language:UiLanguage)=>Promise<void>; }
interface UnlockState { legacyPin:string; error:string; busy:boolean; checking:boolean; needsLegacyUpgrade:boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { legacyPin:'', error:'', busy:false, checking:true, needsLegacyUpgrade:false };

  componentDidMount():void{void this.unlockWithAccount();}

  private accountSecret=async():Promise<string>=>{
    const user=currentCloudUser();
    if(!user)throw new Error(t('Your account session ended. Sign in again.','انتهت جلسة حسابك. سجّل الدخول مرة أخرى.'));
    return getOrCreateAccountVaultSecret(user.uid);
  };

  private unlockWithAccount=async():Promise<void>=>{
    this.setState({checking:true,busy:true,error:'',needsLegacyUpgrade:false});
    try{
      const secret=await this.accountSecret();
      await this.props.onUnlock(secret);
    }catch(error){
      const message=error instanceof Error?error.message:t('Unable to open your workspace.','تعذر فتح مساحة العمل.');
      const legacy=/wrong pin/i.test(message);
      this.setState({checking:false,busy:false,needsLegacyUpgrade:legacy,error:legacy?'':message});
    }
  };

  private migrateLegacy=async(e:any):Promise<void>=>{
    e.preventDefault();
    if(this.state.busy||!this.state.legacyPin)return;
    this.setState({busy:true,error:''});
    try{
      const secret=await this.accountSecret();
      await changePin(this.state.legacyPin,secret);
      await this.props.onUnlock(secret);
    }catch(error){
      const message=error instanceof Error?error.message:t('Unable to finish the secure upgrade.','تعذر إكمال ترقية الأمان.');
      this.setState({busy:false,error:/wrong pin/i.test(message)?t('The previous device PIN is incorrect.','رمز PIN السابق للجهاز غير صحيح.'):message,legacyPin:''});
    }
  };

  render(): any {
    if(this.state.checking)return <div className="auth-page"><div className="auth-card unlock-card account-auto-unlock"><button type="button" className="auth-language-switch" disabled onClick={()=>undefined}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Opening your workspace…','جارٍ فتح مساحة عملك…')}</h1><p className="subtle">{t('Your account is restoring secure access automatically.','يستعيد حسابك الوصول الآمن تلقائيًا.')}</p><span className="account-access-loader" aria-hidden="true"/></div></div>;
    return <div className="auth-page"><form className="auth-card unlock-card legacy-upgrade-card" onSubmit={this.migrateLegacy}><button type="button" className="auth-language-switch" disabled={this.state.busy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">{t('ONE-TIME SECURE UPGRADE','ترقية أمان لمرة واحدة')}</p><h1>{t('Connect your existing encrypted data','اربط بياناتك المشفّرة الحالية')}</h1><p className="subtle">{t('This device still contains data protected by the previous PIN system. Enter that old PIN once to move it to automatic account access. LOUREX will not ask for it again.','يحتوي هذا الجهاز على بيانات محمية بنظام PIN السابق. أدخل رمز PIN القديم مرة واحدة لنقلها إلى الدخول التلقائي بالحساب. لن يطلبه LOUREX مرة أخرى.')}</p><Field label={t('Previous device PIN · one time only','رمز PIN السابق للجهاز · مرة واحدة فقط')}><Input autoFocus inputMode="numeric" autoComplete="off" maxLength="12" type="password" value={this.state.legacyPin} onChange={(e:any)=>this.setState({legacyPin:e.target.value.replace(/\D/g,''),error:''})}/></Field>{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}<Button variant="primary" type="submit" disabled={this.state.busy||!this.state.legacyPin}>{this.state.busy?t('Upgrading…','جارٍ الترقية…'):t('Finish Secure Upgrade','إكمال ترقية الأمان')}</Button><p className="security-note">{t('After this upgrade: sign in once, then LOUREX opens directly.','بعد هذه الترقية: سجّل الدخول مرة واحدة ثم يفتح LOUREX مباشرة.')}</p></form></div>;
  }
}
