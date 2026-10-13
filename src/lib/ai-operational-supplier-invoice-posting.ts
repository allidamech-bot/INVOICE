import type {VaultPayload} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {matchedSupplierInvoices} from './supplier-invoice-flow.js';
import {postMatchedSupplierInvoice,invoicePostingForMatch,assertMatchedSupplierInvoicePostingIntegrity} from './supplier-invoice-posting.js';
import {inventoryBalances} from './operations.js';
import {decimalToScaled} from './money.js';

/** Posting is deliberately separate from matching the bill and paying the supplier. */
export interface AiMatchedBillPostingRequest{
  purchaseOrderNumber:string;
  invoiceReference:string;
  skus:string[];
}
export interface AiMatchedBillPostingReview extends AiMatchedBillPostingRequest{
  purchaseOrderId:string;
  matchEventId:string;
  supplierId:string;
  currency:string;
  invoiceTotal:string;
  expectedPurchaseOrderUpdatedAt:string;
  savedItemIds:string[];
  workspaceId:string;
  branchId:string;
  ledgerSignature:string;
  preview:string[];
}
const MATCH_MARKER='@lourex:supplier-invoice:matched:v1:';
const AR='٠١٢٣٤٥٦٧٨٩',FA='۰۱۲۳۴۵۶۷۸۹';
function normalize(value:string):string{
  return String(value||'').normalize('NFKC').replace(/[٠-٩۰-۹]/gu,c=>
    String(AR.includes(c)?AR.indexOf(c):FA.indexOf(c))).trim();
}
export function isAiMatchedBillPostingIntent(message:string):boolean{
  return /^(?:رحّل|رحل|post)\s+(?:فاتورة\s+(?:ال)?مورد(?:\s+المطابقة)?|matched\s+(?:supplier|vendor)\s+(?:invoice|bill))\s+/iu
    .test(normalize(message));
}
export function parseAiMatchedBillPosting(message:string):AiMatchedBillPostingRequest|null{
  const value=normalize(message);
  if(!isAiMatchedBillPostingIntent(value)||value.length>2200)return null;
  const prefix=/^(?:رحّل|رحل|post)\s+(?:فاتورة\s+(?:ال)?مورد(?:\s+المطابقة)?|matched\s+(?:supplier|vendor)\s+(?:invoice|bill))\s+(?:لأمر\s+الشراء|لامر\s+الشراء|for)\s+/iu;
  const tail=value.replace(prefix,'');
  if(tail===value)return null;
  const found=tail.match(/^(PO-[A-Z0-9][A-Z0-9_-]{3,79})\s*[,،;]\s*(?:مرجع(?:\s+الفاتورة)?|المرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{1,59})\s*[,،;]\s*(?:أكواد\s+SKU\s+بالترتيب|رموز\s+SKU\s+بالترتيب|SKUs(?:\s+in\s+order)?)\s*[:：]?\s*([A-Z0-9_-]+(?:\s*[,،;]\s*[A-Z0-9_-]+){0,119})\s*$/iu);
  if(!found)return null; // Also blocks any second instruction, payment or implicit inventory mapping.
  const skus=found[3]!.split(/\s*[,،;]\s*/).map(s=>s.toUpperCase());
  if(!skus.length||skus.length>120||new Set(skus).size!==skus.length)return null;
  return{purchaseOrderNumber:found[1]!.toUpperCase(),invoiceReference:found[2]!.toUpperCase(),skus};
}
function qty(value:string):bigint{return decimalToScaled(value,4);}
function formatQty(value:bigint):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value;
  return (sign+(abs/10000n).toString()+'.'+(abs%10000n).toString().padStart(4,'0'))
    .replace(/\.?0+$/,'');
}
function inspect(vault:VaultPayload,request:AiMatchedBillPostingRequest){
  if(!request||!Array.isArray(request.skus)||!request.skus.length||request.skus.length>120)
    throw new Error('Explicit, complete, line-ordered SKUs are required for supplier invoice posting.');
  const scoped=scopeVault(vault);
  assertGovernancePermission(vault,'post-purchase');
  assertMatchedSupplierInvoicePostingIntegrity(scoped);
  const orders=scoped.documents.filter(d=>d.kind==='purchase-order'&&
    d.number.toUpperCase()===request.purchaseOrderNumber.toUpperCase());
  if(orders.length!==1)throw new Error('Select exactly one purchase order in the active company and branch.');
  const order=orders[0]!;
  const matched=scoped.documentEvents.filter(e=>e.documentId===order.id&&e.type==='audit'&&
    e.note.startsWith(MATCH_MARKER));
  // A broken match must not be skipped by the legacy flatMap error recovery.
  if(matchedSupplierInvoices(order.id,scoped.documentEvents).length!==matched.length)
    throw new Error('Supplier invoice matching evidence is corrupt. No posting allowed.');
  const events=matched.filter(event=>{
    try{return String(JSON.parse(event.note.slice(MATCH_MARKER.length))?.invoiceReference||'').toUpperCase()===
      request.invoiceReference.toUpperCase();}catch{return false;}
  });
  if(events.length!==1)throw new Error('Exactly one previously matched supplier invoice reference is required.');
  const sourceEvent=events[0]!;
  const invoice=matchedSupplierInvoices(order.id,[sourceEvent])[0];
  if(!invoice||invoice.lines.length!==request.skus.length)
    throw new Error('Every matched invoice line needs one explicit SKU, in the original line order.');
  const seen=new Set<string>();
  const items=request.skus.map(raw=>{
    const sku=normalize(raw).toUpperCase();
    if(!/^[A-Z0-9_-]{1,80}$/.test(sku)||seen.has(sku))
      throw new Error('SKU mappings must be exact, valid and unique.');
    seen.add(sku);
    const found=scoped.savedItems.filter(item=>String(item.sku||'').trim().toUpperCase()===sku&&!item.archived);
    if(found.length!==1)throw new Error('SKU '+sku+' must identify exactly one active catalog item.');
    return found[0]!;
  });
  const savedItemIds=items.map(i=>i.id);
  const postInput={purchaseOrderId:order.id,matchEventId:sourceEvent.id,
    expectedPurchaseOrderUpdatedAt:order.updatedAt,savedItemIds,confirmed:true};
  // Pure established posting engine checks PO/GRN, prices, units, duplicates,
  // governance, stock movements, and that one liability equals the matched total.
  // Its speculative result is NEVER persisted during preparation.
  const dryRun=postMatchedSupplierInvoice(vault,postInput);
  const current=inventoryBalances(scoped.savedItems,scoped.inventoryMovements);
  const lines=invoice.lines.map((line,i)=>{
    const product=items[i]!,before=current.find(b=>b.item.id===product.id)?.quantity||'0';
    return (i+1)+'. '+product.sku+' / '+(product.descriptionEn||product.descriptionAr)+
      ' | '+line.quantity+' '+line.unit+' @ '+line.unitPrice+' '+invoice.currency+
      ' | Stock: '+before+' -> '+formatQty(qty(before)+qty(line.quantity));
  });
  const signature=JSON.stringify({
    order,sourceEvent,invoice,matchEvents:matched,
    documentEvents:scoped.documentEvents.filter(e=>e.documentId===order.id),
    purchases:scoped.purchases,inventoryMovements:scoped.inventoryMovements,
    supplierPayments:scoped.supplierPayments,items,
    supplier:scoped.suppliers.find(s=>s.id===invoice.supplierId),
    approvalPolicies:scoped.approvalPolicies,approvalRequests:scoped.approvalRequests
  });
  return{scoped,order,sourceEvent,invoice,items,savedItemIds,postInput,dryRun,signature,lines};
}
export function prepareAiMatchedBillPosting(vault:VaultPayload,request:AiMatchedBillPostingRequest):AiMatchedBillPostingReview{
  const check=inspect(vault,request);
  return{...request,skus:request.skus.map(x=>x.toUpperCase()),
    purchaseOrderId:check.order.id,matchEventId:check.sourceEvent.id,
    supplierId:check.invoice.supplierId,currency:check.invoice.currency,invoiceTotal:check.invoice.total,
    expectedPurchaseOrderUpdatedAt:check.order.updatedAt,savedItemIds:check.savedItemIds,
    workspaceId:vault.appSettings.activeWorkspaceId||'default',
    branchId:vault.appSettings.activeBranchId||'main',
    ledgerSignature:check.signature,preview:[
      'POST MATCHED SUPPLIER BILL — '+check.invoice.invoiceReference+
        ' | PO '+check.order.number,
      'Supplier: '+(check.order.supplierSnapshot?.nameEn||check.order.supplierSnapshot?.nameAr||'[missing]'),
      'Invoice date '+check.invoice.invoiceDate+' | Due '+check.invoice.dueDate+
        ' | Currency '+check.invoice.currency,
      'Line-by-line inventory impacts ('+check.lines.length+'):',
      ...check.lines,
      'NEW accounts payable: +'+check.invoice.total+' '+check.invoice.currency+
        ' (separate from existing supplier liabilities)',
      'Payments: 0. No supplier settlement will be made.',
      check.dryRun.approvalPending
        ?'Additional post-purchase governance approval is enabled; the next approval may create only a pending governance request.'
        :'APPROVAL: posts one purchase, exact stock receipts and one payable; never creates a payment.',
      'Matching this bill alone never authorized posting. Review every mapped SKU before approval.'
    ]};
}
export function applyAiMatchedBillPosting(vault:VaultPayload,review:AiMatchedBillPostingReview):
 {vault:VaultPayload;posted:boolean;approvalPending:boolean;purchaseId:string}{
  if(!review?.ledgerSignature||!review.purchaseOrderId||!review.matchEventId||
    review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
    review.branchId!==(vault.appSettings.activeBranchId||'main'))
    throw new Error('Company, branch or supplier posting approval scope changed.');
  const latest=inspect(vault,review);
  if(latest.signature!==review.ledgerSignature||latest.order.id!==review.purchaseOrderId||
    latest.order.updatedAt!==review.expectedPurchaseOrderUpdatedAt||
    latest.sourceEvent.id!==review.matchEventId||
    latest.invoice.supplierId!==review.supplierId||latest.invoice.currency!==review.currency||
    latest.invoice.total!==review.invoiceTotal||
    latest.savedItemIds.length!==review.savedItemIds.length||
    latest.savedItemIds.some((id,i)=>id!==review.savedItemIds[i])||
    latest.items.some((item,i)=>String(item.sku||'').toUpperCase()!==review.skus[i]?.toUpperCase()))
    throw new Error('Supplier invoice, mappings or ledger changed. Review and approve again.');
  const result=postMatchedSupplierInvoice(vault,latest.postInput);
  if(result.posted){
    const evidence=invoicePostingForMatch(review.matchEventId,result.vault.documentEvents);
    if(!evidence||!result.purchase||evidence.purchaseId!==result.purchase.id||
      evidence.lineTotal!==review.invoiceTotal||evidence.currency!==review.currency)
      throw new Error('Posted supplier purchase and payable evidence could not be verified.');
  }else if(!result.approvalPending){
    throw new Error('Supplier invoice was neither posted nor queued for governance approval.');
  }
  return{vault:result.vault,posted:result.posted,approvalPending:result.approvalPending,
    purchaseId:result.purchase?.id||'purchase-from-'+review.matchEventId};
}
