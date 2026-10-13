import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {confirmGoodsReceipt,goodsReceiptBalances,confirmedGoodsReceipts,assertGoodsReceiptIntegrity,type ConfirmGoodsReceiptInput} from './goods-receipt-flow.js';

export interface AiGoodsReceiptReview {
  purchaseOrderId:string;purchaseOrderNumber:string;expectedPurchaseOrderUpdatedAt:string;
  workspaceId:string;branchId:string;supplierId:string;
  reference:string;receivedDate:string;notes:string;quantities:string[];
  evidenceSignature:string;preview:string[];
}
function normalize(s:string):string{
 const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
 return String(s||'').normalize('NFKC')
   .replace(/[٠-٩۰-۹]/g,ch=>String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch))).trim();
}
const startsReceipt=/^(?:جهز|جهّز|حضر|حضّر|سجل|سجّل|prepare|record|register)\s+(?:(?:محضر|سند|إشعار)\s+)?(?:استلام(?:\s+بضاعة)?|goods[\s-]*receipt|grn)(?:\s|$)/iu;
export function isAiGoodsReceiptRequest(message:string):boolean {
 const text=normalize(message);
 return text.length<=800&&startsReceipt.test(text);
}
/** Explicit data is compulsory; physical counts are never inferred from order quantity. */
export function parseAiGoodsReceiptRequest(message:string):{
  purchaseOrderNumber:string;reference:string;receivedDate:string;quantities:string[];
}|null {
 const text=normalize(message);
 if(!isAiGoodsReceiptRequest(text))return null;
 if(/(?:اعتمد|اصدر|أصدر|رحّل|رحل|المخزون|تسوية|دفع|سدد|\b(?:post|issue|finalize|approve|pay|stock|inventory)\b)/iu.test(text))
   throw new Error('Receipt and financial/stock posting cannot be combined in one chat action.');
 const po=[...text.matchAll(/\bPO[-_]\d{4}[-_]\d{1,12}\b/giu)].map(x=>x[0]!.toUpperCase());
 if(po.length!==1)return null;
 const reference=text.match(/(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{1,59})/iu);
 const date=text.match(/(?:التاريخ|تاريخ|date)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})/iu);
 const qty=text.match(/(?:الكميات|كميات|quantities)\s*[:：]?\s*(\d+(?:[.,]\d{1,4})?(?:\s*[,،;]\s*\d+(?:[.,]\d{1,4})?){0,119})/iu);
 if(!reference||!date||!qty)return null;
 const values=qty[1]!.split(/\s*[,،;]\s*/).map(x=>x.trim());
 if(!values.length||values.some(x=>!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(x)))
   throw new Error('Provide each received quantity separately with a dot for decimals and comma between line quantities.');
 const tail=text.slice((qty.index||0)+qty[0].length).trim();
 if(tail&&!/^[.!؟\s]*$/.test(tail))throw new Error('Unexpected extra text after quantities. Split this into separate reviewed actions.');
 return{purchaseOrderNumber:po[0]!,reference:reference[1]!,receivedDate:date[1]!,quantities:values};
}
function sourceSignature(order:LourexDocument,vault:VaultPayload):string{
 const linked=vault.documentEvents.filter(row=>row.documentId===order.id)
  .map(x=>[x.id,x.at,x.type,x.note,x.relatedDocumentId]);
 return JSON.stringify({
  order:{id:order.id,updatedAt:order.updatedAt,number:order.number,status:order.status,
    lifecycleStatus:order.lifecycleStatus,supplierId:order.supplierSnapshot?.sourceSupplierId,
    items:order.items.map(i=>[i.id,i.quantity,i.unit,i.unitPrice])},
  linked
 });
}
function verify(vault:VaultPayload,data:{
  purchaseOrderNumber:string;reference:string;receivedDate:string;quantities:string[];
}):{order:LourexDocument;scoped:VaultPayload;signature:string;input:ConfirmGoodsReceiptInput}{
 const scoped=scopeVault(vault),matches=scoped.documents.filter(row=>row.kind==='purchase-order'&&
  row.number.toUpperCase()===data.purchaseOrderNumber.toUpperCase());
 if(matches.length!==1)throw new Error('Exactly one issued purchase order in the active company and branch is required.');
 const order=matches[0]!;
 if(order.status!=='final'||order.lifecycleStatus==='voided')
  throw new Error('Goods receipt requires a valid issued purchase order, not a draft or voided order.');
 const supplierId=order.supplierSnapshot?.sourceSupplierId||'';
 if(!supplierId||!scoped.suppliers.some(s=>s.id===supplierId))
  throw new Error('Receipt needs the same registered supplier and branch as the purchase order.');
 if(data.quantities.length!==order.items.length)
  throw new Error('One received quantity is required for every PO line, including explicit zero for unreceived lines.');
 assertGovernancePermission(vault,'record-goods-receipt');
 // Reject corrupted or conflicting historical receipts rather than using them
 // as a trustworthy basis for an additional physical receipt.
 assertGoodsReceiptIntegrity(scoped.documents,scoped.documentEvents);
 const evidence=scoped.documentEvents.filter(ev=>ev.documentId===order.id&&ev.type==='audit'&&
   ev.note.startsWith('@lourex:goods-receipt:confirmed:v1:'));
 if(confirmedGoodsReceipts(order.id,scoped.documentEvents).length!==evidence.length)
   throw new Error('Corrupted physical receipt evidence exists for this purchase order; do not add another receipt before reconciliation.');
 const input:ConfirmGoodsReceiptInput={purchaseOrderId:order.id,
   expectedPurchaseOrderUpdatedAt:order.updatedAt,reference:data.reference,
   receivedDate:data.receivedDate,notes:'',quantities:[...data.quantities]};
 // Reuse the existing ledger validator on a pure, unsaved copy, including
 // over-receipt, duplicate references, dates and actor permission.
 confirmGoodsReceipt(scoped,input);
 return{order,scoped,signature:sourceSignature(order,scoped),input};
}
export function prepareAiGoodsReceiptReview(vault:VaultPayload,data:{
 purchaseOrderNumber:string;reference:string;receivedDate:string;quantities:string[];
}):AiGoodsReceiptReview{
 const {order,scoped,signature,input}=verify(vault,data);
 const balances=goodsReceiptBalances(order,scoped.documentEvents);
 return{
  purchaseOrderId:order.id,purchaseOrderNumber:order.number,
  expectedPurchaseOrderUpdatedAt:order.updatedAt,
  workspaceId:vault.appSettings.activeWorkspaceId||'default',
  branchId:vault.appSettings.activeBranchId||'main',
  supplierId:order.supplierSnapshot!.sourceSupplierId,reference:input.reference,
  receivedDate:input.receivedDate,quantities:[...input.quantities],notes:'',
  evidenceSignature:signature,
  preview:[
   'PO: '+order.number+' — '+order.items.length+' line(s)',
   'Supplier: '+(order.supplierSnapshot?.nameEn||order.supplierSnapshot?.nameAr||'[unavailable]'),
   'Goods receipt reference: '+input.reference+'; date: '+input.receivedDate,
   ...order.items.map((line,index)=>(index+1)+'. '+(line.descriptionEn||line.descriptionAr)+
      ' | Ordered: '+line.quantity+' '+line.unit+
      ' | Remaining before: '+(balances[index]?.remaining||'[missing]')+
      ' | To receive: '+input.quantities[index]),
   'APPROVAL: Records a confirmed goods receipt event only. This does NOT post stock, create an AP payable, or issue an invoice.'
  ]
 };
}
/** Called only inside signed, separately approved atomic vault mutation. */
export function applyAiGoodsReceiptApproval(vault:VaultPayload,review:AiGoodsReceiptReview):{
 vault:VaultPayload;receiptReference:string;purchaseOrderId:string;
}{
 if(!review||!review.purchaseOrderId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Company or branch changed; goods receipt was not recorded.');
 const latest=verify(vault,{purchaseOrderNumber:review.purchaseOrderNumber,reference:review.reference,
   receivedDate:review.receivedDate,quantities:review.quantities});
 if(latest.order.id!==review.purchaseOrderId||
   latest.order.updatedAt!==review.expectedPurchaseOrderUpdatedAt||
   latest.order.supplierSnapshot?.sourceSupplierId!==review.supplierId||
   latest.signature!==review.evidenceSignature)
   throw new Error('Purchase order or receipt ledger changed since review. Reopen and approve exact quantities again.');
 const confirmed=confirmGoodsReceipt(vault,latest.input);
 if(!confirmedGoodsReceipts(latest.order.id,confirmed.vault.documentEvents)
   .some(row=>row.reference===review.reference))
   throw new Error('Goods receipt record could not be verified after approval.');
 return{vault:confirmed.vault,receiptReference:confirmed.receipt.reference,purchaseOrderId:latest.order.id};
}
