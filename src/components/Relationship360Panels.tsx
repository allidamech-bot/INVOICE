import type { Customer360Snapshot, Supplier360Snapshot } from '../lib/relationship-360.js';
import { displayDate } from '../lib/id.js';
import { formatMoney } from '../lib/money.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { Icon } from './UI.js';

function dateLabel(value:string):string{return value?displayDate(value.slice(0,10),getUiLanguage()):'—';}
function activityLabel(kind:string):string{
  if(kind==='payment')return t('Payment','دفعة');
  if(kind==='document-event')return t('Document activity','نشاط مستند');
  if(kind==='purchase')return t('Purchase','شراء');
  if(kind==='expense')return t('Expense','مصروف');
  return t('Document','مستند');
}

export function Customer360Panel({snapshot}:{snapshot:Customer360Snapshot}):any{
  const quotation=snapshot.latestQuotation;
  return <section className="lx-360-shell lx-customer-360" aria-label={t('Customer 360','ملف العميل 360')}>
    <header className="lx-360-heading"><div><small>{t('Relationship intelligence','ذكاء العلاقة')}</small><h2>{t('Customer 360','ملف العميل 360')}</h2><p>{t('A single derived view of commercial activity, receivables, products and recent interactions.','عرض موحّد مشتق من النشاط التجاري والمستحقات والمنتجات وآخر التفاعلات.')}</p></div><span className="lx-360-derived"><Icon name="chart"/>{t('Derived from live LOUREX records','مشتق من سجلات LOUREX الحالية')}</span></header>

    <div className="lx-360-brief"><span>{t('Last activity','آخر نشاط')}: <strong>{dateLabel(snapshot.lastActivityAt)}</strong></span>{quotation?<span>{t('Latest quotation','آخر عرض سعر')}: <strong><bdi>{quotation.number}</bdi></strong> · {dateLabel(quotation.issueDate)}</span>:null}</div>
    <div className="lx-360-kpis">
      <article><span><Icon name="file"/></span><div><small>{t('Documents','المستندات')}</small><strong>{snapshot.documentCount}</strong><em>{snapshot.activeDocumentCount} {t('active','فعال')}</em></div></article>
      <article><span><Icon name="proforma"/></span><div><small>{t('Quotations','عروض الأسعار')}</small><strong>{snapshot.quotationCount}</strong><em>{t('Commercial offers','عروض تجارية')}</em></div></article>
      <article><span><Icon name="invoice"/></span><div><small>{t('Invoices','الفواتير')}</small><strong>{snapshot.invoiceCount}</strong><em>{t('Standard invoices','فواتير قياسية')}</em></div></article>
      <article><span><Icon name="backup"/></span><div><small>{t('Recorded payments','الدفعات المسجلة')}</small><strong>{snapshot.paymentCount}</strong><em>{t('Customer collections only','تحصيلات العميل فقط')}</em></div></article>
    </div>

    <div className="lx-360-grid">
      <section className="lx-360-card lx-360-financial"><header><div><small>{t('Financial position','الوضع المالي')}</small><h3>{t('Receivables by currency','المستحقات حسب العملة')}</h3></div></header>{snapshot.financialPosition.length?<div className="lx-360-money-list">{snapshot.financialPosition.map(row=><article key={row.currency}><div><strong>{row.currency}</strong><span>{row.openInvoices} {t('open invoices','فواتير مفتوحة')}</span></div><dl><div><dt>{t('Billed','المفوتر')}</dt><dd>{formatMoney(row.billed,row.currency)}</dd></div><div><dt>{t('Outstanding','المستحق')}</dt><dd>{formatMoney(row.outstanding,row.currency)}</dd></div><div className={row.overdue!=='0.00'?'is-danger':''}><dt>{t('Overdue','المتأخر')}</dt><dd>{formatMoney(row.overdue,row.currency)}</dd></div><div><dt>{t('Paid','المدفوع')}</dt><dd>{formatMoney(row.paid,row.currency)}</dd></div></dl></article>)}</div>:<div className="lx-360-empty">{t('No finalized invoice receivables for this customer.','لا توجد مستحقات لفواتير نهائية لهذا العميل.')}</div>}</section>

      <section className="lx-360-card"><header><div><small>{t('Products','المنتجات')}</small><h3>{t('Commercial product activity','نشاط المنتجات التجاري')}</h3></div></header>{snapshot.productMentions.length?<div className="lx-360-product-list">{snapshot.productMentions.slice(0,8).map(row=><div key={row.key}><span><strong>{row.label}</strong><small>{row.unit||t('No unit','بدون وحدة')} · {t('Last seen','آخر ظهور')} {dateLabel(row.lastSeenAt)}</small></span><b>{row.appearances}×</b></div>)}</div>:<div className="lx-360-empty">{t('No linked product activity yet.','لا يوجد نشاط منتجات مرتبط بعد.')}</div>}</section>
    </div>

    <details className="lx-360-card lx-360-activity lx-360-disclosure"><summary><span><small>{t('Timeline','الخط الزمني')}</small><strong>{t('Recent relationship activity','آخر نشاط للعلاقة')}</strong></span><span>{snapshot.lastActivityAt?t('Last activity','آخر نشاط')+' '+dateLabel(snapshot.lastActivityAt):t('No activity yet','لا يوجد نشاط بعد')}</span></summary>{snapshot.recentActivity.length?<div className="lx-360-timeline">{snapshot.recentActivity.slice(0,10).map(row=><article key={row.id}><span className="lx-360-timeline-dot"/><div><small>{activityLabel(row.kind)} · {dateLabel(row.at)}</small><strong>{row.reference||'—'}</strong>{row.detail?<p>{row.detail}</p>:null}</div></article>)}</div>:<div className="lx-360-empty">{t('Activity will appear as LOUREX records are created.','سيظهر النشاط عند إنشاء سجلات LOUREX.')}</div>}</details>
  </section>;
}

