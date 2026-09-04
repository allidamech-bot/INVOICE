import type { CloudUser } from '../cloud/firebase.js';
import { hasCloudConflict, resolveCloudConflictWithCloud, resolveCloudConflictWithLocal } from '../cloud/firebase.js';
import { t } from '../lib/i18n.js';
import { Button, Field, Input, Modal } from './UI.js';

interface Props {
  open:boolean;
  user:CloudUser|null;
  syncState:'local'|'queued'|'syncing'|'synced'|'offline'|'error';
  syncMessage:string;
  onClose:()=>void;
  onSignIn:(email:string,password:string)=>Promise<void>;
  onCreate:(email:string,password:string)=>Promise<void>;
  onReset:(email:string)=>Promise<void>;
  onSync:()=>Promise<void>;
  onSignOut:()=>Promise<void>;
}
interface State { mode:'signin'|'create'; email:string; password:string; confirm:string; busy:boolean; error:string; message:string; resolving:'local'|'cloud'|null; }

export class CloudAccountModal extends React.Component<Props,State>{
  state:State={mode:'signin',email:'',password:'',confirm:'',busy:false,error:'',message:'',resolving:null};
  componentDidUpdate(prev:Props):void{if(this.props.open&&!prev.open)this.setState({mode:'signin',email:this.props.user?.email||'',password:'',confirm:'',busy:false,error:'',message:'',resolving:null});}
  private requestClose=()=>{if(!this.state.busy)this.props.onClose();};
  private run=async(action:()=>Promise<void>,success='')=>{if(this.state.busy)return;this.setState({busy:true,error:'',message:''});try{await action();this.setState({busy:false,password:'',confirm:'',message:success});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Cloud operation failed.','فشلت العملية السحابية.')});}};
  private submit=async(e:any)=>{e.preventDefault();if(this.state.busy)return;const email=this.state.email.trim();if(!email||!this.state.password)return this.setState({error:t('Enter your email and password.','أدخل البريد الإلكتروني وكلمة المرور.')});if(this.state.mode==='create'&&this.state.password!==this.state.confirm)return this.setState({error:t('Password confirmation does not match.','تأكيد كلمة المرور غير مطابق.')});if(this.state.mode==='create'&&this.state.password.length<6)return this.setState({error:t('Password must contain at least 6 characters.','يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.')});await this.run(()=>this.state.mode==='create'?this.props.onCreate(email,this.state.password):this.props.onSignIn(email,this.state.password));};
  private useDeviceCopy=async()=>{const user=this.props.user;if(!user||this.state.busy)return;this.setState({busy:true,resolving:'local',error:'',message:''});try{await resolveCloudConflictWithLocal(user.uid);this.setState({message:t('This device copy is now the protected account copy. Reloading…','تم اعتماد بيانات هذا الجهاز كنسخة الحساب المحمية. جارٍ إعادة التحميل…')});window.setTimeout(()=>window.location.reload(),450);}catch(e){this.setState({busy:false,resolving:null,error:e instanceof Error?e.message:t('Unable to publish this device copy.','تعذر اعتماد بيانات هذا الجهاز.')});}};
  private useCloudCopy=async()=>{const user=this.props.user;if(!user||this.state.busy)return;this.setState({busy:true,resolving:'cloud',error:'',message:''});try{await resolveCloudConflictWithCloud(user.uid);this.setState({message:t('Account data restored safely. The previous device copy was preserved as a safety snapshot. Reloading…','تمت استعادة بيانات الحساب بأمان، وحُفظت نسخة الجهاز السابقة كنسخة أمان. جارٍ إعادة التحميل…')});window.setTimeout(()=>window.location.reload(),450);}catch(e){this.setState({busy:false,resolving:null,error:e instanceof Error?e.message:t('Unable to restore the account copy.','تعذر استعادة نسخة الحساب.')});}};
  render():any{
    const conflict=Boolean(this.props.user&&hasCloudConflict(this.props.user.uid));
    return <Modal open={this.props.open} title={t('Cloud Sync','المزامنة السحابية')} size="sm" onClose={this.requestClose}>
      {this.props.user?<div className="cloud-account-panel">
        <div className="cloud-account-identity"><span className={`cloud-dot cloud-${this.props.syncState}`}/><div><strong>{this.props.user.email}</strong><small>{conflict?t('Two protected copies need your choice','توجد نسختان محميتان وتحتاجان اختيارك'):this.props.syncState==='syncing'?t('Syncing encrypted account data…','جارٍ مزامنة بيانات الحساب المشفّرة…'):this.props.syncState==='queued'?t('Saved locally — waiting to sync','تم الحفظ محليًا — بانتظار المزامنة'):this.props.syncState==='offline'?t('Offline — safely saved on this device','غير متصل — محفوظ بأمان على هذا الجهاز'):this.props.syncState==='synced'?t('Account data is up to date','بيانات الحساب محدثة'):this.props.syncState==='error'?t('Cloud needs attention','السحابة تحتاج مراجعة'):t('Cloud account connected','الحساب السحابي متصل')}</small></div></div>
        {this.props.syncMessage?<div className={`settings-message ${this.props.syncState==='error'?'error':'success'}`} role={this.props.syncState==='error'?'alert':'status'}>{this.props.syncMessage}</div>:null}
        {conflict?<div className="settings-card cloud-conflict-card"><strong>{t('No data will be overwritten automatically','لن يتم حذف أي بيانات تلقائيًا')}</strong><p className="subtle">{t('This device and your LOUREX account both contain changes. Choose the complete copy you want to make current. The replaced copy remains recoverable in safety/history storage.','هذا الجهاز وحساب LOUREX يحتويان على تغييرات. اختر النسخة الكاملة التي تريد اعتمادها، وستبقى النسخة المستبدلة قابلة للاسترجاع من نسخ الأمان/السجل.')}</p><div className="cloud-account-actions"><Button variant="primary" disabled={this.state.busy} onClick={()=>void this.useDeviceCopy()}>{this.state.resolving==='local'?t('Protecting device copy…','جارٍ اعتماد نسخة الجهاز…'):t('Keep This Device Copy','اعتماد بيانات هذا الجهاز')}</Button><Button disabled={this.state.busy} onClick={()=>void this.useCloudCopy()}>{this.state.resolving==='cloud'?t('Restoring account copy…','جارٍ استعادة نسخة الحساب…'):t('Use Account Copy','اعتماد نسخة الحساب')}</Button></div></div>:null}
        {this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}
        <p className="subtle">{t('Your LOUREX account is the durable home for your encrypted data. A new phone or tablet restores the latest account copy after sign-in; local storage remains an offline cache and safety layer.','حساب LOUREX هو المكان الدائم لبياناتك المشفّرة. عند تغيير الجوال أو الآيباد يتم استعادة آخر نسخة من الحساب بعد تسجيل الدخول، بينما يبقى التخزين المحلي للعمل دون اتصال وكنسخة أمان.')}</p>
        <div className="cloud-account-actions"><Button variant="primary" disabled={this.state.busy||this.props.syncState==='syncing'||conflict} onClick={()=>void this.run(this.props.onSync,t('Cloud sync completed.','اكتملت المزامنة السحابية.'))}>{this.props.syncState==='error'?t('Retry Sync','إعادة المزامنة'):t('Sync Now','مزامنة الآن')}</Button><Button disabled={this.state.busy||this.props.syncState==='syncing'} onClick={()=>void this.run(this.props.onSignOut)}>{t('Sign Out','تسجيل الخروج')}</Button></div>
      </div>:<form className="cloud-auth-form" onSubmit={this.submit}>
        <div className="segmented cloud-auth-tabs"><button type="button" disabled={this.state.busy} className={this.state.mode==='signin'?'active':''} onClick={()=>this.setState({mode:'signin',error:'',message:''})}>{t('Sign In','تسجيل الدخول')}</button><button type="button" disabled={this.state.busy} className={this.state.mode==='create'?'active':''} onClick={()=>this.setState({mode:'create',error:'',message:''})}>{t('Create Account','إنشاء حساب')}</button></div>
        <p className="subtle">{this.state.mode==='signin'?t('Sign in to restore the latest encrypted LOUREX account data on this device.','سجّل الدخول لاستعادة أحدث بيانات حساب LOUREX المشفّرة على هذا الجهاز.'):t('Create an account to make your encrypted data durable across devices.','أنشئ حسابًا لحفظ بياناتك المشفّرة بشكل دائم عبر أجهزتك.')}</p>
        <Field label={t('Email','البريد الإلكتروني')}><Input type="email" autoComplete="email" value={this.state.email} onChange={(e:any)=>this.setState({email:e.target.value,error:''})}/></Field>
        <Field label={t('Password','كلمة المرور')}><Input type="password" autoComplete={this.state.mode==='create'?'new-password':'current-password'} value={this.state.password} onChange={(e:any)=>this.setState({password:e.target.value,error:''})}/></Field>
        {this.state.mode==='create'?<Field label={t('Confirm Password','تأكيد كلمة المرور')}><Input type="password" autoComplete="new-password" value={this.state.confirm} onChange={(e:any)=>this.setState({confirm:e.target.value,error:''})}/></Field>:null}
        {this.state.error?<div className="auth-error" role="alert">{this.state.error}</div>:null}{this.state.message?<div className="settings-message success" role="status">{this.state.message}</div>:null}
        <Button variant="primary" disabled={this.state.busy} type="submit">{this.state.busy?t('Please wait…','يرجى الانتظار…'):this.state.mode==='create'?t('Create Cloud Account','إنشاء حساب سحابي'):t('Sign In','تسجيل الدخول')}</Button>
        {this.state.mode==='signin'?<button type="button" className="cloud-reset-link" disabled={this.state.busy||!this.state.email.trim()} onClick={()=>void this.run(()=>this.props.onReset(this.state.email.trim()),t('Password reset email sent.','تم إرسال رسالة إعادة تعيين كلمة المرور.'))}>{t('Forgot password?','نسيت كلمة المرور؟')}</button>:null}
      </form>}
    </Modal>;
  }
}
