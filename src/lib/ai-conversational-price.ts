import type {VaultPayload,SavedItem} from '../types.js';
import type {ConversationKernel} from './ai-conversation-kernel.js';
import {scopeVault} from './workspaces.js';
import {prepareAiBulkProductUpdate,type AiBulkProductBatch} from './ai-product-bulk-update.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {aiProductArchived} from './ai-business.js';
import {explicitQuoteConversionIntent} from './ai-quote-source-draft.js';

/** Interpreted values are conversation-only. Nothing is changed or submitted
 * until the existing scope-bound approval gateway independently authorizes it.
 * This small parser is an execution boundary, not a restriction on conversation. */
export interface ConversationalPriceIntent {
  amount:string;
  currency:string;
  unit:string;
  itemId:string;
  startedAtTurn:number;
}
const digits=(v:string)=>String(v||'').normalize('NFKC')
  .replace(/[٠-٩۰-۹]/gu,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
const normalized=(v:string)=>digits(v).replace(/[\u064b-\u065f\u0670\u0640]/gu,'')
  .replace(/[إأٱآ]/gu,'ا').replace(/ى/gu,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
const currencyOf=(v:string):string=>{
  if(/\b(?:usd)\b|\$|دولار(?:\s+امريكي)?/iu.test(v))return'USD';
  if(/\b(?:eur)\b|€|يورو/iu.test(v))return'EUR';
  if(/\b(?:try)\b|₺|ليرة\s+تركية/iu.test(v))return'TRY';
  const code=v.match(/\b([A-Z]{3})\b/u);
  return code&&['USD','EUR','TRY','GBP','AED','SAR','SYP'].includes(code[1]!)?code[1]!:'';
};
const unitOf=(v:string):string=>{
  if(/(?:ل(?:ل|ال)?\s*كرتون|كرتون|كراتين|per\s+carton|cartons?|\bCTN\b)/iu.test(v))return'CTN';
  if(/(?:ل(?:ل|ال)?\s*قطعة|قطعة|per\s+(?:piece|unit)|\bPCS\b)/iu.test(v))return'PCS';
  return'';
};
function sameUnit(a:string,b:string):boolean{
  const u=(v:string)=>unitOf(v)||(normalized(v)==='ctn'?'CTN':normalized(v)==='pcs'?'PCS':normalized(v).toUpperCase());
  return u(a)===u(b);
}
export function quotationCreationHasPriority(message:string):boolean{
  return explicitQuoteConversionIntent(message);
}
export function parseConversationalSalePrice(message:string):Pick<ConversationalPriceIntent,'amount'|'currency'|'unit'>|null{
  const s=digits(message).replace(/\s+/g,' ').trim();
  if(!s||s.length>300||
    /^(?:لا|مو|مش|بدون|ما\s+(?:بدي|اريد|أريد|تغير|تعدل|تغيّر|تعدّل)|don't|do not|never)(?:\s|$)/iu.test(s)||
    /^(?:هل|كم|ليش|لماذا|why|how|what|is|can)(?:\s|$)/iu.test(s)||
    /(?:كم|ما هو|ماهي|what is)\s+(?:سعر|price)/iu.test(s))return null;
  // A unit price quoted inside a NEW document request is a line-item fact,
  // never authorization to change the company's saved product selling price.
  if(quotationCreationHasPriority(s))return null;
  const priceMark=/(?:سعر\s*(?:ال)?بيع|سعر\s*(?:ال)?منتج|سعر\s*(?:ال)?صنف|selling\s*price|sale\s*price|unit\s*price)/iu;
  if(!priceMark.test(s))return null;
  const numeric=s.match(/(?:سعر\s*(?:ال)?بيع|سعر\s*(?:ال)?منتج|سعر\s*(?:ال)?صنف|selling\s*price|sale\s*price|unit\s*price)(?:\s*(?:هذا|لهذا|للصنف|للمنتج))?\s*(?:إلى|الى|هو|يكون|ب|=|:|to|at|is|of)?\s*(\d{1,12}(?:[.,]\d{1,4})?)/iu)
    ||s.match(/(?:خلّي|خلي|اجعل|حدد|غيّر|غير|عدل|عدّل|set|change|update)\s+.{0,70}?(?:سعر\s*(?:ال)?بيع|selling\s*price|sale\s*price)\s*(?:إلى|الى|هو|يكون|=|:|to|at|is)?\s*(\d{1,12}(?:[.,]\d{1,4})?)/iu);
  if(!numeric)return null;
  const amount=normalizeDecimalInput(numeric[1]!.replace(',','.'));
  if(!isNonNegativeDecimalInput(amount))return null;
  return{amount,currency:currencyOf(s),unit:unitOf(s)};
}
export function parsePriceFollowup(message:string):{currency:string;unit:string;target:string}|null{
  const s=digits(message).trim();
  if(!s||s.length>140)return null;
  const currency=currencyOf(s),unit=unitOf(s);
  // Only exact product names or short context references are eligible as
  // selection evidence. A generic new discussion cannot revive an old price.
  const target=s.replace(/^(?:الصنف|المنتج|هو|اختار|اختر|اختاروا|select|product|item)\s+/iu,'').trim();
  return{currency,unit,target};
}
export function resolvePriceProduct(vault:VaultPayload,kernel:ConversationKernel,target:string,itemId=''):SavedItem|null{
  if(kernel.scope.scope!=='business'||kernel.scope.workspaceId!==(vault.appSettings.activeWorkspaceId||'default')||
     kernel.scope.branchId!==(vault.appSettings.activeBranchId||'main'))
    throw new Error('The company or branch changed; start a new price review.');
  const all=scopeVault(vault).savedItems.filter(x=>!aiProductArchived(x));
  const exact=(id:string)=>all.filter(x=>x.id===id);
  if(itemId){const rows=exact(itemId);return rows.length===1?rows[0]!:null;}
  const name=normalized(target);
  if(name&&name!=='هذا'&&name!=='نفس الصنف'){
    const rows=all.filter(x=>[x.sku,x.descriptionAr,x.descriptionEn].some(label=>label&&normalized(label)===name));
    if(rows.length>1)throw new Error('Product name is ambiguous. Select the exact product or SKU.');
    if(rows.length===1)return rows[0]!;
  }
  if(target&&!/^(?:هذا|هدا|نفس الصنف|selected product|this product)$/iu.test(target.trim()))
    return null;
  const selected=kernel.selection?.items.filter(x=>x.entityType==='product'&&kernel.selection?.selectedIds?.includes(x.entityId))||[];
  if(selected.length>1)throw new Error('More than one product is selected; choose one exact product for this price.');
  const ref=selected.length===1?selected[0]!.entityId:
    kernel.entity?.entityType==='product'?kernel.entity.entityId:
    kernel.selection?.selectedId&&kernel.selection.items.some(x=>x.entityId===kernel.selection!.selectedId&&x.entityType==='product')?kernel.selection.selectedId:'';
  return ref?exact(ref)[0]||null:null;
}
export function prepareConversationalSalePrice(vault:VaultPayload,kernel:ConversationKernel,intent:ConversationalPriceIntent):AiBulkProductBatch{
  if(!intent||!isNonNegativeDecimalInput(intent.amount)||!intent.itemId)
    throw new Error('A verified product and numeric price are required.');
  const product=resolvePriceProduct(vault,kernel,'',intent.itemId);
  if(!product)throw new Error('The selected product is missing from this company.');
  if(intent.unit&&(!product.unit||!sameUnit(intent.unit,product.unit)))
    throw new Error('The requested price unit differs from this product unit. Clarify before reviewing.');
  const currency=intent.currency||product.lastCurrency||'';
  if(!/^[A-Z]{3}$/.test(currency))
    throw new Error('Specify the currency before reviewing this product price.');
  return prepareAiBulkProductUpdate(vault,[{itemId:product.id,patch:{lastUnitPrice:intent.amount,lastCurrency:currency}}]);
}
