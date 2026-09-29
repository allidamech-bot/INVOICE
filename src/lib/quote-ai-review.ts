import type { Customer, DocumentItem, SavedItem, VaultPayload } from '../types.js';
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
export type QuoteAiPriceSource='explicit-source'|'customer-last-price'|'saved-sale-price'|'pricing-policy'|'none';
export interface QuoteAiItemReview {
  index:number;
  matchedItemId:string;
  matchedItemName:string;
  matchConfidence:number;
  matchBasis:'sku'|'description-en'|'description-ar'|'description-likely'|'none';
  effectiveUnitPrice:string;
  priceSource:QuoteAiPriceSource;
  lastCustomerPrice:string;
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
export interface QuoteAiPricingCommandResult {draft:QuoteAiSourceDraft;applied:number;mode:string;}

const SCALE=12;
const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';
function normalized(value:string):string{return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function phoneDigits(value:string):string{return value.replace(/\D/g,'');}
function itemName(item:SavedItem):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();}
function marginPercent(price:string,cost:string):string{
  if(!price||!cost)return'';const p=decimalToScaled(price,SCALE),c=decimalToScaled(cost,SCALE);if(p<=0n)return'';
  const numerator=(p-c)*10_000n;const hundredths=numerator/p;const negative=hundredths<0n;const abs=negative?-hundredths:hundredths;
  return `${negative?'-':''}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}
function wordTokens(value:string):Set<string>{return new Set(normalizeSavedItemIdentity(value||'').split(' ').filter(token=>token.length>=2));}
function similarity(left:string,right:string):number{const a=wordTokens(left),b=wordTokens(right);if(!a.size||!b.size)return 0;let common=0;for(const token of a)if(b.has(token))common+=1;return common/(a.size+b.size-common);}
function findProduct(items:SavedItem[],row:QuoteAiSourceItem):{item:SavedItem|null;basis:QuoteAiItemReview['matchBasis'];confidence:number}{
  const sku=normalizeSavedItemSku(row.sku||'');if(sku){const item=items.find(entry=>normalizeSavedItemSku(entry.sku??'')===sku);if(item)return{item,basis:'sku',confidence:1};}
  const en=normalizeSavedItemIdentity(row.descriptionEn||'');if(en){const item=items.find(entry=>normalizeSavedItemIdentity(entry.descriptionEn)===en);if(item)return{item,basis:'description-en',confidence:.96};}
  const ar=normalizeSavedItemIdentity(row.descriptionAr||'');if(ar){const item=items.find(entry=>normalizeSavedItemIdentity(entry.descriptionAr)===ar);if(item)return{item,basis:'description-ar',confidence:.96};}
  let best:SavedItem|null=null,bestScore=0;
  for(const item of items){const score=Math.max(similarity(row.descriptionEn,item.descriptionEn),similarity(row.descriptionAr,item.descriptionAr));if(score>bestScore){best=item;bestScore=score;}}
  if(best&&bestScore>=.72)return{item:best,basis:'description-likely',confidence:Math.min(.88,.58+bestScore*.4)};
  return{item:null,basis:'none',confidence:0};
}
function findCustomer(customers:Customer[],draft:QuoteAiSourceDraft):QuoteAiCustomerReview{
  const email=normalized(draft.customerEmail||'');if(email){const customer=customers.find(item=>item.email.trim().toLowerCase()===email);if(customer)return{customerId:customer.id,customerName:(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim(),matchConfidence:1,matchBasis:'email'};}
  const phone=phoneDigits(draft.customerPhone||'');if(phone){const customer=customers.find(item=>phoneDigits(item.phone)===phone);if(customer)return{customerId:customer.id,customerName:(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim(),matchConfidence:.99,matchBasis:'phone'};}
  const name=normalized(draft.customerName||'');if(name){const en=customers.find(item=>normalized(item.companyNameEn)===name);if(en)return{customerId:en.id,customerName:(en.companyNameEn||en.companyNameAr||en.contactPerson||'Customer').trim(),matchConfidence:.96,matchBasis:'name-en'};const ar=customers.find(item=>normalized(item.companyNameAr)===name);if(ar)return{customerId:ar.id,customerName:(ar.companyNameEn||ar.companyNameAr||ar.contactPerson||'Customer').trim(),matchConfidence:.96,matchBasis:'name-ar'};}
  return{customerId:'',customerName:'',matchConfidence:0,matchBasis:'none'};
}
function sameItem(row:QuoteAiSourceItem,saved:SavedItem,line:DocumentItem):boolean{
  const sourceEn=normalizeSavedItemIdentity(row.descriptionEn||''),sourceAr=normalizeSavedItemIdentity(row.descriptionAr||'');
  const savedEn=normalizeSavedItemIdentity(saved.descriptionEn),savedAr=normalizeSavedItemIdentity(saved.descriptionAr),lineEn=normalizeSavedItemIdentity(line.descriptionEn),lineAr=normalizeSavedItemIdentity(line.descriptionAr);
  return Boolean((sourceEn&&sourceEn===lineEn)||(sourceAr&&sourceAr===lineAr)||(savedEn&&savedEn===lineEn)||(savedAr&&savedAr===lineAr));
}
function lastCustomerPrice(vault:VaultPayload,customerId:string,row:QuoteAiSourceItem,saved:SavedItem,currency:string):string{
  if(!customerId)return'';
  const docs=vault.documents.filter(doc=>doc.status==='final'&&doc.lifecycleStatus!=='voided'&&['proforma','invoice'].includes(doc.kind)&&doc.currency.toUpperCase()===currency&&doc.customerSnapshot?.sourceCustomerId===customerId).sort((a,b)=>(b.issueDate||b.updatedAt).localeCompare(a.issueDate||a.updatedAt)||b.updatedAt.localeCompare(a.updatedAt));
  for(const doc of docs){const line=doc.items.find(entry=>entry.unitPrice.trim()&&sameItem(row,saved,entry));if(line)return line.unitPrice.trim();}
  return'';
}

export function buildQuoteAiReview(vault:VaultPayload,draft:QuoteAiSourceDraft):QuoteAiReview{
  const currency=(draft.currency||vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD').trim().toUpperCase();
  const policy=vault.company.commercial.pricing;const customer=findCustomer(vault.customers,draft);
  const items=draft.items.map((row,index)=>{
    const match=findProduct(vault.savedItems.filter(item=>!item.archived),row);const suggestedSaved=match.item;const exactSaved=suggestedSaved&&match.basis!=='description-likely'?suggestedSaved:null;
    const cost=(exactSaved?.lastUnitCost||'').trim();const costCurrency=(exactSaved?.lastCostCurrency||'').trim().toUpperCase();
    const savedSale=(exactSaved?.lastUnitPrice||'').trim();const savedCurrency=(exactSaved?.lastCurrency||'').trim().toUpperCase();
    const suggested=cost&&costCurrency===currency?pricingSuggestedUnitPrice(cost,policy):'';
    const customerPrice=exactSaved?lastCustomerPrice(vault,customer.customerId,row,exactSaved,currency):'';
    let effective=row.unitPrice.trim();let priceSource:QuoteAiPriceSource=effective?'explicit-source':'none';
    if(!effective&&customerPrice){effective=customerPrice;priceSource='customer-last-price';}
    if(!effective&&savedSale&&savedCurrency===currency){effective=savedSale;priceSource='saved-sale-price';}
    if(!effective&&suggested){effective=suggested;priceSource='pricing-policy';}
    const warnings:QuoteAiWarning[]=[];
    if(!suggestedSaved)warnings.push('unknown-product');
    if(row.quantityAmbiguous||row.quantityConfidence<.75)warnings.push('ambiguous-quantity');
    if((row.productConfidence>0&&row.productConfidence<.7)||(suggestedSaved&&match.confidence<.8))warnings.push('low-product-confidence');
    if(exactSaved&&!cost)warnings.push('missing-cost');
    if(exactSaved&&cost&&!costCurrency)warnings.push('currency-mismatch');
    if(exactSaved&&cost&&costCurrency&&costCurrency!==currency)warnings.push('currency-mismatch');
    if(!effective)warnings.push('missing-selling-price');
    if(exactSaved&&effective&&cost&&costCurrency===currency){const priceScaled=decimalToScaled(effective,SCALE),costScaled=decimalToScaled(cost,SCALE);if(priceScaled<costScaled)warnings.push('below-cost');else if(suggested&&priceScaled<decimalToScaled(suggested,SCALE))warnings.push('below-policy');}
    return{index,matchedItemId:exactSaved?.id||'',matchedItemName:suggestedSaved?itemName(suggestedSaved):'',matchConfidence:match.confidence,matchBasis:match.basis,effectiveUnitPrice:effective,priceSource,lastCustomerPrice:customerPrice,cost,costCurrency,suggestedPrice:suggested,marginPercent:exactSaved&&effective&&cost&&costCurrency===currency?marginPercent(effective,cost):'',warnings};
  });
  return{currency,customer,items,warningCount:items.reduce((sum,row)=>sum+row.warnings.length,0),blockingAttentionCount:items.filter(row=>row.warnings.some(warning=>['unknown-product','ambiguous-quantity','low-product-confidence','currency-mismatch','missing-selling-price'].includes(warning))).length};
}

function latinDigits(value:string):string{return value.replace(/[٠-٩]/g,digit=>String(ARABIC_DIGITS.indexOf(digit))).replace(/[٪﹪]/g,'%');}
function percentFrom(command:string,pattern:RegExp):string{return latinDigits(command).match(pattern)?.[1]||'';}
function scaledMoney(value:bigint):string{const sign=value<0n?'-':'',abs=value<0n?-value:value;const raw=`${sign}${abs/10_000n}.${(abs%10_000n).toString().padStart(4,'0')}`;return raw.replace(/0+$/,'').replace(/\.$/,'');}
function increasePrice(value:string,pct:string):string{const amount=decimalToScaled(value||'0',4),percentValue=decimalToScaled(pct||'0',4);if(amount<0n||percentValue<0n)return'';return scaledMoney((amount*(1_000_000n+percentValue)+500_000n)/1_000_000n);}
export function applyQuoteAiPricingCommand(vault:VaultPayload,draft:QuoteAiSourceDraft,command:string):QuoteAiPricingCommandResult{
  const review=buildQuoteAiReview(vault,draft),text=latinDigits(command).normalize('NFKC').toLowerCase();let mode='';let pct='';
  pct=percentFrom(text,/(?:margin|هامش(?:\s+ربح)?)[^0-9]{0,18}(\d{1,3}(?:\.\d{1,2})?)\s*%?/iu);if(pct)mode='margin';
  if(!mode){pct=percentFrom(text,/(?:markup|مارك\s*أب|ماركاب|زيادة\s+على\s+التكلفة)[^0-9]{0,18}(\d{1,4}(?:\.\d{1,2})?)\s*%?/iu);if(pct)mode='markup';}
  if(!mode&&/(?:last customer price|customer last price|آخر سعر.*العميل|سعر العميل السابق)/iu.test(text))mode='customer';
  if(!mode&&/(?:last sale price|saved price|آخر سعر بيع|السعر المحفوظ)/iu.test(text))mode='last';
  if(!mode&&/(?:company policy|pricing policy|سياسة الشركة|سياسة التسعير)/iu.test(text))mode='policy';
  if(!mode){pct=percentFrom(text,/(?:increase|raise|add|ارفع|زد|زيادة)[^0-9]{0,18}(\d{1,3}(?:\.\d{1,2})?)\s*%/iu);if(pct)mode='increase';}
  if(!mode)return{draft,applied:0,mode:''};
  let applied=0;const items=draft.items.map((row,index)=>{const insight=review.items[index];if(!insight)return row;let price='';
    if(mode==='customer')price=insight.lastCustomerPrice;
    else if(mode==='last'){const saved=vault.savedItems.find(item=>item.id===insight.matchedItemId);if(saved&&saved.lastCurrency.toUpperCase()===review.currency)price=saved.lastUnitPrice;}
    else if(mode==='policy')price=insight.suggestedPrice;
    else if(mode==='increase'&&insight.effectiveUnitPrice)price=increasePrice(insight.effectiveUnitPrice,pct);
    else if((mode==='margin'||mode==='markup')&&insight.cost&&insight.costCurrency===review.currency)price=pricingSuggestedUnitPrice(insight.cost,{method:mode,percent:pct,rounding:vault.company.commercial.pricing.rounding});
    if(!price)return row;applied+=1;return{...row,unitPrice:price};
  });
  return{draft:{...draft,items},applied,mode};
}
