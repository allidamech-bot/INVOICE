import type { Customer, LourexDocument, PaymentRecord } from '../types.js';
import { calculateTotals, decimalToScaled } from './money.js';
import { calculateProfitability } from './profitability.js';
import { customerReceivables, receivablesByCurrency } from './receivables.js';
import { todayIso } from './id.js';

export interface FinancialReportCurrency {
  currency:string;
  invoiced:string;
  netSales:string;
  totalCost:string;
  grossProfit:string;
  marginPercent:string;
  collected:string;
  outstanding:string;
  overdue:string;
  issuedInvoices:number;
  creditNotes:number;
  payments:number;
  profitComplete:boolean;
  missingCostItems:number;
}

export interface CustomerPerformanceRow {
  customerId:string;
  customerName:string;
  currency:string;
  netSales:string;
  totalCost:string;
  grossProfit:string;
  marginPercent:string;
  collected:string;
  outstanding:string;
  overdue:string;
  issuedInvoices:number;
  creditNotes:number;
  profitComplete:boolean;
  missingCostItems:number;
}

export interface MonthlyPerformanceRow {
  month:string;
  currency:string;
  netSales:string;
  grossProfit:string;
  collected:string;
  profitComplete:boolean;
  missingCostItems:number;
}

interface Aggregate {
  invoiced:bigint;
  netSales:bigint;
  totalCost:bigint;
  grossProfit:bigint;
  collected:bigint;
  issuedInvoices:number;
  creditNotes:number;
  payments:number;
  profitComplete:boolean;
  missingCostItems:number;
}

function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'';
  const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}

function marginString(profit:bigint,revenue:bigint):string{
  if(revenue===0n)return '0.00';
  const basisPoints=profit*1_000_000n/revenue;
  const sign=basisPoints<0n?'-':'';
  const abs=basisPoints<0n?-basisPoints:basisPoints;
  return `${sign}${abs/10_000n}.${((abs%10_000n)/100n).toString().padStart(2,'0')}`;
}

function validIsoDate(value:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(value);}
export function reportDateInRange(date:string,from:string,to:string):boolean{
  if(!validIsoDate(date))return false;
  if(from&&date<from)return false;
  if(to&&date>to)return false;
  return true;
}

export function normalizeReportPeriod(from:string,to:string):{from:string;to:string}{
  const cleanFrom=validIsoDate(from)?from:'';
  const cleanTo=validIsoDate(to)?to:todayIso();
  if(cleanFrom&&cleanFrom>cleanTo)return{from:cleanTo,to:cleanFrom};
  return{from:cleanFrom,to:cleanTo};
}

function financialDocuments(documents:LourexDocument[]):LourexDocument[]{
  return documents.filter(doc=>doc.kind==='invoice'&&doc.status==='final'&&doc.lifecycleStatus!=='voided');
}

function customerId(doc:LourexDocument):string{return doc.customerSnapshot?.sourceCustomerId||'';}
function customerName(doc:LourexDocument):string{return (doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'').trim();}
function aggregateSeed():Aggregate{return{invoiced:0n,netSales:0n,totalCost:0n,grossProfit:0n,collected:0n,issuedInvoices:0,creditNotes:0,payments:0,profitComplete:true,missingCostItems:0};}

function addDocument(row:Aggregate,doc:LourexDocument):void{
  const sign=doc.role==='credit-note'?-1n:1n;
  row.invoiced+=decimalToScaled(calculateTotals(doc.items,doc.adjustments).grandTotal,2)*sign;
  const profit=calculateProfitability(doc);
  row.netSales+=decimalToScaled(profit.netRevenue,2);
  row.totalCost+=decimalToScaled(profit.totalCost,2);
  row.grossProfit+=decimalToScaled(profit.grossProfit,2);
  row.profitComplete=row.profitComplete&&profit.complete;
  row.missingCostItems+=profit.missingCostItems;
  if(doc.role==='credit-note')row.creditNotes+=1;else row.issuedInvoices+=1;
}

function asOfDocuments(documents:LourexDocument[],to:string):LourexDocument[]{
  return documents.filter(doc=>financialDocuments([doc]).length>0&&validIsoDate(doc.issueDate)&&doc.issueDate<=to);
}

function asOfPayments(payments:PaymentRecord[],to:string):PaymentRecord[]{return payments.filter(payment=>validIsoDate(payment.date)&&payment.date<=to);}

export function financialReportByCurrency(documents:LourexDocument[],payments:PaymentRecord[],from='',to=todayIso()):FinancialReportCurrency[]{
  const period=normalizeReportPeriod(from,to);
  const map=new Map<string,Aggregate>();
  const get=(currency:string)=>{const key=(currency||'USD').trim().toUpperCase();const row=map.get(key)??aggregateSeed();map.set(key,row);return row;};

  for(const doc of financialDocuments(documents)){
    if(!reportDateInRange(doc.issueDate,period.from,period.to))continue;
    addDocument(get(doc.currency),doc);
  }
  for(const payment of payments){
    if(!reportDateInRange(payment.date,period.from,period.to))continue;
    const row=get(payment.currency);row.collected+=decimalToScaled(payment.amount,2);row.payments+=1;
  }

  const receivables=receivablesByCurrency(asOfDocuments(documents,period.to),asOfPayments(payments,period.to),period.to);
  for(const row of receivables)get(row.currency);

  return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>{
    const receivable=receivables.find(item=>item.currency===currency);
    return{
      currency,
      invoiced:centsString(row.invoiced),
      netSales:centsString(row.netSales),
      totalCost:row.profitComplete?centsString(row.totalCost):'',
      grossProfit:row.profitComplete?centsString(row.grossProfit):'',
      marginPercent:row.profitComplete?marginString(row.grossProfit,row.netSales):'',
      collected:centsString(row.collected),
      outstanding:receivable?.outstanding||'0.00',
      overdue:receivable?.overdue||'0.00',
      issuedInvoices:row.issuedInvoices,
      creditNotes:row.creditNotes,
      payments:row.payments,
      profitComplete:row.profitComplete,
      missingCostItems:row.missingCostItems
    };
  });
}

