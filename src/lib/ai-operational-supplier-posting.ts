import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {strictAiActor} from './ai-foundation-approval.js';
import {matchedSupplierInvoices} from './supplier-invoice-flow.js';
import {postMatchedSupplierInvoice,invoicePostingForMatch,assertMatchedSupplierInvoicePostingIntegrity} from './supplier-invoice-posting.js';
import {defaultWarehouseId,warehouseItemQuantity} from './warehouses.js';
import {decimalToScaled} from './money.js';

export interface AiSupplierPostingRequest {
 purchaseOrderNumber:string;invoiceReference:string;warehouseCode:string;skus:string[];
}
export interface AiSupplierPostingReview extends AiSupplierPostingRequest {
 purchaseOrderId:string;matchEventId:string;expectedUpdatedAt:string;
 workspaceId:string;branchId:string;warehouseId:string;savedItemIds:string[];
 supplierId:string;currency:string;total:string;lineCount:number;
 evidenceSignature:string;preview:string[];
}
const matchMarker='@lourex:supplier-invoice:matched:v1:';
const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
const normalize=(s:string)=>String(s||'').normalize('NFKC')
 .replace(/[٠-٩۰-۹]/gu,c=>String(ar.includes(c)?ar.indexOf(c):fa.indexOf(c))).trim();
const beginning='(?:جهز|جهّز|حضّر|حضر|رحّل|رحل|prepare|review|post)';
const subject='(?:ترحيل\\s+)?(?:فاتورة\\s+(?:ال)?مورد|supplier\\s+(?:invoice|bill)(?:\\s+posting)?|vendor\\s+bill(?:\\s+posting)?)';
export function isAiSupplierPostingIntent(message:string):boolean{
 const s=normalize(message);
 return s.length<=1100&&new RegExp('^'+beginning+'\\s+'+subject+'(?:\\s|$)','iu').test(s);
}
export function parseAiSupplierPosting(message:string):AiSupplierPostingRequest|null{
 const s=normalize(message);
 if(!isAiSupplierPostingIntent(s))return null;
 // Fully anchored: a bundled payment/approval or an extra PO cannot be ignored.
 const pattern=new RegExp('^'+beginning+'\\s+'+subject+
  '\\s+(?:(?:لأمر|لامر|أمر)\\s+الشراء\\s+|for\\s+(?:purchase\\s+order\\s+)?)?'+
  '(PO[-_]\\d{4}[-_]\\d{1,12})\\s*[,،;]?\\s+'+
  '(?:المرجع|مرجع|reference|ref)\\s*[:：]?\\s*([A-Z0-9][A-Z0-9_-]{1,59})\\s*[,،;]?\\s+'+
  '(?:المستودع|مستودع|warehouse)\\s*[:：]?\\s*([A-Z0-9_-]{2,24})\\s*[,،;]?\\s+'+
  '(?:الأصناف|الاصناف|أصناف|اصناف|skus|items)\\s*[:：]?\\s*'+
  '([A-Z0-9_-]+(?:\\s*[,،;]\\s*[A-Z0-9_-]+){0,119})\\s*[.!؟]?$', 'iu');
 const m=s.match(pattern);
 if(!m)return null;
 const skus=m[4]!.split(/\s*[,،;]\s*/).map(x=>x.toUpperCase());
 if(new Set(skus).size!==skus.length)throw new Error('Every matched supplier bill line needs a distinct SKU.');
 return{purchaseOrderNumber:m[1]!.toUpperCase(),invoiceReference:m[2]!.toUpperCase(),
  warehouseCode:m[3]!.toUpperCase(),skus};
}
function name(value:string):string{return String(value||'').normalize('NFKC')
 .replace(/[\u064b-\u065f\u0670]/gu,'').replace(/\s+/gu,' ').trim().toLowerCase();}
