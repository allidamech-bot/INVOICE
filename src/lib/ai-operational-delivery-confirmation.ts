import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {confirmSalesDelivery,confirmedSalesDeliveries,assertSalesDeliveryIntegrity,
 type ConfirmSalesDeliveryInput} from './sales-delivery-flow.js';
import {assertGovernancePermission} from './governance.js';

export interface AiDeliveryConfirmationReview {
  deliveryNoteId:string;deliveryNoteNumber:string;expectedUpdatedAt:string;
  workspaceId:string;branchId:string;customerId:string;salesOrderNumber:string;
  deliveredDate:string;reference:string;evidenceSignature:string;
  lineCount:number;preview:string[];
}
const digitsAr='٠١٢٣٤٥٦٧٨٩',digitsFa='۰۱۲۳۴۵۶۷۸۹';
function normalized(s:string):string{return String(s||'').normalize('NFKC')
  .replace(/[٠-٩۰-۹]/g,ch=>String(digitsAr.includes(ch)?digitsAr.indexOf(ch):digitsFa.indexOf(ch))).trim();}
export function isAiConfirmPhysicalDeliveryIntent(message:string):boolean{
 const s=normalized(message);
 return s.length>12&&s.length<=700&&
  /^(?:سجّل|سجل|حضّر|حضر|جهّز|جهز|prepare|record|register)\s+(?:(?:تأكيد|اثبات|إثبات)\s+(?:ال)?تسليم|delivery\s+confirmation)(?:\s|$)/iu.test(s);
}
export function parseAiConfirmPhysicalDeliveryRequest(message:string):
 {deliveryNoteNumber:string;reference:string;deliveredDate:string}|null{
 const text=normalized(message);
 if(!isAiConfirmPhysicalDeliveryIntent(text))return null;
 if(/(?:أصدر|اصدر|خصم|اخصم|أخصم|مخزون|المخزون|ترحيل|رحّل|رحل|فاتور[ةه]|دفع|سداد|\b(?:post|deduct|stock|inventory|invoice|issue|pay|finalize)\b)/iu.test(text))
   throw new Error('Delivery confirmation and stock/invoicing cannot execute in one instruction. Review each separately.');
 const references=[...text.matchAll(/\bDN[-_]\d{4}[-_]\d{1,12}\b/giu)].map(m=>m[0]!.toUpperCase());
 if(references.length!==1)return null;
 const ref=text.match(/(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{1,59})/iu);
 const date=text.match(/(?:التاريخ|تاريخ|date)\s*[:：]?\s*(20\d{2}-\d{2}-\d{2})/iu);
 if(!ref||!date)return null;
 // No freeform additions, second actions or unknown quantity commands.
 const leftovers=text.replace(/^(?:سجّل|سجل|حضّر|حضر|جهّز|جهز|prepare|record|register)\s+(?:(?:تأكيد|اثبات|إثبات)\s+(?:ال)?تسليم|delivery\s+confirmation)/iu,'')
  .replace(/(?:لسند|للسند|من\s+(?:السند|سند)|for\s+(?:delivery\s+note\s+)?)?\s*DN[-_]\d{4}[-_]\d{1,12}/iu,'')
  .replace(/(?:المرجع|مرجع|reference|ref)\s*[:：]?\s*[A-Z0-9][A-Z0-9_-]{1,59}/iu,'')
  .replace(/(?:التاريخ|تاريخ|date)\s*[:：]?\s*20\d{2}-\d{2}-\d{2}/iu,'')
  .replace(/[\s،,;:.!?؟-]/g,'');
 if(leftovers)throw new Error('Specify only an exact delivery note, physical reference and date. Separate other operations.');
 return{deliveryNoteNumber:references[0]!,reference:ref[1]!,deliveredDate:date[1]!};
}
function snapshot(document:LourexDocument,vault:VaultPayload):string {
 return JSON.stringify({
   document:{id:document.id,number:document.number,updatedAt:document.updatedAt,
     status:document.status,life:document.lifecycleStatus,customerId:document.customerSnapshot?.sourceCustomerId,
     items:document.items.map(x=>[x.id,x.descriptionEn,x.descriptionAr,x.quantity,x.unit])},
   documents:vault.documents.filter(d=>d.id===document.id||d.id===document.convertedFromId)
     .map(d=>[d.id,d.number,d.updatedAt,d.status]),
   events:vault.documentEvents.map(e=>[e.id,e.documentId,e.type,e.note,e.relatedDocumentId,e.at])
 });
}
function verify(vault:VaultPayload,data:{deliveryNoteNumber:string;reference:string;deliveredDate:string}){
 const scoped=scopeVault(vault);
 const matches=scoped.documents.filter(d=>d.kind==='delivery-note'&&d.number.toUpperCase()===data.deliveryNoteNumber.toUpperCase());
 if(matches.length!==1)throw new Error('A single issued Delivery Note in the active company and branch is required.');
 const doc=matches[0]!;
 if(doc.status!=='final'||doc.lifecycleStatus==='voided')throw new Error('Issue the delivery note first; draft or voided notes cannot prove physical delivery.');
 assertGovernancePermission(vault,'confirm-sales-delivery');
 assertSalesDeliveryIntegrity(scoped.documents,scoped.documentEvents);
 const proofs=scoped.documentEvents.filter(e=>e.documentId===doc.id&&e.type==='audit'&&
   e.note.startsWith('@lourex:sales-order:delivery-confirmed:v1:'));
 if(proofs.length!==confirmedSalesDeliveries(doc.id,scoped.documentEvents).length)
   throw new Error('A malformed confirmation already exists. Reconcile delivery evidence first.');
 const input:ConfirmSalesDeliveryInput={deliveryNoteId:doc.id,
  expectedDeliveryNoteUpdatedAt:doc.updatedAt,deliveredDate:data.deliveredDate,
  reference:data.reference,notes:'',confirmed:true};
 // Existing business validator checks accepted SO, source item identities,
 // remaining quantities, physical reference and date. It has no write side effect.
 const proposed=confirmSalesDelivery(scoped,input).delivery;
 return{scoped,doc,input,proposed,evidence:snapshot(doc,scoped)};
}
export function prepareAiDeliveryConfirmation(vault:VaultPayload,data:{
 deliveryNoteNumber:string;reference:string;deliveredDate:string;
}):AiDeliveryConfirmationReview{
 const {doc,proposed,evidence}=verify(vault,data);
 return{deliveryNoteId:doc.id,deliveryNoteNumber:doc.number,expectedUpdatedAt:doc.updatedAt,
   workspaceId:vault.appSettings.activeWorkspaceId||'default',
   branchId:vault.appSettings.activeBranchId||'main',
   customerId:proposed.customerId,salesOrderNumber:proposed.salesOrderNumber,
   reference:proposed.reference,deliveredDate:proposed.deliveredDate,
   evidenceSignature:evidence,lineCount:proposed.lines.length,
   preview:[
     'Physical Delivery: '+doc.number+' | Sales Order: '+proposed.salesOrderNumber,
     'Customer: '+(doc.customerSnapshot?.companyNameEn||doc.customerSnapshot?.companyNameAr||'[unavailable]'),
     'Physical reference: '+proposed.reference+'; delivery date: '+proposed.deliveredDate,
     'Confirmed items ('+proposed.lines.length+') — complete:',
     ...proposed.lines.map((line,i)=>{
       const item=doc.items.find(x=>x.id===line.deliveryLineId);
       return(i+1)+'. '+(item?.descriptionEn||item?.descriptionAr||'[missing]')+
         ' | Physical delivered quantity: '+line.quantity+' '+line.unit;
     }),
     'APPROVAL: Record delivery confirmation evidence only. Stock deduction, customer invoice and collection require separate review.'
   ]};
}
export function applyAiDeliveryConfirmation(vault:VaultPayload,review:AiDeliveryConfirmationReview):
 {vault:VaultPayload;deliveryNoteId:string;reference:string}{
 if(!review||!review.deliveryNoteId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Workspace or branch changed after delivery confirmation review.');
 const verified=verify(vault,{deliveryNoteNumber:review.deliveryNoteNumber,reference:review.reference,
   deliveredDate:review.deliveredDate});
 if(verified.doc.id!==review.deliveryNoteId||verified.doc.updatedAt!==review.expectedUpdatedAt||
   verified.proposed.customerId!==review.customerId||
   verified.proposed.salesOrderNumber!==review.salesOrderNumber||
   verified.proposed.lines.length!==review.lineCount||
   verified.evidence!==review.evidenceSignature)
   throw new Error('Delivery note or recorded evidence changed. Reopen exact confirmation and approve again.');
 const result=confirmSalesDelivery(vault,verified.input);
 const proofs=confirmedSalesDeliveries(review.deliveryNoteId,result.vault.documentEvents);
 if(proofs.length!==1||proofs[0]!.reference!==review.reference||
   proofs[0]!.deliveredDate!==review.deliveredDate)
   throw new Error('Confirmed delivery proof cannot be validated.');
 return{vault:result.vault,deliveryNoteId:review.deliveryNoteId,reference:review.reference};
}
