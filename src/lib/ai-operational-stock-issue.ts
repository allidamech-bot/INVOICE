import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {confirmedSalesDeliveries} from './sales-delivery-flow.js';
import {postSalesDeliveryStock,salesDeliveryStockIssues} from './sales-delivery-stock.js';
import {defaultWarehouseId,warehouseItemQuantity} from './warehouses.js';
import {decimalToScaled} from './money.js';

export interface AiSalesStockIssueReview {
 deliveryNoteId:string;deliveryNoteNumber:string;expectedUpdatedAt:string;
 workspaceId:string;branchId:string;warehouseId:string;warehouseCode:string;
 savedItemIds:string[];skus:string[];lineCount:number;
 evidenceSignature:string;preview:string[];
}
const arDigits='٠١٢٣٤٥٦٧٨٩',faDigits='۰۱۲۳۴۵۶۷۸۹';
function normalize(value:string):string{return String(value||'').normalize('NFKC')
 .replace(/[٠-٩۰-۹]/g,ch=>String(arDigits.includes(ch)?arDigits.indexOf(ch):faDigits.indexOf(ch))).trim();}
export function isAiStockIssueIntent(message:string):boolean{
 const s=normalize(message);
 return s.length<=850&&/^(?:جهز|جهّز|حضّر|حضر|prepare)\s+(?:(?:صرف\s+(?:ال)?مخزون)|(?:stock\s+issue))(?:\s|$)/iu.test(s);
}
export function parseAiStockIssueRequest(message:string):{
 deliveryNoteNumber:string;warehouseCode:string;skus:string[];
}|null{
 const s=normalize(message);
 if(!isAiStockIssueIntent(s))return null;
 if(/(?:فاتور[ةه]|دفع|سداد|تحصيل|اصدر|أصدر|اعتمد|وافق|رحل|رحّل|تأكيد|أكد|اكّد|\b(?:invoice|payment|approve|issue\s+invoice|confirm|pay|collect)\b)/iu.test(s))
  throw new Error('Inventory deduction cannot be bundled with document issuance, delivery confirmation or payment.');
 const refs=[...s.matchAll(/\bDN[-_]\d{4}[-_]\d{1,12}\b/giu)].map(x=>x[0]!.toUpperCase());
 const wh=s.match(/(?:المستودع|مستودع|warehouse)\s*[:：]?\s*([A-Z0-9_-]{2,24})/iu);
 const list=s.match(/(?:الأصناف|اصناف|أصناف|skus|items)\s*[:：]?\s*([A-Z0-9_-]+(?:\s*[,،;]\s*[A-Z0-9_-]+){0,119})/iu);
 if(refs.length!==1||!wh||!list)return null;
 const skus=list[1]!.split(/\s*[,،;]\s*/).map(x=>x.toUpperCase());
 if(!skus.length||new Set(skus).size!==skus.length)throw new Error('Select one distinct SKU for every confirmed DN line.');
 const leftover=s.replace(/^(?:جهز|جهّز|حضّر|حضر|prepare)\s+(?:(?:صرف\s+(?:ال)?مخزون)|(?:stock\s+issue))/iu,'')
  .replace(/(?:(?:لسند|للسند|من\s+(?:سند|السند))\s*(?:ال)?تسليم\s*|(?:لسند|للسند)\s*|for\s+(?:delivery\s+note\s+)?)?\s*DN[-_]\d{4}[-_]\d{1,12}/iu,'')
  .replace(/(?:المستودع|مستودع|warehouse)\s*[:：]?\s*[A-Z0-9_-]{2,24}/iu,'')
  .replace(/(?:الأصناف|اصناف|أصناف|skus|items)\s*[:：]?\s*[A-Z0-9_-]+(?:\s*[,،;]\s*[A-Z0-9_-]+){0,119}/iu,'')
  .replace(/[\s،,;:.!?؟-]/g,'');
 if(leftover)throw new Error('Unexpected additional stock instruction. Specify only one DN, warehouse and exact SKU list.');
 return{deliveryNoteNumber:refs[0]!,warehouseCode:wh[1]!.toUpperCase(),skus};
}
function signature(vault:VaultPayload,delivery:LourexDocument,warehouseId:string,ids:string[]):string{
 return JSON.stringify({
  delivery:{id:delivery.id,number:delivery.number,updatedAt:delivery.updatedAt,
   status:delivery.status,life:delivery.lifecycleStatus,
   items:delivery.items.map(x=>[x.id,x.quantity,x.unit,x.descriptionEn,x.descriptionAr])},
  warehouse:vault.warehouses.find(x=>x.id===warehouseId),
  savedItems:ids.map(id=>vault.savedItems.find(x=>x.id===id)),
  ledger:vault.inventoryMovements.map(x=>[x.id,x.itemId,x.type,x.quantity,x.date,
   x.fromWarehouseId,x.toWarehouseId,x.sourceId,x.sourceNumber,x.note]),
  events:vault.documentEvents.map(x=>[x.id,x.documentId,x.type,x.note,x.at])
 });
}
function verify(vault:VaultPayload,input:{deliveryNoteNumber:string;warehouseCode:string;skus:string[]}){
 const scoped=scopeVault(vault),workspaceId=vault.appSettings.activeWorkspaceId||'default',
  branchId=vault.appSettings.activeBranchId||'main';
 assertGovernancePermission(vault,'issue-sales-stock');
 const docs=scoped.documents.filter(d=>d.kind==='delivery-note'&&
  d.number.toUpperCase()===input.deliveryNoteNumber.toUpperCase());
 if(docs.length!==1)throw new Error('Select exactly one issued delivery note from the active company and branch.');
 const delivery=docs[0]!;
 if(delivery.status!=='final'||delivery.lifecycleStatus==='voided')
  throw new Error('Stock may only be issued from an active, issued and physically confirmed delivery note.');
 const proofs=confirmedSalesDeliveries(delivery.id,scoped.documentEvents);
 if(proofs.length!==1)throw new Error('One valid physical delivery confirmation is required before stock deduction.');
 if(salesDeliveryStockIssues(delivery.id,scoped.inventoryMovements).length)
  throw new Error('The delivery already has stock issue evidence; duplicate deduction is blocked.');
 if(proofs[0]!.lines.length!==input.skus.length)
  throw new Error('Provide exactly one SKU in confirmed delivery-line order; do not omit any item.');
 const warehouses=scoped.warehouses.filter(w=>w.code.toUpperCase()===input.warehouseCode.toUpperCase()&&
  w.workspaceId===workspaceId&&w.branchId===branchId&&w.active);
 if(warehouses.length!==1)throw new Error('Choose one active warehouse code in this company and branch.');
 const warehouse=warehouses[0]!,seen=new Set<string>();
 const items=input.skus.map((sku,i)=>{
  const match=scoped.savedItems.filter(row=>!row.archived&&row.sku?.toUpperCase()===sku);
  if(match.length!==1||seen.has(match[0]!.id))
   throw new Error('SKU '+sku+' is missing, duplicated or ambiguous in this company and branch.');
  const item=match[0]!;seen.add(item.id);
  const line=delivery.items.find(row=>row.id===proofs[0]!.lines[i]?.deliveryLineId);
  if(!line||item.unit.trim().toLowerCase()!==line.unit.trim().toLowerCase())
   throw new Error('SKU '+sku+' has no matching confirmed delivery line/unit.');
  return item;
 });
 const command={deliveryNoteId:delivery.id,expectedDeliveryNoteUpdatedAt:delivery.updatedAt,
  warehouseId:warehouse.id,savedItemIds:items.map(x=>x.id),confirmed:true};
 const proposed=postSalesDeliveryStock(scoped,command);
 if(!proposed.created)throw new Error('Stock issue already exists. Reopen recorded movements.');
 return{scoped,delivery,warehouse,items,command,proof:proofs[0]!,
  evidence:signature(scoped,delivery,warehouse.id,command.savedItemIds),workspaceId,branchId};
}
export function prepareAiSalesStockIssue(vault:VaultPayload,input:{
 deliveryNoteNumber:string;warehouseCode:string;skus:string[];
}):AiSalesStockIssueReview{
 const v=verify(vault,input);
 const defaultId=defaultWarehouseId(v.branchId);
 const lines=v.proof.lines.map((line,i)=>{
  const item=v.items[i]!;
  const before=warehouseItemQuantity(item.id,v.warehouse.id,v.scoped.inventoryMovements,defaultId);
  const after=before-decimalToScaled(line.quantity,4);
  const format=(raw:bigint)=>{const abs=raw<0n?-raw:raw;return(raw<0n?'-':'')+
   String(abs/10000n)+(abs%10000n?'.'+String(abs%10000n).padStart(4,'0').replace(/0+$/,''):'');};
  return(i+1)+'. '+(item.descriptionEn||item.descriptionAr)+' ['+item.sku+']'+
    ' | Confirmed: '+line.quantity+' '+line.unit+
    ' | Stock: '+format(before)+' → '+format(after);
 });
 return{deliveryNoteId:v.delivery.id,deliveryNoteNumber:v.delivery.number,
  expectedUpdatedAt:v.delivery.updatedAt,workspaceId:v.workspaceId,branchId:v.branchId,
  warehouseId:v.warehouse.id,warehouseCode:v.warehouse.code,skus:input.skus,
  savedItemIds:v.command.savedItemIds,lineCount:lines.length,evidenceSignature:v.evidence,
  preview:['Confirmed delivery: '+v.delivery.number,
   'Warehouse: '+v.warehouse.code+' — '+v.warehouse.name,
   'Line-by-line issue ('+lines.length+') — no lines omitted:',
   ...lines,
   'APPROVAL: DEDUCT the verified warehouse inventory for every confirmed line. No invoice, payment or supplier receipt will be created.']
 };
}
export function applyAiSalesStockIssue(vault:VaultPayload,review:AiSalesStockIssueReview):
 {vault:VaultPayload;deliveryNoteId:string}{
 if(!review||!review.deliveryNoteId||!review.evidenceSignature||
  review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
  review.branchId!==(vault.appSettings.activeBranchId||'main'))
  throw new Error('Company or branch changed; stock was not deducted.');
 const latest=verify(vault,{deliveryNoteNumber:review.deliveryNoteNumber,
  warehouseCode:review.warehouseCode,skus:review.skus});
 if(latest.delivery.id!==review.deliveryNoteId||
    latest.delivery.updatedAt!==review.expectedUpdatedAt||
    latest.warehouse.id!==review.warehouseId||
    latest.command.savedItemIds.join('|')!==review.savedItemIds.join('|')||
    latest.proof.lines.length!==review.lineCount||
    latest.evidence!==review.evidenceSignature)
  throw new Error('Stock, warehouse or confirmed delivery changed. Review all quantities again.');
 const out=postSalesDeliveryStock(vault,latest.command);
 if(!out.created||salesDeliveryStockIssues(review.deliveryNoteId,out.vault.inventoryMovements).length!==review.lineCount)
  throw new Error('Stock issue was not fully recorded as one validated operation.');
 return{vault:out.vault,deliveryNoteId:review.deliveryNoteId};
}
