import type { CloudUser } from '../cloud/firebase.js';
import { t } from '../lib/i18n.js';
import { suspendSession } from '../storage/session.js';
import { Button, Field, Input, Modal } from './UI.js';

interface Props {
  open:boolean;
  user:CloudUser|null;
  onClose:()=>void;
  onSignIn:(email:string,password:string)=>Promise<void>;
  onCreate:(email:string,password:string)=>Promise<void>;
  onReset:(email:string)=>Promise<void>;
  onRestore:()=>Promise<void>;
  onSignOut:()=>Promise<void>;
}
interface State { mode:'signin'|'create'; email:string; password:string; confirm:string; busy:boolean; accountAction:''|'signout'; error:string; message:string; }

export class CloudAccountModal extends React.Component<Props,State>{
  private operationRunning=false;
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,accountAction:'',error:'',message:''};
  componentDidUpdate(prev:Props):void{if(this.props.open&&!prev.open)this.setState({mode:'signin',email:this.props.user?.email||'',password:'',confirm:'',busy:this.operationRunning,accountAction:this.operationRunning?this.state.accountAction:'',error:'',message:''});}
  private requestClose=()=>this.props.onClose();
  private setMode=(mode:'signin'|'create')=>{if(this.state.busy)return;this.setState({mode,password:'',confirm:'',error:'',message:''});};
  private run=async(action:()=>Promise<void>,success='')=>{if(this.operationRunning)return;this.operationRunning=true;this.setState({busy:true,error:'',message:''});try{await action();this.operationRunning=false;this.setState({busy:false,password:'',confirm:'',message:success});}catch(e){this.operationRunning=false;const error=e instanceof Error?e.message:t('Account operation failed.','فشلت عملية الحساب.');const existingInvoiceAccount=this.state.mode==='create'&&/already has a LOUREX account/i.test(error);this.setState({busy:false,mode:existingInvoiceAccount?'signin':this.state.mode,password:existingInvoiceAccount?'':this.state.password,confirm:existingInvoiceAccount?'':this.state.confirm,error:existingInvoiceAccount?t('A LOUREX Invoice account already exists for this email. Sign in or use Forgot password.','يوجد بالفعل حساب LOUREX Invoice بهذا البريد. استخدم تسجيل الدخول أو «نسيت كلمة المرور؟».'):error});}};
  private submit=async(e:any)=>{e.preventDefault();if(this.state.busy)return;const email=this.state.email.trim();if(!email||!this.state.password)return this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});if(this.state.mode==='create'&&this.state.password!==this.state.confirm)return this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});if(this.state.mode==='create'&&this.state.password.length<6)return this.setState({error:t('Password must contain at least 6 characters.','يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.')});await this.run(()=>this.state.mode==='create'?this.props.onCreate(email,this.state.password):this.props.onSignIn(email,this.state.password));};
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
  render():any{return <Modal open={this.props.open} title={t('Account','الحساب')} size="sm" onClose={this.requestClose}>{this.props.user?<div className="cloud-account-panel account-only-panel" aria-busy={this.state.busy}><div className="cloud-account-identity"><div><strong>{this.props.user.email}</strong><small>{t('Your LOUREX workspace saves automatically. Local storage and account backup run in the background.','يتم حفظ مساحة LOUREX تلقائيًا. يعمل التخزين المحلي والنسخ الاحتياطي للحساب في الخلفية.')}</small></div></div><div className="account-continuity-note" role="note"><span className="shell-status-dot"/><div><strong>{t('Automatic protection is active','الحماية التلقائية مفعّلة')}</strong><small>{t('No manual sync or separate cloud sign-in is required.','لا تحتاج إلى مزامنة يدوية أو تسجيل دخول سحابي منفصل.')}</small></div></div>{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}<div className="cloud-account-actions account-only-actions"><Button disabled={this.state.busy} onClick={()=>void this.signOut()}>{this.state.accountAction==='signout'?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</Button></div></div>:<form className="cloud-auth-form" aria-busy={this.state.busy} onSubmit={this.submit}><div className="segmented cloud-auth-tabs" role="tablist" aria-label={t('Account access','الدخول إلى الحساب')}><button type="button" role="tab" aria-selected={this.state.mode==='signin'} disabled={this.state.busy} className={this.state.mode==='signin'?'active':''} onClick={()=>this.setMode('signin')}>{t('Sign In','تسجيل الدخول')}</button><button type="button" role="tab" aria-selected={this.state.mode==='create'} disabled={this.state.busy} className={this.state.mode==='create'?'active':''} onClick={()=>this.setMode('create')}>{t('Create Account','إنشاء حساب')}</button></div><p className="cloud-account-scope-note">{t('Use your LOUREX Invoice account to continue to your workspace. Saving and backup are automatic.','استخدم حساب LOUREX Invoice للمتابعة إلى مساحة عملك. الحفظ والنسخ الاحتياطي تلقائيان.')}</p><Field label={t('Email','البريد الإلكتروني')}><Input type="email" inputMode="email" autoComplete="email" disabled={this.state.busy} value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field><Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={this.state.mode==='create'?'new-password':'current-password'} disabled={this.state.busy} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>{this.state.mode==='create'?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" disabled={this.state.busy} value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}{this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}<Button variant="primary" disabled={this.state.busy} type="submit">{this.state.busy?t('Please wait…','يرجى الانتظار…'):this.state.mode==='create'?t('Create Account','إنشاء حساب'):t('Sign In','تسجيل الدخول')}</Button>{this.state.mode==='signin'?<button type="button" className="cloud-reset-link" disabled={this.state.busy||!this.state.email.trim()} onClick={()=>void this.run(()=>this.props.onReset(this.state.email.trim()),t('Password reset email sent.','تم إرسال رسالة إعادة تعيين كلمة المرور.'))}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}</form>}</Modal>;}
}
