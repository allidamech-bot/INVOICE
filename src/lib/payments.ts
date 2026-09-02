import type { LourexDocument, PaymentMethod, PaymentRecord, PaymentStatus } from '../types.js';
import { calculateTotals, decimalToScaled, isDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';

const METHODS=new Set<PaymentMethod>(['cash','bank-transfer','card','cheque','other']);
function centsString(cents:bigint):string{const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`; }
export function invoicePayments(invoiceId:string,payments:PaymentRecord[]):PaymentRecord[]{return payments.filter(payment=>payment.invoiceId===invoiceId);}
export function paidAmount(invoiceId:string,payments:PaymentRecord[]):string{let cents=0n;for(const payment of invoicePayments(invoiceId,payments))cents+=decimalToScaled(payment.amount,2);return centsString(cents);}
export function invoicePaymentSummary(invoice:LourexDocument,payments:PaymentRecord[],today=todayIso()):{status:PaymentStatus;total:string;paid:string;remaining:string}{
  const total=calculateTotals(invoice.items,invoice.adjustments).grandTotal;const totalCents=decimalToScaled(total,2);const paid=paidAmount(invoice.id,payments);const paidCents=decimalToScaled(paid,2);const remainingCents=totalCents>paidCents?totalCents-paidCents:0n;
  let status:PaymentStatus='unpaid';if(remainingCents===0n&&totalCents>=0n)status='paid';else if(invoice.dueDate&&isIsoDate(invoice.dueDate)&&invoice.dueDate<today)status='overdue';else if(paidCents>0n)status='partially-paid';
  return{status,total:centsString(totalCents),paid:centsString(paidCents),remaining:centsString(remainingCents)};
}
export function normalizePaymentRecord(invoice:LourexDocument,payments:PaymentRecord[],source:PaymentRecord):PaymentRecord{
  if(invoice.kind!=='invoice'||invoice.role==='credit-note'||invoice.status!=='final'||invoice.lifecycleStatus==='voided')throw new Error('Payments can only be recorded against an active final invoice.');
  if(!isDecimalInput(source.amount)||decimalToScaled(source.amount,2)<=0n)throw new Error('Payment amount must be greater than 0.');
  if(!isIsoDate(source.date))throw new Error('Payment date is invalid.');
  const amountCents=decimalToScaled(source.amount,2);let otherCents=0n;for(const payment of payments)if(payment.invoiceId===invoice.id&&payment.id!==source.id)otherCents+=decimalToScaled(payment.amount,2);
  const totalCents=decimalToScaled(calculateTotals(invoice.items,invoice.adjustments).grandTotal,2);if(otherCents+amountCents>totalCents)throw new Error('Payment cannot exceed the remaining invoice balance.');
  const now=new Date().toISOString();const existing=payments.find(payment=>payment.id===source.id);
  return{...source,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:invoice.customerSnapshot?.sourceCustomerId||'',customerNameEn:invoice.customerSnapshot?.companyNameEn||'',customerNameAr:invoice.customerSnapshot?.companyNameAr||'',currency:invoice.currency,amount:centsString(amountCents),method:METHODS.has(source.method)?source.method:'other',reference:(source.reference||'').trim(),notes:(source.notes||'').trim(),createdAt:existing?.createdAt||source.createdAt||now,updatedAt:now};
}
export function assertInvoicePaymentInvariant(invoice:LourexDocument,payments:PaymentRecord[]):void{
  const linked=invoicePayments(invoice.id,payments);if(!linked.length)return;if(invoice.kind!=='invoice'||invoice.status!=='final')throw new Error('An invoice with payments must remain final.');
  const totalCents=decimalToScaled(calculateTotals(invoice.items,invoice.adjustments).grandTotal,2);let paidCents=0n;const customerId=invoice.customerSnapshot?.sourceCustomerId||'';for(const payment of linked){if(payment.currency!==invoice.currency)throw new Error('Invoice currency cannot change after a payment is recorded.');if(payment.customerId!==customerId)throw new Error('Invoice customer cannot change after a payment is recorded.');paidCents+=decimalToScaled(payment.amount,2);}if(paidCents>totalCents)throw new Error('Invoice total cannot be reduced below the amount already paid.');
}
export function paymentMethodLabel(method:PaymentMethod,arabic=false):string{const en:{[key:string]:string}={cash:'Cash','bank-transfer':'Bank transfer',card:'Card',cheque:'Cheque',other:'Other'};const ar:{[key:string]:string}={cash:'نقدي','bank-transfer':'تحويل بنكي',card:'بطاقة',cheque:'شيك',other:'أخرى'};return (arabic?ar:en)[method]||method;}
