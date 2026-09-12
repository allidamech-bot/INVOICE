import type { CloudUser } from '../cloud/firebase.js';
import { t } from '../lib/i18n.js';
import { accountPasswordIssue, MAX_ACCOUNT_PASSWORD_LENGTH, MIN_ACCOUNT_PASSWORD_LENGTH } from '../lib/account-security.js';
import { suspendSession } from '../storage/session.js';
import { Button, Field, Input, Modal } from './UI.js';

interface Props {
  open:boolean;
  user:CloudUser|null;
  cloudState:'local'|'queued'|'syncing'|'synced'|'offline'|'error'|'conflict';
  cloudMessage:string;
  canResolve:boolean;
  onClose:()=>void;
  onSignIn:(email:string,password:string)=>Promise<void>;
  onCreate:(email:string,password:string)=>Promise<void>;
  onReset:(email:string)=>Promise<void>;
  onRestore:()=>Promise<void>;
  onKeepLocal:()=>Promise<void>;
  onSignOut:()=>Promise<void>;
}
interface State { mode:'signin'|'create'; email:string; password:string; confirm:string; busy:boolean; accountAction:''|'signout'|'keep-local'|'use-cloud'; confirmConflict:'keep-local'|'use-cloud'|''; error:string; message:string; }

export class CloudAccountModal extends React.Component<Props,State>{
  private operationRunning=false;
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,accountAction:'',confirmConflict:'',error:'',message:''};
  componentDidUpdate(prev:Props):void{if(this.props.open&&!prev.open)this.setState({mode:'signin',email:this.props.user?.email||'',password:'',confirm:'',busy:this.operationRunning,accountAction:this.operationRunning?this.state.accountAction:'',confirmConflict:'',error:'',message:''});}
  private requestClose=()=>this.props.onClose();
  private setMode=(mode:'signin'|'create')=>{if(this.state.busy)return;this.setState({mode,password:'',confirm:'',error:'',message:''});};
  private run=async(action:()=>Promise<void>,success='')=>{if(this.operationRunning)return;this.operationRunning=true;this.setState({busy:true,error:'',message:''});try{await action();this.operationRunning=false;this.setState({busy:false,password:'',confirm:'',message:success});}catch(e){this.operationRunning=false;const error=e instanceof Error?e.message:t('Account operation failed.','فشلت عملية الحساب.');const existingInvoiceAccount=this.state.mode==='create'&&/already has a LOUREX account/i.test(error);this.setState({busy:false,mode:existingInvoiceAccount?'signin':this.state.mode,password:existingInvoiceAccount?'':this.state.password,confirm:existingInvoiceAccount?'':this.state.confirm,error:existingInvoiceAccount?t('A LOUREX Invoice account already exists for this email. Sign in or use Forgot password.','يوجد بالفعل حساب LOUREX Invoice بهذا البريد. استخدم تسجيل الدخول أو «نسيت كلمة المرور؟».'):error});}};
  private passwordError=(password:string):string=>{const issue=accountPasswordIssue(password);if(issue==='too-short')return t(`Use at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters for a stronger account password.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا على الأقل لكلمة مرور أقوى.`);if(issue==='too-long')return t(`Password must be ${MAX_ACCOUNT_PASSWORD_LENGTH} characters or fewer.`,`يجب ألا تتجاوز كلمة المرور ${MAX_ACCOUNT_PASSWORD_LENGTH} حرفًا.`);if(issue==='too-repetitive')return t('Avoid repeated-character passwords. Use a longer passphrase or a mix of different characters.','تجنب كلمات المرور المكوّنة من أحرف مكررة. استخدم عبارة مرور أطول أو مجموعة متنوعة من الأحرف.');return '';};
  private submit=async(e:any)=>{e.preventDefault();if(this.state.busy)return;const email=this.state.email.trim();if(!email||!this.state.password)return this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});if(this.state.mode==='create'){const passwordError=this.passwordError(this.state.password);if(passwordError)return this.setState({error:passwordError});}if(this.state.mode==='create'&&this.state.password!==this.state.confirm)return this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});await this.run(()=>this.state.mode==='create'?this.props.onCreate(email,this.state.password):this.props.onSignIn(email,this.state.password));};
  private reset=async()=>{
    if(this.state.busy)return;
    const email=this.state.email.trim();
    if(!email)return this.setState({error:t('Enter your email first.','أدخل بريدك الإلكتروني أولًا.')});
    const success=t('If an account exists for this email, password reset instructions will be sent.','إذا كان هناك حساب مرتبط بهذا البريد فسيتم إرسال تعليمات إعادة تعيين كلمة المرور.');
    await this.run(async()=>{
      try{await this.props.onReset(email);}catch(e:any){
        const code=String(e?.code||'');const message=e instanceof Error?e.message:'';
        if(code.includes('user-not-found')||/email or password is incorrect/i.test(message))return;
        throw e;
      }
    },success);
  };
  private signOut=async()=>{
    if(this.operationRunning)return;
    this.operationRunning=true;
    this.setState({busy:true,accountAction:'signout',error:'',message:''});
    try{
      await this.props.onSignOut();
      await suspendSession();
      try{sessionStorage.setItem('lourex-auth-just-signed-out','1');}catch{}
      window.location.reload();
    }catch(e){
      this.operationRunning=false;
      this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to sign out.','تعذر تسجيل الخروج.')});
    }
  };
  private resolveConflict=async(choice:'keep-local'|'use-cloud')=>{
    if(this.operationRunning||!this.props.canResolve)return;
    this.operationRunning=true;
    this.setState({busy:true,accountAction:choice,error:'',message:''});
    try{
      if(choice==='keep-local')await this.props.onKeepLocal();else await this.props.onRestore();
      this.operationRunning=false;
      this.setState({busy:false,accountAction:'',confirmConflict:'',message:choice==='keep-local'?t('This Device Copy is now safely stored in the cloud.','تم حفظ نسخة هذا الجهاز بأمان في السحابة.'):t('Cloud Copy selected. Reloading…','تم اختيار نسخة السحابة. جارٍ إعادة التحميل…')});
      if(choice==='use-cloud')window.setTimeout(()=>window.location.reload(),220);
    }catch(e){this.operationRunning=false;this.setState({busy:false,accountAction:'',error:e instanceof Error?e.message:t('Unable to resolve cloud data.','تعذر حل تعارض البيانات السحابية.')});}
  };
  private conflictRecovery=():any=>{
    if(this.props.cloudState!=='conflict')return <div className="account-continuity-note" role="note"><span className="shell-status-dot"/><div><strong>{t('Automatic protection is active','الحماية التلقائية مفعّلة')}</strong><small>{t('No manual sync or separate cloud sign-in is required.','لا تحتاج إلى مزامنة يدوية أو تسجيل دخول سحابي منفصل.')}</small></div></div>;
    const choice=this.state.confirmConflict;
    return <section className="cloud-conflict-recovery" role="alert"><strong>{t('Cloud sync needs your choice','المزامنة السحابية تحتاج اختيارك')}</strong><p>{this.props.cloudMessage||t('This device and the cloud both changed. Neither copy was overwritten.','تم تعديل نسخة هذا الجهاز ونسخة السحابة. لم يتم استبدال أي منهما.')}</p>{!this.props.canResolve?<small>{t('Close the open document or Settings first. Your local work remains safe.','أغلق المستند المفتوح أو الإعدادات أولًا. تبقى بياناتك المحلية آمنة.')}</small>:choice?<div className="cloud-conflict-confirm"><strong>{choice==='keep-local'?t('Keep This Device Copy?','الاحتفاظ بنسخة هذا الجهاز؟'):t('Use Cloud Copy?','استخدام نسخة السحابة؟')}</strong><p>{choice==='keep-local'?t('This device copy will replace the current cloud copy. Continue only if this is the version you want to keep.','ستحل نسخة هذا الجهاز محل النسخة السحابية الحالية. تابع فقط إذا كانت هذه هي النسخة التي تريد الاحتفاظ بها.'):t('The Cloud Copy will replace unsynced local changes on this device.','ستحل نسخة السحابة محل التعديلات المحلية غير المتزامنة على هذا الجهاز.')}</p><div><Button disabled={this.state.busy} onClick={()=>this.setState({confirmConflict:''})}>{t('Cancel','إلغاء')}</Button><Button variant="primary" disabled={this.state.busy} onClick={()=>void this.resolveConflict(choice)}>{this.state.busy?t('Working…','جارٍ التنفيذ…'):t('Confirm choice','تأكيد الاختيار')}</Button></div></div>:<div className="cloud-conflict-actions"><Button disabled={this.state.busy} onClick={()=>this.setState({confirmConflict:'keep-local'})}>{t('Keep This Device Copy','الاحتفاظ بنسخة هذا الجهاز')}</Button><Button variant="primary" disabled={this.state.busy} onClick={()=>this.setState({confirmConflict:'use-cloud'})}>{t('Use Cloud Copy','استخدام نسخة السحابة')}</Button></div>}</section>;
  };
  render():any{return <Modal open={this.props.open} title={t('Account','الحساب')} size="sm" onClose={this.requestClose}>{this.props.user?<div className="cloud-account-panel account-only-panel" aria-busy={this.state.busy}><div className="cloud-account-identity"><div><strong>{this.props.user.email}</strong><small>{t('Your LOUREX workspace saves automatically. Local storage and account backup run in the background.','يتم حفظ مساحة LOUREX تلقائيًا. يعمل التخزين المحلي والنسخ الاحتياطي للحساب في الخلفية.')}</small></div></div>{this.conflictRecovery()}{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}<div className="cloud-account-actions account-only-actions"><Button disabled={this.state.busy} onClick={()=>void this.signOut()}>{this.state.accountAction==='signout'?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</Button></div></div>:<form className="cloud-auth-form" aria-busy={this.state.busy} onSubmit={this.submit}><div className="segmented cloud-auth-tabs" role="tablist" aria-label={t('Account access','الدخول إلى الحساب')}><button type="button" role="tab" aria-selected={this.state.mode==='signin'} disabled={this.state.busy} className={this.state.mode==='signin'?'active':''} onClick={()=>this.setMode('signin')}>{t('Sign In','تسجيل الدخول')}</button><button type="button" role="tab" aria-selected={this.state.mode==='create'} disabled={this.state.busy} className={this.state.mode==='create'?'active':''} onClick={()=>this.setMode('create')}>{t('Create Account','إنشاء حساب')}</button></div><p className="cloud-account-scope-note">{t('Use your LOUREX Invoice account to continue to your workspace. Saving and backup are automatic.','استخدم حساب LOUREX Invoice للمتابعة إلى مساحة عملك. الحفظ والنسخ الاحتياطي تلقائيان.')}</p><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" disabled={this.state.busy} value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={this.state.mode==='create'?'new-password':'current-password'} minLength={this.state.mode==='create'?MIN_ACCOUNT_PASSWORD_LENGTH:undefined} maxLength={this.state.mode==='create'?MAX_ACCOUNT_PASSWORD_LENGTH:undefined} disabled={this.state.busy} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>{this.state.mode==='create'?<><Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" minLength={MIN_ACCOUNT_PASSWORD_LENGTH} maxLength={MAX_ACCOUNT_PASSWORD_LENGTH} disabled={this.state.busy} value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field><p className="security-note">{t(`Use ${MIN_ACCOUNT_PASSWORD_LENGTH}+ characters. A long passphrase is recommended.`,`استخدم ${MIN_ACCOUNT_PASSWORD_LENGTH} حرفًا أو أكثر. يُنصح بعبارة مرور طويلة.`)}</p></>:null}{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}<Button variant="primary" disabled={this.state.busy} type="submit">{this.state.busy?t('Please wait…','يرجى الانتظار…'):this.state.mode==='create'?t('Create Account','إنشاء حساب'):t('Sign In','تسجيل الدخول')}</Button>{this.state.mode==='signin'?<button type="button" className="cloud-reset-link" disabled={this.state.busy||!this.state.email.trim()} onClick={()=>void this.reset()}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}</form>}</Modal>;}
}
