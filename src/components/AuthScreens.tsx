import type { CompanySettings, UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { fileToDataUrl } from '../lib/files.js';
import { t } from '../lib/i18n.js';
import { currentCloudUser } from '../cloud/firebase.js';

interface SetupProps {
  onFinish: (pin: string, company: CompanySettings) => Promise<void>;
  initialCompany: CompanySettings;
  logoDataUrl: string;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface SetupState { company: CompanySettings; error: string; busy: boolean; }

export class SetupScreen extends React.Component<SetupProps, SetupState> {
  state: SetupState = { company: this.props.initialCompany, error: '', busy: false };
  private updateCompany = (key: keyof CompanySettings, value: any): void => this.setState({ company: { ...this.state.company, [key]: value }, error:'' });
  private uploadLogo = async (file?: File): Promise<void> => {
    if (!file) return;
    try { const data = await fileToDataUrl(file,4*1024*1024,'logo'); this.updateCompany('logoDataUrl', data); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Unable to read image.','تعذر قراءة الصورة.') }); }
  };
  private finish = async (): Promise<void> => {
    if (!this.state.company.nameEn.trim() && !this.state.company.nameAr.trim()) return this.setState({ error: t('Company name is required.','اسم الشركة مطلوب.') });
    this.setState({ busy: true, error: '' });
    try { await this.props.onFinish('', this.state.company); }
    catch (e) { this.setState({ error: e instanceof Error ? e.message : t('Setup failed.','فشل الإعداد.'), busy: false }); }
  };
  private languageSwitch():any{return <button type="button" className="auth-language-switch" disabled={this.state.busy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;}
  render(): any {
    const { company, busy, error } = this.state; const signedIn=currentCloudUser();
    return <div className="auth-page"><div className="auth-card setup-card setup-card-v115">{this.languageSwitch()}<Brand logoDataUrl={company.logoDataUrl||this.props.logoDataUrl} language={this.props.language}/><div className="setup-account-badge"><span>{t('Cloud account','الحساب السحابي')}</span><strong>{signedIn?.email||''}</strong></div>
      <div className="auth-section setup-essential-step"><p className="eyebrow">{t('Company setup','إعداد الشركة')}</p><h1>{t('Name your company','أدخل اسم شركتك')}</h1><p className="subtle">{t('Your LOUREX account opens automatically on this and your other devices. No separate PIN is required.','يفتح حساب LOUREX تلقائيًا على هذا الجهاز وأجهزتك الأخرى، ولا يوجد رمز PIN منفصل.')}</p><div className="form-grid two setup-company-essential-grid"><Field label={t('Company Name English','اسم الشركة بالإنجليزية')}><Input autoFocus={this.props.language!=='ar'} value={company.nameEn} onChange={(e:any)=>this.updateCompany('nameEn',e.target.value)}/></Field><Field label={t('Company Name Arabic','اسم الشركة بالعربية')}><Input autoFocus={this.props.language==='ar'} dir="rtl" value={company.nameAr} onChange={(e:any)=>this.updateCompany('nameAr',e.target.value)}/></Field></div><label className="upload-tile setup-logo-tile"><span>{t('Company Logo · Optional','شعار الشركة · اختياري')}</span><img src={company.logoDataUrl || './brand/lourex-logo.svg'} alt={t('Company logo preview','معاينة شعار الشركة')}/><b>{t('Tap to choose logo','اضغط لاختيار الشعار')}</b><input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" onChange={(e:any)=>void this.uploadLogo(e.target.files?.[0])}/></label><div className="setup-later-note"><strong>{t('You can start immediately','يمكنك البدء مباشرة')}</strong><span>{t('All advanced company and document defaults remain available in Settings whenever you need them.','تبقى جميع بيانات الشركة والإعدادات الافتراضية المتقدمة متاحة في الإعدادات متى احتجتها.')}</span></div><Button className="setup-primary-action" variant="primary" disabled={busy} onClick={()=>void this.finish()}>{busy ? t('Finishing…','جارٍ الإنهاء…') : t('Finish Setup','إنهاء الإعداد')}</Button></div>
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
    </div></div>;
  }
}

interface UnlockProps { onUnlock: (pin: string) => Promise<void>; logoDataUrl:string; language:UiLanguage; onLanguageChange:(language:UiLanguage)=>Promise<void>; }
interface UnlockState { error: string; busy: boolean; }
export class UnlockScreen extends React.Component<UnlockProps, UnlockState> {
  state: UnlockState = { error: '', busy: true };
  componentDidMount():void{void this.open();}
  private open=async():Promise<void>=>{this.setState({busy:true,error:''});try{await this.props.onUnlock('');}catch(err){this.setState({busy:false,error:err instanceof Error?err.message:t('Unable to open account data.','تعذر فتح بيانات الحساب.')});}};
  render(): any { return <div className="auth-page"><div className="auth-card unlock-card"><button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button><Brand logoDataUrl={this.props.logoDataUrl} language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{t('Opening your account','جارٍ فتح حسابك')}</h1><p className="subtle">{t('Your signed-in LOUREX account opens automatically. No PIN is required.','يتم فتح حساب LOUREX المسجل تلقائيًا، ولا يلزم أي رمز PIN.')}</p>{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{!this.state.busy?<Button variant="primary" onClick={()=>void this.open()}>{t('Try Again','حاول مرة أخرى')}</Button>:<span className="loading-line"/>}</div></div>; }
}
