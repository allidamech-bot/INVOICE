import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { ensureDocumentElectronicCopy, revokeSecureShare } from '../cloud/secure-share-owner.js';
import { secureShareIsActive, secureShareUrl, type SecureShareRecord } from '../lib/secure-share.js';
import { t } from '../lib/i18n.js';
import { DocumentQr } from '../templates/DocumentQr.js';
import { Button, Input, Modal } from './UI.js';

interface Props{open:boolean;document:LourexDocument|null;events:DocumentEventRecord[];onClose:()=>void;onOutput:(doc:LourexDocument,mode:'print'|'pdf'|'share',electronicShareId?:string)=>Promise<void>;}

/** Manage the electronic rendering of this document. No parallel export flow. */
export function ElectronicDocumentManager({open,document:doc,onClose,onOutput}:Props):any{
  const [share,setShare]=React.useState<SecureShareRecord|null>(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[copied,setCopied]=React.useState(false),[retry,setRetry]=React.useState(0);
  const identity=doc?.id+'|'+doc?.updatedAt;
  React.useEffect(()=>{
    let active=true;setShare(null);setError('');setCopied(false);
    if(open&&doc){setBusy(true);void ensureDocumentElectronicCopy(doc,{allowInactive:true,isCurrent:()=>active}).then(value=>{if(active)setShare(value);}).catch(()=>{if(active)setError(t('Unable to connect the electronic document. Check your LOUREX cloud account and try again.','تعذر فتح النسخة الإلكترونية. تحقق من اتصال حساب LOUREX السحابي وأعد المحاولة.'));}).finally(()=>{if(active)setBusy(false);});}
    return()=>{active=false;};
  },[open,identity,retry]);
  if(!doc)return null;
  const active=Boolean(share&&secureShareIsActive(share));
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:t('Please try again.','أعد المحاولة.'));}finally{setBusy(false);}};
  return <Modal portal open={open} title={t('Electronic document','النسخة الإلكترونية')} onClose={()=>{if(!busy)onClose();}} size="md">
    <div className="lx-electronic-management"><strong><bdi>{doc.number}</bdi></strong><p>{t('The QR is included automatically in the normal PDF and print output of this document. This page manages the same document link.','يظهر QR تلقائيًا داخل ملف PDF والطباعة العادية لهذا المستند. هذه الصفحة لإدارة رابط المستند نفسه.')}</p>
      {busy&&!share?<p role="status">{t('Connecting the document…','جارٍ ربط المستند…')}</p>:null}
      {error?<p role="alert" className="lx-public-error">{error}</p>:null}
      {share?<><span className={'lx-share-chip is-'+(active?'active':'revoked')}>{active?t('Electronic document active','النسخة الإلكترونية فعّالة'):t('QR disabled / expired','QR متوقف أو منتهي')}</span>
        {active?<DocumentQr token={share.id} language={doc.language}/>:null}
        <div className="lx-share-link-row"><Input readOnly aria-label={t('Document link','رابط المستند')} value={secureShareUrl(share.id)}/><Button disabled={!active||busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(secureShareUrl(share.id));setCopied(true);})}>{copied?t('Copied','تم النسخ'):t('Copy','نسخ')}</Button></div>
        <div className="lx-electronic-management-actions">{active?<><a href={secureShareUrl(share.id)} target="_blank" rel="noopener noreferrer">{t('Open electronic document','فتح النسخة الإلكترونية')}</a><Button variant="primary" disabled={busy} onClick={()=>void run(()=>onOutput(doc,'pdf'))}>{t('Save PDF','حفظ PDF')}</Button><Button variant="danger" disabled={busy} onClick={()=>void run(async()=>{await revokeSecureShare(share.id);setShare({...share,revokedAt:new Date().toISOString()});})}>{t('Disable QR link','إيقاف رابط QR')}</Button></>:<Button disabled={busy} variant="primary" onClick={()=>void run(async()=>setShare(await ensureDocumentElectronicCopy(doc,{renew:true}))) }>{t('Reactivate document QR','إعادة تفعيل QR للمستند')}</Button>}</div>
        <p className="lx-share-snapshot-note">{t('Anyone with the link can view this issued version. Edits create a new version; the previous PDF keeps its original details.','يمكن لمن لديه الرابط عرض هذا الإصدار الصادر. عند تعديل المستند يصدر رابط للإصدار الجديد، وتبقى بيانات PDF السابق مطابقة لإصداره.')}</p>
      </>:!busy?<Button onClick={()=>setRetry(value=>value+1)}>{t('Retry','إعادة المحاولة')}</Button>:null}
    </div>
  </Modal>;
}
