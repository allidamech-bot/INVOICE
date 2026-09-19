import type { Customer, LourexDocument, PaymentRecord } from '../types.js';
import { calculateTotals, decimalToScaled, isDecimalInput, lineTotal } from './money.js';
import { todayIso } from './id.js';
import { customerPerformanceReport, financialReportByCurrency, monthlyPerformanceReport, type FinancialReportCurrency } from './reports.js';
import { customerReceivables, type CurrencyReceivableSummary } from './receivables.js';
import { accountedInvoiceCreditNotes, invoicePaymentSummary } from './payments.js';
import { calculateProfitability } from './profitability.js';

export interface AiFinanceSource {
  documents:LourexDocument[];
  payments:PaymentRecord[];
  customers:Customer[];
  activeDocument?:LourexDocument|null;
}

export interface AiFinanceCurrencyRow {
  currency:string;
  netSales:string;
  grossProfit:string;
  marginPercent:string;
  collected:string;
  outstanding:string;
  overdue:string;
  issuedInvoices:number;
  profitComplete:boolean;
  missingCostItems:number;
}

export interface AiFinanceComparisonRow {
  currency:string;
  netSalesCurrent:string;
  netSalesPrevious:string;
  netSalesChange:string;
  collectedCurrent:string;
  collectedPrevious:string;
  collectedChange:string;
  outstandingCurrent:string;
  outstandingPrevious:string;
  outstandingChange:string;
  overdueCurrent:string;
  overduePrevious:string;
  overdueChange:string;
  grossProfitCurrent:string;
  grossProfitPrevious:string;
  grossProfitChange:string;
  profitComplete:boolean;
}

export interface AiFinanceReceivableRow {
  currency:string;
  outstanding:string;
  overdue:string;
  openInvoices:number;
  overdueInvoices:number;
}

export interface AiFinanceCustomerRow {
  customerName:string;
  currencies:AiFinanceReceivableRow[];
}

export interface AiFinanceProductRow {
  name:string;
  currency:string;
  lineRevenue:string;
  lineCost:string;
  lineGrossProfit:string;
  marginPercent:string;
  profitComplete:boolean;
  missingCostItems:number;
}

export interface AiFinanceDocumentSummary {
  number:string;
  kind:LourexDocument['kind'];
  role:LourexDocument['role'];
  status:LourexDocument['status'];
  lifecycleStatus:LourexDocument['lifecycleStatus'];
  customerName:string;
  currency:string;
  issueDate:string;
  dueDate:string;
  total:string;
  paymentStatus:string;
  paid:string;
  outstanding:string;
  grossProfit:string;
  marginPercent:string;
  profitComplete:boolean;
  missingCostItems:number;
}

export interface AiFinanceContext {
  version:1;
  asOf:string;
  basis:'deterministic-finance-engine';
  periods:{today:string;yesterday:string;monthStart:string;previousMonthStart:string;previousMonthEnd:string;historyStart:string;};
  today:AiFinanceCurrencyRow[];
  yesterday:AiFinanceCurrencyRow[];
  monthToDate:AiFinanceCurrencyRow[];
  previousMonth:AiFinanceCurrencyRow[];
  comparisons:{todayVsYesterday:AiFinanceComparisonRow[];monthToDateVsPreviousMonth:AiFinanceComparisonRow[];};
  monthlyHistory:Array<{month:string;currency:string;netSales:string;grossProfit:string;collected:string;profitComplete:boolean;missingCostItems:number;}>;
  receivables:AiFinanceReceivableRow[];
  highestOverdueByCurrency:Array<{currency:string;customerName:string;overdue:string;outstanding:string;openInvoices:number;}>;
  matchedCustomers:AiFinanceCustomerRow[];
  activeDocument:AiFinanceDocumentSummary|null;
  productLinePerformance:{periodFrom:string;periodTo:string;basis:'item-lines-only';hasUnallocatedDocumentAdjustments:boolean;rows:AiFinanceProductRow[];}|null;
  limitations:string[];
}

function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}

function marginString(profit:bigint,revenue:bigint):string{
  if(revenue===0n)return '0.00';
  const basisPoints=profit*1_000_000n/revenue;
  const sign=basisPoints<0n?'-':'';const abs=basisPoints<0n?-basisPoints:basisPoints;
  return `${sign}${abs/10_000n}.${((abs%10_000n)/100n).toString().padStart(2,'0')}`;
}

