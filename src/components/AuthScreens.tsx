import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { t } from '../lib/i18n.js';
import { createCloudUser, currentCloudUser, friendlyCloudError, sendCloudPasswordReset, signInCloudUser } from '../cloud/firebase.js';

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface SetupState {
  step: 1|2|3;
  pin: string;
  confirm: string;
  company: CompanySettings;
  error: string;
  busy: boolean;
  accountReady:boolean;
  accountMode:'signin'|'create';
  email:string;
  password:string;
  passwordConfirm:string;
  accountBusy:boolean;
  accountError:string;
  accountMessage:string;
}

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  state: SetupState = {
    step: 1,
    pin: '',
    confirm: '',
    company: this.props.initialCompany,
    error: '',
    busy: false,
    accountReady: !!currentCloudUser(),
    accountMode: 'signin',
    email: currentCloudUser()?.email || '',
    password: '',
    passwordConfirm: '',
    accountBusy: false,
    accountError: '',
    accountMessage: ''
  };

  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value } });
  private updateBank = (key: keyof CompanySettings['bank'], value: string): void => this.setState({ company: { ...this.state.company, bank: { ...this.state.company.bank, [key]: value } } });
  private upload = async (field: 'logoDataUrl'|'signatureDataUrl'|'stampDataUrl', file?: File): Promise<void> => {
    if (!file) return;
    const kind=field==='logoDataUrl'?'logo':field==='signatureDataUrl'?'signature':'stamp';
    try { const data = await fileToDataUrl(file,4*1024*1024,kind); this.updateCompany(field, data); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Unable to read image.','تعذر قراءة الصورة.') }); }
  };
  private submitCloudAccount = async (e:any):Promise<void> => {
    e.preventDefault();
    const email=this.state.email.trim();
    const password=this.state.password;
    if(!email||!password)return this.setState({accountError:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});
    if(this.state.accountMode==='create'&&password.length<6)return this.setState({accountError:t('Password must contain at least 6 characters.','يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.')});
    if(this.state.accountMode==='create'&&password!==this.state.passwordConfirm)return this.setState({accountError:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});
    this.setState({accountBusy:true,accountError:'',accountMessage:''});
    try{
      if(this.state.accountMode==='create')await createCloudUser(email,password);
      else await signInCloudUser(email,password);
      this.setState({accountMessage:this.state.accountMode==='create'?t('Account created. Preparing your secure workspace…','تم إنشاء الحساب. جارٍ تجهيز مساحة العمل الآمنة…'):t('Signed in. Restoring your secure workspace…','تم تسجيل الدخول. جارٍ استعادة مساحة العمل الآمنة…')});
      window.setTimeout(()=>window.location.reload(),250);
    }catch(e){this.setState({accountBusy:false,accountError:friendlyCloudError(e)});}
  };
  private resetPassword = async ():Promise<void> => {
    const email=this.state.email.trim();
    if(!email)return this.setState({accountError:t('Enter your email first.','أدخل بريدك الإلكتروني أولًا.')});
    this.setState({accountBusy:true,accountError:'',accountMessage:''});
    try{await sendCloudPasswordReset(email);this.setState({accountBusy:false,accountMessage:t('Password reset email sent.','تم إرسال رسالة إعادة تعيين كلمة المرور.')});}
    catch(e){this.setState({accountBusy:false,accountError:friendlyCloudError(e)});}
  };
  private next = (): void => {
    if (this.state.step === 1) {
      if (!/^\d{4,12}$/.test(this.state.pin)) return this.setState({ error: t('Use a 4–12 digit PIN.','استخدم رمز PIN من 4 إلى 12 رقمًا.') });
      if (this.state.pin !== this.state.confirm) return this.setState({ error: t('PIN confirmation does not match.','تأكيد رمز PIN غير مطابق.') });
      this.setState({ step: 2, error: '' }); return;
    }
    if (this.state.step === 2) {
      if (!this.state.company.nameEn.trim() && !this.state.company.nameAr.trim()) return this.setState({ error: t('Company name is required.','اسم الشركة مطلوب.') });
      this.setState({ step: 3, error: '' }); return;
    }
  };
  private finish = async (): Promise<void> => {
    this.setState({ busy: true, error: '' });
    try { await this.props.onFinish(this.state.pin, this.state.company); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Setup failed.','فشل الإعداد.'), busy: false }); }
  };
  private languageSwitch():any{return <button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;}
  private accountScreen():any{
    const create=this.state.accountMode==='create';
    return <div className="auth-page"><form className="auth-card unlock-card welcome-card account-first-card" onSubmit={this.submitCloudAccount}>{this.languageSwitch()}<Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{create?t('Create your account','أنشئ حسابك'):t('Welcome back','مرحبًا بعودتك')}</h1><p className="subtle">{create?t('Create a free LOUREX account. Your invoices will sync securely across your devices.','أنشئ حساب LOUREX مجانيًا. ستتم مزامنة فواتيرك بأمان بين أجهزتك.'):t('Sign in to restore your encrypted invoices, customers and company settings.','سجّل الدخول لاستعادة الفواتير والعملاء وإعدادات الشركة المشفّرة.')}</p><div className="segmented account-entry-tabs"><button type="button" className={!create?'active':''} onClick={()=>this.setState({accountMode:'signin',accountError:'',accountMessage:'',password:'',passwordConfirm:''})}>{t('Sign In','تسجيل الدخول')}</button><button type="button" className={create?'active':''} onClick={()=>this.setState({accountMode:'create',accountError:'',accountMessage:'',password:'',passwordConfirm:''})}>{t('Create Account','إنشاء حساب')}</button></div><div className="account-entry-fields"><Field label={t('Email','البريد الإلكتروني')}><Input type="email" autoComplete="email" value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,accountError:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={create?'new-password':'current-password'} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,accountError:''})}/></Field>{create?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" value={this.state.passwordConfirm} onChange={(e:any)=>this.setState({passwordConfirm:e.target.value,accountError:''})}/></Field>:null}</div>{this.state.accountError?<div className="auth-error">{this.state.accountError}</div>:null}{this.state.accountMessage?<div className="settings-message success">{this.state.accountMessage}</div>:null}<Button className="welcome-primary" variant="primary" type="submit" disabled={this.state.accountBusy}>{this.state.accountBusy?t('Please wait…','يرجى الانتظار…'):create?t('Create Account','إنشاء الحساب'):t('Sign In','تسجيل الدخول')}</Button>{!create?<button type="button" className="cloud-reset-link account-forgot" disabled={this.state.accountBusy} onClick={()=>void this.resetPassword()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}<p className="security-note">{t('Free cloud account · Encrypted data · Works offline','حساب سحابي مجاني · بيانات مشفّرة · يعمل دون اتصال')}</p></form></div>;
  }
  render(): any {
    const { step, company, busy, error } = this.state;
    if(!this.state.accountReady)return this.accountScreen();
    const signedIn=currentCloudUser();
    return <div className="auth-page"><div className="auth-card setup-card">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-account-badge"><span>{t('Cloud account','الحساب السحابي')}</span><strong>{signedIn?.email||''}</strong></div><div className="setup-progress"><span className={step >= 1 ? 'active' : ''}>1</span><i/><span className={step >= 2 ? 'active' : ''}>2</span><i/><span className={step >= 3 ? 'active' : ''}>3</span></div>
      {step === 1 ? <div className="auth-section"><p className="eyebrow">{t('Security','الأمان')}</p><h1>{t('Create your local PIN','أنشئ رمز PIN المحلي')}</h1><p className="subtle">{t('This PIN encrypts your LOUREX data on this device. It is separate from your account password.','يشفّر رمز PIN بيانات LOUREX على هذا الجهاز، وهو منفصل عن كلمة مرور الحساب.')}</p><div className="form-grid one"><Field label={t('PIN','رمز PIN')}><Input inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('Confirm PIN','تأكيد رمز PIN')}><Input inputMode="numeric" maxLength="12" type="password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value.replace(/\D/g,'')})}/></Field></div><Button variant="primary" onClick={this.next}>{t('Continue','متابعة')}</Button></div> : null}
      {step === 2 ? <div className="auth-section"><p className="eyebrow">{t('Company','الشركة')}</p><h1>{t('Company details','بيانات الشركة')}</h1><div className="form-grid two">
        <Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field>
        <Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field>
        <Field label={t('Address English','العنوان بالإنجليزية')}><Input value={company.addressEn} onChange={(e:any)=>this.updateCompany('addressEn',e.target.value)}/></Field>
        <Field label={t('Address Arabic','العنوان بالعربية')}><Input dir="rtl" value={company.addressAr} onChange={(e:any)=>this.updateCompany('addressAr',e.target.value)}/></Field>
        <Field label={t('City','المدينة')}><Input value={company.city} onChange={(e:any)=>this.updateCompany('city',e.target.value)}/></Field>
        <Field label={t('Country','الدولة')}><Input value={company.country} onChange={(e:any)=>this.updateCompany('country',e.target.value)}/></Field>
        <Field label={t('Phone','الهاتف')}><Input value={company.phone} onChange={(e:any)=>this.updateCompany('phone',e.target.value)}/></Field>
        <Field label={t('Email','البريد الإلكتروني')}><Input type="email" value={company.email} onChange={(e:any)=>this.updateCompany('email',e.target.value)}/></Field>
        <Field label={t('Website','الموقع الإلكتروني')}><Input value={company.website} onChange={(e:any)=>this.updateCompany('website',e.target.value)}/></Field>
        <Field label={t('Commercial Registration','السجل التجاري')}><Input value={company.commercialRegistration} onChange={(e:any)=>this.updateCompany('commercialRegistration',e.target.value)}/></Field>
      </div><label className="upload-tile"><span>{t('Company Logo','شعار الشركة')}</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt={t('Company logo preview','معاينة شعار الشركة')}/><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>this.upload('logoDataUrl',e.target.files?.[0])}/></label><div className="setup-actions"><Button onClick={()=>this.setState({step:1})}>{t('Back','رجوع')}</Button><Button variant="primary" onClick={this.next}>{t('Continue','متابعة')}</Button></div></div> : null}
      {step === 3 ? <div className="auth-section"><p className="eyebrow">{t('Optional','اختياري')}</p><h1>{t('Bank & signing','البنك والتوقيع')}</h1><div className="form-grid two">
        <Field label={t('Bank Name','اسم البنك')}><Input value={company.bank.bankName} onChange={(e:any)=>this.updateBank('bankName',e.target.value)}/></Field>
        <Field label={t('Account Name','اسم الحساب')}><Input value={company.bank.accountName} onChange={(e:any)=>this.updateBank('accountName',e.target.value)}/></Field>
        <Field label="IBAN"><Input value={company.bank.iban} onChange={(e:any)=>this.updateBank('iban',e.target.value)}/></Field>
        <Field label="SWIFT / BIC"><Input value={company.bank.swift} onChange={(e:any)=>this.updateBank('swift',e.target.value)}/></Field>
      </div><div className="upload-row"><label className="upload-tile small"><span>{t('Signature','التوقيع')}</span>{company.signatureDataUrl ? <img src={company.signatureDataUrl} alt={t('Signature','التوقيع')}/> : <b>{t('Upload','رفع')}</b>}<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.upload('signatureDataUrl',e.target.files?.[0])}/></label><label className="upload-tile small"><span>{t('Stamp','الختم')}</span>{company.stampDataUrl ? <img src={company.stampDataUrl} alt={t('Stamp','الختم')}/> : <b>{t('Upload','رفع')}</b>}<input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e:any)=>this.upload('stampDataUrl',e.target.files?.[0])}/></label></div><div className="setup-actions"><Button onClick={()=>this.setState({step:2})}>{t('Back','رجوع')}</Button><Button variant="primary" disabled={busy} onClick={this.finish}>{busy ? t('Finishing…','جارٍ الإنهاء…') : t('Finish','إنهاء')}</Button></div></div> : null}
      {error ? <div className="auth-error">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; logoDataUrl:string; language:UiLanguage; onLanguageChange:(language:UiLanguage)=>Promise<void>; }
