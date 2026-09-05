import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { t } from '../lib/i18n.js';
import { currentCloudUser } from '../cloud/firebase.js';

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
  step: 1|2;
  pin: string;
  confirm: string;
  company: CompanySettings;
  error: string;
  busy: boolean;
  logoBusy: boolean;
}

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  private logoUploadId=0;
  state: SetupState = {
    step: 1,
    pin: '',
    confirm: '',
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
  private next = (): void => {
    if (!/^\d{4,12}$/.test(this.state.pin)) return this.setState({ error: t('Use a 4–12 digit PIN.','استخدم رمز PIN من 4 إلى 12 رقمًا.') });
    if (this.state.pin !== this.state.confirm) return this.setState({ error: t('PIN confirmation does not match.','تأكيد رمز PIN غير مطابق.') });
    this.setState({ step: 2, error: '' });
  };
  private finish = async (): Promise<void> => {
    if(this.state.logoBusy)return;
    if (!this.state.company.nameEn.trim() && !this.state.company.nameAr.trim()) {
      this.setState({ error: t('Company name is required.','اسم الشركة مطلوب.') });
      return;
    }
    this.setState({ busy: true, error: '' });
    try { await this.props.onFinish(this.state.pin, this.state.company); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Setup failed.','فشل الإعداد.'), busy: false }); }
  };
  private languageSwitch():any{return <button type="button" className="auth-language-switch" disabled={this.state.busy||this.state.logoBusy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;}

  render(): any {
    const { step, company, busy, logoBusy, error } = this.state;
    const signedIn=currentCloudUser();
    return <div className="auth-page"><div className="auth-card setup-card setup-card-v115">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-account-badge"><span>{t('Cloud account','الحساب السحابي')}</span><strong>{signedIn?.email||''}</strong></div><div className="setup-progress setup-progress-two" aria-label={t('Setup progress','تقدم الإعداد')}><span className={step >= 1 ? 'active' : ''}>1</span><i/><span className={step >= 2 ? 'active' : ''}>2</span></div>
      {step === 1 ? <div className="auth-section setup-essential-step"><p className="eyebrow">{t('Security · 1 of 2','الأمان · 1 من 2')}</p><h1>{t('Create your LOUREX PIN','أنشئ رمز PIN لـ LOUREX')}</h1><p className="subtle">{t('Your PIN unlocks the encrypted LOUREX vault on this device and after an encrypted cloud restore. It is separate from your account password.','رمز PIN يفتح خزنة LOUREX المشفّرة على هذا الجهاز وبعد استعادة النسخة السحابية المشفّرة، وهو منفصل عن كلمة مرور الحساب.')}</p><div className="pin-recovery-note" role="note"><strong>{t('Keep this PIN safe','احتفظ برمز PIN بأمان')}</strong><span>{t('Your account password cannot replace or recover this PIN. You will need the same PIN to unlock restored encrypted data.','كلمة مرور الحساب لا تستبدل رمز PIN ولا تستعيده. ستحتاج إلى رمز PIN نفسه لفتح البيانات المشفّرة بعد استعادتها.')}</span></div><div className="form-grid one"><Field label={t('PIN','رمز PIN')}><Input autoFocus inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,''),error:''})}/></Field><Field label={t('Confirm PIN','تأكيد رمز PIN')}><Input inputMode="numeric" maxLength="12" type="password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value.replace(/\D/g,''),error:''})}/></Field></div><Button className="setup-primary-action" variant="primary" onClick={this.next}>{t('Continue','متابعة')}</Button></div> : null}
      {step === 2 ? <div className="auth-section setup-essential-step"><p className="eyebrow">{t('Company · 2 of 2','الشركة · 2 من 2')}</p><h1>{t('Name your company','أدخل اسم شركتك')}</h1><p className="subtle">{t('Only the company name is required now. Address, tax, bank details, signature and stamp can be completed later from Settings.','المطلوب الآن هو اسم الشركة فقط. يمكنك إكمال العنوان والضريبة وبيانات البنك والتوقيع والختم لاحقًا من الإعدادات.')}</p><div className="form-grid two setup-company-essential-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={this.props.language!=='ar'} dir="ltr" value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={this.props.language==='ar'} dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field></div><label className="upload-tile setup-logo-tile"><span>{t('Company Logo · Optional','شعار الشركة · اختياري')}</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt={t('Company logo preview','معاينة شعار الشركة')}/><b>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):t('Tap to choose logo','اضغط لاختيار الشعار')}</b><input type="file" disabled={busy||logoBusy} accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.selectLogo(e.currentTarget)}/></label><div className="setup-later-note"><strong>{t('You can start immediately','يمكنك البدء مباشرة')}</strong><span>{t('All advanced company and document defaults remain available in Settings whenever you need them.','تبقى جميع بيانات الشركة والإعدادات الافتراضية المتقدمة متاحة في الإعدادات متى احتجتها.')}</span></div><div className="setup-actions"><Button disabled={busy||logoBusy} onClick={()=>this.setState({step:1,error:''})}>{t('Back','رجوع')}</Button><Button variant="primary" disabled={busy||logoBusy} onClick={()=>void this.finish()}>{logoBusy?t('Preparing logo…','جارٍ تجهيز الشعار…'):busy ? t('Finishing…','جارٍ الإنهاء…') : t('Finish Setup','إنهاء الإعداد')}</Button></div></div> : null}
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; logoDataUrl:string; language:UiLanguage; onLanguageChange:(language:UiLanguage)=>Promise<void>; }
interface UnlockState { pin: string; error: string; busy: boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { pin: '', error: '', busy: false };
  private openCloud = (): void => { const button=document.querySelector('.auth-cloud-launcher .btn') as HTMLButtonElement|null; button?.click(); };
  private submit = async (e:any): Promise<void> => { e.preventDefault(); if (!this.state.pin) return; this.setState({busy:true,error:''}); try { await this.props.onUnlock(this.state.pin); } catch (err) { this.setState({busy:false,error:err instanceof Error?err.message:t('Unable to unlock.','تعذر فتح التطبيق.'),pin:''}); } };
  render(): any { return <div className="auth-page"><form className="auth-card unlock-card" onSubmit={this.submit}><button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Enter PIN','أدخل رمز PIN')}</h1><Field label={t('Access PIN','رمز الدخول')}><Input autoFocus inputMode="numeric" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field>{this.state.error ? <div className="auth-error" role="alert">{this.state.error}</div> : null}<Button variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Unlocking…','جارٍ الفتح…'):t('Unlock','فتح')}</Button><button type="button" className="auth-inline-cloud" onClick={this.openCloud}>{t('Cloud account','الحساب السحابي')}</button><p className="security-note">{t('Encrypted local access · Cloud sync available','دخول محلي مشفّر · المزامنة السحابية متاحة')}</p></form></div>; }
}
