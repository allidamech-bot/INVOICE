import type { UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { t } from '../lib/i18n.js';
import { createCloudUser, friendlyCloudError, sendCloudPasswordReset, signInCloudUser } from '../cloud/firebase.js';

interface Props {
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => Promise<void>;
}
interface State {
  mode:'signin'|'create';
  email:string;
  password:string;
  confirm:string;
  busy:boolean;
  error:string;
  message:string;
}

export class AccountEntryScreen extends React.Component<Props,State>{
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,error:'',message:''};

  private languageSwitch=():any=><button type="button" className="auth-language-switch" onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;

  private submit=async(e:any):Promise<void>=>{
    e.preventDefault();
    const email=this.state.email.trim();
    const password=this.state.password;
    const create=this.state.mode==='create';
    if(!email||!password){this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});return;}
    if(create&&password.length<6){this.setState({error:t('Password must contain at least 6 characters.','يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.')});return;}
    if(create&&password!==this.state.confirm){this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});return;}
    this.setState({busy:true,error:'',message:''});
    try{
      if(create)await createCloudUser(email,password);else await signInCloudUser(email,password);
      this.setState({message:create?t('Account created. Preparing LOUREX Invoice…','تم إنشاء الحساب. جارٍ تجهيز LOUREX Invoice…'):t('Signed in. Opening LOUREX Invoice…','تم تسجيل الدخول. جارٍ فتح LOUREX Invoice…')});
      window.setTimeout(()=>window.location.reload(),180);
    }catch(error){this.setState({busy:false,error:friendlyCloudError(error)});}
  };

  private reset=async():Promise<void>=>{
    const email=this.state.email.trim();
    if(!email){this.setState({error:t('Enter your email first.','أدخل بريدك الإلكتروني أولًا.')});return;}
    this.setState({busy:true,error:'',message:''});
    try{await sendCloudPasswordReset(email);this.setState({busy:false,message:t('Password reset email sent.','تم إرسال رسالة إعادة تعيين كلمة المرور.')});}
    catch(error){this.setState({busy:false,error:friendlyCloudError(error)});}
  };

  render():any{
    const create=this.state.mode==='create';
    return <div className="auth-page"><form className="auth-card unlock-card welcome-card account-first-card system-login-card" onSubmit={this.submit}>{this.languageSwitch()}<Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/><p className="eyebrow">LOUREX Invoice</p><h1>{create?t('Create your account','أنشئ حسابك'):t('Sign in to LOUREX Invoice','تسجيل الدخول إلى LOUREX Invoice')}</h1><p className="subtle">{create?t('Create your account to start using the invoicing system.','أنشئ حسابك لبدء استخدام نظام الفواتير.'):t('Enter your account details to access your invoices and customers.','أدخل بيانات حسابك للوصول إلى فواتيرك وعملائك.')}</p><div className="segmented account-entry-tabs"><button type="button" className={!create?'active':''} onClick={()=>this.setState({mode:'signin',error:'',message:'',password:'',confirm:''})}>{t('Sign In','تسجيل الدخول')}</button><button type="button" className={create?'active':''} onClick={()=>this.setState({mode:'create',error:'',message:'',password:'',confirm:''})}>{t('Create Account','إنشاء حساب')}</button></div><div className="account-entry-fields"><Field label={t('Email','البريد الإلكتروني')}><Input type="email" autoComplete="email" value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={create?'new-password':'current-password'} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>{create?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}</div>{this.state.error?<div className="auth-error">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success">{this.state.message}</div>:null}<Button className="welcome-primary" variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Please wait…','يرجى الانتظار…'):create?t('Create Account','إنشاء الحساب'):t('Sign In','تسجيل الدخول')}</Button>{!create?<button type="button" className="cloud-reset-link account-forgot" disabled={this.state.busy} onClick={()=>void this.reset()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}<p className="security-note">{t('LOUREX Invoice · Secure cloud sync · Works offline','LOUREX Invoice · مزامنة سحابية آمنة · يعمل دون اتصال')}</p></form></div>;
  }
}
