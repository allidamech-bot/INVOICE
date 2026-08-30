import type { UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { t } from '../lib/i18n.js';
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
  private languageSwitch=():any=><button type="button" className="auth-language-switch" disabled={this.state.busy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button>;

  private submit=async(e:any):Promise<void>=>{
    e.preventDefault();
    if(this.state.busy)return;
    const email=this.state.email.trim(); const password=this.state.password; const create=this.state.mode==='create';
    if(!email||!password){this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});return;}
    if(create&&password.length<6){this.setState({error:t('Password must contain at least 6 characters.','يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.')});return;}
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
    try{await sendCloudPasswordReset(email);this.setState({busy:false,message:t('Password reset email sent.','تم إرسال رسالة إعادة تعيين كلمة المرور.')});}
    catch(error){this.setState({busy:false,error:friendlyCloudError(error)});}
  };

  render():any{
    const create=this.state.mode==='create';
    return <div className="auth-page"><form className="auth-card unlock-card welcome-card account-first-card system-login-card" onSubmit={this.submit}>{this.languageSwitch()}<Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/><p className="eyebrow">LOUREX</p><h1>{create?t('Create your account','أنشئ حسابك'):t('Sign in to LOUREX','تسجيل الدخول إلى LOUREX')}</h1><p className="subtle">{create?t('Use this only if you do not already have a LOUREX account.','استخدم هذا الخيار فقط إذا لم يكن لديك حساب LOUREX سابق.'):t('Already have an account? Sign in with the same email and password to restore your data.','لديك حساب سابق؟ سجّل الدخول بنفس البريد وكلمة المرور لاستعادة بياناتك.')}</p><div className="segmented account-entry-tabs"><button type="button" disabled={this.state.busy} className={!create?'active':''} onClick={()=>this.setState({mode:'signin',error:'',message:'',password:'',confirm:''})}>{t('Sign In','تسجيل الدخول')}</button><button type="button" disabled={this.state.busy} className={create?'active':''} onClick={()=>this.setState({mode:'create',error:'',message:'',password:'',confirm:''})}>{t('Create Account','إنشاء حساب')}</button></div><div className="account-entry-fields"><Field label={t('Email','البريد الإلكتروني')}><Input type="email" autoComplete="email" disabled={this.state.busy} value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={create?'new-password':'current-password'} disabled={this.state.busy} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>{create?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" disabled={this.state.busy} value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}</div>{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}<Button className="welcome-primary" variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Please wait…','يرجى الانتظار…'):create?t('Create Account','إنشاء الحساب'):t('Sign In','تسجيل الدخول')}</Button>{!create?<button type="button" className="cloud-reset-link account-forgot" disabled={this.state.busy} onClick={()=>void this.reset()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}<p className="security-note">{t('LOUREX · Secure cloud sync · Works offline','LOUREX · مزامنة سحابية آمنة · يعمل دون اتصال')}</p></form></div>;
  }
}
