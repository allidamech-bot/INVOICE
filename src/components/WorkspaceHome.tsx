import type { ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem } from '../types.js';
import { calculateTotals, formatMoney } from '../lib/money.js';
import { financialReportByCurrency, monthlyPerformanceReport } from '../lib/reports.js';
import { receivablesByCurrency } from '../lib/receivables.js';
import { invoicePaymentSummary } from '../lib/payments.js';
import { dailyBusinessBrief } from '../lib/daily-brief.js';
import { inventoryBalances } from '../lib/operations.js';
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

type ChartRange='7d'|'30d'|'6m'|'1y';
type ChartMode='cash'|'profit';
interface ChartPoint{key:string;label:string;sales:number;collected:number;profit:number;profitComplete:boolean;}

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

function shiftIso(iso:string,days:number):string{
  const [year,month,day]=iso.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day+days));
  return date.toISOString().slice(0,10);
}

function monthKey(iso:string,offset:number):string{
  const [year,month]=iso.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1+offset,1));
  return date.toISOString().slice(0,7);
}

function previousMonthPeriod(today:string):{from:string;to:string}{
  const [year,month]=today.split('-').map(Number);
  const start=new Date(Date.UTC(year,month-2,1));
  const end=new Date(Date.UTC(year,month-1,0));
  return{from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
}

function compactMonthLabel(month:string):string{
  const [year,value]=month.split('-').map(Number);
  const date=new Date(Date.UTC(year,value-1,1));
  return new Intl.DateTimeFormat(getUiLanguage()==='ar'?'ar':'en',{month:'short'}).format(date);
}

function compactDayLabel(iso:string):string{
  const [year,month,day]=iso.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return new Intl.DateTimeFormat(getUiLanguage()==='ar'?'ar':'en',{day:'numeric',month:'short'}).format(date);
}

function percentChange(current:string,previous:string):string{
  const now=Number(current||0),before=Number(previous||0);
  if(!Number.isFinite(now)||!Number.isFinite(before)||before===0)return'';
  const value=((now-before)/Math.abs(before))*100;
  const rounded=Math.abs(value)>=10?value.toFixed(0):value.toFixed(1);
  return `${value>=0?'↑':'↓'} ${Math.abs(Number(rounded))}%`;
}

function linePoints(values:number[],width:number,height:number,pad:number,max:number):string{
  if(!values.length)return'';
  const span=Math.max(1,values.length-1);
  return values.map((value,index)=>{
    const x=pad+(index/span)*(width-pad*2);
    const y=height-pad-(Math.max(0,value)/max)*(height-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function WorkspaceHome({companyName,documents,payments,purchases=[],expenses=[],inventoryMovements=[],items=[],itemCount,customerCount,onNewDocument,onOpenDocument,onNavigate}:Props):any{
  const [chartRange,setChartRange]=React.useState<ChartRange>('6m');
  const [chartMode,setChartMode]=React.useState<ChartMode>('cash');
  const today=todayIso();
  const monthStart=`${today.slice(0,7)}-01`;
  const previous=previousMonthPeriod(today);
  const receivables=receivablesByCurrency(documents,payments,today);
  const monthly=financialReportByCurrency(documents,payments,monthStart,today);
  const previousMonthly=financialReportByCurrency(documents,payments,previous.from,previous.to);
  const daily=dailyBusinessBrief(documents,payments,purchases,expenses,inventoryMovements,items,today);
  const openInvoices=receivables.reduce((sum,row)=>sum+row.openInvoices,0);
  const overdueInvoices=receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
  const drafts=documents.filter(doc=>doc.status==='draft').length;
  const incompleteAccounting=daily.invalidOperations+daily.missingCostItems;
  const recent=[...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  const displayedItemCount=items.length||(itemCount??0);
  const balances=inventoryBalances(items,inventoryMovements);
  const positiveStock=balances.filter(row=>row.quantityScaled>0n).length;
  const stockExceptions=balances.filter(row=>row.quantityScaled<=0n).length;
  const historyStart=`${monthKey(today,-11)}-01`;
  const history=monthlyPerformanceReport(documents,payments,historyStart,today);
  const chartCurrency=monthly.find(row=>row.netSales!=='0.00'||row.collected!=='0.00')?.currency
    ||receivables.find(row=>row.outstanding!=='0.00'||row.overdue!=='0.00')?.currency
    ||history.at(-1)?.currency
    ||'USD';

  const chartData=React.useMemo<ChartPoint[]>(()=>{
    if(chartRange==='7d'||chartRange==='30d'){
      const days=chartRange==='7d'?7:30;
      const rows:ChartPoint[]=[];
      for(let offset=days-1;offset>=0;offset-=1){
        const date=shiftIso(today,-offset);
        const row=financialReportByCurrency(documents,payments,date,date).find(entry=>entry.currency===chartCurrency);
        rows.push({key:date,label:compactDayLabel(date),sales:Number(row?.netSales||0),collected:Number(row?.collected||0),profit:Number(row?.grossProfit||0),profitComplete:row?.profitComplete??true});
      }
      return rows;
    }
    const months=chartRange==='6m'?6:12;
    const byMonth=new Map(history.filter(row=>row.currency===chartCurrency).map(row=>[row.month,row]));
    const rows:ChartPoint[]=[];
    for(let offset=months-1;offset>=0;offset-=1){
      const key=monthKey(today,-offset);
      const row=byMonth.get(key);
      rows.push({key,label:compactMonthLabel(key),sales:Number(row?.netSales||0),collected:Number(row?.collected||0),profit:Number(row?.grossProfit||0),profitComplete:row?.profitComplete??true});
    }
    return rows;
  },[chartRange,chartCurrency,documents,payments,history,today]);

  const chartValues=chartMode==='profit'?chartData.map(row=>row.profit):chartData.flatMap(row=>[row.sales,row.collected]);
  const chartMax=Math.max(1,...chartValues.filter(value=>Number.isFinite(value)&&value>=0));
  const chartWidth=760,chartHeight=220,chartPad=22;
  const salesPoints=linePoints(chartData.map(row=>row.sales),chartWidth,chartHeight,chartPad,chartMax);
  const collectionPoints=linePoints(chartData.map(row=>row.collected),chartWidth,chartHeight,chartPad,chartMax);
  const profitPoints=linePoints(chartData.map(row=>row.profit),chartWidth,chartHeight,chartPad,chartMax);
  const chartProfitComplete=chartData.every(row=>row.profitComplete);
  const currentChartReceivable=receivables.find(row=>row.currency===chartCurrency);
  const currentMonth=monthly.find(row=>row.currency===chartCurrency);
  const priorMonth=previousMonthly.find(row=>row.currency===chartCurrency);
  const salesChange=currentMonth&&priorMonth?percentChange(currentMonth.netSales,priorMonth.netSales):'';
  const collectionChange=currentMonth&&priorMonth?percentChange(currentMonth.collected,priorMonth.collected):'';
  const attentionCount=(overdueInvoices?1:0)+(drafts?1:0)+(daily.draftPurchases?1:0)+(incompleteAccounting?1:0)+(daily.dormantProducts?1:0)+(stockExceptions?1:0);

  return <section className="workspace-home-page dashboard-page command-center-page">
    <header className="workspace-home-hero dashboard-hero command-center-hero">
      <div>
        <p className="workspace-home-eyebrow">{companyName||'LOUREX Invoice'}</p>
        <h1>{t('Business command center','مركز قيادة الأعمال')}</h1>
        <p>{t('See what is happening, what needs attention, and what changed without searching through the system.','اعرف ما يحدث وما يحتاج انتباهك وما الذي تغيّر دون البحث داخل النظام.')}</p>
      </div>
      <div className="workspace-home-actions command-center-actions">
        <span className="command-period-pill"><Icon name="file"/><span>{t('This month','هذا الشهر')}</span></span>
        <Button icon="plus" variant="primary" onClick={onNewDocument}>{t('New Document','مستند جديد')}</Button>
      </div>
    </header>

    <div className="dashboard-kpis command-kpis" aria-label={t('Business summary','ملخص الأعمال')}>
      <button type="button" className="dashboard-kpi kpi-sales" onClick={()=>onNavigate('reports')}><span className="dashboard-kpi-icon"><Icon name="file"/></span><span><small>{t('Sales','المبيعات')}</small>{monthly.length?<span className="dashboard-money-stack">{monthly.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.netSales,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{salesChange?`${salesChange} · ${t('vs previous month','مقارنة بالشهر السابق')}`:t('Net issued this month','صافي الصادر هذا الشهر')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-collected" onClick={()=>onNavigate('reports')}><span className="dashboard-kpi-icon"><Icon name="backup"/></span><span><small>{t('Collected','المحصّل')}</small>{monthly.length?<span className="dashboard-money-stack">{monthly.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.collected,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{collectionChange?`${collectionChange} · ${t('vs previous month','مقارنة بالشهر السابق')}`:t('Payments this month','مدفوعات هذا الشهر')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-outstanding" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="invoice"/></span><span><small>{t('Outstanding','المستحق')}</small>{receivables.length?<span className="dashboard-money-stack">{receivables.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.outstanding,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{openInvoices?t(`${openInvoices} open invoices`,`${openInvoices} فواتير مفتوحة`):t('No open invoices','لا توجد فواتير مفتوحة')}</em></span></button>
      <button type="button" className="dashboard-kpi kpi-overdue" onClick={()=>onNavigate('receivables')}><span className="dashboard-kpi-icon"><Icon name="invoice"/></span><span><small>{t('Overdue','المتأخر')}</small>{receivables.length?<span className="dashboard-money-stack">{receivables.slice(0,3).map(row=><b key={row.currency}>{formatMoney(row.overdue,row.currency)}</b>)}</span>:<strong>—</strong>}<em>{overdueInvoices?t(`${overdueInvoices} overdue invoices`,`${overdueInvoices} فواتير متأخرة`):t('Nothing overdue','لا توجد مستحقات متأخرة')}</em></span></button>
    </div>

    <div className="command-performance-grid">
      <section className="dashboard-panel command-performance-panel">
        <header className="dashboard-panel-heading command-chart-heading">
          <div><small>{t('Performance','الأداء')}</small><h2>{t('Business performance','أداء الأعمال')}</h2><span>{t(`Currency · ${chartCurrency}`,`العملة · ${chartCurrency}`)}</span></div>
          <div className="command-chart-controls" aria-label={t('Chart period','فترة الرسم')}>
            {(['7d','30d','6m','1y'] as ChartRange[]).map(value=><button type="button" key={value} className={chartRange===value?'active':''} onClick={()=>setChartRange(value)}>{value==='7d'?t('7D','7 أيام'):value==='30d'?t('30D','30 يوم'):value==='6m'?t('6M','6 أشهر'):t('1Y','سنة')}</button>)}
          </div>
        </header>
        <div className="command-chart-mode" role="group" aria-label={t('Chart metric','مؤشر الرسم')}>
          <button type="button" className={chartMode==='cash'?'active':''} onClick={()=>setChartMode('cash')}>{t('Sales & collections','المبيعات والتحصيل')}</button>
          <button type="button" className={chartMode==='profit'?'active':''} onClick={()=>setChartMode('profit')}>{t('Gross profit','إجمالي الربح')}</button>
        </div>
        <div className="command-chart-wrap">
          <svg className="command-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={chartMode==='cash'?t(`Sales and collections trend in ${chartCurrency}`,`اتجاه المبيعات والتحصيل بعملة ${chartCurrency}`):t(`Gross profit trend in ${chartCurrency}`,`اتجاه إجمالي الربح بعملة ${chartCurrency}`)} preserveAspectRatio="none">
            {[0.25,0.5,0.75].map(ratio=><line key={ratio} className="command-chart-grid" x1={chartPad} x2={chartWidth-chartPad} y1={chartPad+(chartHeight-chartPad*2)*ratio} y2={chartPad+(chartHeight-chartPad*2)*ratio}/>)}
            {chartMode==='cash'?<><polyline className="command-chart-line line-sales" points={salesPoints}/><polyline className="command-chart-line line-collected" points={collectionPoints}/></>:<polyline className="command-chart-line line-profit" points={profitPoints}/>} 
          </svg>
          <div className="command-chart-labels" aria-hidden="true">{chartData.map((row,index)=>{const show=chartData.length<=7||index===0||index===chartData.length-1||index%Math.ceil(chartData.length/6)===0;return <span key={row.key} className={show?'show':''}>{show?row.label:''}</span>;})}</div>
        </div>
        <footer className="command-chart-footer">
          {chartMode==='cash'?<div className="command-chart-legend"><span className="legend-sales">{t('Sales','المبيعات')}</span><span className="legend-collected">{t('Collections','التحصيل')}</span></div>:<div className="command-chart-legend"><span className="legend-profit">{t('Gross profit','إجمالي الربح')}</span></div>}
          {chartMode==='profit'&&!chartProfitComplete?<button type="button" className="command-data-warning" onClick={()=>onNavigate('reports')}>{t('Profit data is incomplete because some product costs are missing.','بيانات الربح غير مكتملة لأن تكلفة بعض الأصناف مفقودة.')}</button>:null}
        </footer>
      </section>

      <aside className="dashboard-panel command-position-panel">
        <header className="dashboard-panel-heading"><div><small>{t('Position','الوضع')}</small><h2>{t('Financial position','الوضع المالي')}</h2></div><button type="button" onClick={()=>onNavigate('receivables')}>{t('Finance','المالية')}</button></header>
        <div className="command-position-list">
          <div><span>{t('Outstanding','المستحق')}</span><strong>{currentChartReceivable?formatMoney(currentChartReceivable.outstanding,chartCurrency):formatMoney('0.00',chartCurrency)}</strong></div>
          <div><span>{t('Overdue','المتأخر')}</span><strong>{currentChartReceivable?formatMoney(currentChartReceivable.overdue,chartCurrency):formatMoney('0.00',chartCurrency)}</strong></div>
          <div><span>{t('Open invoices','الفواتير المفتوحة')}</span><strong>{currentChartReceivable?.openInvoices??0}</strong></div>
          <div><span>{t('Overdue invoices','الفواتير المتأخرة')}</span><strong>{currentChartReceivable?.overdueInvoices??0}</strong></div>
        </div>
        <button type="button" className="command-position-action" onClick={()=>onNavigate('receivables')}><span>{t('Review receivables','مراجعة المستحقات')}</span><span aria-hidden="true">→</span></button>
      </aside>
    </div>

    <div className="command-insight-grid">
      <section className="dashboard-panel dashboard-attention command-attention">
        <header className="dashboard-panel-heading"><div><small>{t('Priority','الأولوية')}</small><h2>{t('Needs attention','يحتاج انتباهك')}</h2><span>{attentionCount?t(`${attentionCount} areas need review`,`${attentionCount} أمور تحتاج مراجعة`):t('Everything important is under control','الأمور المهمة تحت السيطرة')}</span></div></header>
        {attentionCount?<div className="dashboard-attention-list">
          {overdueInvoices?<button type="button" className="is-alert" onClick={()=>onNavigate('receivables')}><span><Icon name="invoice"/><b>{t('Overdue invoices','الفواتير المتأخرة')}</b></span><strong>{overdueInvoices}</strong></button>:null}
          {drafts?<button type="button" className="is-warn" onClick={()=>onNavigate('documents')}><span><Icon name="edit"/><b>{t('Drafts to finish','مسودات تحتاج إكمال')}</b></span><strong>{drafts}</strong></button>:null}
          {daily.draftPurchases?<button type="button" className="is-warn" onClick={()=>onNavigate('operations')}><span><Icon name="items"/><b>{t('Purchase drafts to finish','مسودات مشتريات تحتاج إكمال')}</b></span><strong>{daily.draftPurchases}</strong></button>:null}
          {incompleteAccounting?<button type="button" className="is-alert" onClick={()=>onNavigate(daily.invalidOperations?'operations':'reports')}><span><Icon name="edit"/><b>{t('Incomplete accounting data','بيانات محاسبية غير مكتملة')}</b></span><strong>{incompleteAccounting}</strong></button>:null}
          {stockExceptions?<button type="button" className="is-warn" onClick={()=>onNavigate('items')}><span><Icon name="items"/><b>{t('Stock exceptions','حالات مخزون تحتاج مراجعة')}</b></span><strong>{stockExceptions}</strong></button>:null}
          {daily.dormantProducts?<button type="button" className="is-warn" onClick={()=>onNavigate('items')}><span><Icon name="items"/><b>{t('Dormant products · 90+ days','أصناف خاملة · أكثر من 90 يوم')}</b></span><strong>{daily.dormantProducts}</strong></button>:null}
        </div>:<div className="command-clear-state"><span className="command-clear-icon">✓</span><strong>{t('No urgent issues','لا توجد أمور عاجلة')}</strong><span>{t('LOUREX will surface important exceptions here when they need your attention.','سيعرض LOUREX هنا الحالات المهمة عندما تحتاج إلى انتباهك.')}</span></div>}
      </section>

      <section className="dashboard-panel command-inventory-health">
        <header className="dashboard-panel-heading"><div><small>{t('Stock','المخزون')}</small><h2>{t('Inventory health','حالة المخزون')}</h2></div><button type="button" onClick={()=>onNavigate('items')}>{t('Products & Inventory','المنتجات والمخزون')}</button></header>
        <div className="command-health-number"><strong>{displayedItemCount}</strong><span>{t('products in your library','منتجًا في مكتبتك')}</span></div>
        <div className="command-health-bars">
          <div><span>{t('Positive stock','رصيد موجب')}</span><b>{positiveStock}</b></div>
          <div><span>{t('Zero / negative','صفر / سالب')}</span><b>{stockExceptions}</b></div>
          <div><span>{t('Customers','العملاء')}</span><b>{customerCount}</b></div>
        </div>
      </section>
    </div>

    <section className="dashboard-panel dashboard-recent command-recent">
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
      })}</div>:<div className="dashboard-empty"><Icon name="file"/><strong>{t('No documents yet','لا توجد مستندات بعد')}</strong><span>{t('Create your first quotation or invoice. LOUREX will build your command center from real activity.','أنشئ أول عرض سعر أو فاتورة وسيبني LOUREX مركز القيادة من نشاطك الحقيقي.')}</span><Button icon="plus" variant="primary" onClick={onNewDocument}>{t('New Document','مستند جديد')}</Button></div>}
    </section>
  </section>;
}