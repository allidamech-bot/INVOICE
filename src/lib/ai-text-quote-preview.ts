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


/** A deterministic local preview for explicitly structured carton quotations.
 * Never turn stated carton/inner-unit counts into mixed sales units. Cross-check
 * every line and declared total before staging an UNSAVED controller artifact.
 * Discounts/freight are informational until the document editor supports them. */
export function exactStructuredCartonQuote(message:string):AiDocumentDraftProposal|null{
 const input=String(message||'').normalize('NFKC').trim();
 if(!input||input.length>14000||
   !/(?:^|\n)[^\n]{0,160}(?:أنشئ|انشئ|اعمل|جهز|جهّز|حضّر|حضر|إنشاء|اعد|create|prepare)[^\n]{0,160}(?:عرض\s*(?:ال)?سعر|quotation|quote)/iu.test(input)||
   /(?:لا|بدون|دون)\s+(?:تنشئ|انشاء|إنشاء|تجهز|تجهيز)\s+(?:مسودة\s+)?عرض\s*(?:ال)?سعر/iu.test(input))return null;
 const header=/(?:^|\n)[ \t]*\*{0,2}الصنف\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9]{1,2})\s*[:：]\s*([^\n*]{3,160})\*{0,2}[ \t]*(?=\n|$)/gmu;
 const blocks=[...input.matchAll(header)];
 if(blocks.length<2||blocks.length>20)return null;
 const lines=(source:string)=>source.split(/\r?\n/).map(row=>row.replace(/^\s*(?:[-*]|\d+[.)])\s*\*{0,2}/u,'').trim().replace(/\*+$/u,'').trim());
 const field=(source:string,key:string):string|null=>{
   const found=lines(source).filter(row=>row.startsWith(key+':')||row.startsWith(key+'：'));
   return found.length===1?found[0]!.slice(key.length+1).trim():null;
 };
 const arDigits='٠١٢٣٤٥٦٧٨٩',faDigits='۰۱۲۳۴۵۶۷۸۹';
 const amount=(value:string|null):string|null=>{
   if(!value)return null;
   const match=value.match(/^([0-9٠-٩۰-۹,.]+)(?=$|[\s%٪])/u);
   if(!match)return null;
   let v=[...match[1]!].map(char=>arDigits.includes(char)?String(arDigits.indexOf(char)):faDigits.includes(char)?String(faDigits.indexOf(char)):char).join('');
   if(v.includes(',')){if(!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(v))return null;v=v.replace(/,/g,'');}
   return /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(v)?v:null;
 };
 const buyerValue=field(input,'العميل');
 const buyer=buyerValue?.split(/\s+[—–-]\s+/u)[0]?.replace(/[.،؛]+$/u,'').trim()||'';
 if(!buyer||buyer.length>100||!/^\p{L}/u.test(buyer))return null;
 const items:AiDraftItemInput[]=[];
 let cartons=0n,inside=0n,goods=0n;
 try{
 for(let i=0;i<blocks.length;i++){
   const block=blocks[i]!,name=(block[1]||'').trim();
   const portion=input.slice((block.index||0)+block[0].length,i+1<blocks.length?blocks[i+1]!.index:input.length);
   if(!name||name.length>160||items.some(row=>row.descriptionAr===name))return null;
   const qty=amount(field(portion,'الكمية')),packing=field(portion,'التعبئة');
   const packMatch=packing?.match(/^([0-9٠-٩۰-۹,.]+)\s+(قطعة|عبوة|كيس)\s+في\s+الكرتون/u);
   if(!qty||!packMatch)return null;
   const pack=amount(packMatch[1]!);
   const insideType=packMatch[2]!;
   const singlePrice=amount(field(portion,insideType==='قطعة'?'سعر القطعة':insideType==='عبوة'?'سعر العبوة':'سعر الكيس'));
   const cartonPrice=amount(field(portion,'سعر الكرتون'));
   const rowTotal=amount(field(portion,'إجمالي الصنف'));
   const countLabel=insideType==='قطعة'?'إجمالي القطع':insideType==='عبوة'?'إجمالي العبوات':'إجمالي الأكياس';
   const innerTotal=amount(field(portion,countLabel));
   if(!pack||!singlePrice||!cartonPrice||!rowTotal||!innerTotal)return null;
   const moneyFields=[field(portion,insideType==='قطعة'?'سعر القطعة':insideType==='عبوة'?'سعر العبوة':'سعر الكيس'),field(portion,'سعر الكرتون'),field(portion,'إجمالي الصنف')];
   if(moneyFields.some(v=>!/\bUSD\b/u.test(v||'')||/\b(?:EUR|TRY|SAR|SYP)\b/u.test(v||'')))return null;
   const quantity=decimalToScaled(qty,0),per=decimalToScaled(pack,0);
   if(quantity<=0n||per<=0n||decimalToScaled(qty,2)!==quantity*100n||decimalToScaled(pack,2)!==per*100n)return null;
   const price=decimalToScaled(cartonPrice,2),line=decimalToScaled(rowTotal,2);
   if(price!==decimalToScaled(lineTotal(singlePrice,pack),2)||
      line!==decimalToScaled(lineTotal(qty,cartonPrice),2)||
      decimalToScaled(innerTotal,0)!==quantity*per)return null;
   cartons+=quantity;inside+=quantity*per;goods+=line;
   items.push({savedItemId:'',descriptionEn:'',descriptionAr:name,quantity:qty,unit:'CTN',
     unitPrice:cartonPrice,packing:pack+' '+insideType+' في الكرتون'});
 }
 const check=(key:string,expected:bigint,scale:number)=>{
   const v=field(input,key);return v===null||amount(v)!==null&&decimalToScaled(amount(v)!,scale)===expected;
 };
 if(!check('إجمالي عدد الكراتين',cartons,0)||
   !check('إجمالي عدد الوحدات الداخلية',inside,0)||
   !check('إجمالي قيمة البضائع',goods,2))return null;
 const discountRaw=field(input,'الخصم التجاري'),discountValue=field(input,'قيمة الخصم');
 const shippingRaw=field(input,'تكاليف النقل والشحن'),afterRaw=field(input,'المجموع بعد الخصم');
 const finalRaw=field(input,'الإجمالي النهائي قبل أي ضرائب');
 const hasAdjustments=[discountRaw,discountValue,shippingRaw,afterRaw,finalRaw].some(Boolean);
 let note='';
 if(hasAdjustments){
   if([discountRaw,discountValue,shippingRaw,afterRaw,finalRaw].some(v=>v===null))return null;
   const pct=amount(discountRaw),discount=amount(discountValue),shipping=amount(shippingRaw),
     after=amount(afterRaw),final=amount(finalRaw);
   if(!pct||!discount||!shipping||!after||!final||!discountRaw!.includes('%'))return null;
   const p=decimalToScaled(pct,0);
   if(p<0n||p>100n||decimalToScaled(pct,2)!==p*100n)return null;
   const discountCents=(goods*p+50n)/100n,post=goods-discountCents,
     shippingCents=decimalToScaled(shipping,2);
   if(discountCents!==decimalToScaled(discount,2)||post!==decimalToScaled(after,2)||
     post+shippingCents!==decimalToScaled(final,2))return null;
   note='المجموع الفرعي للبضائع: '+(Number(goods)/100).toFixed(2)+' USD؛ الخصم المرجعي: '+
     discount+' USD ('+pct+'%)؛ الشحن المرجعي: '+shipping+' USD؛ الإجمالي المرجعي قبل الضرائب: '+final+
     ' USD. الخصم والشحن لم يُطبَّقا في حقول الحساب المحاسبي؛ يجب إدخالهما ومراجعتهما في محرر المستند قبل الاعتماد.';
 }
 const rawTerms=field(input,'طريقة الدفع')||'',delivery=field(input,'مدة تجهيز الطلب')||'',
   validity=field(input,'مدة الصلاحية')||'',destination=field(input,'مكان التسليم')||'';
 return{capability:'document.createDraft',kind:'proforma',customerId:'',
   customerDraft:{companyNameEn:'',companyNameAr:buyer,contactPerson:'',addressEn:'',addressAr:'',
     city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''},
   currency:'USD',language:'bilingual',items,incoterm:'',paymentTerms:rawTerms.slice(0,120),
   deliveryTime:delivery.slice(0,120),validity:validity.slice(0,100),
   remarks:destination.slice(0,300),notes:note.slice(0,800),
   label:'Unsaved structured carton quotation',rationale:'Validated explicit cartons, inner pieces, unit prices and declared totals locally; no provider call, saved record or issuance.'};
 }catch{return null;}
}
