import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { buildCommercialFlowSnapshot, commercialStatusLabel, commercialTrackingEventKind, commercialTrackingEventPayload, type CommercialTrackingEventKind, isQuoteLikeDocument, validatedCommercialTrackingEvent } from '../lib/commercial-flow.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { documentEventDisplayNote } from '../lib/document-event-display.js';
import { documentKindLabel } from '../lib/document-kinds.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Icon, Input, Modal, Textarea } from './UI.js';

interface Props {
  document:LourexDocument;
  documents:LourexDocument[];
  events:DocumentEventRecord[];
  onOpenDocument?:(document:LourexDocument)=>void;
  onCommercialEvent?:(document:LourexDocument,kind:CommercialTrackingEventKind,payload?:string)=>Promise<void>;
}

function documentLabel(document:LourexDocument):string{
  const label=documentKindLabel(document.kind,document.role);
  return t(label.en,label.ar);
}

function eventLabel(event:DocumentEventRecord):string{
  const commercial=commercialTrackingEventKind(event);
  if(commercial==='sent')return t('Marked sent','تم تسجيل الإرسال');
  if(commercial==='viewed')return t('Viewed in secure portal','تمت المشاهدة في البوابة الآمنة');
  if(commercial==='commented')return t('Customer commented','أضاف العميل تعليقًا');
  if(commercial==='accepted')return t('Accepted','تم القبول');
  if(commercial==='rejected')return t('Rejected','تم الرفض');
  if(commercial==='followup-scheduled')return t('Follow-up scheduled','تمت جدولة متابعة');
  if(commercial==='followup-completed')return t('Follow-up completed','تمت المتابعة');
  if(event.type==='created')return t('Created','تم الإنشاء');
  if(event.type==='issued')return t('Issued','تم الإصدار');
  if(event.type==='reissued')return t('Reissued','إعادة إصدار');
  if(event.type==='converted')return t('Converted','تم التحويل');
  if(event.type==='credit-note-created')return t('Credit note created','تم إنشاء إشعار دائن');
  if(event.type==='payment-recorded')return t('Payment recorded','تم تسجيل دفعة');
  if(event.type==='payment-deleted')return t('Payment removed','تم حذف دفعة');
  if(event.type==='voided')return t('Voided / cancelled','ملغى');
  if(event.type==='revision-started')return t('Revision started','بدء مراجعة');
  return t('Revision discarded','إلغاء المراجعة');
}

function eventNote(event:DocumentEventRecord):string{
  return commercialTrackingEventKind(event)?commercialTrackingEventPayload(event):documentEventDisplayNote(event.note);
}

