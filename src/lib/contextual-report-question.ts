import type { FinancialReportCurrency } from './reports.js';

// Context is bounded by the existing assistant composer (1000 characters).
// Only deterministic, per-currency fields enter its data; withheld profit is
// never restored or inferred from sales, collections or partial costs.
export function contextualReportQuestion(from:string,to:string,rows:FinancialReportCurrency[]):string{
  const prefix=`Explain this selected LOUREX report (${from||'all history'} through ${to}). DATA ONLY: `;
  const instruction='Keep currencies separate. Gross profit is not net profit. Explain missing or invalid costs and omitted currencies; do not infer withheld margins, invent FX, or change records.';
  const omitted='Other currencies omitted. ';
  const selected:object[]=[];
  for(const row of rows){
    const next={
      currency:row.currency,netSales:row.netSales,collected:row.collected,
      outstanding:row.outstanding,overdue:row.overdue,
      grossProfit:row.profitComplete?row.grossProfit:'',
      profitComplete:row.profitComplete,
      missingCostItems:row.missingCostItems,
      costEvidence:row.profitComplete?'complete':row.missingCostItems>0?'missing-item-cost':'incomplete-internal-cost'
    };
    // Reserve the full advisory instruction and omission disclosure *before*
    // adding a row. The serializer never truncates a JSON object mid-field.
    const candidate=JSON.stringify([...selected,next]);
    const reserve=prefix.length+candidate.length+2+omitted.length+instruction.length;
    if(reserve>1000)break;
    selected.push(next);
  }
  return `${prefix}${JSON.stringify(selected)}. ${selected.length<rows.length?omitted:''}${instruction}`;
}