function dateParts(iso:string):{year:number;month:number;day:number}{
  return{year:Number(iso.slice(0,4)),month:Number(iso.slice(5,7)),day:Number(iso.slice(8,10))};
}
function shiftIso(iso:string,days:number):string{
  const {year,month,day}=dateParts(iso);
  const value=new Date(Date.UTC(year,month-1,day));
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
function monthStart(iso:string):string{return `${iso.slice(0,7)}-01`;}
function previousMonthPeriod(iso:string):{from:string;to:string}{
  const {year,month}=dateParts(iso);
  const start=new Date(Date.UTC(year,month-2,1));
  const end=new Date(Date.UTC(year,month-1,0));
  return{from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
}
function historyStart(iso:string):string{
  const {year,month}=dateParts(iso);
  return new Date(Date.UTC(year,month-12,1)).toISOString().slice(0,10);
}

function compactFinancialRows(rows:FinancialReportCurrency[]):AiFinanceCurrencyRow[]{
  return rows.slice(0,12).map(row=>({
    currency:row.currency,
    netSales:row.netSales,
    grossProfit:row.profitComplete?row.grossProfit:'',
    marginPercent:row.profitComplete?row.marginPercent:'',
    collected:row.collected,
    outstanding:row.outstanding,
    overdue:row.overdue,
    issuedInvoices:row.issuedInvoices,
    profitComplete:row.profitComplete,
    missingCostItems:row.missingCostItems
  }));
}

function comparisonRows(current:AiFinanceCurrencyRow[],previous:AiFinanceCurrencyRow[]):AiFinanceComparisonRow[]{
  const currencies=new Set([...current.map(row=>row.currency),...previous.map(row=>row.currency)]);
  const money=(row:AiFinanceCurrencyRow|undefined,key:'netSales'|'collected'|'outstanding'|'overdue'|'grossProfit')=>row?.[key]||'0.00';
  const change=(a:string,b:string)=>centsString(decimalToScaled(a||'0.00',2)-decimalToScaled(b||'0.00',2));
  return [...currencies].sort().slice(0,12).map(currency=>{
    const a=current.find(row=>row.currency===currency),b=previous.find(row=>row.currency===currency);
    const profitComplete=(a?.profitComplete??true)&&(b?.profitComplete??true);
    const currentProfit=profitComplete?money(a,'grossProfit'):'',previousProfit=profitComplete?money(b,'grossProfit'):'';
    return{
      currency,
      netSalesCurrent:money(a,'netSales'),netSalesPrevious:money(b,'netSales'),netSalesChange:change(money(a,'netSales'),money(b,'netSales')),
      collectedCurrent:money(a,'collected'),collectedPrevious:money(b,'collected'),collectedChange:change(money(a,'collected'),money(b,'collected')),
      outstandingCurrent:money(a,'outstanding'),outstandingPrevious:money(b,'outstanding'),outstandingChange:change(money(a,'outstanding'),money(b,'outstanding')),
      overdueCurrent:money(a,'overdue'),overduePrevious:money(b,'overdue'),overdueChange:change(money(a,'overdue'),money(b,'overdue')),
      grossProfitCurrent:currentProfit,grossProfitPrevious:previousProfit,grossProfitChange:profitComplete?change(currentProfit,previousProfit):'',profitComplete
    };
  });
}

function compactReceivable(row:CurrencyReceivableSummary):AiFinanceReceivableRow{
  return{currency:row.currency,outstanding:row.outstanding,overdue:row.overdue,openInvoices:row.openInvoices,overdueInvoices:row.overdueInvoices};
}
function normalized(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function queryMatchesName(query:string,name:string):boolean{
  const q=normalized(query),n=normalized(name);if(!q||!n)return false;
  if(q.includes(n))return true;
  const tokens=n.split(' ').filter(token=>token.length>=3);
  return tokens.length>0&&tokens.every(token=>q.includes(token));
}
function customerNameFor(customer:Customer|null|undefined,fallback=''):string{
  return (customer?.companyNameEn||customer?.companyNameAr||fallback||'Customer').trim();
}

function customerDetails(source:AiFinanceSource,query:string,today:string):{highest:AiFinanceContext['highestOverdueByCurrency'];matched:AiFinanceCustomerRow[]}{
  const receivables=customerReceivables(source.customers,source.documents,source.payments,today);
  const performance=customerPerformanceReport(source.customers,source.documents,source.payments,'',today);
  const nameByCustomer=new Map<string,string>();
  for(const row of performance)if(!nameByCustomer.has(row.customerId))nameByCustomer.set(row.customerId,row.customerName);
  for(const customer of source.customers)nameByCustomer.set(customer.id,customerNameFor(customer,nameByCustomer.get(customer.id)||''));

  const highestByCurrency=new Map<string,{currency:string;customerName:string;overdue:string;outstanding:string;openInvoices:number}>();
  for(const customer of receivables){
    const customerName=customerNameFor(customer.customer,nameByCustomer.get(customer.customerId)||'Customer');
    for(const currency of customer.currencies){
      if(decimalToScaled(currency.overdue,2)<=0n)continue;
      const current=highestByCurrency.get(currency.currency);
      if(!current||decimalToScaled(currency.overdue,2)>decimalToScaled(current.overdue,2))highestByCurrency.set(currency.currency,{currency:currency.currency,customerName,overdue:currency.overdue,outstanding:currency.outstanding,openInvoices:currency.openInvoices});
    }
  }

  const matched:AiFinanceCustomerRow[]=[];
  for(const customer of receivables){
    const customerName=customerNameFor(customer.customer,nameByCustomer.get(customer.customerId)||'Customer');
    if(!queryMatchesName(query,customerName))continue;
    matched.push({customerName,currencies:customer.currencies.slice(0,8).map(compactReceivable)});
    if(matched.length>=5)break;
  }
  return{highest:[...highestByCurrency.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),matched};
}

function documentSummary(source:AiFinanceSource,today:string):AiFinanceDocumentSummary|null{
  const doc=source.activeDocument;if(!doc)return null;
  const totals=calculateTotals(doc.items,doc.adjustments);
  const profit=calculateProfitability(doc);
  let paymentStatus='',paid='',outstanding='';
  if(doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'){
    const payment=invoicePaymentSummary(doc,source.payments,today,source.documents);
    paymentStatus=payment.status;paid=payment.paid;outstanding=payment.remaining;
  }
  return{
    number:doc.number,kind:doc.kind,role:doc.role,status:doc.status,lifecycleStatus:doc.lifecycleStatus,
    customerName:(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'').trim(),currency:doc.currency,issueDate:doc.issueDate,dueDate:doc.dueDate,total:totals.grandTotal,
    paymentStatus,paid,outstanding,grossProfit:profit.complete?profit.grossProfit:'',marginPercent:profit.complete?profit.marginPercent:'',profitComplete:profit.complete,missingCostItems:profit.missingCostItems
  };
}

function needsProductPerformance(query:string):boolean{
  const value=normalized(query);
  return ['product','products','item','items','sku','margin','profitability','منتج','منتجات','صنف','اصناف','أصناف','ربحية','هامش'].some(token=>value.includes(token));
}
function countedFinancialDocuments(documents:LourexDocument[]):LourexDocument[]{
  const invoices=documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided');
  const credits=new Set<string>();
  for(const invoice of invoices)for(const credit of accountedInvoiceCreditNotes(invoice,documents))credits.add(credit.id);
  return documents.filter(doc=>doc.kind==='invoice'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&(doc.role!=='credit-note'||credits.has(doc.id)));
}
function nonZero(value:string):boolean{return Boolean(value.trim()&&isDecimalInput(value)&&decimalToScaled(value,2)!==0n);}
function validUnitCost(value:string):boolean{return Boolean(value.trim()&&isDecimalInput(value)&&decimalToScaled(value,4)>=0n);}

function productPerformance(source:AiFinanceSource,from:string,to:string):AiFinanceContext['productLinePerformance']{
  type Aggregate={name:string;currency:string;revenue:bigint;cost:bigint;complete:boolean;missingCostItems:number;};
  const map=new Map<string,Aggregate>();let hasUnallocatedDocumentAdjustments=false;
  for(const doc of countedFinancialDocuments(source.documents)){
    if(doc.issueDate<from||doc.issueDate>to)continue;
    const sign=doc.role==='credit-note'?-1n:1n;
    if((doc.adjustments.discountEnabled&&nonZero(doc.adjustments.discountValue))||(doc.adjustments.shippingEnabled&&nonZero(doc.adjustments.shipping))||(doc.adjustments.otherChargesEnabled&&nonZero(doc.adjustments.otherCharges))||nonZero(doc.internalCosts.shippingCost)||nonZero(doc.internalCosts.otherCost))hasUnallocatedDocumentAdjustments=true;
    for(const item of doc.items){
      const name=(item.descriptionEn||item.descriptionAr||'Item').trim();const currency=(doc.currency||'USD').trim().toUpperCase();const key=`${currency}\u0000${normalized(name)}`;
      let row=map.get(key);if(!row){row={name,currency,revenue:0n,cost:0n,complete:true,missingCostItems:0};map.set(key,row);}
      row.revenue+=decimalToScaled(lineTotal(item.quantity,item.unitPrice),2)*sign;
      if(!validUnitCost(item.unitCost)){row.complete=false;row.missingCostItems+=1;continue;}
      row.cost+=decimalToScaled(lineTotal(item.quantity,item.unitCost),2)*sign;
    }
  }
  const rows=[...map.values()].sort((a,b)=>{
    if(a.complete!==b.complete)return a.complete?-1:1;
    if(a.complete&&b.complete){const ap=a.revenue-a.cost,bp=b.revenue-b.cost;if(ap!==bp)return ap>bp?-1:1;}
    const ar=a.revenue<0n?-a.revenue:a.revenue,br=b.revenue<0n?-b.revenue:b.revenue;return ar===br?a.name.localeCompare(b.name):ar>br?-1:1;
  }).slice(0,12).map(row=>{
    const profit=row.revenue-row.cost;
    return{name:row.name,currency:row.currency,lineRevenue:centsString(row.revenue),lineCost:row.complete?centsString(row.cost):'',lineGrossProfit:row.complete?centsString(profit):'',marginPercent:row.complete?marginString(profit,row.revenue):'',profitComplete:row.complete,missingCostItems:row.missingCostItems};
  });
  return{periodFrom:from,periodTo:to,basis:'item-lines-only',hasUnallocatedDocumentAdjustments,rows};
}

export function buildAiFinanceContext(source:AiFinanceSource,query:string,asOf=todayIso()):AiFinanceContext{
  const yesterday=shiftIso(asOf,-1),currentMonthStart=monthStart(asOf),previous=previousMonthPeriod(asOf),history=historyStart(asOf);
  const customers=customerDetails(source,query,asOf);
  const todayRows=compactFinancialRows(financialReportByCurrency(source.documents,source.payments,asOf,asOf));
  const yesterdayRows=compactFinancialRows(financialReportByCurrency(source.documents,source.payments,yesterday,yesterday));
  const monthRows=compactFinancialRows(financialReportByCurrency(source.documents,source.payments,currentMonthStart,asOf));
  const previousRows=compactFinancialRows(financialReportByCurrency(source.documents,source.payments,previous.from,previous.to));
  return{
    version:1,asOf,basis:'deterministic-finance-engine',
    periods:{today:asOf,yesterday,monthStart:currentMonthStart,previousMonthStart:previous.from,previousMonthEnd:previous.to,historyStart:history},
    today:todayRows,yesterday:yesterdayRows,monthToDate:monthRows,previousMonth:previousRows,
    comparisons:{todayVsYesterday:comparisonRows(todayRows,yesterdayRows),monthToDateVsPreviousMonth:comparisonRows(monthRows,previousRows)},
    monthlyHistory:monthlyPerformanceReport(source.documents,source.payments,history,asOf).slice(-36).map(row=>({month:row.month,currency:row.currency,netSales:row.netSales,grossProfit:row.profitComplete?row.grossProfit:'',collected:row.collected,profitComplete:row.profitComplete,missingCostItems:row.missingCostItems})),
    receivables:customerReceivables(source.customers,source.documents,source.payments,asOf).flatMap(customer=>customer.currencies).reduce<AiFinanceReceivableRow[]>((rows,row)=>{
      const existing=rows.find(item=>item.currency===row.currency);
      if(existing){existing.outstanding=centsString(decimalToScaled(existing.outstanding,2)+decimalToScaled(row.outstanding,2));existing.overdue=centsString(decimalToScaled(existing.overdue,2)+decimalToScaled(row.overdue,2));existing.openInvoices+=row.openInvoices;existing.overdueInvoices+=row.overdueInvoices;}
      else rows.push(compactReceivable(row));return rows;
    },[]).sort((a,b)=>a.currency.localeCompare(b.currency)).slice(0,12),
    highestOverdueByCurrency:customers.highest,
    matchedCustomers:customers.matched,
    activeDocument:documentSummary(source,asOf),
    productLinePerformance:needsProductPerformance(query)?productPerformance(source,currentMonthStart,asOf):null,
    limitations:['currency-separated-no-fx-conversion','profit-hidden-when-cost-incomplete','product-profitability-does-not-allocate-document-level-adjustments','supplier-payables-not-tracked','cash-bank-ledger-not-tracked']
  };
}
