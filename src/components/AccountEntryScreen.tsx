import type { UiLanguage } from '../types.js';
import { Brand, Button, Field, Input } from './UI.js';
import { t } from '../lib/i18n.js';
import { accountPasswordIssue, MAX_ACCOUNT_PASSWORD_LENGTH, MIN_ACCOUNT_PASSWORD_LENGTH } from '../lib/account-security.js';
import { createCloudUser, friendlyCloudError, sendCloudPasswordReset, signInCloudUser } from '../cloud/firebase.js';
import type { CloudUser } from '../cloud/firebase.js';
import { clearPendingGoogleLink, consumeGoogleRedirectResult, googleRedirectPending, GoogleAccountLinkRequiredError, linkGoogleToExistingPasswordAccount, prepareGooglePopupAuth, signInCloudUserWithGoogle } from '../cloud/google-auth.js';
import { activateAccountStorage } from '../storage/db.js';
import { setActiveAccountUid } from '../storage/session.js';
import { ThemeControl } from './ThemeControl.js';

interface Props {language:UiLanguage;onLanguageChange:(language:UiLanguage)=>Promise<void>;}
interface State {mode:'signin'|'create';email:string;password:string;confirm:string;busy:boolean;error:string;message:string;googleLinkPending:boolean;googleReady:boolean;}

