import type { LourexDocument, PaymentMethod, PaymentRecord, PaymentStatus } from '../types.js';
import { calculateTotals, decimalToScaled, isDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';

const METHODS=new Set<PaymentMethod>(['cash','bank-transfer','card','cheque','other']);
function centsString(cents:bigint):string{const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`; }
function paymentAmountCents(payment:PaymentRecord):bigint|null{if(!isDecimalInput(payment.amount))return null;const cents=decimalToScaled(payment.amount,2);return cents>0n?cents:null;}
function creditAmountCents(credit:LourexDocument):bigint|null{const cents=decimalToScaled(calculateTotals(credit.items,credit.adjustments).grandTotal,2);return cents>0n?cents:null;}
function paymentMatchesInvoice(invoice:LourexDocument,payment:PaymentRecord):boolean{return payment.invoiceId===invoice.id&&payment.currency===invoice.currency&&payment.customerId===(invoice.customerSnapshot?.sourceCustomerId||'');}
function creditMatchesInvoice(invoice:LourexDocument,credit:LourexDocument):boolean{return credit.role==='credit-note'&&credit.creditForId===invoice.id&&credit.status==='final'&&credit.lifecycleStatus!=='voided'&&credit.currency===invoice.currency&&(credit.customerSnapshot?.sourceCustomerId||'')===(invoice.customerSnapshot?.sourceCustomerId||'')&&creditAmountCents(credit)!==null&&isIsoDate(credit.issueDate);}
function assertPaymentRecordIntegrity(invoice:LourexDocument,payment:PaymentRecord):bigint{
  const amount=paymentAmountCents(payment);
  if(amount===null)throw new Error('A recorded payment has an invalid amount. Delete or correct the payment record before continuing.');
  if(!isIsoDate(payment.date))throw new Error('A recorded payment has an invalid date. Delete or correct the payment record before continuing.');
  if(payment.currency!==invoice.currency)throw new Error('Invoice currency cannot change after a payment is recorded.');
  if(payment.customerId!==(invoice.customerSnapshot?.sourceCustomerId||''))throw new Error('Invoice customer cannot change after a payment is recorded.');
  return amount;
}
function assertCreditNoteRecordIntegrity(invoice:LourexDocument,credit:LourexDocument):bigint{
  const amount=creditAmountCents(credit);
  if(amount===null)throw new Error('An issued credit note has an invalid total. Void and replace the credit note before continuing.');
  if(!isIsoDate(credit.issueDate))throw new Error('An issued credit note has an invalid issue date. Void and replace the credit note before continuing.');
  if(credit.currency!==invoice.currency)throw new Error('Credit note currency must match the source invoice.');
  if((credit.customerSnapshot?.sourceCustomerId||'')!==(invoice.customerSnapshot?.sourceCustomerId||''))throw new Error('Credit note customer must match the source invoice.');
  return amount;
}
export function invoicePayments(invoiceId:string,payments:PaymentRecord[],asOf=''):PaymentRecord[]{return payments.filter(payment=>payment.invoiceId===invoiceId&&(!asOf||(isIsoDate(payment.date)&&payment.date<=asOf)));}
export function accountedInvoicePayments(invoice:LourexDocument,payments:PaymentRecord[],asOf=''):PaymentRecord[]{return payments.filter(payment=>paymentMatchesInvoice(invoice,payment)&&paymentAmountCents(payment)!==null&&isIsoDate(payment.date)&&(!asOf||payment.date<=asOf));}
export function accountedInvoiceCreditNotes(invoice:LourexDocument,documents:LourexDocument[],asOf=''):LourexDocument[]{return documents.filter(credit=>creditMatchesInvoice(invoice,credit)&&(!asOf||credit.issueDate<=asOf));}
export function paidAmount(invoiceId:string,payments:PaymentRecord[],asOf=''):string{let cents=0n;for(const payment of invoicePayments(invoiceId,payments,asOf)){const amount=paymentAmountCents(payment);if(amount!==null&&isIsoDate(payment.date))cents+=amount;}return centsString(cents);}
export function invoiceCreditAmount(invoiceId:string,documents:LourexDocument[],asOf=''):string{
  let cents=0n;
  for(const document of documents){
    if(document.role!=='credit-note'||document.creditForId!==invoiceId||document.status!=='final'||document.lifecycleStatus==='voided'||!isIsoDate(document.issueDate))continue;
    if(asOf&&document.issueDate>asOf)continue;
    const amount=creditAmountCents(document);if(amount!==null)cents+=amount;
  }
  return centsString(cents);
}
export function invoicePaymentSummary(invoice:LourexDocument,payments:PaymentRecord[],today=todayIso(),documents:LourexDocument[]=[]):{status:PaymentStatus;total:string;credits:string;netTotal:string;paid:string;remaining:string}{
  const total=calculateTotals(invoice.items,invoice.adjustments).grandTotal;
  const totalCents=decimalToScaled(total,2);
  let creditCents=0n;for(const credit of accountedInvoiceCreditNotes(invoice,documents,today))creditCents+=decimalToScaled(calculateTotals(credit.items,credit.adjustments).grandTotal,2);
  const credits=centsString(creditCents);
  const netCents=totalCents>creditCents?totalCents-creditCents:0n;
  let paidCents=0n;for(const payment of accountedInvoicePayments(invoice,payments,today))paidCents+=decimalToScaled(payment.amount,2);
  const paid=centsString(paidCents);
  const remainingCents=netCents>paidCents?netCents-paidCents:0n;
  let status:PaymentStatus='unpaid';
  if(remainingCents===0n&&netCents>=0n)status='paid';
  else if(invoice.dueDate&&isIsoDate(invoice.dueDate)&&invoice.dueDate<today)status='overdue';
  else if(paidCents>0n||creditCents>0n)status='partially-paid';
  return{status,total:centsString(totalCents),credits,netTotal:centsString(netCents),paid,remaining:centsString(remainingCents)};
}
export function normalizePaymentRecord(invoice:LourexDocument,payments:PaymentRecord[],source:PaymentRecord,documents:LourexDocument[]=[]):PaymentRecord{
  if(invoice.kind!=='invoice'||invoice.role==='credit-note'||invoice.status!=='final'||invoice.lifecycleStatus==='voided')throw new Error('Payments can only be recorded against an active final invoice.');
  if(!isDecimalInput(source.amount)||decimalToScaled(source.amount,2)<=0n)throw new Error('Payment amount must be greater than 0.');
  if(!isIsoDate(source.date))throw new Error('Payment date is invalid.');
  const amountCents=decimalToScaled(source.amount,2);
  let otherCents=0n;
  for(const payment of payments)if(payment.invoiceId===invoice.id&&payment.id!==source.id)otherCents+=assertPaymentRecordIntegrity(invoice,payment);
  const totalCents=decimalToScaled(calculateTotals(invoice.items,invoice.adjustments).grandTotal,2);
  let creditCents=0n;for(const credit of documents.filter(document=>document.role==='credit-note'&&document.creditForId===invoice.id&&document.status==='final'&&document.lifecycleStatus!=='voided'))creditCents+=assertCreditNoteRecordIntegrity(invoice,credit);
  const collectibleCents=totalCents>creditCents?totalCents-creditCents:0n;
  if(otherCents+amountCents>collectibleCents)throw new Error('Payment cannot exceed the remaining invoice balance after credit notes.');
  const now=new Date().toISOString();const existing=payments.find(payment=>payment.id===source.id);
  return{...source,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:invoice.customerSnapshot?.sourceCustomerId||'',customerNameEn:invoice.customerSnapshot?.companyNameEn||'',customerNameAr:invoice.customerSnapshot?.companyNameAr||'',currency:invoice.currency,amount:centsString(amountCents),method:METHODS.has(source.method)?source.method:'other',reference:(source.reference||'').trim(),notes:(source.notes||'').trim(),createdAt:existing?.createdAt||source.createdAt||now,updatedAt:now};
}
export function assertInvoicePaymentInvariant(invoice:LourexDocument,payments:PaymentRecord[],documents:LourexDocument[]=[]):void{
  const linked=payments.filter(payment=>payment.invoiceId===invoice.id);
  const credits=documents.filter(document=>document.role==='credit-note'&&document.creditForId===invoice.id&&document.status==='final'&&document.lifecycleStatus!=='voided');
  if(!linked.length&&!credits.length)return;
  if(invoice.kind!=='invoice'||invoice.role==='credit-note'||invoice.status!=='final'||invoice.lifecycleStatus==='voided')throw new Error('An invoice with payments or issued credit notes must remain an active final invoice.');
  const totalCents=decimalToScaled(calculateTotals(invoice.items,invoice.adjustments).grandTotal,2);
  let creditCents=0n;for(const credit of credits)creditCents+=assertCreditNoteRecordIntegrity(invoice,credit);
  let paidCents=0n;for(const payment of linked)paidCents+=assertPaymentRecordIntegrity(invoice,payment);
  if(paidCents+creditCents>totalCents)throw new Error('Invoice balance cannot fall below payments plus issued credit notes.');
}
export function paymentMethodLabel(method:PaymentMethod,arabic=false):string{const en:{[key:string]:string}={cash:'Cash','bank-transfer':'Bank transfer',card:'Card',cheque:'Cheque',other:'Other'};const ar:{[key:string]:string}={cash:'نقدي','bank-transfer':'تحويل بنكي',card:'بطاقة',cheque:'شيك',other:'أخرى'};return (arabic?ar:en)[method]||method;}