interface UnlockState { pin: string; error: string; busy: boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { pin: '', error: '', busy: false };
  private openCloud = (): void => { const button=document.querySelector('.auth-cloud-launcher .btn') as HTMLButtonElement|null; button?.click(); };
  private submit = async (e:any): Promise<void> => { e.preventDefault(); if (!this.state.pin) return; this.setState({busy:true,error:''}); try { await this.props.onUnlock(this.state.pin); } catch (err) { this.setState({busy:false,error:err instanceof Error?err.message:t('Unable to unlock.','تعذر فتح التطبيق.'),pin:''}); } };
  render(): any { return <div className="auth-page"><form className="auth-card unlock-card" onSubmit={this.submit}><button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Enter PIN','أدخل رمز PIN')}</h1><Field label={t('Access PIN','رمز الدخول')}><Input autoFocus inputMode="numeric" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field>{this.state.error ? <div className="auth-error">{this.state.error}</div> : null}<Button variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Unlocking…','جارٍ الفتح…'):t('Unlock','فتح')}</Button><button type="button" className="auth-inline-cloud" onClick={this.openCloud}>{t('Cloud account','الحساب السحابي')}</button><p className="security-note">{t('Encrypted local access · Cloud sync available','دخول محلي مشفّر · المزامنة السحابية متاحة')}</p></form></div>; }
}
