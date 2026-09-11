import type { UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { t } from '../lib/i18n.js';
import { accountPasswordIssue, MAX_ACCOUNT_PASSWORD_LENGTH, MIN_ACCOUNT_PASSWORD_LENGTH } from '../lib/account-security.js';
import { createCloudUser, friendlyCloudError, sendCloudPasswordReset, signInCloudUser } from '../cloud/firebase.js';

interface Props {
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface State {
  mode:'signin'|'create'; email:string; password:string; confirm:string; busy:boolean; error:string; message:string;
}

export class AccountEntryScreen extends React.Component<Props,State>{
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,error:'',message:''};

  componentDidMount():void{
    try{
      if(sessionStorage.getItem('lourex-auth-just-signed-out')==='1'){
        sessionStorage.removeItem('lourex-auth-just-signed-out');
        this.setState({message:t('Signed out securely. Sign in to continue.','تم تسجيل الخروج بأمان. سجّل الدخول للمتابعة.')});
      }
    }catch{}
  }

  private languageSwitch=():any=><button type="button" className="auth-language-switch premium-auth-language" disabled={this.state.busy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;

  private setMode=(mode:'signin'|'create')=>this.setState({mode,error:'',message:'',password:'',confirm:''});

  private passwordError=(password:string):string=>{
    const issue=accountPasswordIssue(password);
    if(issue==='too-short')return t(`Use at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters for a stronger account password.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا على الأقل لكلمة مرور أقوى.`);
    if(issue==='too-long')return t(`Password must be ${MAX_ACCOUNT_PASSWORD_LENGTH} characters or fewer.`,`يجب ألا تتجاوز كلمة المرور ${MAX_ACCOUNT_PASSWORD_LENGTH} حرفًا.`);
    if(issue==='too-repetitive')return t('Avoid repeated-character passwords. Use a longer passphrase or a mix of different characters.','تجنب كلمات المرور المكوّنة من أحرف مكررة. استخدم عبارة مرور أطول أو مجموعة متنوعة من الأحرف.');
    return '';
  };

  private submit=async(e:any):Promise<void>=>{
    e.preventDefault();
    if(this.state.busy)return;
    const email=this.state.email.trim(); const password=this.state.password; const create=this.state.mode==='create';
    if(!email||!password){this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});return;}
    if(create){const passwordError=this.passwordError(password);if(passwordError){this.setState({error:passwordError});return;}}
    if(create&&password!==this.state.confirm){this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});return;}
    this.setState({busy:true,error:'',message:''});
    try{
      if(create)await createCloudUser(email,password);else await signInCloudUser(email,password);
      try{sessionStorage.setItem('lourex-auth-just-signed-in','1');}catch{}
      this.setState({message:create?t('Account created. Preparing LOUREX…','تم إنشاء الحساب. جارٍ تجهيز LOUREX…'):t('Signed in. Restoring your LOUREX data…','تم تسجيل الدخول. جارٍ استعادة بيانات LOUREX…')});
      window.setTimeout(()=>window.location.reload(),500);
    }catch(error:any){
      const code=String(error?.code||'');
      if(create&&code.includes('email-already-in-use')){
        this.setState({mode:'signin',busy:false,password:'',confirm:'',message:'',error:t('This account already exists. Enter its password and sign in — do not create a new account.','هذا الحساب موجود بالفعل. أدخل كلمة المرور وسجّل الدخول — لا تنشئ حسابًا جديدًا.')});
        return;
      }
      this.setState({busy:false,error:friendlyCloudError(error)});
    }
  };

  private reset=async():Promise<void>=>{
    if(this.state.busy)return;
    const email=this.state.email.trim();
    if(!email){this.setState({error:t('Enter your email first.','أدخل بريدك الإلكتروني أولًا.')});return;}
    this.setState({busy:true,error:'',message:''});
    try{await sendCloudPasswordReset(email);this.setState({busy:false,message:t('If an account exists for this email, password reset instructions will be sent.','إذا كان هناك حساب مرتبط بهذا البريد فسيتم إرسال تعليمات إعادة تعيين كلمة المرور.')});}
    catch(error){this.setState({busy:false,error:friendlyCloudError(error)});}
  };

  render():any{
    const create=this.state.mode==='create';
    return <div className={`auth-page auth-account-page ${create?'auth-mode-create':'auth-mode-signin'}`}>
      <div className="auth-account-frame">
        <section className="auth-account-story" aria-label={t('LOUREX Invoice workspace','مساحة عمل LOUREX Invoice')}>
          <div className="auth-story-brand"><Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/><span className="auth-story-product">LOUREX INVOICE</span></div>
          <div className="auth-story-copy">
            <p className="auth-story-kicker">{t('PRIVATE BUSINESS WORKSPACE','مساحة أعمال خاصة')}</p>
            <h2>{t('Run every commercial document from one calm, secure workspace.','أدر مستندات أعمالك كلها من مساحة واحدة هادئة وآمنة.')}</h2>
            <p>{t('Invoices, quotations, customers and financial follow-up stay organized, protected and ready wherever you work.','الفواتير وعروض الأسعار والعملاء والمتابعة المالية تبقى منظمة ومحمية وجاهزة أينما تعمل.')}</p>
          </div>
          <div className="auth-story-trust" aria-label={t('Workspace benefits','مزايا مساحة العمل')}>
            <div><span className="auth-trust-mark"/><strong>{t('Private by design','خصوصية من الأساس')}</strong><small>{t('Encrypted local storage','تخزين محلي مشفّر')}</small></div>
            <div><span className="auth-trust-mark"/><strong>{t('Automatic continuity','استمرارية تلقائية')}</strong><small>{t('Your work saves in the background','يتم حفظ عملك في الخلفية')}</small></div>
            <div><span className="auth-trust-mark"/><strong>{t('Ready anywhere','جاهز أينما كنت')}</strong><small>{t('Works offline too','يعمل دون اتصال أيضًا')}</small></div>
          </div>
          <p className="auth-story-foot">{t('LOUREX Invoice · Your private document workspace','LOUREX Invoice · مساحة مستنداتك الخاصة')}</p>
        </section>

        <form className="auth-card unlock-card welcome-card account-first-card system-login-card auth-account-card" onSubmit={this.submit}>
          {this.languageSwitch()}
          <div className="auth-card-mobile-brand"><Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/></div>
          <div className="auth-card-heading">
            <p className="eyebrow">{create?t('NEW WORKSPACE','مساحة جديدة'):t('WELCOME BACK','مرحبًا بعودتك')}</p>
            <h1>{create?t('Create your LOUREX account','أنشئ حساب LOUREX'):t('Sign in to your workspace','سجّل الدخول إلى مساحتك')}</h1>
            <p className="subtle">{create?t('Create one secure account for LOUREX Invoice. Your workspace will save automatically.','أنشئ حسابًا آمنًا واحدًا لـ LOUREX Invoice. سيتم حفظ مساحة عملك تلقائيًا.'):t('Continue to your invoices, quotations and business records.','تابع إلى فواتيرك وعروض أسعارك وسجلات أعمالك.')}</p>
          </div>

          <div className="segmented account-entry-tabs" role="tablist" aria-label={t('Account access','الدخول إلى الحساب')}>
            <button type="button" role="tab" aria-selected={!create} disabled={this.state.busy} className={!create?'active':''} onClick={()=>this.setMode('signin')}>{t('Sign In','تسجيل الدخول')}</button>
            <button type="button" role="tab" aria-selected={create} disabled={this.state.busy} className={create?'active':''} onClick={()=>this.setMode('create')}>{t('Create Account','إنشاء حساب')}</button>
          </div>

          <div className="account-entry-fields">
            <Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" autoFocus disabled={this.state.busy} value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field>
            <Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={create?'new-password':'current-password'} minLength={create?MIN_ACCOUNT_PASSWORD_LENGTH:undefined} maxLength={create?MAX_ACCOUNT_PASSWORD_LENGTH:undefined} disabled={this.state.busy} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>
            {create?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" minLength={MIN_ACCOUNT_PASSWORD_LENGTH} maxLength={MAX_ACCOUNT_PASSWORD_LENGTH} disabled={this.state.busy} value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}
          </div>

          {create?<p className="security-note">{t(`Use ${MIN_ACCOUNT_PASSWORD_LENGTH}+ characters. A long passphrase is recommended.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا أو أكثر. يُنصح بعبارة مرور طويلة.`)}</p>:null}
          {this.state.error?<div className="auth-error premium-auth-feedback" role="alert">{this.state.error}</div>:null}
          {this.state.message?<div className="settings-message success premium-auth-feedback" role="status">{this.state.message}</div>:null}

          <Button className="welcome-primary premium-auth-primary" variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Please wait…','يرجى الانتظار…'):create?t('Create Account','إنشاء الحساب'):t('Enter LOUREX','الدخول إلى LOUREX')}</Button>
          {!create?<button type="button" className="cloud-reset-link account-forgot" disabled={this.state.busy} onClick={()=>void this.reset()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}

          <div className="auth-card-security"><span className="auth-security-dot"/><span>{t('Protected workspace · Automatic saving · Offline ready','مساحة محمية · حفظ تلقائي · جاهز دون اتصال')}</span></div>
        </form>
      </div>
    </div>;
  }
}
