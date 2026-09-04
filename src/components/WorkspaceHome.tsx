import type { LourexDocument, PaymentRecord } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { financialReportByCurrency } from '../lib/reports.js';
import { receivablesByCurrency } from '../lib/receivables.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';

interface Props{
  companyName:string;
  documents:LourexDocument[];
  payments:PaymentRecord[];
  customerCount:number;
  itemCount:number;
  onNewQuotation:()=>void;
  onNewInvoice:()=>void;
  onOpenDocument:(doc:LourexDocument)=>void;
  onNavigate:(screen:'documents'|'customers'|'items'|'receivables'|'reports'|'operations')=>void;
}

function customerName(doc:LourexDocument):string{
  const snapshot=doc.customerSnapshot;
  if(!snapshot)return t('No customer','بدون عميل');
  return isArabic()
    ? (snapshot.companyNameAr||snapshot.companyNameEn||t('No customer','بدون عميل'))
    : (snapshot.companyNameEn||snapshot.companyNameAr||t('No customer','بدون عميل'));
}

function documentLabel(doc:LourexDocument):string{
  if(doc.role==='credit-note')return t('Credit note','إشعار دائن');
  return doc.kind==='proforma'?t('Quotation','عرض سعر'):t('Invoice','فاتورة');
}

export function WorkspaceHome({companyName,documents,payments,customerCount,itemCount,onNewQuotation,onNewInvoice,onOpenDocument,onNavigate}:Props):any{
  const today=todayIso();
  const monthStart=`${today.slice(0,7)}-01`;
  const receivables=receivablesByCurrency(documents,payments,today);
  const monthly=financialReportByCurrency(documents,payments,monthStart,today);
  const openInvoices=receivables.reduce((sum,row)=>sum+row.openInvoices,0);
  const overdueInvoices=receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
  const activeQuotes=documents.filter(doc=>doc.kind==='proforma'&&doc.role==='standard'&&doc.lifecycleStatus!=='voided'&&doc.status==='final').length;
  const drafts=documents.filter(doc=>doc.status==='draft').length;
  const recent=[...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6);

  return <section className="workspace-home-page dashboard-page">
    <header className="workspace-home-hero dashboard-hero">
      <div>
        <p className="workspace-home-eyebrow">{t('Business overview','نظرة عامة على الأعمال')}</p>
        <h1>{companyName||'LOUREX Invoice'}</h1>
        <p>{t('Your sales documents, receivables and recent activity in one focused view.','مستندات المبيعات والمستحقات وآخر النشاطات في شاشة واحدة مركزة.')}</p>
      </div>
      <div className="workspace-home-actions">
        <Button icon="proforma" variant="primary" onClick={onNewQuotation}>{t('New Quotation','عرض سعر جديد')}</Button>
        <Button icon="invoice" onClick={onNewInvoice}>{t('New Invoice','فاتورة جديدة')}</Button>
      </div>
    </header>

    <div className="dashboard-kpis" aria-label={t('Business summary','ملخص الأعمال')}>
      <button type="button" onClick={()=>onNavigate('documents')}><span className="dashboard-kpi-icon"><Icon name="proforma"/></span><span><small>{t('Open quotations','عروض السعر المفتوحة')}</small><strong>{activeQuotes}</strong><em>{t('Issued and active','صادرة وفعالة')}</em></span></button>
      <button type="button" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="invoice"/></span><span><small>{t('Open invoices','الفواتير غير المسددة')}</small><strong>{openInvoices}</strong><em>{overdueInvoices?t(`${overdueInvoices} overdue`,`${overdueInvoices} متأخرة`):t('No overdue invoices','لا توجد فواتير متأخرة')}</em></span></button>
      <button type="button" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="backup"/></span><span><small>{t('Outstanding','المستحقات')}</small>{receivables.length?<span className="dashboard-money-stack">{receivables.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.outstanding,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{t('Kept separate by currency','منفصلة حسب العملة')}</em></span></button>
      <button type="button" onClick={()=>onNavigate('reports')}><span className="dashboard-kpi-icon"><Icon name="file"/></span><span><small>{t('Sales this month','مبيعات هذا الشهر')}</small>{monthly.length?<span className="dashboard-money-stack">{monthly.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.netSales,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{t('Net issued sales','صافي المبيعات الصادرة')}</em></span></button>
    </div>

    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-recent">
        <header className="dashboard-panel-heading"><div><small>{t('Recent activity','آخر النشاط')}</small><h2>{t('Recent documents','آخر المستندات')}</h2></div><button type="button" onClick={()=>onNavigate('documents')}>{t('View all','عرض الكل')} <span aria-hidden="true">→</span></button></header>
        {recent.length?<div className="dashboard-document-list">{recent.map(doc=>{
          const total=calculateTotals(doc.items,doc.adjustments).grandTotal;
          return <button type="button" key={doc.id} className="dashboard-document-row" onClick={()=>onOpenDocument(doc)}>
            <span className={`dashboard-document-kind kind-${doc.kind}`}><Icon name={doc.kind==='proforma'?'proforma':'invoice'}/></span>
            <span className="dashboard-document-copy"><strong>{doc.number}</strong><small>{customerName(doc)}</small></span>
            <span className="dashboard-document-meta"><strong>{formatMoney(total,doc.currency)}</strong><small>{documentLabel(doc)} · {displayDate(doc.issueDate,getUiLanguage())}</small></span>
          </button>;
        })}</div>:<div className="dashboard-empty"><Icon name="file"/><strong>{t('No documents yet','لا توجد مستندات بعد')}</strong><span>{t('Create your first quotation or invoice.','أنشئ أول عرض سعر أو فاتورة.')}</span></div>}
      </section>

      <aside className="dashboard-side-stack">
        <section className="dashboard-panel dashboard-attention">
          <header className="dashboard-panel-heading"><div><small>{t('Priority','الأولوية')}</small><h2>{t('Needs attention','يحتاج انتباهك')}</h2></div></header>
          <div className="dashboard-attention-list">
            <button type="button" className={overdueInvoices?'is-alert':''} onClick={()=>onNavigate('receivables')}><span><Icon name="invoice"/><b>{t('Overdue invoices','الفواتير المتأخرة')}</b></span><strong>{overdueInvoices}</strong></button>
            <button type="button" className={drafts?'is-warn':''} onClick={()=>onNavigate('documents')}><span><Icon name="edit"/><b>{t('Drafts to finish','مسودات تحتاج إكمال')}</b></span><strong>{drafts}</strong></button>
            <button type="button" onClick={()=>onNavigate('customers')}><span><Icon name="users"/><b>{t('Customers','العملاء')}</b></span><strong>{customerCount}</strong></button>
            <button type="button" onClick={()=>onNavigate('items')}><span><Icon name="items"/><b>{t('Saved items','الأصناف المحفوظة')}</b></span><strong>{itemCount}</strong></button>
          </div>
        </section>

        <section className="dashboard-panel dashboard-shortcuts">
          <header className="dashboard-panel-heading"><div><small>{t('Shortcuts','اختصارات')}</small><h2>{t('Workspaces','مساحات العمل')}</h2></div></header>
          <div className="dashboard-shortcut-grid">
            <button type="button" onClick={()=>onNavigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
            <button type="button" onClick={()=>onNavigate('customers')}><Icon name="users"/><span>{t('Customers','العملاء')}</span></button>
            <button type="button" onClick={()=>onNavigate('items')}><Icon name="items"/><span>{t('Items','الأصناف')}</span></button>
            <button type="button" onClick={()=>onNavigate('operations')}><Icon name="backup"/><span>{t('Business','الأعمال')}</span></button>
          </div>
        </section>
      </aside>
    </div>
  </section>;
}
