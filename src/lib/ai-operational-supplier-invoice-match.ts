import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {matchSupplierInvoice,matchedSupplierInvoices,supplierInvoiceLineBalances,
 type MatchSupplierInvoiceInput} from './supplier-invoice-flow.js';
import {assertSupplierInvoiceIntegrity} from './supplier-invoice-flow.js';
import {assertGoodsReceiptIntegrity} from './goods-receipt-flow.js';
import {assertGovernancePermission} from './governance.js';

/** Explicit vendor bill matching is non-posting: no payable and no stock receipt. */
export interface AiSupplierInvoiceMatchRequest{
 purchaseOrderNumber:string;invoiceReference:string;invoiceDate:string;dueDate:string;
 quantities:string[];unitPrices:string[];statedTotal:string;
}
export interface AiSupplierInvoiceMatchReview extends AiSupplierInvoiceMatchRequest{
 purchaseOrderId:string;expectedUpdatedAt:string;supplierId:string;currency:string;
 workspaceId:string;branchId:string;ledgerSignature:string;preview:string[];
}
const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
const normalized=(value:string)=>String(value||'').normalize('NFKC')
 .replace(/[٠-٩۰-۹]/gu,ch=>String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch))).trim();
export function isAiSupplierInvoiceMatchIntent(message:string):boolean{
 const m=normalized(message);
 return m.length>20&&m.length<=1100&&
  /^(?:جهز|جهّز|حضّر|حضر|طابق|طابِق|prepare|match|review)\s+(?:(?:مطابقة|مراجعة)\s+)?(?:فاتورة\s+(?:ال)?مورد|supplier[\s-]*(?:invoice|bill)|vendor[\s-]*bill)(?:\s|$)/iu.test(m);
}
export function parseAiSupplierInvoiceMatchRequest(message:string):AiSupplierInvoiceMatchRequest|null{
 const s=normalized(message);
 if(!isAiSupplierInvoiceMatchIntent(s))return null;
 if(/(?:رحّل|رحل|ترحيل|المخزون|مخزون|ادفع|دفع|سدّد|سدد|اعتمد|أصدر|اصدر|قيد\s+محاسبي|\b(?:post|pay|issue|approve|inventory|stock|settle)\b)/iu.test(s))
  throw new Error('Invoice matching cannot combine posting, payment, stock or issuance in one instruction.');
 const found=[...s.matchAll(/\bPO[-_]\d{4}[-_]\d{1,12}\b/giu)].map(x=>x[0]!.toUpperCase());
 if(found.length!==1)return null;
 const ref=s.match(/(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{1,59})/iu);
 const dt=s.match(/(?:التاريخ|تاريخ|date)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})/iu);
 const due=s.match(/(?:الاستحقاق|استحقاق|due[\s-]*date|due)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})/iu);
 const qty=s.match(/(?:الكميات|كميات|quantities)\s*[:：]?\s*(\d+(?:\.\d{1,4})?(?:\s*[,،;]\s*\d+(?:\.\d{1,4})?){0,119})/iu);
 const prices=s.match(/(?:الأسعار|الاسعار|أسعار|اسعار|prices)\s*[:：]?\s*(\d+(?:\.\d{1,4})?(?:\s*[,،;]\s*\d+(?:\.\d{1,4})?){0,119})/iu);
 const total=s.match(/(?:الإجمالي|الاجمالي|إجمالي|اجمالي|total)\s*[:：]?\s*(\d+(?:\.\d{1,2})?)/iu);
 if(!ref||!dt||!due||!qty||!prices||!total)return null;
 const split=(value:string)=>value.split(/\s*[,،;]\s*/).map(x=>x.trim());
 const quantities=split(qty[1]!),unitPrices=split(prices[1]!);
 if(quantities.some(x=>!/^\d{1,15}(?:\.\d{1,4})?$/.test(x))||
    unitPrices.some(x=>!/^\d{1,15}(?:\.\d{1,4})?$/.test(x))||
    quantities.length>120||unitPrices.length>120)
  throw new Error('Supply exact numeric quantities and prices for each PO line; no line may be inferred.');
 // Field extraction must consume the *whole* instruction, not guess around a
 // second unrelated high-impact action or a silent extra total/date.
 const remaining=s.replace(/^(?:جهز|جهّز|حضّر|حضر|طابق|طابِق|prepare|match|review)\s+(?:(?:مطابقة|مراجعة)\s+)?(?:فاتورة\s+(?:ال)?مورد|supplier[\s-]*(?:invoice|bill)|vendor[\s-]*bill)/iu,'')
  .replace(/(?:لأمر|لامر|أمر|طلب|لـ|من|for|purchase[\s-]*order)\s*(?:ال)?(?:الشراء)?\s*PO[-_]\d{4}[-_]\d{1,12}/iu,'')
  .replace(/\bPO[-_]\d{4}[-_]\d{1,12}\b/iu,'')
  .replace(/(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*[A-Z0-9][A-Z0-9_-]{1,59}/iu,'')
  .replace(/(?:التاريخ|تاريخ|date)\s*[:：]?\s*20\d{2}-\d{2}-\d{2}/iu,'')
  .replace(/(?:الاستحقاق|استحقاق|due[\s-]*date|due)\s*[:：]?\s*20\d{2}-\d{2}-\d{2}/iu,'')
  .replace(/(?:الكميات|كميات|quantities)\s*[:：]?\s*\d+(?:\.\d{1,4})?(?:\s*[,،;]\s*\d+(?:\.\d{1,4})?){0,119}/iu,'')
  .replace(/(?:الأسعار|الاسعار|أسعار|اسعار|prices)\s*[:：]?\s*\d+(?:\.\d{1,4})?(?:\s*[,،;]\s*\d+(?:\.\d{1,4})?){0,119}/iu,'')
  .replace(/(?:الإجمالي|الاجمالي|إجمالي|اجمالي|total)\s*[:：]?\s*\d+(?:\.\d{1,2})?/iu,'')
  .replace(/[\s،,;:.!?؟-]/g,'');
 if(remaining)throw new Error('Unrecognized supplier invoice details. Use one PO and explicit labeled dates, quantities, prices and total.');
 return{purchaseOrderNumber:found[0]!,invoiceReference:ref[1]!,
  invoiceDate:dt[1]!,dueDate:due[1]!,quantities,unitPrices,statedTotal:total[1]!};
}
function ledgerSignature(order:LourexDocument,vault:VaultPayload):string{
 return JSON.stringify({
  source:{id:order.id,number:order.number,updatedAt:order.updatedAt,
   supplierId:order.supplierSnapshot?.sourceSupplierId,currency:order.currency,
   items:order.items.map(x=>[x.id,x.quantity,x.unit,x.unitPrice])},
  supplier:vault.suppliers.find(s=>s.id===order.supplierSnapshot?.sourceSupplierId),
  receipts:vault.documentEvents.filter(e=>e.documentId===order.id)
    .map(e=>[e.id,e.type,e.at,e.note,e.relatedDocumentId])
 });
}
function verify(vault:VaultPayload,request:AiSupplierInvoiceMatchRequest){
 const scoped=scopeVault(vault),matches=scoped.documents.filter(x=>x.kind==='purchase-order'&&
   x.number.toUpperCase()===request.purchaseOrderNumber.toUpperCase());
 if(matches.length!==1)throw new Error('Exactly one issued purchase order number in the active company and branch is required.');
 const order=matches[0]!;
 assertGovernancePermission(vault,'match-supplier-invoice');
 assertGoodsReceiptIntegrity(scoped.documents,scoped.documentEvents);
 assertSupplierInvoiceIntegrity(scoped.documents,scoped.documentEvents);
 // Malformed supplier invoice events must not be silently skipped by the
 // legacy helper's flatMap error recovery.
 const raw=scoped.documentEvents.filter(e=>e.documentId===order.id&&e.type==='audit'&&
   e.note.startsWith('@lourex:supplier-invoice:matched:v1:'));
 if(matchedSupplierInvoices(order.id,scoped.documentEvents).length!==raw.length)
   throw new Error('Supplier invoice evidence is corrupted. Reconcile it before another matching.');
 const input:MatchSupplierInvoiceInput={purchaseOrderId:order.id,
  expectedPurchaseOrderUpdatedAt:order.updatedAt,
  invoiceReference:request.invoiceReference,invoiceDate:request.invoiceDate,
  dueDate:request.dueDate,quantities:request.quantities,
  unitPrices:request.unitPrices,statedTotal:request.statedTotal,notes:''};
 // A pure preflight with the established three-way matching engine.
 const proposed=matchSupplierInvoice(scoped,input).invoice;
 return{order,scoped,input,proposed,signature:ledgerSignature(order,scoped)};
}
export function prepareAiSupplierInvoiceMatch(vault:VaultPayload,request:AiSupplierInvoiceMatchRequest):AiSupplierInvoiceMatchReview{
 const v=verify(vault,request),balances=supplierInvoiceLineBalances(v.order,v.scoped.documentEvents);
 return{...request,purchaseOrderId:v.order.id,expectedUpdatedAt:v.order.updatedAt,
  supplierId:v.order.supplierSnapshot?.sourceSupplierId||'',currency:v.order.currency,
  workspaceId:vault.appSettings.activeWorkspaceId||'default',branchId:vault.appSettings.activeBranchId||'main',
  ledgerSignature:v.signature,preview:[
   'Supplier invoice '+v.proposed.invoiceReference+' — Purchase Order '+v.order.number,
   'Supplier: '+(v.order.supplierSnapshot?.nameEn||v.order.supplierSnapshot?.nameAr||'[missing]'),
   'Invoice: '+v.proposed.invoiceDate+' | Due: '+v.proposed.dueDate+' | Currency: '+v.order.currency,
   'All PO lines ('+v.order.items.length+'):',
   ...v.order.items.map((row,i)=>(i+1)+'. '+(row.descriptionEn||row.descriptionAr)+
     ' | Physically received/unbilled '+balances[i]?.availableToMatch+
     ' | Match qty '+request.quantities[i]+' @ '+request.unitPrices[i]+' '+v.order.currency),
   'Supplier bill total: '+v.proposed.total+' '+v.order.currency,
   'APPROVAL: Record three-way vendor bill match ONLY. Do not post accounts payable, payments or inventory.'
  ]};
}
export function applyAiSupplierInvoiceMatchApproval(vault:VaultPayload,review:AiSupplierInvoiceMatchReview):{
 vault:VaultPayload;purchaseOrderId:string;invoiceReference:string;
}{
 if(!review||!review.ledgerSignature||!review.purchaseOrderId||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Supplier invoice approval scope changed. No match recorded.');
 const latest=verify(vault,review);
 if(latest.order.id!==review.purchaseOrderId||latest.order.updatedAt!==review.expectedUpdatedAt||
   latest.order.supplierSnapshot?.sourceSupplierId!==review.supplierId||
   latest.order.currency!==review.currency||latest.signature!==review.ledgerSignature)
  throw new Error('Purchase order, supplier or goods receipt ledger changed. Review and approve again.');
 const recorded=matchSupplierInvoice(vault,latest.input);
 if(recorded.invoice.invoiceReference!==review.invoiceReference||
   recorded.invoice.total!==latest.proposed.total)
  throw new Error('Vendor bill match could not be verified.');
 return{vault:recorded.vault,purchaseOrderId:review.purchaseOrderId,
  invoiceReference:review.invoiceReference};
}
