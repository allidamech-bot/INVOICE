import type { LourexDocument } from '../types.js';
import { calculateTotals, decimalToScaled, normalizeDecimalInput } from './money.js';
import { accountedInvoiceCreditNotes } from './payments.js';
import { isIsoDate, todayIso } from './id.js';

export interface TaxVatDocumentRow {
  documentId:string;
  number:string;
  issueDate:string;
  customerName:string;
  currency:string;
  taxRate:string;
  taxableAmount:string;
  outputVat:string;
  grandTotal:string;
  creditNote:boolean;
}

export interface TaxVatRateRow {
  currency:string;
  taxRate:string;
  taxableAmount:string;
  outputVat:string;
  documents:number;
  creditNotes:number;
}

export interface TaxVatCurrencySummary {
  currency:string;
  taxableAmount:string;
  outputVat:string;
  invoiceVat:string;
  creditVat:string;
  documents:number;
  creditNotes:number;
  rates:TaxVatRateRow[];
}

export interface TaxVatReport {
  from:string;
  to:string;
  currencies:TaxVatCurrencySummary[];
  rows:TaxVatDocumentRow[];
  inputVatSupported:false;
}

function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'';
  const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}

function normalizePeriod(from:string,to:string):{from:string;to:string}{
  const cleanFrom=isIsoDate(from)?from:'';
  const cleanTo=isIsoDate(to)?to:todayIso();
  if(cleanFrom&&cleanFrom>cleanTo)return{from:cleanTo,to:cleanFrom};
  return{from:cleanFrom,to:cleanTo};
}

function dateInRange(date:string,from:string,to:string):boolean{
  return isIsoDate(date)&&(!from||date>=from)&&(!to||date<=to);
}

function currencyOf(doc:LourexDocument):string{return (doc.currency||'USD').trim().toUpperCase()||'USD';}
function customerName(doc:LourexDocument):string{return (doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'').trim();}
function taxRateKey(doc:LourexDocument):string{
  const cleaned=normalizeDecimalInput(doc.adjustments.taxPercent||'0');
  if(!cleaned)return '0';
  const scaled=decimalToScaled(cleaned,4);
  const sign=scaled<0n?'-':'';const abs=scaled<0n?-scaled:scaled;
  const whole=abs/10_000n;const fraction=(abs%10_000n).toString().padStart(4,'0').replace(/0+$/,'');
  return `${sign}${whole}${fraction?`.${fraction}`:''}`;
}

/**
 * Returns only auditable sales documents for Output VAT: active final invoices
 * plus valid active final credit notes linked to those invoices. Drafts, voided
 * documents, quotes/proformas and unrelated credit notes are intentionally excluded.
 */
export function outputVatDocuments(documents:LourexDocument[]):LourexDocument[]{
  const invoices=documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided');
  const result:LourexDocument[]=[];
  const seen=new Set<string>();
  for(const invoice of invoices){
    if(!seen.has(invoice.id)){seen.add(invoice.id);result.push(invoice);}
    for(const credit of accountedInvoiceCreditNotes(invoice,documents))if(!seen.has(credit.id)){seen.add(credit.id);result.push(credit);}
  }
  return result;
}

export function outputVatReport(documents:LourexDocument[],from='',to=todayIso()):TaxVatReport{
  const period=normalizePeriod(from,to);
  const rows:TaxVatDocumentRow[]=[];
  for(const doc of outputVatDocuments(documents)){
    if(!dateInRange(doc.issueDate,period.from,period.to)||!doc.adjustments.taxEnabled)continue;
    const totals=calculateTotals(doc.items,doc.adjustments);
    const sign=doc.role==='credit-note'?-1n:1n;
    const tax=decimalToScaled(totals.tax,2)*sign;
    const grand=decimalToScaled(totals.grandTotal,2)*sign;
    const taxable=grand-tax;
    rows.push({
      documentId:doc.id,number:doc.number,issueDate:doc.issueDate,customerName:customerName(doc),currency:currencyOf(doc),taxRate:taxRateKey(doc),
      taxableAmount:centsString(taxable),outputVat:centsString(tax),grandTotal:centsString(grand),creditNote:doc.role==='credit-note'
    });
  }
  rows.sort((a,b)=>b.issueDate.localeCompare(a.issueDate)||a.currency.localeCompare(b.currency)||a.number.localeCompare(b.number));

  const currencyMap=new Map<string,{taxable:bigint;vat:bigint;invoiceVat:bigint;creditVat:bigint;documents:number;creditNotes:number;rates:Map<string,{taxable:bigint;vat:bigint;documents:number;creditNotes:number}>}>();
  for(const row of rows){
    const currency=currencyMap.get(row.currency)??{taxable:0n,vat:0n,invoiceVat:0n,creditVat:0n,documents:0,creditNotes:0,rates:new Map()};
    const taxable=decimalToScaled(row.taxableAmount,2),vat=decimalToScaled(row.outputVat,2);
    currency.taxable+=taxable;currency.vat+=vat;
    if(row.creditNote){currency.creditNotes+=1;currency.creditVat+=vat;}else{currency.documents+=1;currency.invoiceVat+=vat;}
    const rate=currency.rates.get(row.taxRate)??{taxable:0n,vat:0n,documents:0,creditNotes:0};
    rate.taxable+=taxable;rate.vat+=vat;if(row.creditNote)rate.creditNotes+=1;else rate.documents+=1;
    currency.rates.set(row.taxRate,rate);currencyMap.set(row.currency,currency);
  }

  const currencies=[...currencyMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({
    currency,taxableAmount:centsString(row.taxable),outputVat:centsString(row.vat),invoiceVat:centsString(row.invoiceVat),creditVat:centsString(row.creditVat),documents:row.documents,creditNotes:row.creditNotes,
    rates:[...row.rates.entries()].sort(([a],[b])=>Number(a)-Number(b)).map(([taxRate,rate])=>({currency,taxRate,taxableAmount:centsString(rate.taxable),outputVat:centsString(rate.vat),documents:rate.documents,creditNotes:rate.creditNotes}))
  }));
  return{from:period.from,to:period.to,currencies,rows,inputVatSupported:false};
}
