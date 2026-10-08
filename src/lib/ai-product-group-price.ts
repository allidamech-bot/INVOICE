import type {SavedItem,VaultPayload} from '../types.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {normalizeSavedItemIdentity} from './saved-items.js';
import {AI_BULK_PRODUCT_LIMIT,prepareAiBulkProductUpdate,type AiBulkProductBatch} from './ai-product-bulk-update.js';

export interface AiProductGroupPriceRequest{nameContains:string;sizeGrams:string;unitPrice:string;currency?:string;}
const currencies:Record<string,string>={usd:'USD',dollar:'USD',dollars:'USD','دولار':'USD',sar:'SAR',riyal:'SAR',riyals:'SAR','ريال':'SAR',eur:'EUR',euro:'EUR','يورو':'EUR',try:'TRY',lira:'TRY','ليرة':'TRY'};
function asciiDigits(raw:string):string{
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  return [...raw.normalize('NFKC')].map(c=>ar.includes(c)?String(ar.indexOf(c)):fa.includes(c)?String(fa.indexOf(c)):c).join('');
}
function failNegated(raw:string):boolean{
  return /(?:don't|do not|never|without changing|only preview|preview only|لا\s*(?:تغير|تغيّر|تعدل|تعدّل)|بدون\s*(?:تغيير|تعديل)|معاينة\s*فقط)/iu.test(raw);
}
/** A constrained parser: no guessed SKU, product, price, exchange rate or currency. */
export function parseAiProductGroupPriceIntent(message:string):AiProductGroupPriceRequest|null{
  const s=asciiDigits(message).trim().toLowerCase().replace(/\s+/g,' ');
  if(!s||s.length>400||failNegated(s)||/%|٪/.test(s))return null;
  const currency='(?:usd|sar|eur|try|dollars?|riyals?|euro|lira|دولار|ريال|يورو|ليرة)';
  const en=new RegExp('(set|change|update)\\s+(?:the\\s+)?(?:price\\s+(?:of|for)\\s+)?([a-z][a-z0-9\\s-]{1,48}?)\\s+(\\d{1,4})\\s*(?:g|gr|grams?)\\s+(?:price\\s+)?(?:to|at|=)\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*('+currency+')?','iu');
  const ar=new RegExp('(?:خلي|خلّي|اجعل|غير|غيّر|عدل|عدّل)\\s+(?:سعر\\s+)?([\\p{L}\\p{N}\\s-]{2,52}?)\\s+(\\d{1,4})\\s*(?:غرام|جرام|g|gr)\\s+(?:السعر\\s+|سعرها\\s+|بسعر\\s+|إلى\\s+|الى\\s+|يكون\\s+|=\\s*)?(\\d+(?:[.,]\\d{1,2})?)\\s*('+currency+')?','iu');
  const m=en.exec(s)||ar.exec(s);
  if(!m)return null;
  const nameContains=m[2]!.replace(/^(?:all|the|كل|جميع|مجموعة|أصناف|اصناف)\s+/iu,'').trim();
  const sizeGrams=m[3]!,unitPrice=m[4]!.replace(',','.');
  const currencyToken=m[5]?.trim()||'';
  if(!nameContains||nameContains.length<2||!isNonNegativeDecimalInput(unitPrice))return null;
  const explicitCurrency=currencyToken?currencies[currencyToken]||currencyToken.toUpperCase():undefined;
  return{nameContains,sizeGrams,unitPrice,currency:explicitCurrency};
}
function normalizeName(text:string):string{
  return normalizeSavedItemIdentity(text).replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function containsName(item:SavedItem,needle:string):boolean{
  const safe=normalizeName(needle);
  if(!safe)return false;
  return [item.descriptionEn,item.descriptionAr].some(value=>{
    const hay=normalizeName(value||'');
    return (' '+hay+' ').includes(' '+safe+' ');
  });
}
function weightMatches(item:SavedItem,grams:string):boolean{
  const g=String(Number(grams));
  if(!g||g==='NaN'||Number(g)<1||Number(g)>5000)return false;
  const expression=new RegExp('(?:^|[^0-9])0*'+g+'\\s*(?:g|gr|grams?|غرام|جرام)(?=$|[^\\p{L}\\p{N}])','iu');
  return [item.descriptionEn,item.descriptionAr,item.packing].some(value=>expression.test(value||''));
}
/** Matches ONLY active products in the current company by named group AND weight. */
export function prepareAiProductGroupPrice(vault:VaultPayload,request:unknown):AiBulkProductBatch{
  if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('Invalid product group price request.');
  const input=request as Record<string,unknown>;
  if(Object.keys(input).some(key=>!['nameContains','sizeGrams','unitPrice','currency'].includes(key)))
    throw new Error('Unsupported product group price instruction.');
  const name=typeof input.nameContains==='string'?input.nameContains.trim():'';
  const grams=typeof input.sizeGrams==='string'?input.sizeGrams.trim():'';
  const price=typeof input.unitPrice==='string'?normalizeDecimalInput(input.unitPrice):'';
  const currency=typeof input.currency==='string'?input.currency.trim().toUpperCase():'';
  if(name.length<2||name.length>50||!/^[0-9]{1,4}$/.test(grams)||Number(grams)<1||Number(grams)>5000)
    throw new Error('Product group name and exact pack weight are required.');
  if(!isNonNegativeDecimalInput(price)||!price||!/^\d+(?:\.\d{1,2})?$/.test(price))
    throw new Error('Specify an explicit valid selling price with at most two decimals.');
  if(currency&&!/^[A-Z]{3}$/.test(currency))throw new Error('Invalid explicit sale currency.');
  const activeWorkspace=vault.appSettings.activeWorkspaceId||'default';
  const matched=vault.savedItems.filter(item=>(item.workspaceId||'default')===activeWorkspace&&!item.archived&&containsName(item,name)&&weightMatches(item,grams));
  if(!matched.length)throw new Error('No saved products match both the named group and pack weight. Nothing changed.');
  if(matched.length>AI_BULK_PRODUCT_LIMIT)throw new Error('More than 120 products match; split the group into reviewable batches.');
  const savedCurrency=matched[0]?.lastCurrency||'';
  if(!currency&&(!/^[A-Z]{3}$/.test(savedCurrency)||matched.some(item=>item.lastCurrency!==savedCurrency)))
    throw new Error('Mixed or missing recorded currencies. Specify an explicit currency before changing these prices.');
  if(matched.some(item=>item.lastUnitPrice===price&&(item.lastCurrency||'')===(currency||savedCurrency)))
    throw new Error('At least one matched product already has the target price; review the group before saving.');
  const updates=matched.map(item=>({itemId:item.id,patch:{lastUnitPrice:price,lastCurrency:currency||savedCurrency}}));
  return prepareAiBulkProductUpdate(vault,updates);
}
