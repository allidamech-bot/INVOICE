import type {VaultPayload,PurchaseRecord,SupplierPaymentRecord,PaymentMethod} from '../types.js';
import {scopeVault} from './workspaces.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary,assertSupplierPaymentInvariant} from './payables.js';
import {decimalToScaled} from './money.js';
import {isIsoDate,todayIso} from './id.js';
import {assertGovernancePermission} from './governance.js';

export interface AiSupplierSettlementRequest {
  purchaseNumber:string;amount:string;currency:string;date:string;method:PaymentMethod;reference:string;
}
export interface AiSupplierSettlementReview extends AiSupplierSettlementRequest {
  purchaseId:string;supplierId:string;expectedUpdatedAt:string;workspaceId:string;branchId:string;
  beforeRemaining:string;afterRemaining:string;evidenceSignature:string;preview:string[];
}
const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
const normalize=(value:string)=>String(value||'').normalize('NFKC').replace(/[٠-٩۰-۹]/gu,ch=>
  String(arabic.includes(ch)?arabic.indexOf(ch):persian.indexOf(ch))).trim();
export function isAiSupplierSettlementIntent(message:string):boolean {
 const s=normalize(message);
 return s.length<=680&&/^(?:سجّل|سجل|حضّر|حضر|جهّز|جهز|record|prepare)\s+(?:سداد\s+(?:ال)?مورد|دفعة\s+(?:ال)?مورد|supplier\s+payment)(?:\s|$)/iu.test(s);
}
export function parseAiSupplierSettlement(message:string):AiSupplierSettlementRequest|null {
 const s=normalize(message);
 if(!isAiSupplierSettlementIntent(s))return null;
 const pattern=/^(?:سجّل|سجل|حضّر|حضر|جهّز|جهز|record|prepare)\s+(?:سداد\s+(?:ال)?مورد|دفعة\s+(?:ال)?مورد|supplier\s+payment)\s+(PUR[-_]\d{4}[-_]\d{1,12})\s*[,،;]\s*(?:المبلغ|مبلغ|amount)\s*[:：]?\s*(\d{1,13}(?:\.\d{1,2})?)\s+([A-Z]{3})\s*[,،;]\s*(?:التاريخ|تاريخ|date)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})\s*[,،;]\s*(?:الطريقة|طريقة|method)\s*[:：]?\s*(cash|bank-transfer|card|cheque|other)\s*[,،;]\s*(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{2,79})[.!؟\s]*$/iu;
 const m=s.match(pattern);if(!m)return null;
 if(!isIsoDate(m[4]!)||m[4]!>todayIso())throw new Error('Supplier payment date must be a real non-future ISO date.');
 if(decimalToScaled(m[2]!,2)<=0n)throw new Error('A positive supplier payment amount is required.');
 return{purchaseNumber:m[1]!.toUpperCase(),amount:m[2]!,currency:m[3]!.toUpperCase(),
  date:m[4]!,method:m[5]!.toLowerCase() as PaymentMethod,reference:m[6]!.toUpperCase()};
}
function evidence(vault:VaultPayload,purchase:PurchaseRecord):string {
 return JSON.stringify({
  purchase:{id:purchase.id,number:purchase.number,updatedAt:purchase.updatedAt,status:purchase.status,
    postedAt:purchase.postedAt,sourceSupplierInvoiceEventId:purchase.sourceSupplierInvoiceEventId,
    sourcePurchaseOrderId:purchase.sourcePurchaseOrderId,items:purchase.items,freight:purchase.freight,
    duty:purchase.duty,otherCosts:purchase.otherCosts,currency:purchase.currency,supplier:purchase.supplierSnapshot},
  supplier:vault.suppliers.find(x=>x.id===purchase.supplierSnapshot?.sourceSupplierId),
  allPosted:vault.purchases.map(p=>[p.id,p.number,p.status,p.updatedAt,p.currency,p.supplierSnapshot?.sourceSupplierId]),
  allPayments:vault.supplierPayments.map(p=>[p.id,p.purchaseId,p.supplierId,p.currency,p.amount,
    p.date,p.method,p.reference,p.voidedAt,p.voidReason,p.updatedAt])
 });
}
function verify(vault:VaultPayload,request:AiSupplierSettlementRequest){
 assertGovernancePermission(vault,'record-supplier-payment');
 const scoped=scopeVault(vault);
 const matches=scoped.purchases.filter(p=>p.number.toUpperCase()===request.purchaseNumber);
 if(matches.length!==1)throw new Error('An exact, unique posted purchase number in the active company and branch is required.');
 const purchase=matches[0]!;
 if(purchase.status!=='posted'||purchase.reversedAt)
  throw new Error('Supplier payment needs an active POSTED purchase, not an RFQ, PO, draft, reversed purchase or matched invoice alone.');
 const supplierId=purchase.supplierSnapshot?.sourceSupplierId||'';
 const supplier=scoped.suppliers.find(x=>x.id===supplierId);
 if(!supplier||!supplierId)throw new Error('The posted purchase supplier is missing from the active company and branch.');
 if(purchase.currency.toUpperCase()!==request.currency)
  throw new Error('The payment currency does not match the posted purchase. No automatic FX conversion.');
 if(!isIsoDate(request.date)||request.date>todayIso())
  throw new Error('Supplier payment date must not be invalid or in the future.');
 if(!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(request.reference))
  throw new Error('One exact external payment reference is required.');
 // Never reuse an external bank reference for another liability of the same
 // supplier, even after a payment was voided. Avoid double bank posting.
 if(scoped.supplierPayments.some(p=>p.supplierId===supplierId&&
    p.currency.toUpperCase()===request.currency&&p.reference.toUpperCase()===request.reference))
  throw new Error('This supplier already has a payment with the same external reference; duplicates are blocked.');
 assertSupplierPaymentInvariant(scoped.purchases,scoped.suppliers,scoped.supplierPayments);
 const payment=createSupplierPayment(purchase,supplier,scoped.supplierPayments);
 payment.amount=request.amount;payment.currency=request.currency;payment.date=request.date;
 payment.method=request.method;payment.reference=request.reference;
 payment.workspaceId=vault.appSettings.activeWorkspaceId||'default';
 payment.branchId=vault.appSettings.activeBranchId||'main';
 const normalized=normalizeSupplierPayment(purchase,supplier,scoped.supplierPayments,payment);
 const before=purchasePayableSummary(purchase,scoped.supplierPayments,todayIso());
 const after=purchasePayableSummary(purchase,[...scoped.supplierPayments,normalized],todayIso());
 if(decimalToScaled(after.remaining,2)>=decimalToScaled(before.remaining,2))
  throw new Error('The payment did not reduce an actual outstanding supplier liability.');
 return{scoped,purchase,supplier,payment:normalized,before,after,
   signature:evidence(scoped,purchase)};
}
export function prepareAiSupplierSettlement(vault:VaultPayload,request:AiSupplierSettlementRequest):AiSupplierSettlementReview{
 const v=verify(vault,request);
 return{...request,amount:v.payment.amount,purchaseId:v.purchase.id,supplierId:v.supplier.id,
  expectedUpdatedAt:v.purchase.updatedAt,
  workspaceId:v.payment.workspaceId||'default',branchId:v.payment.branchId||'main',
  beforeRemaining:v.before.remaining,afterRemaining:v.after.remaining,evidenceSignature:v.signature,
  preview:[
   'SUPPLIER PAYMENT — Posted purchase '+v.purchase.number,
   'Supplier: '+(v.supplier.nameEn||v.supplier.nameAr||'[missing]'),
   'Amount: '+v.payment.amount+' '+request.currency+' | Method: '+request.method,
   'Bank/cash reference: '+request.reference+' | Date: '+request.date,
   'Purchase liability: '+v.before.total+' '+request.currency+
      ' | Prior supplier payments: '+v.before.paid,
   'Remaining before: '+v.before.remaining+' '+request.currency+
      ' | Remaining after: '+v.after.remaining+' '+request.currency,
   'APPROVAL: Records a real supplier payment and reduces a posted purchase payable. No supplier invoice, goods receipt or stock movement is created.'
  ]};
}
export function applyAiSupplierSettlement(vault:VaultPayload,review:AiSupplierSettlementReview):
 {vault:VaultPayload;payment:SupplierPaymentRecord}{
 if(!review?.purchaseId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
  throw new Error('Supplier payment company/branch approval scope changed; nothing posted.');
 const latest=verify(vault,review);
 if(latest.purchase.id!==review.purchaseId||
    latest.purchase.updatedAt!==review.expectedUpdatedAt||
    latest.supplier.id!==review.supplierId||
    latest.signature!==review.evidenceSignature||
    latest.before.remaining!==review.beforeRemaining||
    latest.after.remaining!==review.afterRemaining)
  throw new Error('Purchase payable or existing supplier payments changed. Review the exact settlement again.');
 const next={...vault,supplierPayments:[...vault.supplierPayments,latest.payment]};
 const scoped=scopeVault(next);
 assertSupplierPaymentInvariant(scoped.purchases,scoped.suppliers,scoped.supplierPayments);
 return{vault:next,payment:latest.payment};
}
