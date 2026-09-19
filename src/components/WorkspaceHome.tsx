import type { ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { financialReportByCurrency } from '../lib/reports.js';
import { receivablesByCurrency } from '../lib/receivables.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { dailyBusinessBrief } from '../lib/daily-brief.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';

interface Props{
  companyName:string;
  documents:LourexDocument[];
  payments:PaymentRecord[];
  purchases?:PurchaseRecord[];
  expenses?:ExpenseRecord[];
  inventoryMovements?:InventoryMovementRecord[];
  items?:SavedItem[];
  itemCount?:number;
  customerCount:number;
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

export function WorkspaceHome({companyName,documents,payments,purchases=[],expenses=[],inventoryMovements=[],items=[],itemCount,customerCount,onNewDocument,onOpenDocument,onNavigate}:Props):any{
  const today=todayIso();
  const monthStart=`${today.slice(0,7)}-01`;
  const receivables=receivablesByCurrency(documents,payments,today);
  const monthly=financialReportByCurrency(documents,payments,monthStart,today);
  const daily=dailyBusinessBrief(documents,payments,purchases,expenses,inventoryMovements,items,today);
  const openInvoices=receivables.reduce((sum,row)=>sum+row.openInvoices,0);
  const overdueInvoices=receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
  const drafts=documents.filter(doc=>doc.status==='draft').length;
  const incompleteAccounting=daily.invalidOperations+daily.missingCostItems;
  const recent=[...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6);
  const displayedItemCount=items.length||(itemCount??0);
  const dailyMoney=(field:'sales'|'collected'|'purchases'|'expenses')=>{
    const rows=daily.money.filter(row=>row[field]!=='0.00');
    return rows.length?rows.map(row=>formatMoney(row[field],row.currency)).join(' · '):'—';
  };
  const changeLabel=(change:(typeof daily.changes)[number])=>{
    const metric=change.metric==='sales'?t('Sales','المبيعات'):t('Collections','التحصيل');
    const direction=change.direction==='new'?t('new','جديد'):change.direction==='up'?'↑':'↓';
    return `${metric} ${direction} · ${change.currency}`;
  };

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
        <section className="dashboard-panel dashboard-daily-brief">
          <header className="dashboard-panel-heading"><div><small>{t('Today','اليوم')}</small><h2>{t('LOUREX Daily Brief','ملخص LOUREX اليومي')}</h2></div><button type="button" onClick={()=>onNavigate('reports')}>{t('Reports','التقارير')}</button></header>
          <div className="dashboard-attention-list">
            <button type="button" onClick={()=>onNavigate('reports')}><span><Icon name="file"/><b>{t(`Sales today · ${daily.issuedInvoices} invoices`,`مبيعات اليوم · ${daily.issuedInvoices} فواتير`)}</b></span><strong>{dailyMoney('sales')}</strong></button>
            <button type="button" onClick={()=>onNavigate('reports')}><span><Icon name="backup"/><b>{t('Collected today','المحصّل اليوم')}</b></span><strong>{dailyMoney('collected')}</strong></button>
            <button type="button" onClick={()=>onNavigate('operations')}><span><Icon name="items"/><b>{t(`Purchases today · ${daily.postedPurchases}`,`مشتريات اليوم · ${daily.postedPurchases}`)}</b></span><strong>{dailyMoney('purchases')}</strong></button>
            <button type="button" onClick={()=>onNavigate('operations')}><span><Icon name="edit"/><b>{t(`Expenses today · ${daily.expenses}`,`مصاريف اليوم · ${daily.expenses}`)}</b></span><strong>{dailyMoney('expenses')}</strong></button>
            <button type="button" onClick={()=>onNavigate('operations')}><span><Icon name="items"/><b>{t('Inventory movements today','حركات المخزون اليوم')}</b></span><strong>{daily.inventoryMovements}</strong></button>
            <button type="button" onClick={()=>onNavigate('items')}><span><Icon name="items"/><b>{t('Products used today','أصناف مستخدمة اليوم')}</b></span><strong>{daily.productsUsedToday}</strong></button>
            {daily.changes.slice(0,2).map(change=><button type="button" key={`${change.currency}-${change.metric}`} className="is-warn" title={t(`Yesterday: ${formatMoney(change.previous,change.currency)}`,`أمس: ${formatMoney(change.previous,change.currency)}`)} onClick={()=>onNavigate('reports')}><span><Icon name="backup"/><b>{changeLabel(change)}</b></span><strong>{formatMoney(change.current,change.currency)}</strong></button>)}
          </div>
        </section>

        <section className="dashboard-panel dashboard-attention">
          <header className="dashboard-panel-heading"><div><small>{t('Priority','الأولوية')}</small><h2>{t('Needs attention','يحتاج انتباهك')}</h2></div></header>
          <div className="dashboard-attention-list">
            <button type="button" className={overdueInvoices?'is-alert':''} onClick={()=>onNavigate('receivables')}><span><Icon name="invoice"/><b>{t('Overdue invoices','الفواتير المتأخرة')}</b></span><strong>{overdueInvoices}</strong></button>
            <button type="button" className={drafts?'is-warn':''} onClick={()=>onNavigate('documents')}><span><Icon name="edit"/><b>{t('Drafts to finish','مسودات تحتاج إكمال')}</b></span><strong>{drafts}</strong></button>
            <button type="button" className={daily.draftPurchases?'is-warn':''} onClick={()=>onNavigate('operations')}><span><Icon name="items"/><b>{t('Purchase drafts to finish','مسودات مشتريات تحتاج إكمال')}</b></span><strong>{daily.draftPurchases}</strong></button>
            <button type="button" className={incompleteAccounting?'is-alert':''} onClick={()=>onNavigate(daily.invalidOperations?'operations':'reports')}><span><Icon name="edit"/><b>{t('Incomplete accounting data','بيانات محاسبية غير مكتملة')}</b></span><strong>{incompleteAccounting}</strong></button>
            <button type="button" className={daily.dormantProducts?'is-warn':''} onClick={()=>onNavigate('items')}><span><Icon name="items"/><b>{t('Dormant products · 90+ days','أصناف خاملة · أكثر من 90 يوم')}</b></span><strong>{daily.dormantProducts}</strong></button>
          </div>
        </section>

        <section className="dashboard-panel dashboard-shortcuts">
          <header className="dashboard-panel-heading"><div><small>{t('Shortcuts','اختصارات')}</small><h2>{t('Workspaces','مساحات العمل')}</h2></div></header>
          <div className="dashboard-shortcut-grid">
            <button type="button" onClick={()=>onNavigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
            <button type="button" onClick={()=>onNavigate('customers')}><Icon name="users"/><span>{t(`Customers · ${customerCount}`,`العملاء · ${customerCount}`)}</span></button>
            <button type="button" onClick={()=>onNavigate('items')}><Icon name="items"/><span>{t(`Items · ${displayedItemCount}`,`الأصناف · ${displayedItemCount}`)}</span></button>
            <button type="button" onClick={()=>onNavigate('operations')}><Icon name="backup"/><span>{t('Business','الأعمال')}</span></button>
          </div>
        </section>
      </aside>
    </div>
  </section>;
}
