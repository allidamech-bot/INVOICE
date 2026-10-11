import { lineTotal } from '../lib/money.js';
import type { WorkspaceDocument, WorkspaceLine } from '../lib/ai-workspace-model.js';

type Language = 'ar' | 'en';
const PAGE_SIZE = 12;
const validDecimal = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/;

function lineAmount(row: WorkspaceLine): string | null {
  if (!validDecimal.test(row.quantity) || !validDecimal.test(row.unitPrice)) return null;
  if (Number(row.quantity) <= 0) return null;
  try {
    return lineTotal(row.quantity, row.unitPrice);
  } catch {
    return null;
  }
}

const label = (language: Language, english: string, arabic: string) =>
  language === 'ar' ? arabic : english;

export interface AiDocumentPreviewProps {
  doc: WorkspaceDocument;
  language: Language;
  onReviewed?: () => void;
}

/**
 * Read-only, deterministically calculated document preview.
 * Never derives a financial amount from model text and never posts/saves.
 * The surrounding workspace owns all mutation controls and approval guards.
 */
export function AiDocumentPreview({ doc, language, onReviewed }: AiDocumentPreviewProps): any {
  const [page, setPage] = React.useState(0);
  const isAr = language === 'ar';
  const pageCount = Math.max(1, Math.ceil(doc.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = doc.rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const title = label(language, 'Document preview', 'معاينة المستند');
  const incomplete = doc.subtotal === null || doc.blockers.length > 0;

  return <section className="lxw-document-preview" data-preview-status={doc.status}
    aria-label={title} dir={isAr ? 'rtl' : 'ltr'}>
    <header className="lxw-document-preview-hero">
      <div>
        <span className="lxw-document-preview-eyebrow">{title}</span>
        <h3><bdi>{doc.title}</bdi></h3>
      </div>
      <span className="lxw-document-preview-state">
        {doc.status === 'draft'
          ? label(language, 'Working draft · not saved', 'مسودة عمل · غير محفوظة')
          : label(language, 'Saved record · read only', 'سجل محفوظ · للقراءة')}
      </span>
    </header>

    <div className="lxw-document-preview-facts">
      <div className="lxw-document-preview-fact">
        <small>{label(language, 'Customer / party', 'العميل / الجهة')}</small>
        <strong>{doc.customer || label(language, 'Not selected', 'غير محدد')}</strong>
      </div>
      <div className="lxw-document-preview-fact">
        <small>{label(language, 'Currency', 'العملة')}</small>
        <strong className="lxw-document-preview-currency" dir="ltr">{doc.currency}</strong>
      </div>
      <div className="lxw-document-preview-fact">
        <small>{label(language, 'Line items', 'عدد الأصناف')}</small>
        <strong>{doc.rows.length}</strong>
      </div>
      <div className="lxw-document-preview-fact">
        <small>{label(language, 'Revision', 'نسخة العمل')}</small>
        <strong>{doc.revision}</strong>
      </div>
    </div>

    <div className="lxw-document-preview-section-title">
      <strong>{label(language, 'Products and pricing', 'الأصناف والأسعار')}</strong>
      <span>{doc.rows.length} {label(language, 'items', 'صنف')}</span>
    </div>

    <ol className="lxw-document-preview-items" start={currentPage * PAGE_SIZE + 1}>
      {rows.map((row, i) => {
        const amount = lineAmount(row);
        const description = (isAr ? row.descriptionAr || row.descriptionEn : row.descriptionEn || row.descriptionAr)
          || label(language, 'Description missing', 'وصف الصنف غير متوفر');
        return <li key={row.id} className="lxw-document-preview-item" data-amount-complete={String(amount !== null)}>
          <div className="lxw-document-preview-item-head">
            <span className="lxw-document-preview-sequence">{currentPage * PAGE_SIZE + i + 1}</span>
            <strong>{description}</strong>
            <bdi className="lxw-document-preview-item-amount" dir="ltr">
              {amount === null ? '—' : `${amount} ${doc.currency}`}
            </bdi>
          </div>
          <div className="lxw-document-preview-item-meta">
            <span>{label(language, 'Qty', 'الكمية')}: <bdi dir="ltr">{row.quantity || '—'}</bdi> {row.unit}</span>
            <span>{label(language, 'Unit price', 'سعر الوحدة')}: <bdi dir="ltr">{row.unitPrice || '—'} {doc.currency}</bdi></span>
          </div>
          {row.descriptionAr && row.descriptionEn
            ? <small className="lxw-document-preview-translation" dir={isAr ? 'ltr' : 'rtl'}>{isAr ? row.descriptionEn : row.descriptionAr}</small>
            : null}
          {amount === null
            ? <small className="lxw-document-preview-incomplete">{label(language, 'Quantity or price needs review', 'الكمية أو السعر يحتاج مراجعة')}</small>
            : null}
        </li>;
      })}
      {!rows.length && <li className="lxw-document-preview-empty">{label(language, 'No items in this document', 'لا توجد أصناف بعد')}</li>}
    </ol>

    {pageCount > 1
      ? <nav className="lxw-document-preview-pages" aria-label={label(language, 'Item pages', 'صفحات الأصناف')}>
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            {label(language, 'Previous', 'السابق')}
          </button>
          <span>{currentPage + 1} / {pageCount}</span>
          <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>
            {label(language, 'Next', 'التالي')}
          </button>
        </nav>
      : null}

    <section className="lxw-document-preview-totals" aria-label={label(language, 'Document subtotal', 'المجموع الفرعي للمستند')}>
      <span>{label(language, 'Items subtotal', 'المجموع الفرعي للأصناف')}</span>
      <strong dir="ltr">{doc.subtotal === null ? '—' : `${doc.subtotal} ${doc.currency}`}</strong>
    </section>
    <p className="lxw-document-preview-disclaimer">
      {doc.subtotal === null
        ? label(language, 'Subtotal cannot be determined until missing quantities and prices are resolved.', 'لا يمكن حساب المجموع قبل استكمال الكميات والأسعار المفقودة.')
        : label(language, 'Items subtotal only; excludes freight, discounts and tax. It is not a final invoice total.', 'هذا مجموع الأصناف فقط، ولا يشمل الشحن والخصومات والضرائب، وليس إجمالي الفاتورة النهائي.')}
    </p>

    {doc.terms.length
      ? <section className="lxw-document-preview-terms">
          <h4>{label(language, 'Commercial terms', 'الشروط التجارية')}</h4>
          <dl>{doc.terms.map((term, i) =>
            <div key={i}><dt>{term.label}</dt><dd>{term.value}</dd></div>)}</dl>
        </section>
      : null}

    {doc.diff.length && doc.status === 'draft'
      ? <section className="lxw-document-preview-changes">
          <h4>{label(language, 'Changes to review', 'التغييرات للمراجعة')}</h4>
          <div>{doc.diff.map((entry, i) =>
            <p key={i}><b>{entry.field}</b><span>{entry.before || '—'} → {entry.after || '—'}</span></p>)}</div>
        </section>
      : null}

    {onReviewed && doc.status === 'draft'
      ? <button type="button" className="lxw-document-preview-reviewed" onClick={onReviewed}>
          {label(language, 'Reviewed · return to chat', 'تمت المراجعة · العودة للمحادثة')}
        </button>
      : null}

    {incomplete
      ? <section className="lxw-document-preview-warnings" role="status">
          <h4>{label(language, 'Complete before approval', 'أكمل قبل الاعتماد')}</h4>
          {doc.blockers.map((issue, i) => <p key={i}>{issue}</p>)}
        </section>
      : null}
  </section>;
}