export function customerPerformanceReport(customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[],from='',to=todayIso()):CustomerPerformanceRow[]{
  const period=normalizeReportPeriod(from,to);
  const map=new Map<string,{customerId:string;customerName:string;currency:string;aggregate:Aggregate}>();
  const customerMap=new Map(customers.map(customer=>[customer.id,customer]));
  const keyOf=(id:string,currency:string)=>`${id}\u0000${currency}`;
  const get=(id:string,currency:string,name='')=>{
    const normalizedCurrency=(currency||'USD').trim().toUpperCase();
    const key=keyOf(id,normalizedCurrency);
    let row=map.get(key);
    if(!row){
      const customer=customerMap.get(id);
      row={customerId:id,customerName:(customer?.companyNameEn||customer?.companyNameAr||name||'Unassigned customer').trim(),currency:normalizedCurrency,aggregate:aggregateSeed()};
      map.set(key,row);
    }
    return row.aggregate;
  };

  for(const doc of financialDocuments(documents)){
    if(!reportDateInRange(doc.issueDate,period.from,period.to))continue;
    addDocument(get(customerId(doc),doc.currency,customerName(doc)),doc);
  }
  for(const payment of payments){
    if(!reportDateInRange(payment.date,period.from,period.to))continue;
    const aggregate=get(payment.customerId,payment.currency,payment.customerNameEn||payment.customerNameAr);
    aggregate.collected+=decimalToScaled(payment.amount,2);aggregate.payments+=1;
  }

  const asOfDocs=asOfDocuments(documents,period.to);
  const asOfPays=asOfPayments(payments,period.to);
  const receivables=customerReceivables(customers,asOfDocs,asOfPays,period.to);
  for(const customer of receivables){
    for(const currency of customer.currencies)get(customer.customerId,currency.currency,customer.customer?.companyNameEn||customer.customer?.companyNameAr||'');
  }

  return [...map.values()].map(row=>{
    const receivable=receivables.find(item=>item.customerId===row.customerId)?.currencies.find(item=>item.currency===row.currency);
    const aggregate=row.aggregate;
    return{
      customerId:row.customerId,
      customerName:row.customerName,
      currency:row.currency,
      netSales:centsString(aggregate.netSales),
      totalCost:aggregate.profitComplete?centsString(aggregate.totalCost):'',
      grossProfit:aggregate.profitComplete?centsString(aggregate.grossProfit):'',
      marginPercent:aggregate.profitComplete?marginString(aggregate.grossProfit,aggregate.netSales):'',
      collected:centsString(aggregate.collected),
      outstanding:receivable?.outstanding||'0.00',
      overdue:receivable?.overdue||'0.00',
      issuedInvoices:aggregate.issuedInvoices,
      creditNotes:aggregate.creditNotes,
      profitComplete:aggregate.profitComplete,
      missingCostItems:aggregate.missingCostItems
    };
  }).sort((a,b)=>a.currency.localeCompare(b.currency)||Number(decimalToScaled(b.netSales,2)-decimalToScaled(a.netSales,2))||a.customerName.localeCompare(b.customerName));
}

export function monthlyPerformanceReport(documents:LourexDocument[],payments:PaymentRecord[],from='',to=todayIso()):MonthlyPerformanceRow[]{
  const period=normalizeReportPeriod(from,to);
  const map=new Map<string,{month:string;currency:string;aggregate:Aggregate}>();
  const get=(month:string,currency:string)=>{
    const normalizedCurrency=(currency||'USD').trim().toUpperCase();const key=`${month}\u0000${normalizedCurrency}`;
    let row=map.get(key);if(!row){row={month,currency:normalizedCurrency,aggregate:aggregateSeed()};map.set(key,row);}return row.aggregate;
  };
  for(const doc of financialDocuments(documents)){
    if(!reportDateInRange(doc.issueDate,period.from,period.to))continue;
    addDocument(get(doc.issueDate.slice(0,7),doc.currency),doc);
  }
  for(const payment of payments){
    if(!reportDateInRange(payment.date,period.from,period.to))continue;
    const aggregate=get(payment.date.slice(0,7),payment.currency);aggregate.collected+=decimalToScaled(payment.amount,2);aggregate.payments+=1;
  }
  return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.currency.localeCompare(b.currency)).map(row=>({
    month:row.month,currency:row.currency,netSales:centsString(row.aggregate.netSales),grossProfit:row.aggregate.profitComplete?centsString(row.aggregate.grossProfit):'',collected:centsString(row.aggregate.collected),profitComplete:row.aggregate.profitComplete,missingCostItems:row.aggregate.missingCostItems
  }));
}
