import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { createCommercialTrackingEvent, commercialTrackingEventKind, commercialTrackingFromEvents, isQuoteLikeDocument } from '../lib/commercial-flow.js';
import { displayDate } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { secureShareIsActive, secureShareState, secureShareUrl, type SecureShareRecord } from '../lib/secure-share.js';
import { currentCloudUser } from '../cloud/firebase.js';
import { createSecureShare, revokeSecureShare, subscribeOwnerSecureShares } from '../cloud/secure-share-owner.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Input, Modal, Select } from './UI.js';

interface Props {open:boolean;document:LourexDocument|null;events:DocumentEventRecord[];onClose:()=>void;}

function stateLabel(share:SecureShareRecord):string{const state=secureShareState(share);return state==='active'?t('Active','فعال'):state==='expired'?t('Expired','منتهي'):state==='revoked'?t('Revoked','ملغى'):state==='accepted'?t('Accepted','مقبول'):t('Rejected','مرفوض');}
function eventExists(events:DocumentEventRecord[],shareId:string,kind:string):boolean{return events.some(event=>event.relatedDocumentId===shareId&&commercialTrackingEventKind(event)===kind);}

async function syncPortalEvidence(shares:SecureShareRecord[]):Promise<void>{
  if(!shares.length)return;
  await mutateVaultSafely(vault=>{
    let changed=false;const events=[...vault.documentEvents];
    for(const share of shares){
      const doc=vault.documents.find(item=>item.id===share.documentId);if(!doc||!isQuoteLikeDocument(doc))continue;
      if(share.viewedAt&&!eventExists(events,share.id,'viewed')){events.push(createCommercialTrackingEvent(doc,'viewed','',share.viewedAt,share.id,'Secure share'));changed=true;}
      if(share.customerComment&&share.commentAt&&!eventExists(events,share.id,'commented')){events.push(createCommercialTrackingEvent(doc,'commented',share.customerComment,share.commentAt,share.id,'Secure share'));changed=true;}
      if(share.decision&&share.decisionAt&&!eventExists(events,share.id,share.decision)){
        const payload=share.decision==='rejected'?(share.customerComment||'Rejected through secure customer portal.'):share.customerComment;
        events.push(createCommercialTrackingEvent(doc,share.decision,payload,share.decisionAt,share.id,'Secure share'));changed=true;
      }
    }
    return changed?{...vault,documentEvents:events}:vault;
  });
}

