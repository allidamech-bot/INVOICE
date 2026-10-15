import type {VaultPayload,LourexDocument} from '../types.js';
import {scopeVault} from './workspaces.js';
import {assertGovernancePermission} from './governance.js';
import {convertToInvoice,nextDocumentNumber,validateDocument} from './documents.js';
import {createDocumentEvent} from './document-lifecycle.js';
import {linkedInvoiceForCommercialDocument} from './commercial-flow.js';
import {assertSalesOrderIntegrity,salesOrderForQuotation} from './sales-order-flow.js';
import {applyPaymentTermPreset,paymentTermPresetById,paymentTermPresetByLabel} from './commercial-controls.js';

/** A source quotation may only be converted by this deterministic, ledger-backed
 * path. A language model is not allowed to regenerate, reprioritize or reprice
 * source lines when a saved quotation was explicitly requested. */
export interface AiStoredQuotationInvoiceReview {
 sourceId:string;sourceNumber:string;sourceUpdatedAt:string;
 workspaceId:string;branchId:string;expectedInvoiceNumber:string;
 customerId:string;currency:string;lineCount:number;
 evidenceSignature:string;preview:string[];
}
const digits='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
function normalized(s:string):string {
 return String(s||'').normalize('NFKC').replace(/[٠-٩۰-۹]/gu,ch=>
  String(digits.includes(ch)?digits.indexOf(ch):persian.indexOf(ch))).trim();
}
export function isAiStoredQuotationInvoiceIntent(message:string):boolean{
 const q=normalized(message);
 if(q.length<17||q.length>650)return false;
 if(/^(?:لا|ولا|بدون|don't|do not|never)\s/iu.test(q))return false;
 const create=/(?:\b(?:create|prepare|make|draft|convert|generate)\b|أنشئ|انشئ|جهز|جهّز|حضّر|حضر|حوّل|حول)/iu.test(q);
 const output=/(?:\binvoice\b|فاتور[ةه])/iu.test(q);
 const source=/(?:\b(?:quotation|quote|proforma)\b|عرض\s*(?:ال)?سعر|بروفورما)/iu.test(q);
 const relation=/(?:\b(?:from|based\s+on|into|to)\b|من|إلى|الى)/iu.test(q);
 return create&&output&&source&&relation;
}
export function requestedStoredQuotationNumber(message:string):string|null{
 if(!isAiStoredQuotationInvoiceIntent(message))return null;
 const ids=[...normalized(message).matchAll(/\b[A-Z0-9]{2,8}-\d{4}-\d{1,12}\b/giu)]
   .map(row=>row[0]!.toUpperCase());
 return ids.length===1?ids[0]!:null;
}
function verifiedSource(vault:VaultPayload,number:string) {
 const scoped=scopeVault(vault);
 const workspaceId=vault.appSettings.activeWorkspaceId||'default';
 const branchId=vault.appSettings.activeBranchId||'main';
 const hits=scoped.documents.filter(doc=>doc.number.toUpperCase()===number.toUpperCase());
 if(hits.length!==1)throw new Error('One exact saved quotation number is required in the active company and branch.');
 const source=hits[0]!;
 if(!['proforma','proforma-invoice'].includes(source.kind)||source.role!=='standard'||
    source.status!=='final'||source.lifecycleStatus==='voided')
   throw new Error('Only an active, issued saved quotation can be converted to an invoice.');
 assertGovernancePermission(vault,'issue-document');
 assertSalesOrderIntegrity(scoped.documents,scoped.documentEvents);
 if(salesOrderForQuotation(source.id,scoped.documentEvents))
   throw new Error('This quotation has an accepted Sales Order. Invoice each confirmed Delivery Note, not the whole order.');
 if(linkedInvoiceForCommercialDocument(source,scoped.documents))
   throw new Error('This quotation already has an active linked invoice. Open the existing invoice instead.');
 if(Object.keys(validateDocument(source)).length)
   throw new Error('The saved quotation is invalid. Correct the original before conversion.');
 const customerId=source.customerSnapshot?.sourceCustomerId||'';
 if(!customerId||!scoped.customers.some(row=>row.id===customerId))
   throw new Error('The original quotation must have one registered customer.');
 if(!source.items.length||source.items.length>120)
   throw new Error('The source document must contain 1–120 fully reviewed lines.');
 if(scoped.documents.some(doc=>doc.id!==source.id&&doc.number.toLowerCase()===source.number.toLowerCase()))
   throw new Error('The quotation number is ambiguous across saved documents.');
 // Number preview is pure. The canonical allocator reserves the number only
 // inside the approved mutation; preview must not consume invoice sequences.
 const year=new Date().getFullYear(),settings=vault.appSettings.numbering;
 const prefix=String(settings.invoicePrefix||'INV').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||'INV';
 let serial=settings.invoiceYear===year?Math.max(0,Math.trunc(settings.invoiceLast||0)):0;
 const used=new Set(vault.documents.map(doc=>doc.number.toUpperCase()));
 let candidate='';
 do{candidate=prefix+'-'+year+'-'+String(++serial).padStart(4,'0');}
 while(used.has(candidate));
 let invoice=convertToInvoice(source,candidate);
 const preset=paymentTermPresetById(scoped.company,invoice.paymentTermPresetId)||
   paymentTermPresetByLabel(scoped.company,invoice.terms.paymentTerms);
 if(preset)invoice=applyPaymentTermPreset(invoice,preset);
 const signature=JSON.stringify({
   source,allDocuments:scoped.documents.map(doc=>[doc.id,doc.number,doc.convertedFromId,doc.status,doc.lifecycleStatus]),
   orders:scoped.documentEvents,customer:scoped.customers.find(row=>row.id===customerId),
   company:scoped.company,numbering:scoped.appSettings.numbering
 });
 return{source,invoice,scoped,workspaceId,branchId,customerId,signature};
}
export function prepareAiStoredQuotationInvoice(vault:VaultPayload,number:string):AiStoredQuotationInvoiceReview{
 const v=verifiedSource(vault,number);
 return{
  sourceId:v.source.id,sourceNumber:v.source.number,sourceUpdatedAt:v.source.updatedAt,
  workspaceId:v.workspaceId,branchId:v.branchId,expectedInvoiceNumber:v.invoice.number,
  customerId:v.customerId,currency:v.invoice.currency,lineCount:v.invoice.items.length,
  evidenceSignature:v.signature,
  preview:[
   'Original saved quotation: '+v.source.number+' (issued, active)',
   'Invoice DRAFT: '+v.invoice.number+' — not issued',
   'Customer: '+(v.source.customerSnapshot?.companyNameEn||v.source.customerSnapshot?.companyNameAr||v.customerId),
   'Currency: '+v.invoice.currency,
   'All '+v.invoice.items.length+' source line(s), without omissions:',
   ...v.invoice.items.map((row,i)=>String(i+1)+'. '+(row.descriptionEn||row.descriptionAr)+
      ' | '+row.quantity+' '+row.unit+' | '+row.unitPrice+' '+v.invoice.currency),
   'Source terms, adjustments and tax settings are preserved. Review their applicability before issuance.',
   'Approval saves one linked INVOICE DRAFT only; no posting, stock change or payment.'
  ]
 };
}
export function applyAiStoredQuotationInvoiceApproval(vault:VaultPayload,review:AiStoredQuotationInvoiceReview):
 {vault:VaultPayload;invoice:LourexDocument}{
 if(!review||!review.sourceId||!review.evidenceSignature||
    review.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
    review.branchId!==(vault.appSettings.activeBranchId||'main'))
   throw new Error('Business scope or quotation approval is missing. Nothing saved.');
 const v=verifiedSource(vault,review.sourceNumber);
 if(v.source.id!==review.sourceId||v.source.updatedAt!==review.sourceUpdatedAt||
    v.invoice.number!==review.expectedInvoiceNumber||v.invoice.kind!=='invoice'||
    v.invoice.status!=='draft'||v.invoice.convertedFromId!==review.sourceId||
    v.invoice.currency!==review.currency||v.customerId!==review.customerId||
    v.invoice.items.length!==review.lineCount||v.signature!==review.evidenceSignature)
   throw new Error('Quotation, customer, invoice numbering or ledger changed. Review the conversion again.');
 const numbered=nextDocumentNumber(vault,'invoice');
 if(numbered.number!==review.expectedInvoiceNumber)
   throw new Error('Another invoice reserved this number. Refresh the quotation conversion review.');
 let invoice=convertToInvoice(v.source,numbered.number);
 const preset=paymentTermPresetById(v.scoped.company,invoice.paymentTermPresetId)||
   paymentTermPresetByLabel(v.scoped.company,invoice.terms.paymentTerms);
 if(preset)invoice=applyPaymentTermPreset(invoice,preset);
 if(invoice.currency!==review.currency||invoice.items.length!==review.lineCount)
   throw new Error('Converted invoice differs from the approved source. No draft saved.');
 const eventSource=createDocumentEvent(v.source,'converted','',invoice);
 const eventInvoice=createDocumentEvent(invoice,'created','',v.source);
 return{vault:{...numbered.vault,
   documents:[...numbered.vault.documents,invoice],
   documentEvents:[...numbered.vault.documentEvents,eventSource,eventInvoice]},invoice};
}
