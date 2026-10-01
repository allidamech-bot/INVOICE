import type { Customer, LourexDocument } from '../types.js';
import { createSecureShare, listSecureSharesForCustomer, listSecureSharesForDocument, revokeSecureShare, type SecureShareRecord } from '../cloud/secure-share.js';
import { secureShareEligible } from '../lib/secure-share-snapshot.js';
import { ensureSecureShareStyles } from '../lib/secure-share-style.js';
import { displayDate } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { Button, Icon, Modal, Select } from './UI.js';

interface Props{
  open:boolean;
  document?:LourexDocument|null;
  customer?:Customer|null;
  cloudConnected:boolean;
  onOpenCloud:()=>void;
  onClose:()=>void;
}
interface State{loading:boolean;busy:boolean;days:string;shares:SecureShareRecord[];error:string;copiedId:string;}

function customerName(customer:Customer|null|undefined):string{return customer?((getUiLanguage()==='ar'?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim()||t('Customer','عميل')):t('Customer','عميل');}
function statusFor(share:SecureShareRecord):{key:string;label:string}{
  if(share.revokedAt)return{key:'revoked',label:t('Revoked','ملغى')};
  if(share.expiresAt&&Date.parse(share.expiresAt)<=Date.now())return{key:'expired',label:t('Expired','منتهي')};
  if(share.responseStatus==='accepted')return{key:'accepted',label:t('Accepted','مقبول')};
  if(share.responseStatus==='rejected')return{key:'rejected',label:t('Rejected','مرفوض')};
  if(share.responseStatus==='commented')return{key:'viewed',label:t('Commented','تم التعليق')};
  if(share.viewedAt)return{key:'viewed',label:t('Viewed','تمت المشاهدة')};
  return{key:'active',label:t('Active','فعال')};
}
function activeShare(share:SecureShareRecord):boolean{return !share.revokedAt&&(!share.expiresAt||Date.parse(share.expiresAt)>Date.now());}

export class SecureShareManager extends React.Component<Props,State>{
  state:State={loading:false,busy:false,days:'7',shares:[],error:'',copiedId:''};
  componentDidMount():void{ensureSecureShareStyles();if(this.props.open)void this.load();}
  componentDidUpdate(prev:Props):void{
    const targetChanged=prev.document?.id!==this.props.document?.id||prev.customer?.id!==this.props.customer?.id;
    if(this.props.open&&(!prev.open||targetChanged||(!prev.cloudConnected&&this.props.cloudConnected)))void this.load();
    if(!this.props.open&&prev.open)this.setState({shares:[],error:'',copiedId:'',loading:false,busy:false});
  }
  private load=async()=>{
    if(!this.props.open||!this.props.cloudConnected){this.setState({shares:[],loading:false,error:''});return;}
    this.setState({loading:true,error:''});
    try{
      const shares=this.props.document?await listSecureSharesForDocument(this.props.document.id):this.props.customer?await listSecureSharesForCustomer(this.props.customer.id):[];
      this.setState({shares,loading:false});
    }catch(error){this.setState({loading:false,error:error instanceof Error?error.message:String(error)});}
  };
  private create=async()=>{
    const doc=this.props.document;if(!doc||this.state.busy)return;
    if(!secureShareEligible(doc)){this.setState({error:t('Only active finalized customer documents can be shared securely.','يمكن المشاركة الآمنة فقط للمستندات النهائية الفعالة المرتبطة بعميل.')});return;}
    const days=Number(this.state.days);this.setState({busy:true,error:'',copiedId:''});
    try{const created=await createSecureShare(doc,days);this.setState(state=>({busy:false,shares:[created,...state.shares],copiedId:''}));}
    catch(error){this.setState({busy:false,error:error instanceof Error?error.message:String(error)});}
  };
  private copy=async(share:SecureShareRecord)=>{
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(share.url);
      else{const area=document.createElement('textarea');area.value=share.url;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
      this.setState({copiedId:share.id});window.setTimeout(()=>{if(this.state.copiedId===share.id)this.setState({copiedId:''});},1800);
    }catch{this.setState({error:t('Could not copy the secure link.','تعذر نسخ الرابط الآمن.')});}
  };
  private revoke=async(share:SecureShareRecord)=>{
    if(this.state.busy||!activeShare(share))return;this.setState({busy:true,error:''});
    try{await revokeSecureShare(share.id);await this.load();}
    catch(error){this.setState({error:error instanceof Error?error.message:String(error)});}
    finally{this.setState({busy:false});}
  };
  private row=(share:SecureShareRecord):any=>{
    const status=statusFor(share),created=share.createdAt?displayDate(share.createdAt.slice(0,10),getUiLanguage()):'—',expires=share.expiresAt?displayDate(share.expiresAt.slice(0,10),getUiLanguage()):'—';
    return <article key={share.id} className="lx-share-owner-row"><div className="lx-share-owner-row-main"><div className="lx-share-owner-row-title"><strong>{share.documentNumber}</strong><span className={`lx-share-owner-status is-${status.key}`}>{status.label}</span></div><div className="lx-share-owner-meta"><span>{t('Created','أُنشئ')}: {created}</span><span>{t('Expires','ينتهي')}: {expires}</span>{share.viewedAt?<span>{t('Viewed','شوهِد')}: {displayDate(share.viewedAt.slice(0,10),getUiLanguage())}</span>:null}</div><div className="lx-share-owner-link"><code dir="ltr">{share.url}</code></div>{share.customerComment?<div className="lx-share-owner-comment"><strong>{t('Customer comment','تعليق العميل')}</strong><br/>{share.customerComment}</div>:null}</div><div className="lx-share-owner-actions"><Button icon="copy" disabled={this.state.busy} onClick={()=>void this.copy(share)}>{this.state.copiedId===share.id?t('Copied','تم النسخ'):t('Copy Link','نسخ الرابط')}</Button>{activeShare(share)?<Button variant="danger" disabled={this.state.busy} onClick={()=>void this.revoke(share)}>{t('Revoke','إلغاء الرابط')}</Button>:null}</div></article>;
  };
  render():any{
    if(!this.props.open)return null;
    const doc=this.props.document??null,customer=this.props.customer??null,title=doc?t(`Secure Share — ${doc.number}`,`مشاركة آمنة — ${doc.number}`):t(`Shared with ${customerName(customer)}`,`المشارك مع ${customerName(customer)}`);
    return <Modal open title={title} size="lg" onClose={this.props.onClose} footer={<div className="modal-footer-actions"><Button onClick={this.props.onClose}>{t('Close','إغلاق')}</Button></div>}><div className="lx-secure-share">
      <div className="lx-share-owner-note"><Icon name="lock"/><div><strong>{t('External customer access is separated from your encrypted workspace.','وصول العميل الخارجي منفصل عن مساحة عملك المشفرة.')}</strong><p>{t('The link contains a high-entropy capability token only. It does not expose your Vault, internal costs, attachments, or customer data in the URL.','يحتوي الرابط فقط على رمز صلاحية عشوائي عالي القوة، ولا يكشف الخزنة أو التكاليف الداخلية أو المرفقات أو بيانات العميل في عنوان الرابط.')}</p></div></div>
      {!this.props.cloudConnected?<div className="lx-share-owner-empty"><Icon name="backup"/><strong>{t('LOUREX Cloud is required for Secure Share','سحابة LOUREX مطلوبة للمشاركة الآمنة')}</strong><small>{t('Connect the current workspace account so the external link can be stored separately from the local encrypted Vault.','اربط حساب مساحة العمل الحالية حتى يتم حفظ الرابط الخارجي بشكل منفصل عن الخزنة المحلية المشفرة.')}</small><Button variant="primary" onClick={this.props.onOpenCloud}>{t('Open Cloud Account','فتح الحساب السحابي')}</Button></div>:null}
      {this.props.cloudConnected&&doc?<div className="lx-share-owner-create"><label>{t('Link expiry','انتهاء الرابط')}<Select value={this.state.days} onChange={(event:any)=>this.setState({days:String(event.target.value)})}><option value="1">{t('1 day','يوم واحد')}</option><option value="7">{t('7 days','7 أيام')}</option><option value="30">{t('30 days','30 يومًا')}</option><option value="90">{t('90 days','90 يومًا')}</option></Select></label><Button icon="share" variant="primary" disabled={this.state.busy||!secureShareEligible(doc)} onClick={()=>void this.create()}>{this.state.busy?t('Creating…','جارٍ الإنشاء…'):t('Create Secure Link','إنشاء رابط آمن')}</Button></div>:null}
      {this.state.error?<div className="lx-share-owner-error" role="alert"><Icon name="alert"/><span>{this.state.error}</span></div>:null}
      {this.props.cloudConnected?(this.state.loading?<div className="lx-share-owner-empty"><Icon name="refresh"/><strong>{t('Loading secure shares…','جارٍ تحميل المشاركات الآمنة…')}</strong></div>:this.state.shares.length?<div className="lx-share-owner-list">{this.state.shares.map(this.row)}</div>:<div className="lx-share-owner-empty"><Icon name="share"/><strong>{doc?t('No secure links yet','لا توجد روابط آمنة بعد'):t('Nothing shared with this customer yet','لم تتم مشاركة شيء مع هذا العميل بعد')}</strong><small>{doc?t('Create a time-limited link when the finalized customer document is ready to send.','أنشئ رابطًا محدود المدة عندما يصبح المستند النهائي جاهزًا للإرسال.'):t('Securely shared documents for this customer will appear here with viewed and response status.','ستظهر هنا المستندات التي تمت مشاركتها بأمان مع هذا العميل مع حالة المشاهدة والرد.')}</small></div>):null}
    </div></Modal>;
  }
}
