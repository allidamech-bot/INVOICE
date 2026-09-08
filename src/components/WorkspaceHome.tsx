import type { LourexDocument, PaymentRecord } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { financialReportByCurrency } from '../lib/reports.js';
import { receivablesByCurrency } from '../lib/receivables.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';

interface Props{
  companyName:string;
  documents:LourexDocument[];
  payments:PaymentRecord[];
  customerCount:number;
  itemCount:number;
  onNewDocument:()=>void;
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

function documentStatus(doc:LourexDocument,payments:PaymentRecord[],documents:LourexDocument[],today:string):{tone:string;label:string}{
  if(doc.lifecycleStatus==='voided')return{tone:'void',label:t('Void','ملغى')};
  if(doc.status==='draft')return{tone:'draft',label:t('Draft','مسودة')};
  if(doc.kind==='proforma')return{tone:'quotation',label:t('Quotation','عرض سعر')};
  if(doc.role==='credit-note')return{tone:'issued',label:t('Issued','صادر')};
  const payment=invoicePaymentSummary(doc,payments,today,documents).status;
  if(payment==='paid')return{tone:'paid',label:t('Paid','مدفوعة')};
  if(payment==='partially-paid')return{tone:'partial',label:t('Partially paid','مدفوعة جزئيًا')};
  if(payment==='overdue')return{tone:'overdue',label:t('Overdue','متأخرة')};
  return{tone:'issued',label:t('Issued','صادرة')};
}

export function WorkspaceHome({companyName,documents,payments,customerCount,itemCount,onNewDocument,onOpenDocument,onNavigate}:Props):any{
  const today=todayIso();
  const monthStart=`${today.slice(0,7)}-01`;
  const receivables=receivablesByCurrency(documents,payments,today);
  const monthly=financialReportByCurrency(documents,payments,monthStart,today);
  const openInvoices=receivables.reduce((sum,row)=>sum+row.openInvoices,0);
  const overdueInvoices=receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
  const drafts=documents.filter(doc=>doc.status==='draft').length;
  const recent=[...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6);

  return <section className="workspace-home-page dashboard-page">
    <header className="workspace-home-hero dashboard-hero">
      <div>
        <p className="workspace-home-eyebrow">{companyName||'LOUREX Invoice'}</p>
        <h1>{t('Business overview','نظرة عامة على الأعمال')}</h1>
        <p>{t('Your sales documents, receivables and recent activity in one focused view.','مستندات المبيعات والمستحقات وآخر النشاطات في شاشة واحدة مركزة.')}</p>
      </div>
      <div className="workspace-home-actions">
        <Button icon="plus" variant="primary" onClick={onNewDocument}>{t('New Document','مستند جديد')}</Button>
      </div>
    </header>

    <div className="dashboard-kpis" aria-label={t('Business summary','ملخص الأعمال')}>
      <button type="button" className="dashboard-kpi kpi-sales" onClick={()=>onNavigate('reports')}><span className="dashboard-kpi-icon"><Icon name="file"/></span><span><small>{t('Sales','المبيعات')}</small>{monthly.length?<span className="dashboard-money-stack">{monthly.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.netSales,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{t('Net issued this month','صافي الصادر هذا الشهر')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-collected" onClick={()=>onNavigate('reports')}><span className="dashboard-kpi-icon"><Icon name="backup"/></span><span><small>{t('Collected','المحصّل')}</small>{monthly.length?<span className="dashboard-money-stack">{monthly.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.collected,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{t('Payments this month','مدفوعات هذا الشهر')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-outstanding" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="invoice"/></span><span><small>{t('Outstanding','المستحق')}</small>{receivables.length?<span className="dashboard-money-stack">{receivables.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.outstanding,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{openInvoices?t(`${openInvoices} open invoices`,`${openInvoices} فواتير مفتوحة`):t('No open invoices','لا توجد فواتير مفتوحة')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-overdue" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="invoice"/></span><span><small>{t('Overdue','المتأخر')}</small>{receivables.length?<span className="dashboard-money-stack">{receivables.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.overdue,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{overdueInvoices?t(`${overdueInvoices} overdue invoices`,`${overdueInvoices} فواتير متأخرة`):t('Nothing overdue','لا توجد مستحقات متأخرة')}</em></span></button>
    </div>

    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-recent">
        <header className="dashboard-panel-heading"><div><small>{t('Recent activity','آخر النشاط')}</small><h2>{t('Recent documents','آخر المستندات')}</h2></div><button type="button" onClick={()=>onNavigate('documents')}>{t('View all','عرض الكل')} <span aria-hidden="true">→</span></button></header>
        {recent.length?<div className="dashboard-document-list"><div className="dashboard-document-head" aria-hidden="true"><span/><span>{t('Document','المستند')}</span><span>{t('Customer','العميل')}</span><span>{t('Date','التاريخ')}</span><span>{t('Amount','المبلغ')}</span><span>{t('Status','الحالة')}</span></div>{recent.map(doc=>{
          const total=calculateTotals(doc.items,doc.adjustments).grandTotal;
          const status=documentStatus(doc,payments,documents,today);
          return <button type="button" key={doc.id} className="dashboard-document-row" onClick={()=>onOpenDocument(doc)}>
            <span className={`dashboard-document-kind kind-${doc.kind}`}><Icon name={doc.kind==='proforma'?'proforma':'invoice'}/></span>
            <span className="dashboard-document-copy"><strong>{doc.number}</strong><small>{documentLabel(doc)}</small></span>
            <span className="dashboard-document-customer">{customerName(doc)}</span>
            <span className="dashboard-document-date">{displayDate(doc.issueDate,getUiLanguage())}</span>
            <strong className="dashboard-document-amount">{formatMoney(total,doc.currency)}</strong>
            <span className={`dashboard-document-status status-${status.tone}`}>{status.label}</span>
          </button>;
        })}</div>:<div className="dashboard-empty"><Icon name="file"/><strong>{t('No documents yet','لا توجد مستندات بعد')}</strong><span>{t('Create your first quotation or invoice.','أنشئ أول عرض سعر أو فاتورة.')}</span><Button icon="plus" variant="primary" onClick={onNewDocument}>{t('New Document','مستند جديد')}</Button></div>}
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