export class AccountEntryScreen extends React.Component<Props,State>{
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,error:'',message:'',googleLinkPending:false,googleReady:false};

  componentDidMount():void{
    try{if(sessionStorage.getItem('lourex-auth-just-signed-out')==='1'){sessionStorage.removeItem('lourex-auth-just-signed-out');this.setState({message:t('Signed out securely. Sign in to continue.','تم تسجيل الخروج بأمان. سجّل الدخول للمتابعة.')});}}catch{}
    if(googleRedirectPending())void this.finishGoogleRedirect();
    void this.prepareGoogle();
  }
  componentWillUnmount():void{clearPendingGoogleLink();}

  private enterAuthenticatedAccount=async(user:CloudUser):Promise<void>=>{
    try{sessionStorage.setItem('lourex-auth-just-signed-in','1');}catch{}
    setActiveAccountUid(user.uid);
    await activateAccountStorage(user.uid);
    window.location.replace(window.location.href);
  };

  private prepareGoogle=async():Promise<void>=>{
    try{await prepareGooglePopupAuth();this.setState({googleReady:true});}
    catch(error:any){try{console.error('[LOUREX Google Auth Prep]',String(error?.code||'unknown'),String(error?.message||''));}catch{}this.setState({googleReady:false,error:t('Google sign-in could not prepare in this browser. Reload LOUREX and try again, or use email sign-in.','تعذر تجهيز تسجيل الدخول عبر Google في هذا المتصفح. حدّث LOUREX وحاول مجددًا أو استخدم تسجيل الدخول بالبريد الإلكتروني.')});}
  };

  private languageSwitch=():any=><div className="ta-auth-utilities"><ThemeControl compact language={this.props.language}/><button type="button" className="ta-auth-language" disabled={this.state.busy} onClick={()=>void this.props.onLanguageChange(this.props.language==='ar'?'en':'ar')}>{this.props.language==='ar'?'English':'العربية'}</button></div>;

  private setMode=(mode:'signin'|'create',focusTab=false)=>{clearPendingGoogleLink();this.setState({mode,error:'',message:'',password:'',confirm:'',googleLinkPending:false},()=>{if(focusTab)window.requestAnimationFrame(()=>document.getElementById(`account-tab-${mode}`)?.focus());});};
  private modeKeyDown=(event:any):void=>{let mode:'signin'|'create'|null=null;if(event.key==='ArrowLeft'||event.key==='ArrowRight')mode=this.state.mode==='signin'?'create':'signin';else if(event.key==='Home')mode='signin';else if(event.key==='End')mode='create';if(!mode)return;event.preventDefault();this.setMode(mode,true);};

  private passwordError=(password:string):string=>{
    const issue=accountPasswordIssue(password);
    if(issue==='too-short')return t(`Use at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters for a stronger account password.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا على الأقل لكلمة مرور أقوى.`);
    if(issue==='too-long')return t(`Password must be ${MAX_ACCOUNT_PASSWORD_LENGTH} characters or fewer.`,`يجب ألا تتجاوز كلمة المرور ${MAX_ACCOUNT_PASSWORD_LENGTH} حرفًا.`);
    if(issue==='too-repetitive')return t('Avoid repeated-character passwords. Use a longer passphrase or a mix of different characters.','تجنب كلمات المرور المكوّنة من أحرف مكررة. استخدم عبارة مرور أطول أو مجموعة متنوعة من الأحرف.');
    return '';
  };

  private googleError=(error:any):string=>{
    const code=String(error?.code||'');
    if(code.includes('popup-closed-by-user')||code.includes('cancelled-popup-request'))return t('Google sign-in was cancelled.','تم إلغاء تسجيل الدخول عبر Google.');
    if(code.includes('popup-blocked'))return t('Your browser blocked the Google sign-in window. Allow pop-ups for LOUREX and try again.','حظر المتصفح نافذة تسجيل الدخول عبر Google. اسمح بالنوافذ المنبثقة لـ LOUREX ثم حاول مجددًا.');
    if(code.includes('unauthorized-domain'))return t('This LOUREX domain is not authorized for Google sign-in.','هذا النطاق غير مصرح له بتسجيل الدخول عبر Google.');
    if(code.includes('operation-not-allowed'))return t('Google sign-in is not enabled for this LOUREX project.','تسجيل الدخول عبر Google غير مفعّل لهذا المشروع.');
    if(code.includes('network-request-failed'))return t('Google sign-in could not reach the network. Check your connection and try again.','تعذر الاتصال بـ Google. تحقق من اتصال الإنترنت وحاول مجددًا.');
    if(code.includes('web-storage-unsupported'))return t('This browser is blocking storage required for Google sign-in. Use a regular browser window and allow site storage.','المتصفح يحظر التخزين المطلوب لتسجيل الدخول عبر Google. افتح LOUREX في نافذة عادية واسمح بتخزين بيانات الموقع.');
    if(code.includes('operation-not-supported-in-this-environment'))return t('Google sign-in is not supported in this browser context. Open LOUREX directly in Safari or Chrome and try again.','تسجيل الدخول عبر Google غير مدعوم في وضع المتصفح الحالي. افتح LOUREX مباشرة في Safari أو Chrome وحاول مجددًا.');
    if(code.includes('app-not-authorized')||code.includes('invalid-api-key'))return t('This LOUREX web app is not authorized for Firebase Authentication.','تطبيق LOUREX هذا غير مصرح له باستخدام Firebase Authentication.');
    if(code.includes('too-many-requests'))return t('Google sign-in is temporarily rate-limited. Please wait a moment and try again.','تم تقييد محاولات Google مؤقتًا. انتظر قليلًا ثم حاول مجددًا.');
    if(code.includes('internal-error'))return t('Google sign-in could not start correctly in this browser. Reload LOUREX and try again.','تعذر بدء تسجيل الدخول عبر Google بشكل صحيح في هذا المتصفح. حدّث LOUREX ثم حاول مجددًا.');
    if(code.includes('google-popup-not-ready'))return t('Google sign-in is still preparing. Try again in a moment.','لا يزال تسجيل الدخول عبر Google قيد التجهيز. حاول بعد لحظة.');
    if(code.includes('credential-already-in-use'))return t('This Google account is already linked to another LOUREX account.','حساب Google هذا مرتبط بالفعل بحساب LOUREX آخر.');
    if(code.includes('wrong-password')||code.includes('invalid-credential'))return t('The password for this existing LOUREX account is incorrect.','كلمة مرور حساب LOUREX الحالي غير صحيحة.');
    const reference=code?` (${code})`:'';
    return `${t('Google sign-in failed. Please try again.','تعذر تسجيل الدخول عبر Google. حاول مرة أخرى.')}${reference}`;
  };

  private applyGoogleFailure=(error:any):void=>{
    try{console.error('[LOUREX Google Auth]',String(error?.code||'unknown'),String(error?.message||''));}catch{}
    if(error instanceof GoogleAccountLinkRequiredError){this.setState({mode:'signin',email:error.email,password:'',confirm:'',busy:false,error:'',googleLinkPending:true,message:t('This Google email already has a LOUREX account. Enter your existing LOUREX password once to connect Google without changing your data.','هذا البريد في Google لديه حساب LOUREX موجود. أدخل كلمة مرور LOUREX الحالية مرة واحدة لربط Google دون تغيير بياناتك.')});return;}
    this.setState({busy:false,error:this.googleError(error)});
  };

  private finishGoogleRedirect=async():Promise<void>=>{
    this.setState({busy:true,error:'',message:t('Completing Google sign-in…','جارٍ إكمال تسجيل الدخول عبر Google…')});
    try{const user=await consumeGoogleRedirectResult();if(!user){this.setState({busy:false,message:''});return;}this.setState({message:t('Google sign-in complete. Restoring your LOUREX data…','تم تسجيل الدخول عبر Google. جارٍ استعادة بيانات LOUREX…')});await this.enterAuthenticatedAccount(user);}catch(error:any){this.applyGoogleFailure(error);}
  };

  private googleSignIn=async():Promise<void>=>{
    if(this.state.busy||!this.state.googleReady)return;
    clearPendingGoogleLink();this.setState({busy:true,error:'',message:'',googleLinkPending:false});
    try{const user=await signInCloudUserWithGoogle();if(!user)return;this.setState({message:t('Google sign-in complete. Restoring your LOUREX data…','تم تسجيل الدخول عبر Google. جارٍ استعادة بيانات LOUREX…')});await this.enterAuthenticatedAccount(user);}catch(error:any){this.applyGoogleFailure(error);}
  };

  private submit=async(e:any):Promise<void>=>{
    e.preventDefault();if(this.state.busy)return;
    const email=this.state.email.trim(),password=this.state.password,create=this.state.mode==='create';
    if(!email||!password){this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});return;}
    if(create){const passwordError=this.passwordError(password);if(passwordError){this.setState({error:passwordError});return;}}
    if(create&&password!==this.state.confirm){this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});return;}
    this.setState({busy:true,error:'',message:''});
    try{
      if(!this.state.googleLinkPending){try{await prepareGooglePopupAuth();}catch{}}
      let user:CloudUser;
      if(this.state.googleLinkPending)user=await linkGoogleToExistingPasswordAccount(email,password);else if(create)user=await createCloudUser(email,password);else user=await signInCloudUser(email,password);
      const message=this.state.googleLinkPending?t('Google connected securely. Restoring your existing LOUREX data…','تم ربط Google بأمان. جارٍ استعادة بيانات LOUREX الحالية…'):create?t('Account created. Preparing LOUREX…','تم إنشاء الحساب. جارٍ تجهيز LOUREX…'):t('Signed in. Restoring your LOUREX data…','تم تسجيل الدخول. جارٍ استعادة بيانات LOUREX…');
      this.setState({message,error:''});await this.enterAuthenticatedAccount(user);
    }catch(error:any){const code=String(error?.code||'');if(create&&code.includes('email-already-in-use')){this.setState({mode:'signin',busy:false,password:'',confirm:'',message:'',error:t('This account already exists. Enter its password and sign in — do not create a new account.','هذا الحساب موجود بالفعل. أدخل كلمة المرور وسجّل الدخول — لا تنشئ حسابًا جديدًا.')});return;}this.setState({busy:false,error:this.state.googleLinkPending?this.googleError(error):friendlyCloudError(error)});}
  };

  private reset=async():Promise<void>=>{
    if(this.state.busy)return;const email=this.state.email.trim();if(!email){this.setState({error:t('Enter your email first.','أدخل بريدك الإلكتروني أولًا.')});return;}
    const neutral=t('If an account exists for this email, password reset instructions will be sent.','إذا كان هناك حساب مرتبط بهذا البريد فسيتم إرسال تعليمات إعادة تعيين كلمة المرور.');
    this.setState({busy:true,error:'',message:''});
    try{await sendCloudPasswordReset(email);this.setState({busy:false,message:neutral});}catch(error:any){const code=String(error?.code||'');if(code.includes('user-not-found')){this.setState({busy:false,message:neutral});return;}this.setState({busy:false,error:friendlyCloudError(error)});}
  };

  render():any{
    const create=this.state.mode==='create',linkingGoogle=this.state.googleLinkPending;
    return <main className={`ta-auth-page ${create?'is-create':'is-signin'}`}>
      <div className="ta-auth-frame">
        <section className="ta-auth-aside" aria-label={t('LOUREX Invoice workspace','مساحة عمل LOUREX Invoice')}>
          <div className="ta-auth-brand"><Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/><span>LOUREX INVOICE</span></div>
          <div className="ta-auth-aside-copy"><span>{t('PRIVATE BUSINESS WORKSPACE','مساحة أعمال خاصة')}</span><h1>{t('Your commercial workspace, organized around the work that matters.','مساحة أعمالك التجارية منظمة حول العمل الذي يهمك.')}</h1><p>{t('Documents, customers, purchasing, finance and reports stay protected in one focused workspace.','المستندات والعملاء والمشتريات والمالية والتقارير تبقى محمية في مساحة عمل واحدة مركزة.')}</p></div>
          <div className="ta-auth-feature-list"><div><b>01</b><span><strong>{t('Encrypted workspace','مساحة مشفّرة')}</strong><small>{t('Protected local vault and account continuity','خزنة محلية محمية واستمرارية للحساب')}</small></span></div><div><b>02</b><span><strong>{t('Automatic continuity','استمرارية تلقائية')}</strong><small>{t('Reliable saving without interrupting your work','حفظ موثوق دون مقاطعة العمل')}</small></span></div><div><b>03</b><span><strong>{t('Offline ready','جاهز دون اتصال')}</strong><small>{t('Keep working when the network is unavailable','تابع العمل عندما لا تتوفر الشبكة')}</small></span></div></div>
          <footer>{t('LOUREX Invoice · Private business workspace','LOUREX Invoice · مساحة أعمال خاصة')}</footer>
        </section>

        <section className="ta-auth-main">
          <form className="ta-auth-card" onSubmit={this.submit}>
            {this.languageSwitch()}
            <div className="ta-auth-mobile-brand"><Brand logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/></div>
            <header className="ta-auth-card-header"><span>{linkingGoogle?t('Connect Google','ربط Google'):create?t('New account','حساب جديد'):t('Welcome back','مرحبًا بعودتك')}</span><h2>{linkingGoogle?t('Connect Google to your LOUREX account','اربط Google بحساب LOUREX'):create?t('Create your LOUREX account','أنشئ حساب LOUREX'):t('Sign in to your workspace','سجّل الدخول إلى مساحتك')}</h2><p>{linkingGoogle?t('Verify your existing password once. Your account and cloud data stay unchanged.','تحقق من كلمة المرور الحالية مرة واحدة. سيبقى الحساب والبيانات السحابية دون تغيير.'):create?t('One secure account gives you access to the complete LOUREX workspace.','حساب آمن واحد يمنحك الوصول إلى مساحة LOUREX كاملة.'):t('Continue to your documents, finance and business records.','تابع إلى مستنداتك وبياناتك المالية وسجلات الأعمال.')}</p></header>

            {!linkingGoogle?<><button type="button" className="ta-google-button" disabled={this.state.busy||!this.state.googleReady} onClick={()=>void this.googleSignIn()}><span aria-hidden="true">G</span><strong>{this.state.busy?t('Please wait…','يرجى الانتظار…'):!this.state.googleReady?t('Preparing Google…','جارٍ تجهيز Google…'):t('Continue with Google','المتابعة باستخدام Google')}</strong></button><div className="ta-auth-divider"><span>{t('or use email','أو استخدم البريد الإلكتروني')}</span></div></>:null}

            <div className="ta-auth-tabs" role="tablist" aria-label={t('Account access','الدخول إلى الحساب')}><button id="account-tab-signin" type="button" role="tab" aria-controls="account-entry-panel" aria-selected={!create} tabIndex={!create?0:-1} disabled={this.state.busy||linkingGoogle} className={!create?'is-active':''} onKeyDown={this.modeKeyDown} onClick={()=>this.setMode('signin')}>{t('Sign In','تسجيل الدخول')}</button><button id="account-tab-create" type="button" role="tab" aria-controls="account-entry-panel" aria-selected={create} tabIndex={create?0:-1} disabled={this.state.busy||linkingGoogle} className={create?'is-active':''} onKeyDown={this.modeKeyDown} onClick={()=>this.setMode('create')}>{t('Create Account','إنشاء حساب')}</button></div>

            <div className="ta-auth-fields" id="account-entry-panel" role="tabpanel" aria-labelledby={create?'account-tab-create':'account-tab-signin'}><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" autoFocus={!linkingGoogle} disabled={this.state.busy||linkingGoogle} value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={create?'new-password':'current-password'} minLength={create?MIN_ACCOUNT_PASSWORD_LENGTH:undefined} maxLength={create?MAX_ACCOUNT_PASSWORD_LENGTH:undefined} autoFocus={linkingGoogle} disabled={this.state.busy} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>{create?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" minLength={MIN_ACCOUNT_PASSWORD_LENGTH} maxLength={MAX_ACCOUNT_PASSWORD_LENGTH} disabled={this.state.busy} value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}</div>

            {create?<p className="ta-auth-note">{t(`Use ${MIN_ACCOUNT_PASSWORD_LENGTH}+ characters. A long passphrase is recommended.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا أو أكثر. يُنصح بعبارة مرور طويلة.`)}</p>:null}
            {this.state.error?<div className="ta-auth-feedback is-error" role="alert">{this.state.error}</div>:null}
            {this.state.message?<div className="ta-auth-feedback is-success" role="status">{this.state.message}</div>:null}
            <Button className="ta-auth-primary" variant="primary" type="submit" disabled={this.state.busy}>{this.state.busy?t('Please wait…','يرجى الانتظار…'):linkingGoogle?t('Connect Google securely','ربط Google بأمان'):create?t('Create Account','إنشاء الحساب'):t('Enter LOUREX','الدخول إلى LOUREX')}</Button>
            {linkingGoogle?<button type="button" className="ta-auth-link" disabled={this.state.busy} onClick={()=>this.setMode('signin')}>{t('Cancel Google linking','إلغاء ربط Google')}</button>:!create?<button type="button" className="ta-auth-link" disabled={this.state.busy} onClick={()=>void this.reset()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}
            <div className="ta-auth-security"><span/><small>{t('Protected workspace · Automatic saving · Offline ready','مساحة محمية · حفظ تلقائي · جاهز دون اتصال')}</small></div>
          </form>
        </section>
      </div>
    </main>;
  }
}
