import type {VaultPayload} from '../types.js';
import {decimalToScaled, isDecimalInput, isNonNegativeDecimalInput, normalizeDecimalInput} from './money.js';
import {normalizeSavedItemSku} from './saved-items.js';
import {AI_BULK_PRODUCT_LIMIT, prepareAiBulkProductUpdate, type AiBulkProductBatch} from './ai-product-bulk-update.js';

/** Explicit, business-scoped transformations. File data never authorizes these commands. */
export interface AiBulkProductTransform {
  selector:'all'|'missingSku';
  pricePercent?:string;
  generateMissingSku?:boolean;
  skuPrefix?:string;
}
function priceWithPercent(price:string,percent:string):string{
  if(!isNonNegativeDecimalInput(price)||!price.trim())throw new Error('Every selected product needs a valid recorded sale price.');
  const old=decimalToScaled(price,4);
  const percentScaled=decimalToScaled(percent,4);
  const multiplier=1_000_000n+percentScaled;
  if(multiplier<0n)throw new Error('A percentage discount cannot exceed 100%.');
  const numerator=old*multiplier,divisor=100_000_000n;
  const cents=(numerator+divisor/2n)/divisor;
  return String(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
}
export function prepareAiBulkProductTransform(vault:VaultPayload,input:unknown):AiBulkProductBatch{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid product transformation.');
  const transform=input as Record<string,unknown>;
  if(Object.keys(transform).some(key=>!['selector','pricePercent','generateMissingSku','skuPrefix'].includes(key)))
    throw new Error('Unsupported bulk product transformation field.');
  if(transform.selector!=='all'&&transform.selector!=='missingSku')throw new Error('Specify a safe product selection.');
  const generate=transform.generateMissingSku===true;
  if(transform.generateMissingSku!==undefined&&typeof transform.generateMissingSku!=='boolean')
    throw new Error('Invalid SKU generation setting.');
  const wantsPrice=Object.hasOwn(transform,'pricePercent');
  if(!wantsPrice&&!generate)throw new Error('No product changes were requested.');
  if(generate&&transform.selector!=='missingSku')throw new Error('Automatic SKU generation requires the missing-SKU selection.');
  if(wantsPrice&&typeof transform.pricePercent!=='string')throw new Error('Supply a numeric percentage.');
  const percent=wantsPrice?normalizeDecimalInput(transform.pricePercent as string):'';
  if(wantsPrice&&(!isDecimalInput(percent)||percent.length>16||
    decimalToScaled(percent,4)<-1_000_000n||decimalToScaled(percent,4)>5_000_000n||
    decimalToScaled(percent,4)===0n))throw new Error('Percentage must be between -100 and 500, excluding zero.');
  const prefix=String(transform.skuPrefix??'SKU').trim().toUpperCase();
  if((transform.skuPrefix!==undefined&&!generate)||!/^[A-Z0-9]{1,12}$/.test(prefix))throw new Error('Invalid SKU prefix.');
  const workspaceId=vault.appSettings.activeWorkspaceId||'default';
  const current=vault.savedItems.filter(item=>(item.workspaceId||'default')===workspaceId);
  const selected=current.filter(item=>!item.archived&&(transform.selector==='all'||!normalizeSavedItemSku(item.sku||'')));
  if(!selected.length)throw new Error('No active products match the requested transformation.');
  if(selected.length>AI_BULK_PRODUCT_LIMIT)
    throw new Error('More than 40 products match. Nothing was changed. Review smaller explicit batches.');
  const used=new Set(current.map(item=>normalizeSavedItemSku(item.sku||'')).filter(Boolean));
  let counter=1;
  const updates=selected.map(item=>{
    const patch:Record<string,string>={};
    if(generate&&!normalizeSavedItemSku(item.sku||'')){
      let sku='';
      do {
        if(counter>999999)throw new Error('SKU sequence exhausted.');
        sku=prefix+'-'+String(counter++).padStart(4,'0');
      } while(used.has(normalizeSavedItemSku(sku)));
      patch.sku=sku;used.add(normalizeSavedItemSku(sku));
    }
    if(wantsPrice){
      if(!/^[A-Z]{3}$/.test(item.lastCurrency||''))throw new Error('A selected product has no valid sale currency.');
      patch.lastUnitPrice=priceWithPercent(item.lastUnitPrice,percent);
    }
    return{itemId:item.id,patch};
  });
  return prepareAiBulkProductUpdate(vault,updates);
}
function normalizedDigits(input:string):string{
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  return [...input.normalize('NFKC')].map(c=>ar.includes(c)?String(ar.indexOf(c)):fa.includes(c)?String(fa.indexOf(c)):c).join('');
}
/** Only recognize unambiguous whole-active-catalog pricing or missing-SKU user commands. */
export function parseAiBulkProductTransformIntent(message:string):AiBulkProductTransform|null{
  const s=normalizedDigits(message).toLowerCase().trim();
  if(s.length>500||!s||!/(?:products?|items?|prices?|sku|منتجات|المنتجات|الأصناف|اصناف|اصناف|صنف|أسعار|اسعار|سعر|كود|أكواد|اكواد)/iu.test(s))return null;
  const all=/(?:\ball\b|\bevery\b|جميع|كل|كافة)/iu.test(s);
  const isSku=/(?:\bsku\b|codes?|أكواد|اكواد|كود|رموز)/iu.test(s);
  const missing=/(?:missing|without|blank|no sku|empty|بدون|فارغ|ناقصة|ناقص|ليس لها|ما لها|ليس لديها|غير موجود)/iu.test(s);
  const generate=Boolean(isSku&&missing&&/(?:generate|create|assign|add|fill|أنشئ|انشئ|ولّد|ولد|أضف|اضف|سوي|حط|عبئ|املأ)/iu.test(s));
  const prices=/(?:prices?|pricing|سعر|أسعار|اسعار)/iu.test(s);
  const percentMatch=s.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|٪)/u);
  const up=/(?:increase|raise|markup|mark up|add|up|زود|زد|زيد|ارفع|رفع|زيادة|اضف|أضف)/iu.test(s);
  const down=/(?:decrease|reduce|discount|lower|cut|خفض|قلل|خصم|نقص|انقص)/iu.test(s);
  if(generate&&!percentMatch)return{selector:'missingSku',generateMissingSku:true};
  if(prices&&all&&percentMatch&&up!==down){
    const pct=normalizeDecimalInput(percentMatch[1]!.replace(',','.'));
    if(!isDecimalInput(pct))return null;
    return{selector:'all',pricePercent:(down?'-':'')+pct};
  }
  return null;
}
