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
/** An explicit increase on a unit cost is MARKUP, not gross sales margin.
 * An unrelated number or a discount must never silently change prices. */
export function requestedSourceMarkup(message:string):string|null{
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  const text=String(message||'').normalize('NFKC')
    .replace(/[٠-٩۰-۹]/gu,c=>String(ar.includes(c)?ar.indexOf(c):fa.indexOf(c)))
    .replace(/[ً-ٰٟ]/gu,'').replace(/٫/g,'.');
  const verb='(?:أضف|اضف|ضيف|زوّد|زود|زد|ارفع|زيادة|add|increase|markup)';
  const price='(?:(?:كل|جميع|all)\\s+)?(?:الأسعار|الاسعار|أسعار\\s+(?:كل\\s+)?(?:الأصناف|الاصناف|المنتجات)|اسعار\\s+(?:كل\\s+)?(?:الأصناف|الاصناف|المنتجات)|السعر|prices?|item\\s+prices?)';
  const amount='(\\d{1,3}(?:[.,]\\d{1,4})?)';
  // "أضف 3% على الأسعار", "زود الأسعار 3%" and "increase all prices by 3%".
  // A bare percentage or tax instruction is NOT an authorization to reprice.
  const before=new RegExp(verb+'\\s*(?:بنسبة\\s*|by\\s*)?\\+?\\s*'+amount+'\\s*[%٪]\\s*(?:(?:على|ل|to|on)\\s*)?'+price,'iu');
  const after=new RegExp(verb+'\\s*(?:(?:على|ل|to|on)\\s*)?'+price+'\\s*(?:بنسبة\\s*|by\\s*)?\\+?\\s*'+amount+'\\s*[%٪]','iu');
  const found=text.match(before)||text.match(after);
  if(!found)return null;
  const value=normalizeDecimalInput(found[1]!.replace(',','.'));
  if(!/^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,4})?$/.test(value)||decimalToScaled(value,4)>5000000n)
    throw new Error('SOURCE_INCOMPLETE: An explicit markup must be between 0% and 500%.');
  return value;
}
export function sellingPriceForMarkup(sourceUnitPrice:string,markup:string):string{
  if(!sourceUnitPrice)throw new Error('SOURCE_INCOMPLETE: A unit price is missing; cannot apply markup to every line.');
  const cost=decimalToScaled(sourceUnitPrice,6),factor=1000000n+decimalToScaled(markup,4);
  // unit cost has 6 decimal places; percentage factor is scaled to 1e6.
  const denominator=1000000000000n;
  const cents=(cost*factor*100n+denominator-1n)/denominator;
  const value=String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  if(!/^(?:0|[1-9]\d{0,12})\.\d{2}$/.test(value))
    throw new Error('SOURCE_INCOMPLETE: Markup would exceed the supported document price range.');
  return value;
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
  const selected=sources.filter(row=>row?.route==='quote_request'||row?.route==='supplier_purchase'||Boolean(row?.quoteSheetCandidate));
  if(!selected.length)return null;
  if(sources.length!==1||selected.length!==1)throw new Error('SOURCE_INCOMPLETE: Multiple attachment sources need a combined row-by-row review. No partial quotation was staged.');
  const source=selected[0]!;
  // An explicitly requested customer quotation may also originate from a
  // supplier offer. Supplier unitCost is NEVER silently copied to the selling
  // price: absent an explicit gross margin, every selling price stays blank.
  const supplierSource=source.route==='supplier_purchase'&&!source.quoteSheetCandidate;
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
  const margin=requestedGrossMargin(message),markup=requestedSourceMarkup(message);
  if(margin!==null&&markup!==null)throw new Error('SOURCE_INCOMPLETE: Choose gross margin OR markup, not both. Nothing was prepared.');
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
    const quantityConfidence=row.quantityConfidence,productConfidence=row.productConfidence;
    // Reject malformed/out-of-range AI confidence instead of treating NaN as sufficient evidence.
    if((row.quantityAmbiguous!==undefined&&row.quantityAmbiguous!==false)||
      (quantityConfidence!==undefined&&(typeof quantityConfidence!=='number'||!Number.isFinite(quantityConfidence)||quantityConfidence<.5||quantityConfidence>1))||
      (productConfidence!==undefined&&(typeof productConfidence!=='number'||!Number.isFinite(productConfidence)||productConfidence<.5||productConfidence>1)))
      throw new Error('SOURCE_INCOMPLETE: Quantity, pack unit or product identity is uncertain on line '+(index+1)+'. Confirm the source before building a quotation.');
    const unit=sourceText(row.unit,40),sourcePrice=numeric(supplierSource?row.unitCost:row.unitPrice,false);
    const unitPrice=margin!==null?sellingPriceForGrossMargin(sourcePrice,margin)
      :markup!==null?sellingPriceForMarkup(sourcePrice,markup)
      :supplierSource?'':sourcePrice;
    return{savedItemId:'',descriptionEn:descriptionEn||sku,descriptionAr,quantity,unit,unitPrice};
  });
  const currency=sourceText(data.currency,3).toUpperCase();
  if(currency&&!/^[A-Z]{3}$/.test(currency))throw new Error('SOURCE_INCOMPLETE: The source currency is unclear.');
  // A supplier offer establishes supplier identity, never the customer's.
  // Even an extra/injected customerName field in supplier evidence is ignored.
  const customerName=supplierSource?'':sourceText(data.customerName,180),customerEmail=supplierSource?'':sourceText(data.customerEmail,180),customerPhone=supplierSource?'':sourceText(data.customerPhone,80);
  const customerId=matchCustomer(runtime,customerName,customerEmail);
  const customerDraft:AiCustomerDraftInput|null=customerId||!customerName?null:{
    companyNameEn:customerName,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:customerPhone,
    email:customerEmail,vatTaxNumber:'',commercialRegistration:''
  };
  return{capability:'document.createDraft',kind:'proforma',customerId,customerDraft,currency,language:'bilingual',items,
    // Supplier payment/lead-time/notes belong to purchasing, not to the buyer.
    // Never copy supplier-side trade terms into a customer quotation.
    incoterm:supplierSource?'':sourceText(data.incoterm,80),paymentTerms:supplierSource?'':sourceText(data.paymentTerms,160),
    deliveryTime:supplierSource?'':sourceText(data.deliveryTime,160),validity:supplierSource?'':sourceText(data.validity,100),
    remarks:supplierSource?'':sourceText(data.remarks,500),notes:supplierSource?'':sourceText(data.notes,500),
    label:'Unsaved quotation from '+sourceText(source.fileName,120),
    rationale:'User requested a quotation from structured attachment evidence. '+(margin!==null?'Applied '+margin+'% gross margin (on selling price, not markup) to all '+items.length+' verified source unit prices, rounded UP to cents. ':markup!==null?'Applied an explicit '+markup+'% markup on '+items.length+' verified source unit prices, rounded UP to cents. ':supplierSource?'Supplier unit costs are evidence only: customer selling prices remain blank until explicitly set. ':'Source unit prices retained exactly. ')+(supplierSource?'Supplier terms and supplier identity were not copied into buyer-facing fields. ':'')+'This is an unsaved working draft, not permission to save or issue.'
  };
}
