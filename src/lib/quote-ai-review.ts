import type { Customer, SavedItem, VaultPayload } from '../types.js';
import { pricingSuggestedUnitPrice } from './commercial-controls.js';
import { decimalToScaled } from './money.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';

export interface QuoteAiSourceItem {
  sku:string;
  descriptionEn:string;
  descriptionAr:string;
  quantity:string;
  unit:string;
  unitPrice:string;
  quantityConfidence:number;
  quantityAmbiguous:boolean;
  quantityNote:string;
  productConfidence:number;
  productNote:string;
}
export interface QuoteAiSourceDraft {
  customerName:string;
  customerEmail:string;
  customerPhone:string;
  customerConfidence:number;
  customerNote:string;
  currency:string;
  incoterm:string;
  paymentTerms:string;
  deliveryTime:string;
  validity:string;
  remarks:string;
  notes:string;
  items:QuoteAiSourceItem[];
}
export type QuoteAiWarning='unknown-product'|'ambiguous-quantity'|'low-product-confidence'|'missing-cost'|'currency-mismatch'|'below-cost'|'below-policy'|'missing-selling-price';
export type QuoteAiPriceSource='explicit-source'|'saved-sale-price'|'pricing-policy'|'none';
export interface QuoteAiItemReview {
  index:number;
  matchedItemId:string;
  matchedItemName:string;
  matchConfidence:number;
  matchBasis:'sku'|'description-en'|'description-ar'|'none';
  effectiveUnitPrice:string;
  priceSource:QuoteAiPriceSource;
  cost:string;
  costCurrency:string;
  suggestedPrice:string;
  marginPercent:string;
  warnings:QuoteAiWarning[];
}
export interface QuoteAiCustomerReview {
  customerId:string;
  customerName:string;
  matchConfidence:number;
  matchBasis:'email'|'phone'|'name-en'|'name-ar'|'none';
}
export interface QuoteAiReview {
  currency:string;
  customer:QuoteAiCustomerReview;
  items:QuoteAiItemReview[];
  warningCount:number;
  blockingAttentionCount:number;
}

const SCALE=12;
function normalized(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function phoneDigits(value:string):string{return value.replace(/\D/g,'');}
function itemName(item:SavedItem):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();}
function marginPercent(price:string,cost:string):string{
  if(!price||!cost)return'';const p=decimalToScaled(price,SCALE),c=decimalToScaled(cost,SCALE);if(p<=0n)return'';
  const numerator=(p-c)*10_000n;const hundredths=numerator/p;const negative=hundredths<0n;const abs=negative?-hundredths:hundredths;
  return `${negative?'-':''}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}
function findProduct(items:SavedItem[],row:QuoteAiSourceItem):{item:SavedItem|null;basis:QuoteAiItemReview['matchBasis'];confidence:number}{
  const sku=normalizeSavedItemSku(row.sku||'');if(sku){const item=items.find(entry=>normalizeSavedItemSku(entry.sku??'')===sku);if(item)return{item,basis:'sku',confidence:1};}
  const en=normalizeSavedItemIdentity(row.descriptionEn||'');if(en){const item=items.find(entry=>normalizeSavedItemIdentity(entry.descriptionEn)===en);if(item)return{item,basis:'description-en',confidence:.96};}
  const ar=normalizeSavedItemIdentity(row.descriptionAr||'');if(ar){const item=items.find(entry=>normalizeSavedItemIdentity(entry.descriptionAr)===ar);if(item)return{item,basis:'description-ar',confidence:.96};}
  return{item:null,basis:'none',confidence:0};
}
function findCustomer(customers:Customer[],draft:QuoteAiSourceDraft):QuoteAiCustomerReview{
  const email=normalized(draft.customerEmail||'');if(email){const customer=customers.find(item=>item.email.trim().toLowerCase()===email);if(customer)return{customerId:customer.id,customerName:(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim(),matchConfidence:1,matchBasis:'email'};}
  const phone=phoneDigits(draft.customerPhone||'');if(phone){const customer=customers.find(item=>phoneDigits(item.phone)===phone);if(customer)return{customerId:customer.id,customerName:(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim(),matchConfidence:.99,matchBasis:'phone'};}
  const name=normalized(draft.customerName||'');if(name){const en=customers.find(item=>normalized(item.companyNameEn)===name);if(en)return{customerId:en.id,customerName:(en.companyNameEn||en.companyNameAr||en.contactPerson||'Customer').trim(),matchConfidence:.96,matchBasis:'name-en'};const ar=customers.find(item=>normalized(item.companyNameAr)===name);if(ar)return{customerId:ar.id,customerName:(ar.companyNameEn||ar.companyNameAr||ar.contactPerson||'Customer').trim(),matchConfidence:.96,matchBasis:'name-ar'};}
  return{customerId:'',customerName:'',matchConfidence:0,matchBasis:'none'};
}

export function buildQuoteAiReview(vault:VaultPayload,draft:QuoteAiSourceDraft):QuoteAiReview{
  const currency=(draft.currency||vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD').trim().toUpperCase();
  const policy=vault.company.commercial.pricing;
  const items=draft.items.map((row,index)=>{
    const match=findProduct(vault.savedItems.filter(item=>!item.archived),row);const saved=match.item;
    const cost=(saved?.lastUnitCost||'').trim();const costCurrency=(saved?.lastCostCurrency||'').trim().toUpperCase();
    const savedSale=(saved?.lastUnitPrice||'').trim();const savedCurrency=(saved?.lastCurrency||'').trim().toUpperCase();
    const suggested=cost&&costCurrency===currency?pricingSuggestedUnitPrice(cost,policy):'';
    let effective=row.unitPrice.trim();let priceSource:QuoteAiPriceSource=effective?'explicit-source':'none';
    if(!effective&&savedSale&&savedCurrency===currency){effective=savedSale;priceSource='saved-sale-price';}
    if(!effective&&suggested){effective=suggested;priceSource='pricing-policy';}
    const warnings:QuoteAiWarning[]=[];
    if(!saved)warnings.push('unknown-product');
    if(row.quantityAmbiguous||row.quantityConfidence<.75)warnings.push('ambiguous-quantity');
    if(row.productConfidence>0&&row.productConfidence<.7)warnings.push('low-product-confidence');
    if(saved&&!cost)warnings.push('missing-cost');
    if(saved&&cost&&costCurrency&&costCurrency!==currency)warnings.push('currency-mismatch');
    if(!effective)warnings.push('missing-selling-price');
    if(saved&&effective&&cost&&costCurrency===currency){const priceScaled=decimalToScaled(effective,SCALE),costScaled=decimalToScaled(cost,SCALE);if(priceScaled<costScaled)warnings.push('below-cost');else if(suggested&&priceScaled<decimalToScaled(suggested,SCALE))warnings.push('below-policy');}
    return{index,matchedItemId:saved?.id||'',matchedItemName:saved?itemName(saved):'',matchConfidence:match.confidence,matchBasis:match.basis,effectiveUnitPrice:effective,priceSource,cost,costCurrency,suggestedPrice:suggested,marginPercent:saved&&effective&&cost&&costCurrency===currency?marginPercent(effective,cost):'',warnings};
  });
  return{currency,customer:findCustomer(vault.customers,draft),items,warningCount:items.reduce((sum,row)=>sum+row.warnings.length,0),blockingAttentionCount:items.filter(row=>row.warnings.some(warning=>['unknown-product','ambiguous-quantity','currency-mismatch','missing-selling-price'].includes(warning))).length};
}
