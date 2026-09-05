import type { CompanySettings, Customer, LourexDocument, PaymentRecord } from '../types.js';
import { formatMoney } from '../lib/money.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { customerPerformanceReport, financialReportByCurrency, monthlyPerformanceReport, normalizeReportPeriod, type CustomerPerformanceRow } from '../lib/reports.js';
import { Button, Icon, Input, Select } from './UI.js';

interface Props{company:CompanySettings;customers:Customer[];documents:LourexDocument[];payments:PaymentRecord[];}
type PeriodPreset='month'|'quarter'|'year'|'all';
interface State{from:string;to:string;currency:string;query:string;}

function startOfMonth(today:string):string{return `${today.slice(0,7)}-01`;}
function startOfQuarter(today:string):string{const year=today.slice(0,4);const month=Number(today.slice(5,7));const start=Math.floor((month-1)/3)*3+1;return `${year}-${String(start).padStart(2,'0')}-01`;}
function monthLabel(month:string):string{const [year,rawMonth]=month.split('-');const date=new Date(Date.UTC(Number(year),Number(rawMonth)-1,1));try{return new Intl.DateTimeFormat(getUiLanguage()==='ar'?'ar-EG':'en-US',{month:'short',year:'numeric',timeZone:'UTC',calendar:'gregory'}).format(date);}catch{return month;}}
function customerDisplay(row:CustomerPerformanceRow):string{return row.customerName||t('Unassigned customer','عميل غير محدد');}
function filterDateLabel(value:string):string{return value?displayDate(value,getUiLanguage()):t('All dates','كل التواريخ');}
function safeCsvText(value:string):string{return /^[\t\r ]*[=+\-@]/.test(value)?`'${value}`:value;}
function csvCell(value:string|number):string{const text=String(value??'');return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}

export class ReportsPage extends React.Component<Props,State>{
  state:State={from:`${todayIso().slice(0,4)}-01-01`,to:todayIso(),currency:'ALL',query:''};

  componentDidMount():void{window.addEventListener('afterprint',this.afterPrint);}
  componentWillUnmount():void{window.removeEventListener('afterprint',this.afterPrint);document.body.classList.remove('printing-financial-report');}
  private afterPrint=()=>document.body.classList.remove('printing-financial-report');

  private setPreset=(preset:PeriodPreset)=>{
    const today=todayIso();
    if(preset==='month'){this.setState({from:startOfMonth(today),to:today});return;}
    if(preset==='quarter'){this.setState({from:startOfQuarter(today),to:today});return;}
    if(preset==='year'){this.setState({from:`${today.slice(0,4)}-01-01`,to:today});return;}
    this.setState({from:'',to:today});
  };

  private print=()=>{document.body.classList.add('printing-financial-report');window.setTimeout(()=>window.print(),40);};