function qty(value:bigint):string{
 const neg=value<0n,abs=neg?-value:value;
 return(neg?'-':'')+String(abs/10000n)+(abs%10000n?'.'+String(abs%10000n).padStart(4,'0').replace(/0+$/,''):'');
}
function ledgerSignature(v:VaultPayload,order:LourexDocument,eventId:string,ids:string[]):string{
 return JSON.stringify({
  order,invoiceEvent:v.documentEvents.find(e=>e.id===eventId),
  allSupplierInvoiceEvents:v.documentEvents.filter(e=>e.note.startsWith(matchMarker)||e.note.startsWith('@lourex:supplier-invoice:purchase-posted:v1:')),
  supplier:v.suppliers.find(s=>s.id===order.supplierSnapshot?.sourceSupplierId),
  items:ids.map(id=>v.savedItems.find(item=>item.id===id)),
  allPurchases:v.purchases.map(p=>[p.id,p.number,p.status,p.sourceSupplierInvoiceEventId,p.sourcePurchaseOrderId,p.updatedAt]),
  inventory:v.inventoryMovements.map(m=>[m.id,m.itemId,m.type,m.quantity,m.date,m.sourceId,m.fromWarehouseId,m.toWarehouseId]),
  policy:v.approvalPolicies.find(p=>p.action==='post-purchase'),
  approvals:v.approvalRequests.filter(a=>a.action==='post-purchase'),
 });
}
function verify(vault:VaultPayload,input:AiSupplierPostingRequest){
 assertGovernancePermission(vault,'post-purchase');
 if(!['owner','admin'].includes(strictAiActor(vault).role))
  throw new Error('Controller vendor bill posting requires an owner or admin. Finance and purchasing cannot sign this combined stock/payable action.');
 const scoped=scopeVault(vault);
 assertMatchedSupplierInvoicePostingIntegrity(scoped);
 const matches=scoped.documents.filter(d=>d.kind==='purchase-order'&&d.number.toUpperCase()===input.purchaseOrderNumber);
 if(matches.length!==1)throw new Error('Select one exact issued purchase order in the active company and branch.');
 const order=matches[0]!;
 if(order.status!=='final'||order.lifecycleStatus==='voided')
  throw new Error('Supplier bill posting requires an active issued Purchase Order.');
 const billEvents=scoped.documentEvents.filter(e=>e.documentId===order.id&&e.type==='audit'&&e.note.startsWith(matchMarker))
  .filter(e=>matchedSupplierInvoices(order.id,[e])[0]?.invoiceReference.toUpperCase()===input.invoiceReference);
 if(billEvents.length!==1)throw new Error('Select one exact, previously approved matched supplier bill reference.');
 const event=billEvents[0]!,invoice=matchedSupplierInvoices(order.id,[event])[0]!;
 if(invoicePostingForMatch(event.id,scoped.documentEvents))
  throw new Error('This matched supplier bill was already posted to stock and payables.');
 if(invoice.lines.length!==input.skus.length)
  throw new Error('Supply one SKU for EACH matched supplier invoice line, in exact line order.');
 const workspaceId=vault.appSettings.activeWorkspaceId||'default',branchId=vault.appSettings.activeBranchId||'main';
 const defaultId=defaultWarehouseId(branchId);
 const warehouse=scoped.warehouses.find(w=>w.id===defaultId&&w.active&&
  w.workspaceId===workspaceId&&w.branchId===branchId&&w.code.toUpperCase()===input.warehouseCode);
 if(!warehouse)throw new Error('Existing purchase posting records stock in the branch PRIMARY warehouse. Specify its exact active code; other warehouses are not supported for this posting.');
 const seen=new Set<string>();
 const items=invoice.lines.map((line,i)=>{
  const found=scoped.savedItems.filter(item=>!item.archived&&item.sku?.toUpperCase()===input.skus[i]);
  if(found.length!==1||seen.has(found[0]!.id))
   throw new Error('Each invoice line needs exactly one unique active catalog SKU in this branch.');
  const item=found[0]!,poLine=order.items.find(x=>x.id===line.purchaseOrderLineId);
  if(!poLine||item.unit.trim().toLowerCase()!==line.unit.trim().toLowerCase())
   throw new Error('Invoice SKU unit or source purchase line does not match.');
  const pairs:[[string,string],[string,string]]=[[poLine.descriptionEn,item.descriptionEn],[poLine.descriptionAr,item.descriptionAr]];
  const comparable=pairs.filter(([a,b])=>name(a)!==''&&name(b)!=='');
  if(!comparable.length||!comparable.every(([a,b])=>name(a)===name(b)))
   throw new Error('Mapped SKU describes a different product from the matched purchase order line.');
  const alternatives=scoped.savedItems.filter(candidate=>!candidate.archived&&
   candidate.unit.trim().toLowerCase()===line.unit.trim().toLowerCase()&&
   comparable.every(([a],index)=>index===0?(!name(poLine.descriptionEn)||name(candidate.descriptionEn)===name(poLine.descriptionEn)):(!name(poLine.descriptionAr)||name(candidate.descriptionAr)===name(poLine.descriptionAr))));
  if(alternatives.length!==1||alternatives[0]!.id!==item.id)
   throw new Error('Ambiguous catalog products share this supplier invoice line identity; resolve duplicates before posting.');
  seen.add(item.id);return item;
 });
 const savedItemIds=items.map(x=>x.id);
 const command={purchaseOrderId:order.id,matchEventId:event.id,
  expectedPurchaseOrderUpdatedAt:order.updatedAt,savedItemIds,confirmed:true};
 // Simulate the established posting engine against a SCOPED vault. No original
 // records change in preview; the configured legacy approval policy is retained.
 const previewResult=postMatchedSupplierInvoice(scoped,command);
 if(!previewResult.posted&&!previewResult.approvalPending)
  throw new Error('Vendor bill posting could not be preflighted.');
 return{scoped,order,invoice,event,items,savedItemIds,warehouse,workspaceId,branchId,
  signature:ledgerSignature(scoped,order,event.id,savedItemIds),previewResult,command};
}
export function prepareAiSupplierPosting(vault:VaultPayload,input:AiSupplierPostingRequest):AiSupplierPostingReview{
 const v=verify(vault,input);
 const details=v.invoice.lines.map((line,i)=>{
  const item=v.items[i]!,before=warehouseItemQuantity(item.id,v.warehouse.id,v.scoped.inventoryMovements,v.warehouse.id);
  return (i+1)+'. '+(item.descriptionEn||item.descriptionAr)+' ['+item.sku+']'+
   ' | Received and matched '+line.quantity+' '+line.unit+
   ' | Stock '+qty(before)+' → '+qty(before+decimalToScaled(line.quantity,4));
 });
 return{...input,purchaseOrderId:v.order.id,matchEventId:v.event.id,
  expectedUpdatedAt:v.order.updatedAt,workspaceId:v.workspaceId,branchId:v.branchId,
  warehouseId:v.warehouse.id,savedItemIds:v.savedItemIds,
  supplierId:v.invoice.supplierId,currency:v.invoice.currency,total:v.invoice.total,
  lineCount:details.length,evidenceSignature:v.signature,
  preview:['POST MATCHED SUPPLIER BILL — '+input.invoiceReference+' / '+v.order.number,
   'Supplier: '+(v.order.supplierSnapshot?.nameEn||v.order.supplierSnapshot?.nameAr||'[missing]'),
   'Stock warehouse: '+v.warehouse.code+' (branch primary location ONLY)',
   'Every matched line ('+details.length+'):',...details,
   'ACCOUNTS PAYABLE: +'+v.invoice.total+' '+v.invoice.currency+' (one new posted purchase). No cash payment.',
   'INVENTORY: +'+details.length+' receipt movements; product last purchase costs may update.',
   v.previewResult.approvalPending?'Existing purchase approval policy is ENABLED: posting also needs its own approval request.':
    'Existing purchase approval policy is disabled: the distinct signed Controller approval authorizes posting.',
   'APPROVAL: Post this exact matched invoice ONCE to the existing purchase and inventory ledgers. No RFQ, PO, GRN or supplier payment is created.']};
}
export function applyAiSupplierPosting(vault:VaultPayload,review:AiSupplierPostingReview):{
 vault:VaultPayload;posted:boolean;purchaseId:string;approvalPending:boolean;
}{
 if(!review?.purchaseOrderId||!review.evidenceSignature||
  review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
  review.branchId!==(vault.appSettings.activeBranchId||'main'))
  throw new Error('Supplier invoice posting approval scope changed; no stock or payable was posted.');
 const v=verify(vault,{purchaseOrderNumber:review.purchaseOrderNumber,
  invoiceReference:review.invoiceReference,warehouseCode:review.warehouseCode,skus:review.skus});
 if(v.order.id!==review.purchaseOrderId||v.order.updatedAt!==review.expectedUpdatedAt||
  v.event.id!==review.matchEventId||v.warehouse.id!==review.warehouseId||
  v.invoice.supplierId!==review.supplierId||v.invoice.currency!==review.currency||
  v.invoice.total!==review.total||v.invoice.lines.length!==review.lineCount||
  v.savedItemIds.join('|')!==review.savedItemIds.join('|')||
  v.signature!==review.evidenceSignature)
  throw new Error('Supplier invoice, stock, approvals or purchase ledger changed. Review and sign again.');
 const output=postMatchedSupplierInvoice(vault,v.command);
 if(output.approvalPending)return{vault:output.vault,posted:false,purchaseId:'',approvalPending:true};
 if(!output.posted||!output.purchase||output.purchase.sourceSupplierInvoiceEventId!==review.matchEventId||
  output.purchase.sourcePurchaseOrderId!==review.purchaseOrderId||
  output.purchase.currency!==review.currency||output.purchase.items.length!==review.lineCount)
  throw new Error('Exact supplier invoice posting was not fully verified.');
 assertMatchedSupplierInvoicePostingIntegrity(output.vault);
 return{vault:output.vault,posted:true,purchaseId:output.purchase.id,approvalPending:false};
}
