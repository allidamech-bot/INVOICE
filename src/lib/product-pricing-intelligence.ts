import type { PricingMethod, PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { pricingSuggestedUnitPrice } from './commercial-controls.js';
import { decimalToScaled } from './money.js';
import { purchaseAccountingIsValid } from './operations.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';
import { buildSupplierPurchasingContext, type SupplierPurchasingContext } from './supplier-purchasing-intelligence.js';

export type PricingHealth='no-cost'|'no-sale-price'|'currency-mismatch'|'below-cost'|'below-policy'|'meets-policy';

export interface PricingScenarioRequest {method:PricingMethod;percent:string;}
export interface PricingScenarioResult {
  method:PricingMethod;
  percent:string;
  unitPrice:string;
  grossProfit:string;
  marginPercent:string;
  markupPercent:string;
}
export interface ProductPricingInsight {
  id:string;
  name:string;
  descriptionEn:string;
  descriptionAr:string;
  sku:string;
  category:string;
  tags:string[];
  hsCode:string;
  unit:string;
  currency:string;
  cost:string;
  salePrice:string;
  suggestedPrice:string;
  policyMethod:PricingMethod;
  policyPercent:string;
  currentMarginPercent:string;
  currentMarkupPercent:string;
  priceVsSuggestedPercent:string;
  costChangePercent:string;
  pricingHealth:PricingHealth;
  duplicateWith:string;
  dormant:boolean;
  missing:string[];
  scenario:PricingScenarioResult|null;
  signals:string[];
}
export interface ProductPricingContext {
  version:1;
  basis:'deterministic-product-pricing';
  requestedScenario:PricingScenarioRequest|null;
  rows:ProductPricingInsight[];
  purchasing:SupplierPurchasingContext;
  limitations:string[];
}

const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';
function latinDigits(value:string):string{return value.replace(/[٠-٩]/g,digit=>String(ARABIC_DIGITS.indexOf(digit))).replace(/[٪﹪]/g,'%');}
function normalized(value:string):string{return latinDigits(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();}
function isoDate(value:string):string{return /^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):'';}
function shiftIso(date:string,days:number):string{const [y,m,d]=date.split('-').map(Number);const next=new Date(Date.UTC(y||0,(m||1)-1,(d||1)+days));return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}`;}
function centsString(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function scaled4ToMoney(value:bigint):string{const sign=value<0n?-1n:1n;const abs=value<0n?-value:value;const cents=(abs+50n)/100n;return centsString(sign*cents);}
function percentString(numerator:bigint,denominator:bigint):string{if(denominator<=0n)return'';const negative=numerator<0n;const abs=numerator<0n?-numerator:numerator;const hundredths=abs*10_000n/denominator;return `${negative?'-':''}${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;}
function markupPercent(price:string,cost:string):string{const p=decimalToScaled(price||'0',4),c=decimalToScaled(cost||'0',4);return c>0n?percentString(p-c,c):'';}
function marginPercent(price:string,cost:string):string{const p=decimalToScaled(price||'0',4),c=decimalToScaled(cost||'0',4);return p>0n?percentString(p-c,p):'';}
function differencePercent(current:string,reference:string):string{const now=decimalToScaled(current||'0',4),base=decimalToScaled(reference||'0',4);return base>0n?percentString(now-base,base):'';}
function itemName(item:SavedItem):string{return (item.descriptionEn||item.descriptionAr||item.sku||'Unnamed item').trim();}
function duplicateKey(item:SavedItem):string{const sku=normalizeSavedItemSku(item.sku??'');if(sku)return`sku:${sku}`;const en=normalizeSavedItemIdentity(item.descriptionEn);if(en)return`en:${en}`;const ar=normalizeSavedItemIdentity(item.descriptionAr);return ar?`ar:${ar}`:'';}
function supplierCostHistory(purchases:PurchaseRecord[]):Map<string,Array<{currency:string;unitCost:string;date:string}>>{
  const map=new Map<string,Array<{currency:string;unitCost:string;date:string}>>();
  const ordered=purchases.filter(purchase=>purchase.status==='posted'&&purchaseAccountingIsValid(purchase)).sort((a,b)=>(b.date||b.postedAt).localeCompare(a.date||a.postedAt));
  for(const purchase of ordered)for(const line of purchase.items){if(!line.savedItemId||!line.unitCost.trim())continue;const list=map.get(line.savedItemId)??[];list.push({currency:purchase.currency.toUpperCase(),unitCost:line.unitCost,date:purchase.date});map.set(line.savedItemId,list);}
  return map;
}
function costChange(rows:Array<{currency:string;unitCost:string;date:string}>):string{
  const latest=rows[0];if(!latest)return'';const previous=rows.find(row=>row.currency===latest.currency&&row.unitCost!==latest.unitCost&&row.date<=latest.date);return previous?differencePercent(latest.unitCost,previous.unitCost):'';
}
function parseScenarioRequest(message:string):PricingScenarioRequest|null{
  const value=normalized(message);let method:PricingMethod|null=null;
  if(/\bmargin\b|هامش/.test(value))method='margin';
  else if(/\bmarkup\b|زيادة على التكلفة|فوق التكلفة/.test(value))method='markup';
  if(!method)return null;
  const keyword=method==='margin'?'(?:margin|هامش)':'(?:markup|زيادة على التكلفة|فوق التكلفة)';
  const match=value.match(new RegExp(`${keyword}[^0-9]{0,18}(\\d{1,4}(?:\\.\\d{1,2})?)\\s*%?`));
  if(!match?.[1])return null;const percent=match[1];const scaled=decimalToScaled(percent,4);if(scaled<=0n)return null;if(method==='margin'&&scaled>=1_000_000n)return null;if(method==='markup'&&scaled>10_000_000n)return null;return{method,percent};
}
function scenarioFor(cost:string,rounding:string,request:PricingScenarioRequest|null):PricingScenarioResult|null{
  if(!cost||!request)return null;const unitPrice=pricingSuggestedUnitPrice(cost,{method:request.method,percent:request.percent,rounding});if(!unitPrice)return null;const p=decimalToScaled(unitPrice,4),c=decimalToScaled(cost,4);return{method:request.method,percent:request.percent,unitPrice,grossProfit:scaled4ToMoney(p-c),marginPercent:marginPercent(unitPrice,cost),markupPercent:markupPercent(unitPrice,cost)};
}
function queryScore(item:SavedItem,message:string):number{
  const tokens=normalized(message).split(' ').filter(token=>token.length>=2&&!/^\d/.test(token));if(!tokens.length)return 0;
  const haystack=normalized([item.sku??'',item.descriptionEn,item.descriptionAr,item.category??'',item.hsCode,...(item.tags??[])].join(' '));return tokens.reduce((score,token)=>score+(haystack.includes(token)?1:0),0);
}

export function buildProductPricingContext(vault:VaultPayload,message:string,asOf:string):ProductPricingContext{
  const request=parseScenarioRequest(message);const dormantCutoff=shiftIso(asOf,-90);const history=supplierCostHistory(vault.purchases);const policy=vault.company.commercial.pricing;const purchasing=buildSupplierPurchasingContext(vault,message,asOf);
  const duplicateMap=new Map<string,SavedItem[]>();for(const item of vault.savedItems.filter(item=>!item.archived)){const key=duplicateKey(item);if(!key)continue;const list=duplicateMap.get(key)??[];list.push(item);duplicateMap.set(key,list);}const duplicateWith=new Map<string,string>();for(const group of duplicateMap.values())if(group.length>1){const primary=group[0]!;for(const duplicate of group.slice(1))duplicateWith.set(duplicate.id,primary.id);}
  const rows=vault.savedItems.filter(item=>!item.archived).map(item=>{
    const rows=history.get(item.id)??[];const latest=rows[0];const cost=(item.lastUnitCost||latest?.unitCost||'').trim();const costCurrency=(item.lastCostCurrency||latest?.currency||'').trim().toUpperCase();const salePrice=(item.lastUnitPrice||'').trim();const saleCurrency=(item.lastCurrency||'').trim().toUpperCase();const currency=costCurrency||saleCurrency||vault.company.defaultCurrency||'USD';const comparable=Boolean(cost&&salePrice&&costCurrency&&saleCurrency&&costCurrency===saleCurrency);const suggestedPrice=cost?pricingSuggestedUnitPrice(cost,policy):'';
    let pricingHealth:PricingHealth='meets-policy';if(!cost)pricingHealth='no-cost';else if(!salePrice)pricingHealth='no-sale-price';else if(!comparable)pricingHealth='currency-mismatch';else if(decimalToScaled(salePrice,4)<decimalToScaled(cost,4))pricingHealth='below-cost';else if(suggestedPrice&&decimalToScaled(salePrice,4)<decimalToScaled(suggestedPrice,4))pricingHealth='below-policy';
    const missing:string[]=[];if(!(item.sku??'').trim())missing.push('sku');if(!item.hsCode.trim())missing.push('hsCode');if(!cost)missing.push('cost');if(!(item.category??'').trim())missing.push('category');if(!item.descriptionEn.trim())missing.push('descriptionEn');if(!item.descriptionAr.trim())missing.push('descriptionAr');
    const used=isoDate(item.lastUsedAt),created=isoDate(item.createdAt);const dormant=item.usageCount>0?Boolean(used&&used<=dormantCutoff):Boolean(created&&created<=dormantCutoff);const change=costChange(rows);const signals:string[]=[];if(duplicateWith.has(item.id))signals.push('possible-duplicate');if(dormant)signals.push('dormant-90-plus');if(missing.length)signals.push('incomplete-product-data');if(missing.includes('descriptionEn')||missing.includes('descriptionAr'))signals.push('bilingual-description-incomplete');if(pricingHealth==='below-cost')signals.push('sale-price-below-cost');else if(pricingHealth==='below-policy')signals.push('sale-price-below-policy');if(change&&decimalToScaled(change.replace('-',''),2)>=2000n)signals.push(decimalToScaled(change,2)>0n?'cost-up-20-plus':'cost-down-20-plus');
    const insight:ProductPricingInsight={id:item.id,name:itemName(item),descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,sku:item.sku??'',category:item.category??'',tags:(item.tags??[]).filter(tag=>!tag.startsWith('__lourex_')).slice(0,12),hsCode:item.hsCode,unit:item.unit,currency,cost,salePrice,suggestedPrice,policyMethod:policy.method,policyPercent:policy.percent,currentMarginPercent:comparable?marginPercent(salePrice,cost):'',currentMarkupPercent:comparable?markupPercent(salePrice,cost):'',priceVsSuggestedPercent:comparable&&suggestedPrice?differencePercent(salePrice,suggestedPrice):'',costChangePercent:change,pricingHealth,duplicateWith:duplicateWith.get(item.id)||'',dormant,missing,scenario:scenarioFor(cost,policy.rounding,request),signals};
    return{insight,score:queryScore(item,message)};
  }).sort((a,b)=>b.score-a.score||b.insight.signals.length-a.insight.signals.length||a.insight.name.localeCompare(b.insight.name)).slice(0,30).map(row=>row.insight);
  return{version:1,basis:'deterministic-product-pricing',requestedScenario:request,rows,purchasing,limitations:['currencies-remain-separate','price-cost-comparisons-require-matching-saved-currencies','scenario-prices-use-company-rounding','ai-may-explain-pricing-results-but-cannot-apply-a-selling-price','missing-or-ambiguous-values-are-not-invented']};
}
