import type { Customer, LourexDocument, PaymentRecord } from '../types.js';
import { formatMoney } from '../lib/money.js';
import { todayIso } from '../lib/id.js';
import { t } from '../lib/i18n.js';
import { customerPerformanceReport, financialReportByCurrency } from '../lib/reports.js';

interface Props{
  customers:Customer[];
  documents:LourexDocument[];
  payments:PaymentRecord[];
}

function numeric(value:string):number{
  const parsed=Number(value||'0');
  return Number.isFinite(parsed)?parsed:0;
}

export function ProfitabilityCenter(props:Props):any{
  const today=todayIso();
  const from=`${today.slice(0,4)}-01-01`;
  const summaries=React.useMemo(()=>financialReportByCurrency(props.documents,props.payments,from,today),[props.documents,props.payments,from,today]);
  const customers=React.useMemo(()=>customerPerformanceReport(props.customers,props.documents,props.payments,from,today),[props.customers,props.documents,props.payments,from,today]);

  const guidance=summaries.flatMap(row=>{
    const items:Array<{id:string;severity:'attention'|'danger'|'good';title:string;body:string}>=[];
    if(!row.profitComplete)items.push({id:`${row.currency}:cost`,severity:'attention',title:t('Review incomplete cost evidence','راجع بيانات التكلفة غير المكتملة'),body:row.missingCostItems>0?t(`${row.missingCostItems} item costs are missing in ${row.currency}. Profit and margin must not be used until repaired.`,`${row.missingCostItems} تكلفة صنف ناقصة بعملة ${row.currency}. لا يجوز الاعتماد على الربح والهامش قبل تصحيحها.`):t(`Gross profit is withheld for ${row.currency} because internal expense evidence is missing or invalid. Review internal shipping and other costs.`,`الربح الإجمالي محجوب لعملة ${row.currency} بسبب بيانات مصاريف داخلية ناقصة أو غير صالحة. راجع الشحن والمصاريف الأخرى.`)});
    if(row.profitComplete&&numeric(row.grossProfit)<0)items.push({id:`${row.currency}:loss`,severity:'danger',title:t('Gross loss requires review','الخسارة الإجمالية تحتاج مراجعة'),body:t(`Recorded ${row.currency} sales are producing a gross loss. Review selling prices, item costs and freight/other internal costs before issuing similar business.`,`المبيعات المسجلة بعملة ${row.currency} تنتج خسارة إجمالية. راجع أسعار البيع وتكاليف الأصناف والشحن والتكاليف الداخلية قبل إصدار أعمال مشابهة.`)});
    if(numeric(row.overdue)>0)items.push({id:`${row.currency}:overdue`,severity:'attention',title:t('Overdue receivables need collection action','المستحقات المتأخرة تحتاج إجراء تحصيل'),body:t(`${formatMoney(row.overdue,row.currency)} is overdue. Prioritize collection follow-up without confusing overdue receivables with revenue or profit.`,`${formatMoney(row.overdue,row.currency)} متأخر. أعطِ أولوية لمتابعة التحصيل دون الخلط بين المستحقات المتأخرة والإيراد أو الربح.`)});
    if(row.profitComplete&&numeric(row.grossProfit)>=0&&numeric(row.overdue)===0&&row.missingCostItems===0&&row.issuedInvoices>0)items.push({id:`${row.currency}:healthy`,severity:'good',title:t('Core profitability data is decision-ready','بيانات الربحية الأساسية جاهزة للقرار'),body:t(`The ${row.currency} view has complete cost data, no recorded gross loss and no overdue balance in the selected year-to-date period.`,`عرض ${row.currency} لديه بيانات تكلفة مكتملة ولا توجد خسارة إجمالية مسجلة أو رصيد متأخر ضمن الفترة من بداية السنة.`)});
    return items;
  });

  const missingCosts=summaries.reduce((sum,row)=>sum+row.missingCostItems,0);
  const lossCurrencies=summaries.filter(row=>row.profitComplete&&numeric(row.grossProfit)<0).length;
  const incompleteCurrencies=summaries.filter(row=>!row.profitComplete).length;
  const overdueCurrencies=summaries.filter(row=>numeric(row.overdue)>0).length;
  const completeCurrencies=summaries.filter(row=>row.profitComplete).length;

  return <section className="ta-reports-page lx-profitability-center">
    <header className="ta-page-header">
      <div>
        <span className="ta-page-kicker">{t('Profitability Center','مركز الربحية')}</span>
        <h2>{t('Profitability & financial guidance','الربحية والإرشاد المالي')}</h2>
        <p>{t('Year-to-date profitability stays deterministic and currency-separated. Guidance is generated only from recorded LOUREX data and never fills missing costs with guesses.','تبقى ربحية السنة حتى اليوم حتمية ومنفصلة حسب العملة. يتم إنشاء الإرشاد فقط من بيانات LOUREX المسجلة ولا يتم تعويض التكاليف الناقصة بتخمينات.')}</p>
      </div>
      <div className="ta-page-actions"><span className="ta-period-chip">{from} — {today}</span></div>
    </header>

    <section className="ta-report-kpi-grid" aria-label={t('Profitability readiness','جاهزية الربحية')}>
      <article className="ta-report-kpi"><header><span>{t('Currencies','العملات')}</span></header><div className="ta-report-kpi-primary"><div><strong>{summaries.length}</strong><span>{t('Tracked separately','متتبعة بشكل منفصل')}</span></div></div></article>
      <article className="ta-report-kpi"><header><span>{t('Cost-complete','تكلفة مكتملة')}</span></header><div className="ta-report-kpi-primary"><div><strong>{completeCurrencies}/{summaries.length||0}</strong><span>{t('Decision-ready currencies','عملات جاهزة للقرار')}</span></div></div></article>
      <article className="ta-report-kpi"><header><span>{t('Missing costs','تكاليف ناقصة')}</span></header><div className="ta-report-kpi-primary"><div><strong>{missingCosts}</strong><span>{t('Item cost entries','قيود تكلفة أصناف')}</span></div></div></article>
      <article className="ta-report-kpi"><header><span>{t('Exceptions','الاستثناءات')}</span></header><div className="ta-report-kpi-primary"><div><strong>{lossCurrencies+overdueCurrencies+incompleteCurrencies}</strong><span>{t('Loss / overdue / cost signals','إشارات خسارة / تأخير / تكلفة')}</span></div></div></article>
    </section>

    {summaries.length?<section className="ta-report-kpi-grid lx-profitability-currency-grid">{summaries.map(row=><article className="ta-report-kpi" key={row.currency}>
      <header><span>{row.currency}</span><small>{row.issuedInvoices} {t('invoices','فواتير')}</small></header>
      <div className="ta-report-kpi-primary"><div><span>{t('Net Sales','صافي المبيعات')}</span><strong>{formatMoney(row.netSales,row.currency)}</strong></div><div><span>{t('Gross Profit','الربح الإجمالي')}</span><strong>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</strong></div><div><span>{t('Margin','الهامش')}</span><strong>{row.profitComplete?`${row.marginPercent}%`:'—'}</strong></div></div>
      <div className="ta-report-kpi-secondary"><span><small>{t('Collected','المحصّل')}</small><b>{formatMoney(row.collected,row.currency)}</b></span><span><small>{t('Outstanding','المتبقي')}</small><b>{formatMoney(row.outstanding,row.currency)}</b></span><span><small>{t('Overdue','المتأخر')}</small><b>{formatMoney(row.overdue,row.currency)}</b></span></div>
      {!row.profitComplete?<p className="ta-report-kpi-warning">{t('Profit is withheld until source cost data is complete.','يتم حجب الربح حتى تكتمل بيانات التكلفة المصدرية.')}</p>:null}
    </article>)}</section>:<section className="ta-empty-card"><div><strong>{t('No issued financial activity yet','لا توجد حركة مالية صادرة بعد')}</strong><p>{t('Final invoices with cost data will populate profitability here.','ستظهر الربحية هنا عند وجود فواتير نهائية مع بيانات تكلفة.')}</p></div></section>}

    <section className="ta-panel ta-report-panel lx-financial-guidance">
      <header className="ta-panel-header"><div><span>{t('Guidance','الإرشاد')}</span><h3>{t('What needs attention now','ما الذي يحتاج انتباهًا الآن')}</h3></div></header>
      {guidance.length?<div className="ta-finance-list">{guidance.map(item=><div className={`ta-finance-row is-${item.severity}`} key={item.id}><div><strong>{item.title}</strong><small>{item.body}</small></div></div>)}</div>:<div className="ta-empty-state"><strong>{t('No guidance signals yet','لا توجد إشارات إرشاد بعد')}</strong><p>{t('Guidance appears when sufficient financial activity exists.','يظهر الإرشاد عند توفر حركة مالية كافية.')}</p></div>}
    </section>

    <section className="ta-panel ta-report-panel lx-customer-profitability">
      <header className="ta-panel-header"><div><span>{t('Customer profitability','ربحية العملاء')}</span><h3>{t('Customer performance by currency','أداء العملاء حسب العملة')}</h3></div></header>
      {customers.length?<div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Customer','العميل')}</th><th>{t('Currency','العملة')}</th><th>{t('Net Sales','صافي المبيعات')}</th><th>{t('Gross Profit','الربح الإجمالي')}</th><th>{t('Margin','الهامش')}</th><th>{t('Outstanding','المتبقي')}</th></tr></thead><tbody>{customers.slice(0,40).map(row=><tr key={`${row.customerId}:${row.currency}`}><td>{row.customerName||t('Unassigned customer','عميل غير محدد')}</td><td>{row.currency}</td><td>{formatMoney(row.netSales,row.currency)}</td><td>{row.profitComplete?formatMoney(row.grossProfit,row.currency):'—'}</td><td>{row.profitComplete?`${row.marginPercent}%`:'—'}</td><td>{formatMoney(row.outstanding,row.currency)}</td></tr>)}</tbody></table></div>:<div className="ta-empty-state"><strong>{t('No customer profitability rows yet','لا توجد بيانات ربحية للعملاء بعد')}</strong></div>}
    </section>
  </section>;
}
