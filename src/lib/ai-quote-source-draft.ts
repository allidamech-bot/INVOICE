import type {AiDocumentDraftProposal, AiCustomerDraftInput} from '../components/AiCopilot.js';
import type {AiToolRuntime} from './ai-tool-orchestrator.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {AI_WORKING_QUOTE_MAX_LINES} from './ai-document-limits.js';

/** The structured /api/quote-source-ai result is evidence, never an instruction
 * or authorization to write. Preserve all rows or stage no working document. */
interface QuoteSourceFact{fileName:string;route:string;documentType:string;confidence:number;extracted:string;quoteSheetCandidate?:string;}
export function explicitQuoteConversionIntent(message:string):boolean{
  const q=String(message||'').normalize('NFKC').trim();
  return /(?:حوّل|حول|جهز|جهّز|أنشئ|انشئ|اصنع|اعمل|سوي|حضّر|حضر|ادمج|اجمع|combine|merge|convert|create|prepare|make|build|draft).{0,100}(?:عرض\s*سعر|عرض\s*السعر|فاتورة\s*مبدئية|quotation|quote|proforma)/iu.test(q)||
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
  if(sources.length>1){
    // The user must explicitly request ONE combined quote. Quietly merging
    // distinct RFQs or clients changes commercial meaning and is forbidden.
    if(!/(?:موحد|موحّد|واحد|واحدة|ادمج|دمج|اجمع|جمع|combine|merge|single|one\s+(?:quote|quotation))/iu.test(message))
      throw new Error('SOURCE_INCOMPLETE: Multiple sources require an explicit request for one combined quotation. Nothing was prepared.');
    if(sources.length>10)throw new Error('SOURCE_INCOMPLETE: More than ten source files; use reviewed batches. Nothing was prepared.');
    const signatures=new Set<string>();
    for(const row of sources){
      const signature=String(row.fileName||'')+'|'+String(row.quoteSheetCandidate||row.extracted||'');
      if(signatures.has(signature))throw new Error('SOURCE_INCOMPLETE: An identical source file is attached twice; reject double counting.');
      signatures.add(signature);
    }
    const drafts=sources.map((source,index)=>{
      const review=quoteSourceWorkingDraft([source],runtime,message);
      if(!review)throw new Error('SOURCE_INCOMPLETE: Attachment '+(index+1)+' is not a complete quotation source. No subset was staged.');
      return review;
    });
    const fields=['kind','customerId','customerDraft','currency','language','incoterm','paymentTerms','deliveryTime','validity','remarks','notes'] as const;
    const first=drafts[0]!;
    for(let i=1;i<drafts.length;i++){
      const next=drafts[i]!;
      for(const field of fields)if(JSON.stringify(next[field])!==JSON.stringify(first[field]))
        throw new Error('SOURCE_INCOMPLETE: The files have different '+field+' values. Confirm a single buyer, currency and terms before merging.');
    }
    const total=drafts.reduce((n,part)=>n+part.items.length,0);
    if(total>AI_WORKING_QUOTE_MAX_LINES)throw new Error('SOURCE_INCOMPLETE: Combined source has '+total+' lines, exceeding '+AI_WORKING_QUOTE_MAX_LINES+'. No rows dropped or saved.');
    return{...first,
      items:drafts.flatMap(draft=>draft.items),
      label:'Unsaved combined quotation from '+sources.length+' reviewed attachments',
      rationale:'Explicit user request for a single draft assembled in source upload order from '+sources.length+' complete consistent quotations. No save or issue authorized.'
    };
  }
  const selected=sources.filter(row=>row?.route==='quote_request'||Boolean(row?.quoteSheetCandidate));
  if(!selected.length)return null;
  if(sources.length!==1||selected.length!==1)throw new Error('SOURCE_INCOMPLETE: Multiple attachment sources need a combined row-by-row review. No partial quotation was staged.');
  const source=selected[0]!;
  const exactSource=typeof source.quoteSheetCandidate==='string'&&source.quoteSheetCandidate.trim()
    ?source.quoteSheetCandidate:null;
  // A complete exact worksheet is authoritative *for row transfer*, regardless
  // of the AI classifier. Non-spreadsheet model extractions still require high
  // confidence and must never turn a product catalog into a quote by default.
  if(!exactSource&&source.confidence<.65)throw new Error('SOURCE_INCOMPLETE: Document classification is uncertain. Confirm it is a customer quotation request before creating a draft.');
  const evidence=exactSource||source.extracted;
  if(!evidence?.trim())throw new Error('SOURCE_INCOMPLETE: The attached quotation has no complete structured extraction.');
  let parsed:unknown;
  try{parsed=JSON.parse(evidence);}catch{throw new Error('SOURCE_INCOMPLETE: Attachment extraction is not a complete JSON quotation. No items were staged.');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('SOURCE_INCOMPLETE: Attachment is not a structured quotation.');
  const data=parsed as Record<string,unknown>,raw=data.items;
  if(!Array.isArray(raw)||raw.length===0||raw.length>AI_WORKING_QUOTE_MAX_LINES)throw new Error('SOURCE_INCOMPLETE: Quotation must contain 1–'+AI_WORKING_QUOTE_MAX_LINES+' complete lines. No rows omitted.');
  if(data.sourceRowCount!==undefined&&(!Number.isInteger(data.sourceRowCount)||data.sourceRowCount!==raw.length))throw new Error('SOURCE_INCOMPLETE: Extracted row count does not match the declared source rows. No partial quote staged.');
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
