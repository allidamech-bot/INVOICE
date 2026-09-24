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
function customerDisplay(row:CustomerPerformanceRow,customers:Customer[]):string{
  const customer=customers.find(item=>item.id===row.customerId);
  const live=customer?(getUiLanguage()==='ar'?(customer.companyNameAr||customer.companyNameEn):(customer.companyNameEn||customer.companyNameAr)).trim():'';
  return live||row.customerName||t('Unassigned customer','عميل غير محدد');
}
function customerSearchText(row:CustomerPerformanceRow,customers:Customer[]):string{
  const customer=customers.find(item=>item.id===row.customerId);
  return [customerDisplay(row,customers),row.customerName,customer?.companyNameEn,customer?.companyNameAr].filter(Boolean).join(' ').toLowerCase();
}
function companyDisplayName(company:CompanySettings):string{return (getUiLanguage()==='ar'?(company.nameAr||company.nameEn):(company.nameEn||company.nameAr)||'LOUREX').trim()||'LOUREX';}
function filterDateLabel(value:string):string{return value?displayDate(value,getUiLanguage()):t('All dates','كل التواريخ');}
const CSV_NUMBER=/^-?(?:\d+|\d*\.\d+)$/;
function csvCell(value:string|number):string{
  const text=String(value??'');
  const probe=text.trimStart();
  const formulaRisk=/^[=+@]/.test(probe)||(probe.startsWith('-')&&!CSV_NUMBER.test(probe));
  const safe=formulaRisk?`'${text}`:text;
  return /[",\r\n]/.test(safe)?`"${safe.replace(/"/g,'""')}"`:safe;
}

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
    const headers=[t('Currency','العملة'),t('Customer','العميل'),t('Net Sales','صافي المبيعات'),t('Gross Profit','الربح الإجمالي'),t('Margin %','الهامش %'),t('Collected','المحصّل'),t('Outstanding','المتبقي'),t('Overdue','المتأخر'),t('Invoices','الفواتير'),t('Credit Notes','الإشعارات الدائنة'),t('Profit Complete','اكتمال الربحية')];
    const lines=[headers,...rows.map(row=>[row.currency,customerDisplay(row,this.props.customers),row.netSales,row.grossProfit,row.marginPercent,row.collected,row.outstanding,row.overdue,row.issuedInvoices,row.creditNotes,row.profitComplete?t('Yes','نعم'):t('No','لا')])].map(row=>row.map(csvCell).join(','));
    const blob=new Blob([`\uFEFF${lines.join('\r\n')}`],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`LOUREX-Financial-Report-${this.state.from||'all'}-${this.state.to||todayIso()}.csv`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),500);
  };

  render():any{
    const period=normalizeReportPeriod(this.state.from,this.state.to);
    const summaries=financialReportByCurrency(this.props.documents,this.props.payments,period.from,period.to);
    const allCustomers=customerPerformanceReport(this.props.customers,this.props.documents,this.props.payments,period.from,period.to);
    const trends=monthlyPerformanceReport(this.props.documents,this.props.payments,period.from,period.to);
    const currencies=Array.from(new Set([...summaries.map(row=>row.currency),...allCustomers.map(row=>row.currency)])).sort((a,b)=>a.localeCompare(b));
    const requestedCurrency=this.state.currency==='ALL'?'':this.state.currency;
    const selected=requestedCurrency&&currencies.includes(requestedCurrency)?requestedCurrency:'';
    const visibleSummaries=selected?summaries.filter(row=>row.currency===selected):summaries;
    const query=this.state.query.trim().toLowerCase();
    const visibleCustomers=allCustomers.filter(row=>(!selected||row.currency===selected)&&(!query||customerSearchText(row,this.props.customers).includes(query)));
    const visibleTrends=trends.filter(row=>!selected||row.currency===selected);
    const missingCostItems=visibleSummaries.reduce((sum,row)=>sum+row.missingCostItems,0);
    const reportTitle=period.from?`${period.from} — ${period.to}`:t(`Through ${period.to}`,`حتى ${period.to}`);
    const logo=this.props.company.logoDataUrl||'./brand/lourex-logo.svg';

    return <div className="ta-reports-page financial-report-print">
      <header className="ta-page-header ta-reports-header">
        <div><span className="ta-page-kicker">{t('Management reporting','التقارير الإدارية')}</span><h1>{t('Financial Reports','التقارير المالية')}</h1><p>{t('Sales, collections, receivables and gross profitability with each currency kept separate.','المبيعات والتحصيل والمستحقات والربحية الإجمالية مع إبقاء كل عملة منفصلة.')}</p></div>
        <div className="ta-page-actions"><Button icon="download" onClick={()=>this.exportCsv(visibleCustomers)}>{t('Export CSV','تصدير CSV')}</Button><Button icon="printer" variant="primary" onClick={this.print}>{t('Print / Save PDF','طباعة / حفظ PDF')}</Button></div>
      </header>

      <section className="ta-report-filterbar" aria-label={t('Report filters','فلاتر التقرير')}>
        <div className="ta-report-presets" role="group" aria-label={t('Period presets','فترات جاهزة')}><button type="button" onClick={()=>this.setPreset('month')}>{t('This Month','هذا الشهر')}</button><button type="button" onClick={()=>this.setPreset('quarter')}>{t('This Quarter','هذا الربع')}</button><button type="button" onClick={()=>this.setPreset('year')}>{t('This Year','هذه السنة')}</button><button type="button" onClick={()=>this.setPreset('all')}>{t('All Time','كل الفترات')}</button></div>
        <label className="ta-report-date"><span>{t('From','من')}</span><span className="ta-date-input"><span aria-hidden="true">{filterDateLabel(this.state.from)}</span><Input aria-label={t('From date','تاريخ البداية')} type="date" value={this.state.from} onChange={(e:any)=>this.setState({from:e.target.value})}/></span></label>
        <label className="ta-report-date"><span>{t('To','إلى')}</span><span className="ta-date-input"><span aria-hidden="true">{filterDateLabel(this.state.to)}</span><Input aria-label={t('To date','تاريخ النهاية')} type="date" value={this.state.to} onChange={(e:any)=>this.setState({to:e.target.value})}/></span></label>
        <label className="ta-report-currency"><span>{t('Currency','العملة')}</span><Select value={selected||'ALL'} onChange={(e:any)=>this.setState({currency:e.target.value})}><option value="ALL">{t('All currencies — separate','كل العملات — منفصلة')}</option>{currencies.map(currency=><option key={currency} value={currency}>{currency}</option>)}</Select></label>
      </section>

      <div className="report-print-header ta-report-print-header"><div className="report-print-brand"><img src={logo} alt={companyDisplayName(this.props.company)}/><div><strong>{companyDisplayName(this.props.company)}</strong><span>{t('Financial Management Report','تقرير الإدارة المالية')}</span></div></div><div><strong>{reportTitle}</strong><span>{selected||t('Currencies shown separately','العملات معروضة بشكل منفصل')}</span></div></div>

      {!visibleSummaries.length?<section className="ta-empty-card"><span><Icon name="invoice"/></span><div><strong>{t('No financial activity in this period','لا توجد حركة مالية ضمن هذه الفترة')}</strong><p>{t('Change the period or currency filter.','غيّر الفترة أو فلتر العملة.')}</p></div></section>:null}

      <section className="ta-report-kpi-grid" aria-label={t('Financial summary','الملخص المالي')}>
        {visibleSummaries.map(row=><article className="ta-report-kpi" key={row.currency}>
          <header><span>{row.currency}</span><small>{row.issuedInvoices} {t('invoices','فواتير')} · {row.creditNotes} {t('credits','دائن')}</small></header>
          <div className="ta-report-kpi-primary"><div><span>{t('Net Sales','صافي المبيعات')}</span><strong>{formatMoney(row.netSales,row.currency)}</strong></div><div><span>{t('Gross Profit','الربح الإجمالي')}</span><strong className={row.profitComplete?'':'is-muted'}>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</strong></div><div><span>{t('Margin','الهامش')}</span><strong className={row.profitComplete?'':'is-muted'}>{row.profitComplete?`${row.marginPercent}%`:'—'}</strong></div></div>
          <div className="ta-report-kpi-secondary"><span><small>{t('Collected','المحصّل')}</small><b>{formatMoney(row.collected,row.currency)}</b></span><span><small>{t('Outstanding','المتبقي')}</small><b>{formatMoney(row.outstanding,row.currency)}</b></span><span className={row.overdue!=='0.00'?'is-danger':''}><small>{t('Overdue','المتأخر')}</small><b>{formatMoney(row.overdue,row.currency)}</b></span></div>
          {!row.profitComplete?<p className="ta-report-kpi-warning">{t(`${row.missingCostItems} item cost entries are missing. Profit and margin are withheld.`,`${row.missingCostItems} تكلفة صنف ناقصة. تم حجب الربح والهامش حتى تكتمل التكاليف.`)}</p>:null}
        </article>)}
      </section>

      {missingCostItems>0?<section className="ta-data-alert"><span><Icon name="invoice"/></span><div><strong>{t('Profitability data is incomplete','بيانات الربحية غير مكتملة')}</strong><p>{t('Net sales, collection and receivables remain accurate. Gross profit and margin are intentionally hidden wherever item cost data is incomplete.','صافي المبيعات والتحصيل والمستحقات تبقى صحيحة. يتم إخفاء الربح الإجمالي والهامش عمدًا عندما تكون تكاليف الأصناف غير مكتملة.')}</p></div></section>:null}

      <section className="ta-panel ta-report-panel">
        <header className="ta-panel-header"><div><span>{t('Trend','الاتجاه')}</span><h2>{t('Monthly Performance','الأداء الشهري')}</h2></div><div className="ta-panel-status">{reportTitle}</div></header>
        <div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Month','الشهر')}</th>{!selected?<th>{t('Currency','العملة')}</th>:null}<th>{t('Net Sales','صافي المبيعات')}</th><th>{t('Gross Profit','الربح الإجمالي')}</th><th>{t('Margin status','حالة الهامش')}</th><th>{t('Collected','المحصّل')}</th></tr></thead><tbody>{visibleTrends.map(row=><tr key={`${row.month}-${row.currency}`}><td>{monthLabel(row.month)}</td>{!selected?<td><b>{row.currency}</b></td>:null}<td>{formatMoney(row.netSales,row.currency)}</td><td>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</td><td>{row.profitComplete?t('Complete','مكتمل'):t('Cost data missing','تكلفة ناقصة')}</td><td>{formatMoney(row.collected,row.currency)}</td></tr>)}</tbody></table></div>
        {!visibleTrends.length?<div className="ta-panel-empty compact"><strong>{t('No monthly activity for the selected period.','لا توجد حركة شهرية ضمن الفترة المحددة.')}</strong></div>:null}
      </section>

      <section className="ta-panel ta-report-panel">
        <header className="ta-panel-header ta-customer-report-header"><div><span>{t('Customers','العملاء')}</span><h2>{t('Customer Performance','أداء العملاء')}</h2><p>{t('Revenue is period-based; outstanding and overdue are balances as of the report end date.','الإيراد حسب الفترة المحددة، أما المتبقي والمتأخر فهما الرصيد حتى تاريخ نهاية التقرير.')}</p></div><div className="ta-search-field"><Icon name="search"/><Input aria-label={t('Search customer performance','بحث أداء العملاء')} value={this.state.query} placeholder={t('Search customer','بحث عن عميل')} onChange={(e:any)=>this.setState({query:e.target.value})}/></div></header>
        <div className="ta-table-wrap"><table className="ta-table ta-customer-performance-table"><thead><tr><th>{t('Customer','العميل')}</th>{!selected?<th>{t('Currency','العملة')}</th>:null}<th>{t('Net Sales','صافي المبيعات')}</th><th>{t('Gross Profit','الربح الإجمالي')}</th><th>{t('Margin','الهامش')}</th><th>{t('Collected','المحصّل')}</th><th>{t('Outstanding','المتبقي')}</th><th>{t('Overdue','المتأخر')}</th></tr></thead><tbody>{visibleCustomers.map(row=><tr key={`${row.customerId}-${row.currency}`}><td><strong>{customerDisplay(row,this.props.customers)}</strong><small>{row.issuedInvoices} {t('invoices','فواتير')}{row.creditNotes?` · ${row.creditNotes} ${t('credits','دائن')}`:''}</small></td>{!selected?<td><b>{row.currency}</b></td>:null}<td>{formatMoney(row.netSales,row.currency)}</td><td>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</td><td>{row.profitComplete?`${row.marginPercent}%`:'—'}</td><td>{formatMoney(row.collected,row.currency)}</td><td>{formatMoney(row.outstanding,row.currency)}</td><td className={row.overdue!=='0.00'?'is-danger':''}>{formatMoney(row.overdue,row.currency)}</td></tr>)}</tbody></table></div>
        {!visibleCustomers.length?<div className="ta-panel-empty compact"><strong>{t('No customer activity matches these filters.','لا توجد حركة عملاء مطابقة لهذه الفلاتر.')}</strong></div>:null}
      </section>

      <footer className="report-print-footer">{t('LOUREX internal management report. Currencies are never combined or converted automatically.','تقرير إداري داخلي من LOUREX. لا يتم جمع العملات أو تحويلها تلقائيًا.')}</footer>
    </div>;
  }
}
