import type { Customer, LourexDocument, PaymentRecord } from '../types.js';
import { calculateTotals, decimalToScaled } from './money.js';
import { invoicePaymentSummary, invoicePayments } from './payments.js';
import { todayIso } from './id.js';

export type AgingBucket='current'|'days1to30'|'days31to60'|'days61to90'|'days90plus';
export interface AgingAmounts{current:string;days1to30:string;days31to60:string;days61to90:string;days90plus:string;}
export interface CurrencyReceivableSummary{currency:string;billed:string;credits:string;paid:string;outstanding:string;overdue:string;aging:AgingAmounts;openInvoices:number;overdueInvoices:number;}
export interface CustomerCurrencySummary extends CurrencyReceivableSummary{customerId:string;}
export interface CustomerReceivableSummary{customerId:string;customer:Customer|null;currencies:CustomerCurrencySummary[];hasOverdue:boolean;openInvoices:number;}
export type StatementEntryType='invoice'|'payment'|'credit-note';
export interface StatementEntry{currency:string;date:string;reference:string;type:StatementEntryType;description:string;debit:string;credit:string;balance:string;relatedInvoiceNumber:string;}
export interface CustomerStatementCurrency{currency:string;entries:StatementEntry[];billed:string;credits:string;paid:string;outstanding:string;overdue:string;}

function centsString(cents:bigint):string{const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function dayNumber(iso:string):number{
  const parts=iso.split('-');
  const year=Number(parts[0]??0);
  const month=Number(parts[1]??1);
  const day=Number(parts[2]??1);
  return Math.floor(Date.UTC(year,month-1,day)/86_400_000);
}
export function daysOverdue(dueDate:string,today=todayIso()):number{if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||dueDate>=today)return 0;return Math.max(0,dayNumber(today)-dayNumber(dueDate));}
export function agingBucketFor(dueDate:string,today=todayIso()):AgingBucket{const days=daysOverdue(dueDate,today);if(days<=0)return'current';if(days<=30)return'days1to30';if(days<=60)return'days31to60';if(days<=90)return'days61to90';return'days90plus';}
function activeInvoices(documents:LourexDocument[],asOf=''):LourexDocument[]{return documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&(!asOf||(/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)&&doc.issueDate<=asOf)));}
function customerIdFor(doc:LourexDocument):string{return doc.customerSnapshot?.sourceCustomerId||'';}
function customerName(doc:LourexDocument):string{return (doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'').trim();}

export function receivablesByCurrency(documents:LourexDocument[],payments:PaymentRecord[],today=todayIso(),customerId=''):CurrencyReceivableSummary[]{
  const map=new Map<string,{billed:bigint;credits:bigint;paid:bigint;outstanding:bigint;overdue:bigint;aging:Record<AgingBucket,bigint>;openInvoices:number;overdueInvoices:number}>();
  for(const invoice of activeInvoices(documents,today)){
    if(customerId&&customerIdFor(invoice)!==customerId)continue;
    const summary=invoicePaymentSummary(invoice,payments,today,documents);
    const currency=invoice.currency;
    const row=map.get(currency)??{billed:0n,credits:0n,paid:0n,outstanding:0n,overdue:0n,aging:{current:0n,days1to30:0n,days31to60:0n,days61to90:0n,days90plus:0n},openInvoices:0,overdueInvoices:0};
    row.billed+=decimalToScaled(summary.total,2);row.credits+=decimalToScaled(summary.credits,2);row.paid+=decimalToScaled(summary.paid,2);row.outstanding+=decimalToScaled(summary.remaining,2);
    if(decimalToScaled(summary.remaining,2)>0n){row.openInvoices+=1;const bucket=agingBucketFor(invoice.dueDate,today);row.aging[bucket]+=decimalToScaled(summary.remaining,2);if(summary.status==='overdue'){row.overdue+=decimalToScaled(summary.remaining,2);row.overdueInvoices+=1;}}
    map.set(currency,row);
  }
  return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,billed:centsString(row.billed),credits:centsString(row.credits),paid:centsString(row.paid),outstanding:centsString(row.outstanding),overdue:centsString(row.overdue),aging:{current:centsString(row.aging.current),days1to30:centsString(row.aging.days1to30),days31to60:centsString(row.aging.days31to60),days61to90:centsString(row.aging.days61to90),days90plus:centsString(row.aging.days90plus)},openInvoices:row.openInvoices,overdueInvoices:row.overdueInvoices}));
}