export function Supplier360Panel({snapshot}:{snapshot:Supplier360Snapshot}):any{
  return <section className="lx-360-shell lx-supplier-360" aria-label={t('Supplier 360','ملف المورد 360')}>
    <header className="lx-360-heading"><div><small>{t('Procurement intelligence','ذكاء المشتريات')}</small><h2>{t('Supplier 360','ملف المورد 360')}</h2><p>{t('Purchase history, valid posted spend, supplied products and recent activity in one derived view.','سجل المشتريات والإنفاق المرحّل الصحيح والمنتجات الموردة وآخر النشاط في عرض واحد مشتق.')}</p></div><span className="lx-360-derived"><Icon name="chart"/>{t('Not Accounts Payable','ليس حساب ذمم موردين')}</span></header>

    <div className="lx-360-brief"><span>{t('Last activity','آخر نشاط')}: <strong>{dateLabel(snapshot.lastActivityAt)}</strong></span>{snapshot.recentPurchases[0]?<span>{t('Latest purchase','آخر شراء')}: <strong><bdi>{snapshot.recentPurchases[0].number}</bdi></strong> · {dateLabel(snapshot.recentPurchases[0].date)}</span>:null}</div>
    <div className="lx-360-kpis">
      <article><span><Icon name="backup"/></span><div><small>{t('Purchases','المشتريات')}</small><strong>{snapshot.purchaseCount}</strong><em>{snapshot.postedPurchaseCount} {t('posted','مرحلة')}</em></div></article>
      <article><span><Icon name="file"/></span><div><small>{t('Drafts','المسودات')}</small><strong>{snapshot.draftPurchaseCount}</strong><em>{t('Not included in spend','غير داخلة في الإنفاق')}</em></div></article>
      <article><span><Icon name="alert"/></span><div><small>{t('Reversed','معكوس')}</small><strong>{snapshot.reversedPurchaseCount}</strong><em>{t('Historical only','للسجل فقط')}</em></div></article>
      <article><span><Icon name="invoice"/></span><div><small>{t('Linked expenses','المصروفات المرتبطة')}</small><strong>{snapshot.linkedExpenseCount}</strong><em>{t('Separate from purchases','منفصلة عن المشتريات')}</em></div></article>
    </div>

    <div className="lx-360-grid">
      <section className="lx-360-card lx-360-financial"><header><div><small>{t('Procurement history','سجل التوريد')}</small><h3>{t('Posted spend by currency','الإنفاق المرحّل حسب العملة')}</h3></div></header>{snapshot.spendByCurrency.length?<div className="lx-360-money-list">{snapshot.spendByCurrency.map(row=><article key={row.currency}><div><strong>{row.currency}</strong><span>{row.purchaseCount} {t('posted purchases','مشتريات مرحلة')}</span></div><dl><div><dt>{t('Landed spend','تكلفة الوصول')}</dt><dd>{formatMoney(row.landedSpend,row.currency)}</dd></div></dl></article>)}</div>:<div className="lx-360-empty">{t('No valid posted purchase spend yet.','لا يوجد إنفاق شراء مرحّل وصحيح بعد.')}</div>}</section>

      <section className="lx-360-card"><header><div><small>{t('Products','المنتجات')}</small><h3>{t('Supplied products','المنتجات الموردة')}</h3></div></header>{snapshot.products.length?<div className="lx-360-product-list">{snapshot.products.slice(0,8).map(row=><div key={row.savedItemId}><span><strong>{row.label||row.sku||t('Product','منتج')}</strong><small>{row.sku||t('No SKU','بدون SKU')} · {t('Last purchase','آخر شراء')} {dateLabel(row.lastPurchaseDate)}</small></span><b>{row.lastUnitCost&&row.lastCurrency?formatMoney(row.lastUnitCost,row.lastCurrency):`${row.purchaseCount}×`}</b></div>)}</div>:<div className="lx-360-empty">{t('No posted product history for this supplier.','لا يوجد سجل منتجات مرحلة لهذا المورد.')}</div>}</section>
    </div>

    <details className="lx-360-card lx-360-activity lx-360-disclosure"><summary><span><small>{t('Timeline','الخط الزمني')}</small><strong>{t('Recent supplier activity','آخر نشاط للمورد')}</strong></span><span>{snapshot.lastActivityAt?t('Last activity','آخر نشاط')+' '+dateLabel(snapshot.lastActivityAt):t('No activity yet','لا يوجد نشاط بعد')}</span></summary>{snapshot.recentActivity.length?<div className="lx-360-timeline">{snapshot.recentActivity.slice(0,10).map(row=><article key={row.id}><span className="lx-360-timeline-dot"/><div><small>{activityLabel(row.kind)} · {dateLabel(row.at)}</small><strong>{row.reference||'—'}</strong>{row.detail?<p>{row.detail}</p>:null}</div></article>)}</div>:<div className="lx-360-empty">{t('Supplier activity will appear from purchases and linked expenses.','سيظهر نشاط المورد من المشتريات والمصروفات المرتبطة.')}</div>}</details>
  </section>;
}