export function SecureShareManager({open,document:doc,events,onClose}:Props):any{
  const [shares,setShares]=React.useState<SecureShareRecord[]>([]),[days,setDays]=React.useState('7'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[copied,setCopied]=React.useState('');
  React.useEffect(()=>{if(!open||!doc)return;setError('');const off=subscribeOwnerSecureShares(items=>{const relevant=items.filter(item=>item.documentId===doc.id);setShares(relevant);void syncPortalEvidence(relevant);},e=>setError(e instanceof Error?e.message:t('Unable to load secure links.','تعذر تحميل الروابط الآمنة.')));return off;},[open,doc?.id]);
  React.useEffect(()=>{if(!open){setShares([]);setError('');setCopied('');}},[open]);
  if(!doc)return null;
  const connected=Boolean(currentCloudUser());
  const create=async()=>{if(busy)return;setBusy(true);setError('');try{const share=await createSecureShare(doc,Number(days));if(isQuoteLikeDocument(doc)){await mutateVaultSafely(vault=>{const latest=vault.documents.find(item=>item.id===doc.id);if(!latest)return vault;const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents);if(tracking.status==='sent'||tracking.status==='accepted'||tracking.status==='rejected')return vault;const event=createCommercialTrackingEvent(latest,'sent','',share.createdAt||new Date().toISOString(),share.id,'Secure share');return{...vault,documentEvents:[...vault.documentEvents,event]};});}setCopied(share.id);await copy(share);}catch(e){setError(e instanceof Error?e.message:t('Unable to create secure link.','تعذر إنشاء الرابط الآمن.'));}finally{setBusy(false);}};
  const copy=async(share:SecureShareRecord)=>{const url=secureShareUrl(share.id);try{await navigator.clipboard.writeText(url);setCopied(share.id);window.setTimeout(()=>setCopied(value=>value===share.id?'':value),1800);}catch{setError(t('Copy is unavailable. Select the link and copy it manually.','النسخ غير متاح. حدّد الرابط وانسخه يدويًا.'));}};
  const revoke=async(share:SecureShareRecord)=>{if(busy||!secureShareIsActive(share))return;setBusy(true);setError('');try{await revokeSecureShare(share.id);}catch(e){setError(e instanceof Error?e.message:t('Unable to revoke secure link.','تعذر إلغاء الرابط الآمن.'));}finally{setBusy(false);}};
  return <Modal open={open} title={t('Secure Share','مشاركة آمنة')} size="lg" onClose={()=>{if(!busy)onClose();}} footer={<div className="modal-footer-actions"><Button disabled={busy} onClick={onClose}>{t('Close','إغلاق')}</Button></div>}>
    <div className="lx-share-manager">
      <div className="lx-share-manager-copy"><strong>{doc.number}</strong><span>{t('Creates a limited customer link. Internal costs and attachments are never included.','ينشئ رابط عميل محدودًا. لا يتم تضمين التكاليف الداخلية أو المرفقات.')}</span></div>
      {!connected?<div className="lx-share-empty">{t('Connect the LOUREX cloud account first. Secure customer links are intentionally unavailable without an authenticated owner account.','اربط حساب LOUREX السحابي أولًا. الروابط الآمنة غير متاحة عمدًا بدون حساب مالك موثّق.')}</div>:<div className="lx-share-expiry"><label>{t('Link expiry','مدة صلاحية الرابط')}<Select value={days} onChange={(e:any)=>setDays(e.target.value)}><option value="1">1 {t('day','يوم')}</option><option value="3">3 {t('days','أيام')}</option><option value="7">7 {t('days','أيام')}</option><option value="14">14 {t('days','يوم')}</option><option value="30">30 {t('days','يوم')}</option></Select></label><Button icon="share" variant="primary" disabled={busy} onClick={()=>void create()}>{busy?t('Working…','جارٍ التنفيذ…'):t('Create secure link','إنشاء رابط آمن')}</Button></div>}
      {error?<p className="lx-public-error" role="alert">{error}</p>:null}
      <div className="lx-share-list">{shares.length?shares.map(share=><article className="lx-share-card" key={share.id}><div className="lx-share-card-head"><strong>{displayDate(share.createdAt.slice(0,10),getUiLanguage())}</strong><span className={`lx-share-chip is-${secureShareState(share)}`}>{stateLabel(share)}</span></div><div className="lx-share-link-row"><Input readOnly value={secureShareUrl(share.id)} aria-label={t('Secure link','الرابط الآمن')}/><Button onClick={()=>void copy(share)}>{copied===share.id?t('Copied','تم النسخ'):t('Copy','نسخ')}</Button></div><div className="lx-share-card-meta"><span>{t('Expires','ينتهي')}: {displayDate(share.expiresAt.slice(0,10),getUiLanguage())}</span>{share.viewedAt?<span>{t('Viewed','تمت المشاهدة')}: {displayDate(share.viewedAt.slice(0,10),getUiLanguage())}</span>:null}</div>{share.decision||share.customerComment?<div className="lx-share-evidence">{share.decision?<strong>{share.decision==='accepted'?t('Customer accepted','وافق العميل'):t('Customer rejected','رفض العميل')}</strong>:null}{share.customerComment?<span>{share.customerComment}</span>:null}</div>:null}<div className="lx-share-card-actions"><Button disabled={busy} onClick={()=>void copy(share)}>{t('Copy link','نسخ الرابط')}</Button>{secureShareIsActive(share)?<Button variant="danger" disabled={busy} onClick={()=>void revoke(share)}>{t('Revoke','إلغاء الرابط')}</Button>:null}</div></article>):<div className="lx-share-empty">{t('No secure links for this document yet.','لا توجد روابط آمنة لهذا المستند حتى الآن.')}</div>}</div>
    </div>
  </Modal>;
}
