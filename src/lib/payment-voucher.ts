import type {CompanySettings,LourexDocument,PaymentRecord,PurchaseRecord,SupplierPaymentRecord} from '../types.js';
import {isIsoDate} from './id.js';
import {decimalToScaled,isDecimalInput} from './money.js';
import {accountedInvoicePayments} from './payments.js';
import {normalizeSupplierPayment,postedOnOrBefore,purchasePayableSummary} from './payables.js';
import type {FiscalAdjustedPaymentVoucher,FiscalSupplierPayableJournal} from './fiscal-accounting-client.js';

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
  simulationSettlement?:{treasuryEntryId:string;accountKind:'cash'|'bank'};
}
function sameScope(source:{workspaceId?:string;branchId?:string},payment:{workspaceId?:string;branchId?:string}):boolean{
  // Match the persistence/merge interpretation of legacy records. A missing
  // scope means default/main; it must not match an arbitrary explicit scope.
  return (source.workspaceId||'default')===(payment.workspaceId||'default')
    &&(source.branchId||'main')===(payment.branchId||'main');
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
    method:payment.method,notes:payment.notes,partyNameEn:invoice.customerSnapshot?.companyNameEn||payment.customerNameEn||'',
    partyNameAr:invoice.customerSnapshot?.companyNameAr||payment.customerNameAr||'',
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

/** Output-only simulation voucher; never creates a SupplierPaymentRecord. */
export function adjustedSupplierPaymentVoucher(purchase:PurchaseRecord,row:FiscalAdjustedPaymentVoucher,journal:FiscalSupplierPayableJournal,payments:SupplierPaymentRecord[],company:CompanySettings,today:string):PaymentVoucher{
  const fail=()=>{throw new Error('Adjusted supplier voucher requires active verified settlement evidence.');};
  if(!row||!journal||purchase.status!=='posted'||!postedOnOrBefore(purchase,row.date)||row.currency!=='SAR'||purchase.currency!==row.currency||row.purchaseId!==purchase.id||row.workspaceId!==purchase.workspaceId||row.branchId!==purchase.branchId||row.supplierId!==purchase.supplierSnapshot?.sourceSupplierId||!purchase.number.trim()||!isIsoDate(row.date)||row.date>today||!storedMoney(row.amount)||row.reversalId!==null||row.reversalDate!==null||!/^[A-Za-z0-9_-]{1,128}$/.test(row.id)||!/^[A-Za-z0-9_-]{1,128}$/.test(row.treasuryEntryId)||!['bank','cash'].includes(row.accountKind))fail();
  purchasePayableSummary(purchase,payments,today,journal);
  const matches=journal.entries.filter(e=>e.id==='settlement:'+row.id);
  if(matches.length!==1||matches[0].type!=='adjusted-payment'||matches[0].reference!==row.id||matches[0].date!==row.date||matches[0].debit!==row.amount||matches[0].credit!=='0.00')fail();
  return {kind:'supplier-disbursement',recordId:'settlement:'+row.id,sourceId:purchase.id,sourceNumber:purchase.number,paymentReference:row.treasuryEntryId,amount:row.amount,currency:row.currency,date:row.date,method:row.accountKind==='cash'?'cash':'other',notes:'',partyNameEn:purchase.supplierSnapshot?.nameEn||'',partyNameAr:purchase.supplierSnapshot?.nameAr||'',companyNameEn:company.nameEn,companyNameAr:company.nameAr,companyLogo:company.logoDataUrl,simulationSettlement:{treasuryEntryId:row.treasuryEntryId,accountKind:row.accountKind}};
}
