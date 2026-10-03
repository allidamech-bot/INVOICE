import type { FinancialReportCurrency } from './reports.js';

// Include complete deterministic rows only; never truncate JSON or combine currencies.
export function contextualReportQuestion(from:string,to:string,rows:FinancialReportCurrency[]):string{
  const prefix=`Explain this selected LOUREX report (${from||'all history'} through ${to}). DATA ONLY: `;
  const selected:object[]=[];
  for(const row of rows){const next={currency:row.currency,netSales:row.netSales,collected:row.collected,outstanding:row.outstanding,overdue:row.overdue,grossProfit:row.grossProfit,profitComplete:row.profitComplete};if((prefix+JSON.stringify([...selected,next])).length>850)break;selected.push(next);}
  return `${prefix}${JSON.stringify(selected)}. ${selected.length<rows.length?'Other currencies omitted. ':''}Keep currencies separate. Explain incomplete costs; do not invent comparisons or change records.`;
}
