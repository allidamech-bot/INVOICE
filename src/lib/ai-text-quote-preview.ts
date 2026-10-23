import type {AiDocumentDraftProposal,AiDraftItemInput} from '../components/AiCopilot.js';
import {explicitlyNamedQuotationCustomer} from './ai-explicit-quote-customer.js';
import {decimalToScaled,isNonNegativeDecimalInput,lineTotal,normalizeDecimalInput} from './money.js';

/** An exact, user-written preview: never a saved document or AI/provider inference.
 * Ambiguous item names, currencies, missing fields and incomplete row extraction
 * must fall back to a question, not a plausible-looking quotation. */
export function exactTextQuotePreview(message:string):AiDocumentDraftProposal|null{
  const input=String(message||'').normalize('NFKC').trim();
  if(!input||input.length>6000||
    !/(?:عرض\s*سعر|quotation|quote|proforma)/iu.test(input)||
    !/(?:للمراجعة\s*فقط|فقط\s*للمراجعة|للعرض\s*فقط|معاينة\s*فقط|بدون\s*حفظ|لا\s*تحفظ|for\s+review\s+only|(?:^|[،,;.!?]\s*)preview\s*only(?:[.!?]|$)|do\s*not\s*save|without\s+saving)/iu.test(input))
    return null;
  const buyer=explicitlyNamedQuotationCustomer(input);
  if(!buyer||/^(?:بصنفين|بندين|صنفين|with\s+two\s+items)/iu.test(buyer))return null;
  // Explicitly delimited line section ONLY. Do not mine loose numbers from prose.
  const header=/(?:بصنفين|من\s+صنفين|بندين|with\s+two\s+items)\s*[:：]\s*([\s\S]+)/iu.exec(input);
  if(!header)return null;
  let section=header[1]||'';
  const footer=/(?:^|[\s،,;؛.])(?:الإجمالي|المجموع|total)(?:\s+الكلي)?\s*[:：]?\s*[0-9٠-٩۰-۹]/iu.exec(section);
  const tail=footer?section.slice(footer.index):'';
  if(footer)section=section.slice(0,footer.index);
  section=section.trim();
  if(!section||section.length>3500)return null;
  const pattern=/([A-Za-z][A-Za-z0-9 _-]{0,55}?)\s+(?:عدد|الكمية|كمية|quantity|qty)\s+([0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,6})?)\s+([A-Za-z]{2,8})\s+(?:بسعر\s*(?:ال)?وحدة|سعر\s*(?:ال)?وحدة|unit\s+price)\s+([0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,6})?)\s+([A-Z]{3})(?=[\s،,;؛.]|$)/gu;
  // Never ignore a priced extra line after an asserted total or footer.
  if([...tail.matchAll(pattern)].length)return null;
  const matches=[...section.matchAll(pattern)];
  if(matches.length!==2)return null;
  let cursor=0,currency='',subtotal=0n;
  const items:AiDraftItemInput[]=[];
  for(const match of matches){
    const at=match.index||0;
    // Every source character must be attributed to one exact row or a separator.
    // No "first two of three" silent truncation, no unmatched quantity/price.
    if(!/^[\s،,;؛.و]*$/u.test(section.slice(cursor,at)))return null;
    cursor=at+match[0].length;
    const name=(match[1]||'').trim(),quantity=normalizeDecimalInput(match[2]||''),unit=match[3]||'',price=normalizeDecimalInput(match[4]||''),rowCurrency=match[5]||'';
    if(!name||!quantity||!price||!unit||
      !isNonNegativeDecimalInput(quantity)||decimalToScaled(quantity,4)<=0n||
      !isNonNegativeDecimalInput(price)||!/^[A-Z]{3}$/.test(rowCurrency)||
      (currency&&currency!==rowCurrency))return null;
    currency=rowCurrency;
    items.push({savedItemId:'',descriptionEn:name,descriptionAr:'',quantity,unit,unitPrice:price});
    subtotal+=decimalToScaled(lineTotal(quantity,price),2);
  }
  if(!/^[\s،,;؛.و]*$/u.test(section.slice(cursor)))return null;
  // A user-stated grand/subtotal is a cross-check, not a source of invented prices.
  const total=/(?:الإجمالي|المجموع|total)(?:\s+الكلي)?\s*[:：]?\s*([0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,6})?)\s*([A-Z]{3})?/iu.exec(input);
  if(total){
    const value=normalizeDecimalInput(total[1]||'');
    if(!isNonNegativeDecimalInput(value)||decimalToScaled(value,2)!==subtotal||(total[2]&&total[2]!==currency))return null;
  }
  const ar=/[\u0600-\u06ff]/u.test(buyer);
  return{
    capability:'document.createDraft',kind:'proforma',
    customerId:'',
    customerDraft:{companyNameEn:ar?'':buyer,companyNameAr:ar?buyer:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''},
    currency,language:/[\u0600-\u06ff]/u.test(input)?'bilingual':'en',
    items,incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',
    label:'Unsaved exact quotation preview',rationale:'Only literal buyer, quantities, units, prices and currency in this user message. No AI guesses; no save or issue approval.'
  };
}
