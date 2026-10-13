import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {confirmedSalesDeliveries} from './sales-delivery-flow.js';
import {createConfirmedDeliveryInvoiceDraft,linkedDeliveryInvoice,assertDeliveryInvoiceIntegrity} from './sales-delivery-invoice.js';

export interface AiConfirmedDeliveryInvoiceReview{
 deliveryNoteId:string;deliveryNoteNumber:string;deliveryUpdatedAt:string;
 workspaceId:string;branchId:string;customerId:string;currency:string;
 expectedInvoiceNumber:string;lineCount:number;
 evidenceSignature:string;preview:string[];
}
const digitAr='٠١٢٣٤٥٦٧٨٩',digitFa='۰۱۲۳۴۵۶۷۸۹';
function normalized(s:string):string {
 return String(s||'').normalize('NFKC').replace(/[٠-٩۰-۹]/g,ch=>
  String(digitAr.includes(ch)?digitAr.indexOf(ch):digitFa.indexOf(ch))).trim();
}
/** Prepare an invoice DRAFT only. Issuance, stock posting and collection
 * are separate protected workflows requiring their own authorization. */
export function isAiConfirmedInvoiceDraftIntent(message:string):boolean{
 const s=normalized(message);
 return s.length>=18&&s.length<=650&&
  /^(?:أنشئ|انشئ|جهز|جهّز|حضر|حضّر|create|prepare|make|draft)\s+(?:(?:مسودة|draft)\s+)?(?:(?:فاتور[ةه](?:\s+(?:ال)?مبيعات)?)|(?:sales\s+)?invoice)(?:\s|$)/iu.test(s)&&
  !/(?:اعتمد|أصدر|اصدر|ثبّت|ثبت|خصم|مخزون|ترحيل|رحّل|رحل|دفع|تحصيل|سدّد|سدد|\b(?:issue|finalize|post|deduct|stock|inventory|collect|pay)\b)/iu.test(s);
}
export function requestedInvoiceDeliveryNumber(message:string):string|null{
 if(!isAiConfirmedInvoiceDraftIntent(message))return null;
 const refs=[...normalized(message).matchAll(/\bDN[-_]\d{4}[-_]\d{1,12}\b/giu)]
  .map(m=>m[0]!.toUpperCase());
 // Duplicate mention or combined references must never pick the first row.
 if(refs.length!==1)return null;
 return refs[0]!;
}
function proofSnapshot(scoped:VaultPayload,delivery:LourexDocument):string{
 return JSON.stringify({
  delivery,
  source:scoped.documents.find(d=>d.id===delivery.convertedFromId)||null,
  documents:scoped.documents.map(d=>[d.id,d.number,d.kind,d.status,d.lifecycleStatus,d.updatedAt,
    d.convertedFromId,d.currency,d.items.map(x=>[x.id,x.quantity,x.unit,x.unitPrice])]),
  events:scoped.documentEvents.map(e=>[e.id,e.type,e.documentId,e.relatedDocumentId,e.note,e.at]),
  numbering:scoped.appSettings.numbering,
  company:scoped.company
 });
}
function verify(vault:VaultPayload,number:string){
 const scoped=scopeVault(vault),workspaceId=vault.appSettings.activeWorkspaceId||'default',
  branchId=vault.appSettings.activeBranchId||'main';
 const hits=scoped.documents.filter(d=>d.kind==='delivery-note'&&d.number.toUpperCase()===number.toUpperCase());
 if(hits.length!==1)throw new Error('Select one exact Delivery Note from the active company and branch.');
 const delivery=hits[0]!;
 if(delivery.status!=='final'||delivery.lifecycleStatus==='voided')
  throw new Error('An issued and active Delivery Note is required before invoicing.');
 assertGovernancePermission(vault,'issue-document');
 assertDeliveryInvoiceIntegrity(scoped.documents,scoped.documentEvents);
 if(confirmedSalesDeliveries(delivery.id,scoped.documentEvents).length!==1)
  throw new Error('The Delivery Note must have one valid physical-delivery confirmation before invoicing.');
 if(linkedDeliveryInvoice(delivery.id,scoped.documents,scoped.documentEvents))
  throw new Error('An invoice already exists for this confirmed delivery. Duplicate creation is blocked.');
 // Run the canonical conversion on a scoped copy. This is a pure preview;
 // it does not persist an invoice, numbering or ledger movement.
 const provisional=createConfirmedDeliveryInvoiceDraft(scoped,delivery.id);
 if(!provisional.created||provisional.invoice.kind!=='invoice'||
   provisional.invoice.status!=='draft'||provisional.invoice.items.length===0)
  throw new Error('Invoice preview was not a complete, unsaved draft.');
 return{scoped,delivery,provisional,workspaceId,branchId,
  signature:proofSnapshot(scoped,delivery)};
}
export function prepareAiConfirmedDeliveryInvoice(vault:VaultPayload,deliveryNoteNumber:string):
 AiConfirmedDeliveryInvoiceReview {
 const state=verify(vault,deliveryNoteNumber),invoice=state.provisional.invoice,
  source=state.delivery,customerId=invoice.customerSnapshot?.sourceCustomerId||'';
 if(!customerId)throw new Error('Missing exact customer identity. No invoice prepared.');
 const rows=invoice.items.map((item,i)=>
  String(i+1)+'. '+(item.descriptionEn||item.descriptionAr||'[missing]')+
  ' | Qty '+item.quantity+' '+item.unit+' | Unit price '+(item.unitPrice||'[missing]')+
  ' '+invoice.currency);
 return{deliveryNoteId:source.id,deliveryNoteNumber:source.number,
  deliveryUpdatedAt:source.updatedAt,workspaceId:state.workspaceId,branchId:state.branchId,
  customerId,currency:invoice.currency,expectedInvoiceNumber:invoice.number,
  lineCount:invoice.items.length,evidenceSignature:state.signature,preview:[
   'Confirmed delivery: '+source.number,
   'Invoice draft: '+invoice.number+' (NOT issued)',
   'Customer: '+(invoice.customerSnapshot?.companyNameEn||
      invoice.customerSnapshot?.companyNameAr||'[missing]'),
   'Currency: '+invoice.currency,
   'All '+invoice.items.length+' confirmed line(s), no omissions:',
   ...rows,
   'Review payment terms, discounts and any shipment charges before issuance.',
   'APPROVAL: Create an INVOICE DRAFT only. No issuance, inventory deduction, payment or collection.'
  ]};
}
export function applyAiConfirmedDeliveryInvoiceApproval(vault:VaultPayload,review:AiConfirmedDeliveryInvoiceReview):
 {vault:VaultPayload;invoice:LourexDocument}{
 if(!review||!review.deliveryNoteId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
  throw new Error('Company or branch changed. Invoice draft was not created.');
 const state=verify(vault,review.deliveryNoteNumber);
 const candidate=state.provisional.invoice;
 if(state.delivery.id!==review.deliveryNoteId||
   state.delivery.updatedAt!==review.deliveryUpdatedAt||
   candidate.number!==review.expectedInvoiceNumber||
   candidate.customerSnapshot?.sourceCustomerId!==review.customerId||
   candidate.currency!==review.currency||
   candidate.items.length!==review.lineCount||
   state.signature!==review.evidenceSignature)
  throw new Error('Confirmed delivery, customer, numbering or business ledger changed. Review invoice again.');
 const saved=createConfirmedDeliveryInvoiceDraft(vault,review.deliveryNoteId);
 if(!saved.created||saved.invoice.status!=='draft'||saved.invoice.kind!=='invoice'||
   saved.invoice.number!==review.expectedInvoiceNumber||
   saved.invoice.items.length!==review.lineCount)
  throw new Error('Could not safely create the exact reviewed invoice draft.');
 return{vault:saved.vault,invoice:saved.invoice};
}
