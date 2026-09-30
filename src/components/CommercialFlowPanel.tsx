import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { buildCommercialFlowSnapshot, commercialStatusLabel, isQuoteLikeDocument } from '../lib/commercial-flow.js';
import { displayDate } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { documentKindLabel } from '../lib/document-kinds.js';
import { Icon } from './UI.js';

interface Props {
  document:LourexDocument;
  documents:LourexDocument[];
  events:DocumentEventRecord[];
  onOpenDocument?:(document:LourexDocument)=>void;
}

function documentLabel(document:LourexDocument):string{
  const label=documentKindLabel(document.kind,document.role);
  return t(label.en,label.ar);
}

function eventLabel(event:DocumentEventRecord):string{
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

export function CommercialFlowPanel({document,documents,events,onOpenDocument}:Props):any{
  if(!isQuoteLikeDocument(document)&&!document.convertedFromId&&document.kind!=='invoice')return null;
  const snapshot=buildCommercialFlowSnapshot(document,documents,events,null);
  const arabic=isArabic();
  const status=commercialStatusLabel(snapshot.status,arabic);
  const statusHint=snapshot.statusSource==='conversion'
    ?t('Based on an actual linked invoice.','مبني على فاتورة مرتبطة فعلية.')
    :snapshot.statusSource==='date'
      ?t('Derived from the recorded valid-until date.','مشتق من تاريخ الصلاحية المسجل.')
      :snapshot.statusSource==='tracking'
        ?t('Based on recorded commercial tracking.','مبني على متابعة تجارية مسجلة.')
        :t('Based on the current document lifecycle.','مبني على دورة حياة المستند الحالية.');

  return <section className="ta-doc-panel lx-commercial-flow" aria-label={t('Commercial flow','المسار التجاري')}>
    <header><div><small>{t('Sales workflow','مسار المبيعات')}</small><h2>{t('Commercial Flow','المسار التجاري')}</h2><p>{t('Document relationships and commercial state without changing accounting status.','علاقات المستند وحالته التجارية بدون تغيير الحالة المحاسبية.')}</p></div><span className={`lx-commercial-status status-${snapshot.status}`} title={statusHint}>{status}</span></header>

    {isQuoteLikeDocument(document)?<div className="lx-commercial-summary">
      <div><small>{t('Commercial status','الحالة التجارية')}</small><strong>{status}</strong><span>{statusHint}</span></div>
      <div><small>{t('Valid until','صالح حتى')}</small><strong>{snapshot.expiresAt?displayDate(snapshot.expiresAt,getUiLanguage()):'—'}</strong><span>{snapshot.expiresAt?t('Recorded on the quotation','مسجل على عرض السعر'):t('No expiry date recorded','لا يوجد تاريخ صلاحية مسجل')}</span></div>
      <div><small>{t('Linked invoice','الفاتورة المرتبطة')}</small><strong>{snapshot.linkedInvoice?.number||'—'}</strong><span>{snapshot.linkedInvoice?t('Conversion is confirmed by the linked record.','تم تأكيد التحويل من السجل المرتبط.'):t('No invoice conversion recorded yet.','لا يوجد تحويل لفاتورة مسجل حتى الآن.')}</span></div>
    </div>:null}

    <div className="lx-commercial-chain" role="list" aria-label={t('Linked document chain','سلسلة المستندات المرتبطة')}>
      {snapshot.flow.map(node=><button key={node.document.id} type="button" role="listitem" className={`lx-commercial-node relation-${node.relation}`} disabled={!onOpenDocument||node.document.id===document.id} onClick={()=>onOpenDocument?.(node.document)}>
        <span className="lx-commercial-node-icon"><Icon name={node.document.kind==='invoice'?'invoice':'file'}/></span>
        <span><small>{documentLabel(node.document)}</small><strong><bdi>{node.document.number}</bdi></strong><em>{node.relation==='source'?t('Source','المصدر'):node.relation==='converted'?t('Converted document','مستند محوّل'):node.relation==='credit'?t('Credit','دائن'):t('Current','الحالي')}</em></span>
      </button>)}
    </div>

    <div className="lx-commercial-evidence">
      <div className="lx-commercial-evidence-heading"><strong>{t('Recorded evidence','السجل المثبت')}</strong><span>{snapshot.events.length}</span></div>
      {snapshot.events.length?<ol>{snapshot.events.slice(-8).reverse().map(event=><li key={event.id}><span className="lx-commercial-event-dot"/><div><strong>{eventLabel(event)}</strong><small><bdi>{event.documentNumber}</bdi>{event.relatedDocumentNumber?` → ${event.relatedDocumentNumber}`:''}</small>{event.note?<p>{event.note}</p>:null}</div><time dateTime={event.at}>{displayDate(event.at.slice(0,10),getUiLanguage())}</time></li>)}</ol>:<div className="lx-commercial-empty"><Icon name="file"/><span>{t('No additional lifecycle evidence has been recorded yet.','لم يتم تسجيل أدلة إضافية في دورة الحياة بعد.')}</span></div>}
    </div>
  </section>;
}
