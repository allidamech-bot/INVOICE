import type {AiDocumentDraftProposal, AiCustomerDraftInput} from '../components/AiCopilot.js';
import type {AiToolRuntime} from './ai-tool-orchestrator.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';

/** The structured /api/quote-source-ai result is evidence, never an instruction
 * or authorization to write. Preserve all rows or stage no working document. */
interface QuoteSourceFact{fileName:string;route:string;documentType:string;confidence:number;extracted:string;}
export function explicitQuoteConversionIntent(message:string):boolean{
  const q=String(message||'').normalize('NFKC').trim();
  return /(?:حوّل|حول|جهز|جهّز|أنشئ|انشئ|اصنع|اعمل|سوي|حضّر|حضر|convert|create|prepare|make|build|draft)\b?.{0,100}(?:عرض\s*سعر|عرض\s*السعر|فاتورة\s*مبدئية|quotation|quote|proforma)/iu.test(q)||
    /(?:عرض\s*سعر|quotation|quote|proforma).{0,100}(?:من\s*(?:الملف|المرفق|الصورة)|from\s*(?:this\s*)?(?:file|attachment))/iu.test(q);
}
function sourceText(value:unknown,max:number):string{
  if(typeof value!=='string'||value.length>max)return '';
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
}
function numeric(value:unknown,required:boolean):string{
  const raw=sourceText(value,32);
  if(!raw&&!required)return '';
  if(!raw||!isNonNegativeDecimalInput(raw))throw new Error('SOURCE_INCOMPLETE: A source line has a missing or invalid quantity or price. Nothing was created.');
  const n=normalizeDecimalInput(raw);
  if(required&&!/[1-9]/.test(n))throw new Error('SOURCE_INCOMPLETE: A source line quantity must be positive. Nothing was created.');
  return n;
}
function matchCustomer(runtime:AiToolRuntime,name:string,email:string):string{
  // Only an exact unique match in the already-scoped saved vault can supply
  // a registered customer ID. A filename or model output cannot invent one.
  const candidates=runtime.vault.customers.filter(row=>
    Boolean(email)&&String(row.email||'').toLowerCase()===email.toLowerCase()||
    Boolean(name)&&[row.companyNameEn,row.companyNameAr].some(v=>v?.trim().toLowerCase()===name.toLowerCase())
  );
  return candidates.length===1?candidates[0]!.id:'';
}
export function quoteSourceWorkingDraft(sources:QuoteSourceFact[],runtime:AiToolRuntime,message:string):AiDocumentDraftProposal|null{
  if(runtime.scope!=='business'||runtime.conversationMode!=='controller'||!explicitQuoteConversionIntent(message))return null;
  const selected=sources.filter(row=>row?.route==='quote_request');
  if(!selected.length)return null;
  if(sources.length!==1||selected.length!==1)throw new Error('SOURCE_INCOMPLETE: Multiple attachment sources need a combined row-by-row review. No partial quotation was staged.');
  const source=selected[0]!;
  if(source.confidence<.65)throw new Error('SOURCE_INCOMPLETE: Document classification is uncertain. Confirm it is a customer quotation request before creating a draft.');
  if(!source.extracted?.trim())throw new Error('SOURCE_INCOMPLETE: The attached quotation has no complete structured extraction.');
  let parsed:unknown;
  try{parsed=JSON.parse(source.extracted);}catch{throw new Error('SOURCE_INCOMPLETE: Attachment extraction is not a complete JSON quotation. No items were staged.');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('SOURCE_INCOMPLETE: Attachment is not a structured quotation.');
  const data=parsed as Record<string,unknown>,raw=data.items;
  if(!Array.isArray(raw)||raw.length===0||raw.length>20)throw new Error('SOURCE_INCOMPLETE: Quotation must contain 1–20 complete lines. Use the full document importer for larger quotes; no rows omitted.');
  const items=raw.map((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('SOURCE_INCOMPLETE: Invalid quotation row '+(index+1));
    const row=value as Record<string,unknown>;
    const descriptionEn=sourceText(row.descriptionEn,180),descriptionAr=sourceText(row.descriptionAr,180),sku=sourceText(row.sku,60);
    if(!descriptionEn&&!descriptionAr&&!sku)throw new Error('SOURCE_INCOMPLETE: Product identity is missing on line '+(index+1));
    const quantity=numeric(row.quantity,true);
    // Ambiguous source quantities are never placed in a priced document.
    if(row.quantityAmbiguous===true||Number(row.quantityConfidence)<.5)throw new Error('SOURCE_INCOMPLETE: Quantity or pack unit is uncertain on line '+(index+1)+'. Confirm the source before building a quotation.');
    const unit=sourceText(row.unit,40),unitPrice=numeric(row.unitPrice,false);
    return{savedItemId:'',descriptionEn:descriptionEn||sku,descriptionAr,quantity,unit,unitPrice};
  });
  const currency=sourceText(data.currency,3).toUpperCase();
  if(currency&&!/^[A-Z]{3}$/.test(currency))throw new Error('SOURCE_INCOMPLETE: The source currency is unclear.');
  const customerName=sourceText(data.customerName,180),customerEmail=sourceText(data.customerEmail,180),customerPhone=sourceText(data.customerPhone,80);
  const customerId=matchCustomer(runtime,customerName,customerEmail);
  const customerDraft:AiCustomerDraftInput|null=customerId||!customerName?null:{
    companyNameEn:customerName,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:customerPhone,
    email:customerEmail,vatTaxNumber:'',commercialRegistration:''
  };
  return{capability:'document.createDraft',kind:'proforma',customerId,customerDraft,currency,language:'bilingual',items,
    incoterm:sourceText(data.incoterm,80),paymentTerms:sourceText(data.paymentTerms,160),
    deliveryTime:sourceText(data.deliveryTime,160),validity:sourceText(data.validity,100),
    remarks:sourceText(data.remarks,500),notes:sourceText(data.notes,500),
    label:'Unsaved quotation from '+sourceText(source.fileName,120),
    rationale:'User requested a quotation from structured attachment evidence. This is an unsaved working draft, not permission to save or issue.'
  };
}