export function customerReceivables(customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[],today=todayIso()):CustomerReceivableSummary[]{
  const customerMap=new Map(customers.map(customer=>[customer.id,customer]));
  const ids=new Set<string>();
  for(const invoice of activeInvoices(documents,today)){const id=customerIdFor(invoice);if(id)ids.add(id);}
  return [...ids].map(customerId=>{const currencies=receivablesByCurrency(documents,payments,today,customerId).map(row=>({...row,customerId}));return{customerId,customer:customerMap.get(customerId)??null,currencies,hasOverdue:currencies.some(row=>decimalToScaled(row.overdue,2)>0n),openInvoices:currencies.reduce((sum,row)=>sum+row.openInvoices,0)};}).sort((a,b)=>Number(b.hasOverdue)-Number(a.hasOverdue)||b.openInvoices-a.openInvoices||((a.customer?.companyNameEn||a.customer?.companyNameAr||'').localeCompare(b.customer?.companyNameEn||b.customer?.companyNameAr||'')));
}

export function customerStatement(customerId:string,documents:LourexDocument[],payments:PaymentRecord[],today=todayIso()):CustomerStatementCurrency[]{
  const rows=new Map<string,{date:string;reference:string;type:StatementEntryType;description:string;debit:bigint;credit:bigint;relatedInvoiceNumber:string;order:number}[]>();
  const push=(currency:string,row:{date:string;reference:string;type:StatementEntryType;description:string;debit:bigint;credit:bigint;relatedInvoiceNumber:string;order:number})=>{const list=rows.get(currency)??[];list.push(row);rows.set(currency,list);};
  const invoices=activeInvoices(documents,today).filter(invoice=>customerIdFor(invoice)===customerId);
  for(const invoice of invoices){
    const total=decimalToScaled(calculateTotals(invoice.items,invoice.adjustments).grandTotal,2);
    push(invoice.currency,{date:invoice.issueDate,reference:invoice.number,type:'invoice',description:customerName(invoice),debit:total,credit:0n,relatedInvoiceNumber:invoice.number,order:1});
    for(const credit of documents.filter(doc=>doc.role==='credit-note'&&doc.creditForId===invoice.id&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)&&doc.issueDate<=today)){
      const amount=decimalToScaled(calculateTotals(credit.items,credit.adjustments).grandTotal,2);
      push(invoice.currency,{date:credit.issueDate,reference:credit.number,type:'credit-note',description:`Credit against ${invoice.number}`,debit:0n,credit:amount,relatedInvoiceNumber:invoice.number,order:2});
    }
    for(const payment of invoicePayments(invoice.id,payments,today))push(invoice.currency,{date:payment.date,reference:payment.reference||payment.id,type:'payment',description:payment.reference||invoice.number,debit:0n,credit:decimalToScaled(payment.amount,2),relatedInvoiceNumber:invoice.number,order:3});
  }
  const summaries=receivablesByCurrency(documents,payments,today,customerId);
  return [...rows.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,entries])=>{
    entries.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||a.reference.localeCompare(b.reference));let balance=0n;
    const statementEntries:StatementEntry[]=entries.map(entry=>{balance+=entry.debit-entry.credit;return{currency,date:entry.date,reference:entry.reference,type:entry.type,description:entry.description,debit:centsString(entry.debit),credit:centsString(entry.credit),balance:centsString(balance),relatedInvoiceNumber:entry.relatedInvoiceNumber};});
    const summary=summaries.find(item=>item.currency===currency);
    return{currency,entries:statementEntries,billed:summary?.billed||'0.00',credits:summary?.credits||'0.00',paid:summary?.paid||'0.00',outstanding:summary?.outstanding||'0.00',overdue:summary?.overdue||'0.00'};
  });
}