export function CommercialFlowPanel({document,documents,events,onOpenDocument,onCommercialEvent}:Props):any{
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [rejectOpen,setRejectOpen]=React.useState(false);
  const [rejectionReason,setRejectionReason]=React.useState('');
  const [followUpDate,setFollowUpDate]=React.useState('');
  if(!isQuoteLikeDocument(document)&&!document.convertedFromId)return null;
  const snapshot=buildCommercialFlowSnapshot(document,documents,events,null);
  const arabic=isArabic();
  const status=commercialStatusLabel(snapshot.status,arabic);
  const quoteLike=isQuoteLikeDocument(document);
  const canTrack=Boolean(quoteLike&&document.status==='final'&&document.lifecycleStatus!=='voided'&&!snapshot.linkedInvoice);
  const terminal=snapshot.status==='accepted'||snapshot.status==='rejected'||snapshot.status==='converted';
  const statusHint=snapshot.statusSource==='conversion'
    ?t('Based on an actual linked invoice.','مبني على فاتورة مرتبطة فعلية.')
    :snapshot.statusSource==='date'
      ?t('Derived from the recorded valid-until date.','مشتق من تاريخ الصلاحية المسجل.')
      :snapshot.statusSource==='tracking'
        ?t('Based on recorded commercial tracking.','مبني على متابعة تجارية مسجلة.')
        :t('Based on the current document lifecycle.','مبني على دورة حياة المستند الحالية.');

  const persistCommercialEvent=async(kind:CommercialTrackingEventKind,payload='')=>{
    if(onCommercialEvent){await onCommercialEvent(document,kind,payload);return;}
    await mutateVaultSafely(vault=>{
      const event=validatedCommercialTrackingEvent(vault,document.id,kind,payload);
      return {...vault,documentEvents:[...vault.documentEvents,event]};
    });
  };

  const record=async(kind:CommercialTrackingEventKind,payload='')=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await persistCommercialEvent(kind,payload);if(kind==='rejected'){setRejectOpen(false);setRejectionReason('');}if(kind==='followup-scheduled')setFollowUpDate('');}
    catch(e){setError(e instanceof Error?e.message:t('Unable to update commercial tracking.','تعذر تحديث المتابعة التجارية.'));}
    finally{setBusy(false);}
  };

  const schedule=()=>{
    const date=followUpDate.trim();
    if(!date){setError(t('Choose a follow-up date first.','اختر تاريخ المتابعة أولًا.'));return;}
    void record('followup-scheduled',date);
  };
  const reject=()=>{
    const reason=rejectionReason.trim();
    if(!reason){setError(t('Enter the rejection reason first.','أدخل سبب الرفض أولًا.'));return;}
    void record('rejected',reason);
  };

  return <section className="ta-doc-panel lx-commercial-flow" aria-label={t('Commercial flow','المسار التجاري')}>
    <header><div><small>{t('Sales workflow','مسار المبيعات')}</small><h2>{t('Commercial Flow','المسار التجاري')}</h2><p>{t('Document relationships and commercial state without changing accounting status.','علاقات المستند وحالته التجارية بدون تغيير الحالة المحاسبية.')}</p></div><span className={`lx-commercial-status status-${snapshot.status}`} title={statusHint}>{status}</span></header>

    {quoteLike?<div className="lx-commercial-summary">
      <div><small>{t('Commercial status','الحالة التجارية')}</small><strong>{status}</strong><span>{statusHint}</span></div>
      <div><small>{t('Valid until','صالح حتى')}</small><strong>{snapshot.expiresAt?displayDate(snapshot.expiresAt,getUiLanguage()):'—'}</strong><span>{snapshot.expiresAt?t('Recorded on the quotation','مسجل على عرض السعر'):t('No expiry date recorded','لا يوجد تاريخ صلاحية مسجل')}</span></div>
      <div><small>{t('Linked invoice','الفاتورة المرتبطة')}</small><strong>{snapshot.linkedInvoice?.number||'—'}</strong><span>{snapshot.linkedInvoice?t('Conversion is confirmed by the linked record.','تم تأكيد التحويل من السجل المرتبط.'):t('No invoice conversion recorded yet.','لا يوجد تحويل لفاتورة مسجل حتى الآن.')}</span></div>
      <div><small>{t('Secure portal viewed','تمت المشاهدة الآمنة')}</small><strong>{snapshot.tracking.viewedAt?displayDate(snapshot.tracking.viewedAt.slice(0,10),getUiLanguage()):'—'}</strong><span>{snapshot.tracking.lastComment?t('Customer comment recorded','تم تسجيل تعليق العميل'):t('Trustworthy view evidence appears only after the secure portal opens.','يظهر إثبات المشاهدة الموثوق فقط بعد فتح البوابة الآمنة.')}</span></div>
    </div>:null}

    {canTrack?<section className="lx-commercial-actions" aria-label={t('Commercial tracking actions','إجراءات المتابعة التجارية')}>
      <div className="lx-commercial-actions-primary">
        {!terminal?<Button disabled={busy||snapshot.status==='sent'||snapshot.status==='expired'} onClick={()=>void record('sent')}>{snapshot.status==='sent'?t('Sent recorded','الإرسال مسجل'):snapshot.status==='expired'?t('Quote expired','انتهت الصلاحية'):t('Mark Sent','تسجيل كمرسل')}</Button>:null}
        {!terminal?<Button variant="primary" disabled={busy} onClick={()=>void record('accepted')}>{t('Mark Accepted','تسجيل القبول')}</Button>:null}
        {!terminal?<Button variant="danger" disabled={busy} onClick={()=>{setError('');setRejectOpen(true);}}>{t('Mark Rejected','تسجيل الرفض')}</Button>:null}
      </div>
      {!terminal?<div className="lx-commercial-followup">
        <label><span>{t('Next follow-up','المتابعة القادمة')}</span><Input type="date" min={todayIso()} value={followUpDate} onChange={(event:any)=>{setFollowUpDate(event.target.value);setError('');}}/></label>
        <Button disabled={busy||!followUpDate} onClick={schedule}>{t('Schedule','جدولة')}</Button>
        {snapshot.tracking.followUpAt?<Button disabled={busy} onClick={()=>void record('followup-completed')}>{t('Complete follow-up','إتمام المتابعة')}</Button>:null}
      </div>:null}
      {snapshot.tracking.followUpAt?<p className="lx-commercial-next-followup"><Icon name="file"/><span>{t('Next follow-up','المتابعة القادمة')}: <strong>{displayDate(snapshot.tracking.followUpAt,getUiLanguage())}</strong></span></p>:null}
      {snapshot.tracking.rejectionReason?<p className="lx-commercial-rejection"><strong>{t('Rejection reason','سبب الرفض')}</strong><span>{snapshot.tracking.rejectionReason}</span></p>:null}
      {error?<p className="lx-commercial-error" role="alert">{error}</p>:null}
    </section>:quoteLike&&document.status!=='final'?<div className="lx-commercial-empty"><Icon name="file"/><span>{t('Issue the quotation first to start external commercial tracking.','أصدر عرض السعر أولًا لبدء المتابعة التجارية الخارجية.')}</span></div>:null}

    <div className="lx-commercial-chain" role="list" aria-label={t('Linked document chain','سلسلة المستندات المرتبطة')}>
      {snapshot.flow.map(node=><button key={node.document.id} type="button" role="listitem" className={`lx-commercial-node relation-${node.relation}`} disabled={!onOpenDocument||node.document.id===document.id} onClick={()=>onOpenDocument?.(node.document)}>
        <span className="lx-commercial-node-icon"><Icon name={node.document.kind==='invoice'?'invoice':'file'}/></span>
        <span><small>{documentLabel(node.document)}</small><strong><bdi>{node.document.number}</bdi></strong><em>{node.relation==='source'?t('Source','المصدر'):node.relation==='converted'?t('Converted document','مستند محوّل'):node.relation==='credit'?t('Credit','دائن'):t('Current','الحالي')}</em></span>
      </button>)}
    </div>

    <div className="lx-commercial-evidence">
      <div className="lx-commercial-evidence-heading"><strong>{t('Recorded evidence','السجل المثبت')}</strong><span>{snapshot.events.length}</span></div>
      {snapshot.events.length?<ol>{snapshot.events.slice(-8).reverse().map(event=>{const note=eventNote(event);return <li key={event.id}><span className="lx-commercial-event-dot"/><div><strong>{eventLabel(event)}</strong><small><bdi>{event.documentNumber}</bdi>{event.relatedDocumentNumber?` → ${event.relatedDocumentNumber}`:''}</small>{note?<p>{commercialTrackingEventKind(event)==='followup-scheduled'?`${t('Follow-up','متابعة')}: ${note}`:note}</p>:null}</div><time dateTime={event.at}>{displayDate(event.at.slice(0,10),getUiLanguage())}</time></li>;})}</ol>:<div className="lx-commercial-empty"><Icon name="file"/><span>{t('No additional lifecycle evidence has been recorded yet.','لم يتم تسجيل أدلة إضافية في دورة الحياة بعد.')}</span></div>}
    </div>

    <Modal open={rejectOpen} title={t('Mark quotation rejected','تسجيل رفض عرض السعر')} size="sm" onClose={()=>{if(!busy){setRejectOpen(false);setError('');}}} footer={<div className="modal-footer-actions"><Button disabled={busy} onClick={()=>{setRejectOpen(false);setError('');}}>{t('Cancel','إلغاء')}</Button><Button variant="danger" disabled={busy||!rejectionReason.trim()} onClick={reject}>{t('Confirm rejection','تأكيد الرفض')}</Button></div>}>
      <p className="modal-message">{t('Record the customer’s reason when known. This does not void or delete the quotation.','سجّل سبب العميل عند معرفته. هذا لا يلغي عرض السعر ولا يحذفه.')}</p>
      <label className="lifecycle-reason-field"><span>{t('Rejection reason','سبب الرفض')}</span><Textarea rows={3} value={rejectionReason} onChange={(event:any)=>{setRejectionReason(event.target.value);setError('');}} placeholder={t('Example: price, timing, specification…','مثال: السعر، الوقت، المواصفات…')}/></label>
      {error?<p className="lx-commercial-error" role="alert">{error}</p>:null}
    </Modal>
  </section>;
}
