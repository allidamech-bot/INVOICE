import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {deliverySourceEligible,createLinkedDeliveryDraft,linkedDeliveries} from './delivery-flow.js';
import {salesOrderForQuotation,assertSalesOrderIntegrity} from './sales-order-flow.js';
import {confirmedSalesDeliveries,salesDeliveryBalances} from './sales-delivery-flow.js';
import {validateDocument} from './documents.js';
import {decimalToScaled} from './money.js';

export interface AiOperationalDeliveryDraftReview{
 quotationId:string;quotationNumber:string;salesOrderNumber:string;
 expectedQuotationUpdatedAt:string;workspaceId:string;branchId:string;
 customerId:string;currency:string;evidenceSignature:string;
 lineCount:number;preview:string[];
}
const norm=(s:string)=>String(s||'').normalize('NFKC').trim();
export function operationalDeliveryDraftRequested(message:string):boolean{
 const text=norm(message);
 return text.length<=550&&
  /^(?:أنشئ|انشئ|جهز|جهّز|حضّر|حضر|create|prepare|make|draft)\s+(?:(?:مسودة|draft)\s+)?(?:(?:سند|إشعار)\s*(?:ال)?تسليم|delivery[\s-]*note)(?:\s|$)/iu.test(text)&&
  !/(?:اعتمد|أصدر|اصدر|أكد|اكّد|سلّم|سلم|ارحل|رحّل|رحل|المخزون|مخزون|اخصم|أخصم|خصم|ترحيل|\b(?:issue|confirm|finalize|post|stock|inventory|deduct)\b)/iu.test(text);
}
export function requestedDeliverySalesOrderNumber(message:string):string|null{
 if(!operationalDeliveryDraftRequested(message))return null;
 const t=norm(message).replace(/[٠-٩۰-۹]/g,ch=>{
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  return String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch));
 });
 const matches=[...t.matchAll(/\bSO-(?:[A-Z0-9]{2,12}-)?\d{4}-\d{1,12}\b/giu)].map(x=>x[0]!.toUpperCase());
 return matches.length===1?matches[0]!:null;
}
function proofSignature(source:LourexDocument,vault:VaultPayload):string{
 const related=linkedDeliveries(source,vault.documents,vault.documentEvents);
 const order=salesOrderForQuotation(source.id,vault.documentEvents);
 return JSON.stringify({
  quote:{id:source.id,updatedAt:source.updatedAt,status:source.status,
   lifecycleStatus:source.lifecycleStatus,number:source.number,
   customerId:source.customerSnapshot?.sourceCustomerId,currency:source.currency,
   lines:source.items.map(x=>[x.id,x.descriptionEn,x.descriptionAr,x.quantity,x.unit,x.unitPrice])},
  order,
  related:related.map(row=>[row.id,row.number,row.status,row.lifecycleStatus,row.updatedAt,
    row.items.map(item=>[item.id,item.quantity,item.unit])]),
  events:vault.documentEvents.filter(x=>
   x.documentId===source.id||related.some(d=>d.id===x.documentId))
   .map(x=>[x.id,x.documentId,x.type,x.note,x.relatedDocumentId,x.at])
 });
}
function verify(vault:VaultPayload,salesOrderNumber:string):{
 source:LourexDocument;scoped:VaultPayload;signature:string;orderNumber:string;
}{
 const scoped=scopeVault(vault),possible=scoped.documents.filter(d=>deliverySourceEligible(d)&&
  salesOrderForQuotation(d.id,scoped.documentEvents)?.salesOrderNumber===salesOrderNumber);
 if(possible.length!==1)throw new Error('An exact, accepted Sales Order for one issued quotation in this company and branch is required.');
 const source=possible[0]!;
 assertGovernancePermission(vault,'confirm-sales-delivery');
 assertSalesOrderIntegrity(scoped.documents,scoped.documentEvents);
 if(Object.keys(validateDocument(source)).length)
  throw new Error('The accepted Sales Order quotation has invalid items or commercial fields.');
 const customerId=source.customerSnapshot?.sourceCustomerId||'';
 if(!customerId||!scoped.customers.some(x=>x.id===customerId))
  throw new Error('A registered customer in the same company and branch is required.');
 const current=salesOrderForQuotation(source.id,scoped.documentEvents);
 if(!current||current.salesOrderNumber!==salesOrderNumber)
  throw new Error('The Sales Order cannot be uniquely verified.');
 const linked=linkedDeliveries(source,scoped.documents,scoped.documentEvents)
  .filter(x=>x.lifecycleStatus!=='voided');
 if(linked.some(x=>!confirmedSalesDeliveries(x.id,scoped.documentEvents).length))
  throw new Error('An unconfirmed delivery-note draft or issued note already exists for this Sales Order. Review it before another draft.');
 const balances=salesDeliveryBalances(current,scoped.documentEvents);
 if(!balances.some(x=>decimalToScaled(x.remaining,4)>0n))
  throw new Error('All Sales Order quantities are already confirmed delivered.');
 if(balances.some(x=>decimalToScaled(x.remaining,4)<0n))
  throw new Error('Conflicting delivered quantities; reconcile sales order evidence before drafting.');
 return{source,scoped,signature:proofSignature(source,scoped),orderNumber:current.salesOrderNumber};
}
export function prepareOperationalDeliveryDraft(vault:VaultPayload,salesOrderNumber:string):AiOperationalDeliveryDraftReview{
 const {source,scoped,signature,orderNumber}=verify(vault,salesOrderNumber);
 const order=salesOrderForQuotation(source.id,scoped.documentEvents)!;
 const balance=new Map(salesDeliveryBalances(order,scoped.documentEvents).map(x=>[x.salesOrderLineId,x.remaining]));
 const outstanding=source.items.filter(row=>decimalToScaled(balance.get(row.id)||'0',4)>0n);
 return{quotationId:source.id,quotationNumber:source.number,salesOrderNumber:orderNumber,
  expectedQuotationUpdatedAt:source.updatedAt,workspaceId:vault.appSettings.activeWorkspaceId||'default',
  branchId:vault.appSettings.activeBranchId||'main',
  customerId:source.customerSnapshot!.sourceCustomerId,currency:source.currency,
  evidenceSignature:signature,lineCount:outstanding.length,preview:[
   'Sales Order: '+orderNumber+' (source quotation '+source.number+')',
   'Customer: '+(source.customerSnapshot?.companyNameEn||source.customerSnapshot?.companyNameAr||'[unavailable]'),
   'Currency: '+source.currency,
   'Outstanding lines ('+outstanding.length+') — no line omitted:',
   ...outstanding.map((row,i)=>(i+1)+'. '+(row.descriptionEn||row.descriptionAr)+
    ' | Unit '+row.unit+' | Remaining '+balance.get(row.id)+
    ' | DRAFT quantity '+balance.get(row.id)+' (edit before issuing for partial delivery)'),
   'APPROVAL: Save a DN DRAFT only. No physical delivery confirmation, stock deduction, sales invoice or payment.'
  ]};
}
export function applyOperationalDeliveryDraftApproval(vault:VaultPayload,review:AiOperationalDeliveryDraftReview):{
 vault:VaultPayload;document:LourexDocument;
}{
 if(!review||!review.quotationId||!review.evidenceSignature||
   review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
   review.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Company or branch changed since delivery review.');
 const v=verify(vault,review.salesOrderNumber);
 if(v.source.id!==review.quotationId||v.source.updatedAt!==review.expectedQuotationUpdatedAt||
   v.source.customerSnapshot?.sourceCustomerId!==review.customerId||
   v.source.currency!==review.currency||v.signature!==review.evidenceSignature)
   throw new Error('Sales Order or delivery ledger changed since review. Reopen before approving a draft.');
 const result=createLinkedDeliveryDraft(vault,v.source.id);
 if(!result.created||result.document.kind!=='delivery-note'||result.document.status!=='draft')
   throw new Error('A new delivery draft was not created; another existing draft may require review.');
 const expected=prepareOperationalDeliveryDraft(vault,review.salesOrderNumber);
 if(result.document.items.length!==expected.lineCount||result.document.items.length!==review.lineCount)
   throw new Error('Delivery quantity lines changed before saving; no partial document may be accepted.');
 return{vault:result.vault,document:result.document};
}
