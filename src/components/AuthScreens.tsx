import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { readBackup } from '../lib/backup.js';
import { replaceVaultWithPin } from '../storage/vault.js';
import { establishSession } from '../storage/session.js';
import { putPublicPreferences } from '../storage/db.js';
import { t } from '../lib/i18n.js';

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface SetupState { welcome: boolean; step: 1|2|3; pin: string; confirm: string; company: CompanySettings; error: string; busy: boolean; restoreFile:File|null; restorePin:string; restoreBusy:boolean; }

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  state: SetupState = { welcome: true, step: 1, pin: '', confirm: '', company: this.props.initialCompany, error: '', busy: false, restoreFile:null, restorePin:'', restoreBusy:false };

  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value } });
  private updateBank = (key: keyof CompanySettings['bank'], value: string): void => this.setState({ company: { ...this.state.company, bank: { ...this.state.company.bank, [key]: value } } });
  private upload = async (field: 'logoDataUrl'|'signatureDataUrl'|'stampDataUrl', file?: File): Promise<void> => {
    if (!file) return;
    try { const data = await fileToDataUrl(file); this.updateCompany(field, data); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Unable to read image.','تعذر قراءة الصورة.') }); }
  };
  private restoreExisting = async (): Promise<void> => {
    const file=this.state.restoreFile;
    const pin=this.state.restorePin;
    if(!file)return this.setState({error:t('Choose your LOUREX backup file first.','اختر ملف النسخة الاحتياطية لـ LOUREX أولًا.')});
    if(!/^\d{4,12}$/.test(pin))return this.setState({error:t('Enter the 4–12 digit PIN used for this backup.','أدخل رمز PIN المكوّن من 4 إلى 12 رقمًا والمستخدم لهذه النسخة.')});
    this.setState({restoreBusy:true,error:''});
    try{
      const vault=await readBackup(file,pin);
      const restored=await replaceVaultWithPin(pin,vault);
      await establishSession(restored.key);
      const uiLanguage=restored.vault.appSettings.uiLanguage??this.props.language;
      await putPublicPreferences({logoDataUrl:restored.vault.company.logoDataUrl||this.props.logoDataUrl,uiLanguage});
      window.location.reload();
    }catch(e){this.setState({restoreBusy:false,error:e instanceof Error?e.message:t('Unable to restore this backup.','تعذر استعادة هذه النسخة الاحتياطية.')});}
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
  render(): any {
    const { step, company, busy, error } = this.state;
    if (this.state.welcome) return <div className="auth-page"><div className="auth-card unlock-card welcome-card">{this.languageSwitch()}<Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Welcome.','مرحبًا.')}</h1><p className="subtle">{t('Create, save and share professional Proforma Invoices and Invoices. Everything stays on this device.','أنشئ واحفظ وشارك الفواتير المبدئية والفواتير الاحترافية. جميع بياناتك تبقى على هذا الجهاز.')}</p><Button variant="primary" onClick={()=>this.setState({welcome:false,error:''})}>{t('Set Up New Account','إعداد حساب جديد')}</Button><div className="welcome-restore"><div className="welcome-divider"><span>{t('or','أو')}</span></div><h3>{t('Restore an existing account','استعادة حساب موجود')}</h3><p className="subtle">{t('Use an encrypted LOUREX backup to bring back your company, customers, invoices and settings without entering them again.','استخدم نسخة LOUREX الاحتياطية المشفّرة لاستعادة الشركة والعملاء والفواتير والإعدادات دون إدخالها من جديد.')}</p><label className="file-picker"><strong>{this.state.restoreFile?this.state.restoreFile.name:t('Choose LOUREX Backup','اختر نسخة LOUREX الاحتياطية')}</strong><input type="file" accept="application/json,.json" onChange={(e:any)=>this.setState({restoreFile:e.target.files?.[0]??null,error:''})}/></label>{this.state.restoreFile?<div className="restore-first-run"><Field label={t('Backup PIN','رمز PIN للنسخة الاحتياطية')}><Input inputMode="numeric" type="password" maxLength="12" value={this.state.restorePin} onChange={(e:any)=>this.setState({restorePin:e.target.value.replace(/\D/g,''),error:''})}/></Field><Button disabled={this.state.restoreBusy} onClick={()=>void this.restoreExisting()}>{this.state.restoreBusy?t('Restoring…','جارٍ الاستعادة…'):t('Restore Account','استعادة الحساب')}</Button></div>:null}</div>{error?<div className="auth-error">{error}</div>:null}<p className="security-note">{t('Local-first · Encrypted · No cloud account','محلي أولًا · مشفّر · بدون حساب سحابي')}</p></div></div>;
    return <div className="auth-page"><div className="auth-card setup-card">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-progress"><span className={step >= 1 ? 'active' : ''}>1</span><i/><span className={step >= 2 ? 'active' : ''}>2</span><i/><span className={step >= 3 ? 'active' : ''}>3</span></div>
      {step === 1 ? <div className="auth-section"><p className="eyebrow">{t('Security','الأمان')}</p><h1>{t('Set your access PIN','أنشئ رمز PIN للدخول')}</h1><p className="subtle">{t('Your data stays encrypted on this device. The PIN is never stored as plain text.','تبقى بياناتك مشفّرة على هذا الجهاز، ولا يتم حفظ رمز PIN كنص عادي.')}</p><div className="form-grid one"><Field label={t('PIN','رمز PIN')}><Input inputMode="numeric" autoComplete="new-password" maxLength="12" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field><Field label={t('Confirm PIN','تأكيد رمز PIN')}><Input inputMode="numeric" maxLength="12" type="password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value.replace(/\D/g,'')})}/></Field></div><Button variant="primary" onClick={this.next}>{t('Continue','متابعة')}</Button></div> : null}
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
  private submit = async (e:any): Promise<void> => { e.preventDefault(); if (!this.state.pin) return; this.setState({busy:true,error:''}); try { await this.props.onUnlock(this.state.pin); } catch (err) { this.setState({busy:false,error:err instanceof Error?err.message:t('Unable to unlock.','تعذر فتح التطبيق.'),pin:''}); } };
  render(): any { return <div className="auth-page"><form className="auth-card unlock-card" onSubmit={this.submit}><button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Enter PIN','أدخل رمز PIN')}</h1><Field label={t('Access PIN','رمز الدخول')}><Input autoFocus inputMode="numeric" type="password" value={this.state.pin} onChange={(e:any)=>this.setState({pin:e.target.value.replace(/\D/g,'')})}/></Field>{this.state.error ? <div className="auth-error">{this.state.error}</div> : null}<Button variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Unlocking…','جارٍ الفتح…'):t('Unlock','فتح')}</Button><p className="security-note">{t('Encrypted local access · No cloud account','دخول محلي مشفّر · بدون حساب سحابي')}</p></form></div>; }
}
