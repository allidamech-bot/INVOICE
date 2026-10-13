import type {VaultPayload,LourexDocument,PaymentMethod,PaymentRecord} from '../types.js';
import {scopeVault} from './workspaces.js';
import {normalizePaymentRecord,invoicePaymentSummary,assertInvoicePaymentInvariant} from './payments.js';
import {decimalToScaled} from './money.js';
import {todayIso,makeId,isIsoDate} from './id.js';
import {assertGovernancePermission} from './governance.js';

export interface AiCustomerCollectionRequest{
 invoiceNumber:string;amount:string;currency:string;date:string;method:PaymentMethod;reference:string;
}
export interface AiCustomerCollectionReview extends AiCustomerCollectionRequest{
 invoiceId:string;workspaceId:string;branchId:string;customerId:string;expectedUpdatedAt:string;
 evidenceSignature:string;beforeRemaining:string;afterRemaining:string;preview:string[];
}
const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
const norm=(input:string)=>String(input||'').normalize('NFKC').replace(/[٠-٩۰-۹]/gu,ch=>
 String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch))).trim();
export function isAiCustomerCollectionIntent(message:string):boolean{
 const t=norm(message);
 return t.length<600&&/^(?:سجّل|سجل|جهّز|جهز|حضّر|حضر|record|prepare)\s+(?:(?:تحصيل|قبض|دفعة)\s+(?:ال)?فاتور[ةه]|invoice\s+(?:collection|payment))(?:\s|$)/iu.test(t);
}
/** Only one exact complete message; never fill payment fields from AI guesses. */
export function parseAiCustomerCollection(message:string):AiCustomerCollectionRequest|null{
 const t=norm(message);
 if(!isAiCustomerCollectionIntent(t))return null;
 const pattern=/^(?:سجّل|سجل|جهّز|جهز|حضّر|حضر|record|prepare)\s+(?:(?:تحصيل|قبض|دفعة)\s+(?:ال)?فاتور[ةه]|invoice\s+(?:collection|payment))\s+(INV[-_]\d{4}[-_]\d{1,12})\s*[,،;]\s*(?:المبلغ|مبلغ|amount)\s*[:：]?\s*(\d{1,13}(?:\.\d{1,2})?)\s+([A-Z]{3})\s*[,،;]\s*(?:التاريخ|تاريخ|date)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})\s*[,،;]\s*(?:الطريقة|طريقة|method)\s*[:：]?\s*(cash|bank-transfer|card|cheque|other)\s*[,،;]\s*(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{2,79})[.!؟\s]*$/iu;
 const m=t.match(pattern);if(!m)return null;
 if(!isIsoDate(m[4]!)||m[4]!>todayIso())throw new Error('Payment date must be a real non-future ISO date.');
 if(decimalToScaled(m[2]!,2)<=0n)throw new Error('A strictly positive payment amount is required.');
 return{invoiceNumber:m[1]!.toUpperCase(),amount:m[2]!,currency:m[3]!.toUpperCase(),
  date:m[4]!,method:m[5]!.toLowerCase() as PaymentMethod,reference:m[6]!.toUpperCase()};
}
function evidence(vault:VaultPayload,invoice:LourexDocument):string{
 return JSON.stringify({
  invoice:{id:invoice.id,number:invoice.number,updatedAt:invoice.updatedAt,status:invoice.status,
   life:invoice.lifecycleStatus,customer:invoice.customerSnapshot,currency:invoice.currency,
   issueDate:invoice.issueDate,items:invoice.items,adjustments:invoice.adjustments},
  allSettlements:vault.payments.map(x=>[x.id,x.invoiceId,x.invoiceNumber,x.customerId,
   x.currency,x.amount,x.date,x.method,x.reference,x.updatedAt]),
  allCredits:vault.documents.filter(x=>x.role==='credit-note')
   .map(x=>[x.id,x.creditForId,x.status,x.lifecycleStatus,x.issueDate,x.currency,
    x.customerSnapshot?.sourceCustomerId,x.items,x.adjustments])
 });
}
function verify(vault:VaultPayload,request:AiCustomerCollectionRequest){
 const scoped=scopeVault(vault);
 assertGovernancePermission(vault,'record-customer-payment');
 const matches=scoped.documents.filter(d=>d.kind==='invoice'&&d.role!=='credit-note'&&
  d.number.toUpperCase()===request.invoiceNumber.toUpperCase());
 if(matches.length!==1)throw new Error('One exact invoice in the active company and branch is required.');
 const invoice=matches[0]!;
 if(invoice.status!=='final'||invoice.lifecycleStatus==='voided')
  throw new Error('Only an active issued invoice can receive an actual customer payment.');
 if(invoice.currency!==request.currency)
  throw new Error('The stated payment currency differs from the saved invoice.');
 if(!invoice.customerSnapshot?.sourceCustomerId||
    !scoped.customers.some(x=>x.id===invoice.customerSnapshot!.sourceCustomerId))
  throw new Error('Customer is not registered in the active company and branch.');
 if(!isIsoDate(request.date)||request.date>todayIso())
  throw new Error('Payment date must be valid and cannot be in the future.');
 if(!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(request.reference))
  throw new Error('A unique external payment reference is required.');
 const sameReference=scoped.payments.some(p=>p.invoiceId===invoice.id&&
   p.reference?.trim().toUpperCase()===request.reference.toUpperCase());
 if(sameReference)throw new Error('A customer collection with this reference already exists for the same invoice.');
 const payment:PaymentRecord={id:makeId('payment'),invoiceId:invoice.id,
  invoiceNumber:invoice.number,customerId:invoice.customerSnapshot.sourceCustomerId,
  customerNameEn:invoice.customerSnapshot.companyNameEn||'',
  customerNameAr:invoice.customerSnapshot.companyNameAr||'',
  currency:invoice.currency,amount:request.amount,date:request.date,method:request.method,
  reference:request.reference,notes:'',createdAt:'',updatedAt:'',
  workspaceId:vault.appSettings.activeWorkspaceId||'default',
  branchId:vault.appSettings.activeBranchId||'main'};
 // Canonical accounting invariant considers all payments and issued credits.
 const normalized=normalizePaymentRecord(invoice,scoped.payments,payment,scoped.documents);
 const before=invoicePaymentSummary(invoice,scoped.payments,todayIso(),scoped.documents);
 const after=invoicePaymentSummary(invoice,[...scoped.payments,normalized],todayIso(),scoped.documents);
 if(decimalToScaled(after.remaining,2)>=decimalToScaled(before.remaining,2))
  throw new Error('No positive collectible balance was reduced.');
 return{scoped,invoice,payment:normalized,before,after,signature:evidence(scoped,invoice)};
}
export function prepareAiCustomerCollection(vault:VaultPayload,request:AiCustomerCollectionRequest):AiCustomerCollectionReview{
 const v=verify(vault,request);
 return{...request,invoiceId:v.invoice.id,workspaceId:v.payment.workspaceId||'default',
  branchId:v.payment.branchId||'main',customerId:v.payment.customerId,
  expectedUpdatedAt:v.invoice.updatedAt,evidenceSignature:v.signature,
  beforeRemaining:v.before.remaining,afterRemaining:v.after.remaining,
  preview:[
   'COLLECTION: '+v.invoice.number+' (issued)',
   'Customer: '+(v.invoice.customerSnapshot?.companyNameEn||v.invoice.customerSnapshot?.companyNameAr||'[missing]'),
   'Currency: '+request.currency+' | Invoice net: '+v.before.netTotal+
    ' | Previously paid: '+v.before.paid+' | Credits: '+v.before.credits,
   'Collect: '+v.payment.amount+' '+request.currency+' | Date: '+request.date,
   'Method: '+request.method+' | External payment reference: '+request.reference,
   'Remaining BEFORE: '+v.before.remaining+' | AFTER: '+v.after.remaining,
   'APPROVAL: Record this customer collection in the invoice payment ledger. No stock, delivery or invoice issuance.'
  ]};
}
export function applyAiCustomerCollection(vault:VaultPayload,review:AiCustomerCollectionReview):{
 vault:VaultPayload;payment:PaymentRecord;
}{
 if(!review||!review.invoiceId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
  throw new Error('Company or branch changed; payment was not recorded.');
 const rechecked=verify(vault,review);
 if(rechecked.invoice.id!==review.invoiceId||
   rechecked.invoice.updatedAt!==review.expectedUpdatedAt||
   rechecked.payment.customerId!==review.customerId||
   rechecked.signature!==review.evidenceSignature||
   rechecked.before.remaining!==review.beforeRemaining||
   rechecked.after.remaining!==review.afterRemaining)
  throw new Error('Invoice, prior payments or credit notes changed. Review collection again.');
 const payment=rechecked.payment;
 const next={...vault,payments:[...vault.payments,payment]};
 assertInvoicePaymentInvariant(rechecked.invoice,scopeVault(next).payments,scopeVault(next).documents);
 return{vault:next,payment};
}
