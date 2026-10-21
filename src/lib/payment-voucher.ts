import type {CompanySettings,LourexDocument,PaymentRecord,PurchaseRecord,SupplierPaymentRecord} from '../types.js';
import {isIsoDate} from './id.js';
import {decimalToScaled,isDecimalInput} from './money.js';
import {accountedInvoicePayments} from './payments.js';
import {normalizeSupplierPayment,postedOnOrBefore} from './payables.js';

/** Output-only proof of one persisted financial payment, never a second posting. */
export interface PaymentVoucher {
  kind:'customer-receipt'|'supplier-disbursement';
  recordId:string;
  sourceId:string;
  sourceNumber:string;
  paymentReference:string;
  amount:string;
  currency:string;
  date:string;
  method:PaymentRecord['method'];
  notes:string;
  partyNameEn:string;
  partyNameAr:string;
  companyNameEn:string;
  companyNameAr:string;
  companyLogo:string;
}
function sameScope(source:{workspaceId?:string;branchId?:string},payment:{workspaceId?:string;branchId?:string}):boolean{
  return (!source.workspaceId||!payment.workspaceId||source.workspaceId===payment.workspaceId)
    &&(!source.branchId||!payment.branchId||source.branchId===payment.branchId);
}
function storedMoney(amount:string):boolean{
  return isDecimalInput(amount)&&decimalToScaled(amount,2)>0n;
}
export function customerPaymentVoucher(invoice:LourexDocument,paymentId:string,payments:PaymentRecord[]):PaymentVoucher{
  if(invoice.kind!=='invoice'||invoice.role!=='standard'||invoice.status!=='final'||invoice.lifecycleStatus==='voided')
    throw new Error('Customer receipt requires an active issued invoice.');
  const matching=payments.filter(payment=>payment.id===paymentId);
  if(matching.length!==1)throw new Error('Customer receipt requires one persisted payment identity.');
  const payment=matching[0]!;
  if(!sameScope(invoice,payment)||!accountedInvoicePayments(invoice,payments).some(row=>row.id===paymentId)
    ||!storedMoney(payment.amount)||!isIsoDate(payment.date)||!invoice.number.trim())
    throw new Error('Customer payment does not belong to this issued invoice.');
  return{
    kind:'customer-receipt',recordId:payment.id,sourceId:invoice.id,sourceNumber:invoice.number,
    paymentReference:payment.reference,amount:payment.amount,currency:invoice.currency,date:payment.date,
    method:payment.method,notes:payment.notes,partyNameEn:payment.customerNameEn||invoice.customerSnapshot?.companyNameEn||'',
    partyNameAr:payment.customerNameAr||invoice.customerSnapshot?.companyNameAr||'',
    companyNameEn:invoice.companySnapshot.nameEn,companyNameAr:invoice.companySnapshot.nameAr,
    companyLogo:invoice.companySnapshot.logoDataUrl
  };
}
export function supplierPaymentVoucher(purchase:PurchaseRecord,paymentId:string,payments:SupplierPaymentRecord[],company:CompanySettings):PaymentVoucher{
  const matching=payments.filter(payment=>payment.id===paymentId);
  if(matching.length!==1)throw new Error('Supplier voucher requires one persisted payment identity.');
  const payment=matching[0]!;
  if(purchase.status!=='posted'||!postedOnOrBefore(purchase,payment.date)||payment.voidedAt
    ||!sameScope(purchase,payment)||!isIsoDate(payment.date)||!storedMoney(payment.amount)||!purchase.number.trim())
    throw new Error('Supplier payment voucher requires an active linked posted purchase.');
  // Reuse the real financial posting validator instead of trusting display-only
  // purchase numbers, amount or supplier identities in a historical record.
  normalizeSupplierPayment(purchase,null,payments,payment,'stored-record');
  return{
    kind:'supplier-disbursement',recordId:payment.id,sourceId:purchase.id,sourceNumber:purchase.number,
    paymentReference:payment.reference,amount:payment.amount,currency:purchase.currency,date:payment.date,
    method:payment.method,notes:payment.notes,
    partyNameEn:purchase.supplierSnapshot?.nameEn||payment.supplierNameEn,
    partyNameAr:purchase.supplierSnapshot?.nameAr||payment.supplierNameAr,
    companyNameEn:company.nameEn,companyNameAr:company.nameAr,companyLogo:company.logoDataUrl
  };
}
