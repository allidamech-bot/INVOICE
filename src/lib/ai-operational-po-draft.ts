import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {validateDocument} from './documents.js';
import {createLinkedPurchaseOrderDraft,linkedPurchaseOrders,purchaseOrderSourceEligible} from './procurement-flow.js';
import {assertGovernancePermission} from './governance.js';

/** RFQ -> PO is the existing approved procurement flow, NOT stock posting. */
export interface AiOperationalPoReview{
  sourceId:string;sourceNumber:string;expectedUpdatedAt:string;
  workspaceId:string;branchId:string;supplierId:string;
  currency:string;itemsSignature:string;lineCount:number;preview:string[];
}
const norm=(value:unknown)=>String(value??'').normalize('NFKC').trim();
export function operationalPoDraftRequested(message:string):boolean{
 const m=norm(message);
 return m.length<=450&&/^(?:انشئ|أنشئ|جهز|جهّز|حضّر|حضر|سوي|سوّي|create|prepare|make|draft)\s+/iu.test(m)&&
   /(?:أمر|طلب)\s*(?:ال)?شراء|\bpurchase[\s-]*order\b|\bpo\b/iu.test(m)&&
   !/(?:اعتمد|اصدر|أصدر|رحّل|رحل|ترحيل|استلام|استلم|المخزون|مخزون|اخصم|أخصم|خصم|أضف|اضف|دفع|سدد|\b(?:post|issue|finalize|confirm|receive|receipt|stock|inventory|deduct|pay)\b)/iu.test(m);
}
export function requestedPoRfqNumber(message:string):string|null{
 if(!operationalPoDraftRequested(message))return null;
 const normalized=norm(message).replace(/[٠-٩۰-۹]/g,c=>{
   const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
   return String(ar.includes(c)?ar.indexOf(c):fa.indexOf(c));
 });
 const hits=[...normalized.matchAll(/\bRFQ[-_]\d{4}[-_]\d{1,12}\b/giu)].map(x=>x[0]!.toUpperCase());
 return hits.length===1?hits[0]!:null;
}
const signature=(doc:LourexDocument):string=>JSON.stringify({
 id:doc.id,updatedAt:doc.updatedAt,status:doc.status,life:doc.lifecycleStatus,
 supplierId:doc.supplierSnapshot?.sourceSupplierId,number:doc.number,currency:doc.currency,
 items:doc.items.map(x=>[x.id,x.descriptionEn,x.descriptionAr,x.quantity,x.unit,x.unitPrice])
});
export function prepareOperationalPoFromRfq(vault:VaultPayload,rfqNumber:string):AiOperationalPoReview{
 const scoped=scopeVault(vault),active=vault.appSettings.activeWorkspaceId||'default',
   branch=vault.appSettings.activeBranchId||'main';
 if(!/^RFQ[-_]\d{4}[-_]\d{1,12}$/i.test(rfqNumber))throw new Error('An exact issued RFQ number is required.');
 const matches=scoped.documents.filter(d=>d.kind==='rfq'&&d.number.toUpperCase()===rfqNumber.toUpperCase());
 if(matches.length!==1)throw new Error('This RFQ number was not found uniquely in the active company and branch.');
 const source=matches[0]!;
 if(!purchaseOrderSourceEligible(source)||Object.keys(validateDocument(source)).length)
   throw new Error('An active, complete issued RFQ is required before preparing a purchase order.');
 const supplierId=source.supplierSnapshot?.sourceSupplierId||'';
 if(!supplierId||!scoped.suppliers.some(s=>s.id===supplierId))
   throw new Error('The RFQ must be linked to one registered supplier in the same company and branch.');
 if(!source.items.length||source.items.length>120)
   throw new Error('RFQ line count is unsupported; no lines will be omitted.');
 if(linkedPurchaseOrders(source,scoped.documents,scoped.documentEvents).some(d=>d.lifecycleStatus!=='voided'))
   throw new Error('An active purchase order already exists for this RFQ; duplicate creation is blocked.');
 return{sourceId:source.id,sourceNumber:source.number,expectedUpdatedAt:source.updatedAt,
  workspaceId:active,branchId:branch,supplierId,currency:source.currency,
  itemsSignature:signature(source),lineCount:source.items.length,
  preview:[
   'RFQ: '+source.number,
   'Supplier: '+(scoped.suppliers.find(s=>s.id===supplierId)?.nameEn||scoped.suppliers.find(s=>s.id===supplierId)?.nameAr||supplierId),
   'Currency: '+source.currency,
   'Items ('+source.items.length+') — all rows:',
   ...source.items.map((item,i)=>(i+1)+'. '+(item.descriptionEn||item.descriptionAr||'[missing]')+
     ' | Qty '+item.quantity+' '+item.unit+' | PO price: NOT PROVIDED (review supplier quote first)'),
   'ACTION: Save an unissued PO DRAFT only after separate approval. No receiving, stock posting, payable or supplier invoice.'
  ]};
}
/** Revalidate the exact source on the FRESHEST vault inside one approved mutation. */
export function applyOperationalPoDraftApproval(vault:VaultPayload,batch:AiOperationalPoReview):
 {vault:VaultPayload;document:LourexDocument}{
 if(!batch||!batch.sourceId||!batch.expectedUpdatedAt||!batch.itemsSignature||
    batch.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
    batch.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Company, branch or RFQ approval scope changed; no purchase order was created.');
 // Purchasing, owner or admin may create an operational PO draft. Never infer
 // purchasing permission from merely being able to view a supplier.
 assertGovernancePermission(vault,'approve-supplier-quote');
 const latest=prepareOperationalPoFromRfq(vault,batch.sourceNumber);
 if(latest.sourceId!==batch.sourceId||latest.expectedUpdatedAt!==batch.expectedUpdatedAt||
    latest.itemsSignature!==batch.itemsSignature||latest.supplierId!==batch.supplierId||
    latest.currency!==batch.currency||latest.lineCount!==batch.lineCount)
   throw new Error('RFQ/supplier/lines changed since approval; reopen the complete review.');
 const linked=createLinkedPurchaseOrderDraft(vault,batch.sourceId);
 if(!linked.created||linked.document.kind!=='purchase-order'||linked.document.status!=='draft')
   throw new Error('An approved purchase order draft could not be safely created.');
 return{vault:linked.vault,document:linked.document};
}
