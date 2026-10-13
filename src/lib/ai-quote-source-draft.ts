import type {AiDocumentDraftProposal, AiCustomerDraftInput} from '../components/AiCopilot.js';
import type {AiToolRuntime} from './ai-tool-orchestrator.js';
import {decimalToScaled,isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {AI_WORKING_QUOTE_MAX_LINES} from './ai-document-limits.js';

/** The structured /api/quote-source-ai result is evidence, never an instruction
 * or authorization to write. Preserve all rows or stage no working document. */
interface QuoteSourceFact{fileName:string;route:string;documentType:string;confidence:number;extracted:string;quoteSheetCandidate?:string;}
export function explicitQuoteConversionIntent(message:string):boolean{
  const q=String(message||'').normalize('NFKC').trim();
  return /(?:حوّل|حول|جهز|جهّز|أنشئ|انشئ|اصنع|اعمل|سوي|حضّر|حضر|ادمج|اجمع|combine|merge|convert|create|prepare|make|build|draft).{0,100}(?:عرض\s*سعر|عرض\s*السعر|فاتورة\s*مبدئية|quotation|quote|proforma)/iu.test(q)||
    /(?:عرض\s*سعر|quotation|quote|proforma).{0,100}(?:من\s*(?:الملف|المرفق|الصورة)|from\s*(?:this\s*)?(?:file|attachment))/iu.test(q);
}
/** A gross margin is a share of SALES, not a markup on supplier cost.
 * Parse only an explicit margin request; ambiguous percentages never silently
 * change 85 supplier prices. The cost itself stays in the source evidence. */
function requestedGrossMargin(message:string):string|null{
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  const text=String(message||'').normalize('NFKC')
    .replace(/[٠-٩۰-۹]/gu,c=>String(ar.includes(c)?ar.indexOf(c):fa.indexOf(c)))
    .replace(/[ً-ٰٟ]/gu,'').replace(/٫/g,'.');
  const keyword=/(?:هامش\s*(?:ال)?ربح|هامش\s*إجمالي|gross\s+(?:profit\s+)?margin)/iu;
  if(!keyword.test(text))return null;
  const exact=text.match(/(?:هامش\s*(?:ال)?ربح|هامش\s*إجمالي|gross\s+(?:profit\s+)?margin)\s*(?:بنسبة\s*)?(\d{1,3}(?:[.,]\d{1,4})?)\s*(?:[%٪]|بالمئة|بالمائة|percent)?/iu);
  if(!exact)throw new Error('SOURCE_INCOMPLETE: Supply an explicit gross margin percentage. No quotation was prepared.');
  const value=normalizeDecimalInput(exact[1]!.replace(',','.'));
  const scaled=decimalToScaled(value,4);
  if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(value)||scaled<0n||scaled>=1000000n)
    throw new Error('SOURCE_INCOMPLETE: Gross profit margin must be between 0% and less than 100%.');
  return value;
}
function sellingPriceForGrossMargin(sourceUnitPrice:string,margin:string):string{
  if(!sourceUnitPrice)throw new Error('SOURCE_INCOMPLETE: A supplier unit price is missing; cannot calculate the requested margin for every line.');
  const rawCost=decimalToScaled(sourceUnitPrice,6);
  const denominator=1000000n-decimalToScaled(margin,4);
  // Selling price = cost / (1 - gross-margin). Round UP to cents so the
  // achieved margin does not fall below the requested rate.
  const cents=(rawCost*100n+denominator-1n)/denominator;
  const amount=String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  if(!/^(?:0|[1-9]\d{0,12})\.\d{2}$/.test(amount))
    throw new Error('SOURCE_INCOMPLETE: Margin would exceed the supported document price range.');
  return amount;
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
  const margin=requestedGrossMargin(message);
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
    const unit=sourceText(row.unit,40),sourcePrice=numeric(row.unitPrice,false);
    const unitPrice=margin===null?sourcePrice:sellingPriceForGrossMargin(sourcePrice,margin);
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
    rationale:'User requested a quotation from structured attachment evidence. '+(margin===null?'Source unit prices retained exactly.':'Applied '+margin+'% gross margin (on selling price, not markup) to all '+items.length+' supplier unit prices, rounded UP to cents; source costs remain in the attachment evidence. ')+'This is an unsaved working draft, not permission to save or issue.'
  };
}