  private exportCsv=(rows:CustomerPerformanceRow[])=>{
    const headers=['Currency','Customer','Net Sales','Gross Profit','Margin %','Collected','Outstanding','Overdue','Invoices','Credit Notes','Profit Complete'];
    const lines=[headers,...rows.map(row=>[safeCsvText(row.currency),safeCsvText(row.customerName),row.netSales,row.grossProfit,row.marginPercent,row.collected,row.outstanding,row.overdue,row.issuedInvoices,row.creditNotes,row.profitComplete?'Yes':'No'])].map(row=>row.map(csvCell).join(','));
    const blob=new Blob([`\uFEFF${lines.join('\r\n')}`],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`LOUREX-Financial-Report-${this.state.from||'all'}-${this.state.to||todayIso()}.csv`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),500);
  };

  render():any{
    const period=normalizeReportPeriod(this.state.from,this.state.to);
    const summaries=financialReportByCurrency(this.props.documents,this.props.payments,period.from,period.to);
    const allCustomers=customerPerformanceReport(this.props.customers,this.props.documents,this.props.payments,period.from,period.to);
    const trends=monthlyPerformanceReport(this.props.documents,this.props.payments,period.from,period.to);
    const currencies=Array.from(new Set([...summaries.map(row=>row.currency),...allCustomers.map(row=>row.currency)])).sort((a,b)=>a.localeCompare(b));
    const selected=this.state.currency==='ALL'?'':this.state.currency;
    const visibleSummaries=selected?summaries.filter(row=>row.currency===selected):summaries;
    const query=this.state.query.trim().toLocaleLowerCase();
    const visibleCustomers=allCustomers.filter(row=>(!selected||row.currency===selected)&&(!query||customerDisplay(row).toLocaleLowerCase().includes(query)));
    const visibleTrends=trends.filter(row=>!selected||row.currency===selected);
    const missingCostItems=visibleSummaries.reduce((sum,row)=>sum+row.missingCostItems,0);
    const reportTitle=period.from?`${period.from} — ${period.to}`:t(`Through ${period.to}`,`حتى ${period.to}`);
    const logo=this.props.company.logoDataUrl||'./brand/lourex-logo.svg';

    return <div className="reports-page financial-report-print">
      <header className="reports-heading">
        <div><p className="eyebrow">{t('Management Reporting','التقارير الإدارية')}</p><h1>{t('Financial Reports','التقارير المالية')}</h1><p>{t('Sales, collection, receivables and gross profitability — always separated by currency.','المبيعات والتحصيل والمستحقات والربحية الإجمالية — مع فصل كل عملة بشكل مستقل دائمًا.')}</p></div>
        <div className="reports-heading-actions"><Button icon="download" onClick={()=>this.exportCsv(visibleCustomers)}>{t('Export CSV','تصدير CSV')}</Button><Button icon="printer" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>
      </header>

      <section className="reports-filter-panel" aria-label={t('Report filters','فلاتر التقرير')}>
        <div className="reports-presets"><button type="button" onClick={()=>this.setPreset('month')}>{t('This Month','هذا الشهر')}</button><button type="button" onClick={()=>this.setPreset('quarter')}>{t('This Quarter','هذا الربع')}</button><button type="button" onClick={()=>this.setPreset('year')}>{t('This Year','هذه السنة')}</button><button type="button" onClick={()=>this.setPreset('all')}>{t('All Time','كل الفترات')}</button></div>
        <label className="reports-date-field"><span>{t('From','من')}</span><span className="reports-date-control"><span className="reports-date-value" aria-hidden="true">{filterDateLabel(this.state.from)}</span><Input aria-label={t('From date','تاريخ البداية')} type="date" value={this.state.from} onChange={(e:any)=>this.setState({from:e.target.value})}/></span></label>
        <label className="reports-date-field"><span>{t('To','إلى')}</span><span className="reports-date-control"><span className="reports-date-value" aria-hidden="true">{filterDateLabel(this.state.to)}</span><Input aria-label={t('To date','تاريخ النهاية')} type="date" value={this.state.to} onChange={(e:any)=>this.setState({to:e.target.value})}/></span></label>
        <label><span>{t('Currency','العملة')}</span><Select value={this.state.currency} onChange={(e:any)=>this.setState({currency:e.target.value})}><option value="ALL">{t('All currencies — separate','كل العملات — منفصلة')}</option>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</Select></label>
      </section>

      <div className="report-print-header"><div className="report-print-brand"><img src={logo}/><div><strong>{this.props.company.nameEn||this.props.company.nameAr||'LOUREX'}</strong><span>{t('Financial Management Report','تقرير الإدارة المالية')}</span></div></div><div><strong>{reportTitle}</strong><span>{selected||t('Currencies shown separately','العملات معروضة بشكل منفصل')}</span></div></div>

      {!visibleSummaries.length?<div className="reports-empty"><Icon name="invoice" size={30}/><strong>{t('No financial activity in this period','لا توجد حركة مالية ضمن هذه الفترة')}</strong><span>{t('Change the period or currency filter.','غيّر الفترة أو فلتر العملة.')}</span></div>:null}

      <div className="reports-currency-grid">
        {visibleSummaries.map(row=><article className="report-currency-card" key={row.currency}>
          <div className="report-card-title"><strong>{row.currency}</strong><span>{row.issuedInvoices} {t('invoices','فواتير')} · {row.creditNotes} {t('credits','دائن')}</span></div>
          <div className="report-primary-metrics"><div><span>{t('Net Sales','صافي المبيعات')}</span><strong>{formatMoney(row.netSales,row.currency)}</strong></div><div><span>{t('Gross Profit','الربح الإجمالي')}</span><strong className={row.profitComplete?'':'metric-incomplete'}>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</strong></div><div><span>{t('Margin','الهامش')}</span><strong className={row.profitComplete?'':'metric-incomplete'}>{row.profitComplete?`${row.marginPercent}%`:'—'}</strong></div></div>
          <div className="report-secondary-metrics"><span><small>{t('Collected','المحصّل')}</small><b>{formatMoney(row.collected,row.currency)}</b></span><span><small>{t('Outstanding','المتبقي')}</small><b>{formatMoney(row.outstanding,row.currency)}</b></span><span className={row.overdue!=='0.00'?'has-overdue':''}><small>{t('Overdue','المتأخر')}</small><b>{formatMoney(row.overdue,row.currency)}</b></span></div>
          {!row.profitComplete?<p className="profit-coverage-warning">{t(`${row.missingCostItems} item cost entries are missing. Profit and margin are withheld.`,`${row.missingCostItems} تكلفة صنف ناقصة. تم حجب الربح والهامش حتى تكتمل التكاليف.`)}</p>:null}
        </article>)}
      </div>

      {missingCostItems>0?<div className="reports-quality-alert"><Icon name="invoice"/><div><strong>{t('Profitability data is incomplete','بيانات الربحية غير مكتملة')}</strong><span>{t('Net sales, collection and receivables remain accurate. Gross profit and margin are intentionally hidden wherever item cost data is incomplete.','صافي المبيعات والتحصيل والمستحقات تبقى صحيحة. يتم إخفاء الربح الإجمالي والهامش عمدًا عندما تكون تكاليف الأصناف غير مكتملة.')}</span></div></div>:null}

      <section className="reports-panel">
        <div className="reports-panel-heading"><div><p className="eyebrow">{t('Trend','الاتجاه')}</p><h2>{t('Monthly Performance','الأداء الشهري')}</h2></div><span>{reportTitle}</span></div>
        <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>{t('Month','الشهر')}</th>{!selected?<th>{t('Currency','العملة')}</th>:null}<th>{t('Net Sales','صافي المبيعات')}</th><th>{t('Gross Profit','الربح الإجمالي')}</th><th>{t('Margin status','حالة الهامش')}</th><th>{t('Collected','المحصّل')}</th></tr></thead><tbody>{visibleTrends.map(row=><tr key={`${row.month}-${row.currency}`}><td>{monthLabel(row.month)}</td>{!selected?<td><b>{row.currency}</b></td>:null}<td>{formatMoney(row.netSales,row.currency)}</td><td>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</td><td>{row.profitComplete?t('Complete','مكتمل'):t('Cost data missing','تكلفة ناقصة')}</td><td>{formatMoney(row.collected,row.currency)}</td></tr>)}</tbody></table></div>
        {!visibleTrends.length?<p className="reports-inline-empty">{t('No monthly activity for the selected period.','لا توجد حركة شهرية ضمن الفترة المحددة.')}</p>:null}
      </section>

      <section className="reports-panel">
        <div className="reports-panel-heading customer-report-heading"><div><p className="eyebrow">{t('Customers','العملاء')}</p><h2>{t('Customer Performance','أداء العملاء')}</h2><p>{t('Revenue is period-based; outstanding and overdue are the balances as of the report end date.','الإيراد حسب الفترة المحددة، أما المتبقي والمتأخر فهما الرصيد حتى تاريخ نهاية التقرير.')}</p></div><div className="reports-customer-search"><Icon name="search"/><Input value={this.state.query} placeholder={t('Search customer','بحث عن عميل')} onChange={(e:any)=>this.setState({query:e.target.value})}/></div></div>
        <div className="reports-table-wrap"><table className="reports-table customer-performance-table"><thead><tr><th>{t('Customer','العميل')}</th>{!selected?<th>{t('Currency','العملة')}</th>:null}<th>{t('Net Sales','صافي المبيعات')}</th><th>{t('Gross Profit','الربح الإجمالي')}</th><th>{t('Margin','الهامش')}</th><th>{t('Collected','المحصّل')}</th><th>{t('Outstanding','المتبقي')}</th><th>{t('Overdue','المتأخر')}</th></tr></thead><tbody>{visibleCustomers.map(row=><tr key={`${row.customerId}-${row.currency}`}><td><strong>{customerDisplay(row)}</strong><small>{row.issuedInvoices} {t('invoices','فواتير')}{row.creditNotes?` · ${row.creditNotes} ${t('credits','دائن')}`:''}</small></td>{!selected?<td><b>{row.currency}</b></td>:null}<td>{formatMoney(row.netSales,row.currency)}</td><td>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</td><td>{row.profitComplete?`${row.marginPercent}%`:'—'}</td><td>{formatMoney(row.collected,row.currency)}</td><td>{formatMoney(row.outstanding,row.currency)}</td><td className={row.overdue!=='0.00'?'overdue-cell':''}>{formatMoney(row.overdue,row.currency)}</td></tr>)}</tbody></table></div>
        {!visibleCustomers.length?<p className="reports-inline-empty">{t('No customer activity matches these filters.','لا توجد حركة عملاء مطابقة لهذه الفلاتر.')}</p>:null}
      </section>

      <footer className="report-print-footer">{t('LOUREX internal management report. Currencies are never combined or converted automatically.','تقرير إداري داخلي من LOUREX. لا يتم جمع العملات أو تحويلها تلقائيًا.')}</footer>
    </div>;
  }
}
