import type { Customer, DocumentItem, SavedItem, VaultPayload } from '../types.js';
import { pricingSuggestedUnitPrice } from './commercial-controls.js';
import { makeId } from './id.js';
import { decimalToScaled, normalizeDecimalInput } from './money.js';
import { documentItemFromSavedItem, normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';

export interface AiQuoteSourceItem {
  sku:string;descriptionEn:string;descriptionAr:string;quantity:string;unit:string;unitPrice:string;
  quantityConfidence?:number;quantityAmbiguous?:boolean;quantityNote?:string;productConfidence?:number;productNote?:string;
}
export interface AiQuoteSourceDraft {
  customerName:string;customerEmail:string;customerPhone:string;customerConfidence?:number;customerNote?:string;
  currency:string;incoterm:string;paymentTerms:string;deliveryTime:string;validity:string;remarks:string;notes:string;
  items:AiQuoteSourceItem[];
}
export type AiQuoteMatchBasis='sku'|'name-exact'|'name-likely'|'none';
export type AiQuoteWarning='below-cost'|'below-policy'|'missing-cost'|'currency-mismatch'|'unknown-product'|'ambiguous-quantity'|'low-match-confidence';
export interface AiQuoteReviewLine {
  index:number;source:AiQuoteSourceItem;matchId:string;matchLabel:string;matchConfidence:number;matchBasis:AiQuoteMatchBasis;
  cost:string;costCurrency:string;lastSalePrice:string;lastSaleCurrency:string;lastCustomerPrice:string;policyPrice:string;proposedPrice:string;marginPercent:string;
  warnings:AiQuoteWarning[];
}
export interface AiQuoteReview {
  currency:string;customerId:string;customerName:string;customerMatchConfidence:number;lines:AiQuoteReviewLine[];warnings:string[];
}
export interface AiQuotePricingCommandResult {draft:AiQuoteSourceDraft;applied:number;message:string;}

const COST_DECIMALS=12;
const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';
function digits(value:string):string{return value.replace(/[٠-٩]/g,d=>String(ARABIC_DIGITS.indexOf(d))).replace(/[٪﹪]/g,'%');}
function norm(value:string):string{return normalizeSavedItemIdentity(value||'');}
function phone(value:string):string{return value.replace(/\D/g,'').replace(/^00/,'');}
function percent(value:bigint,base:bigint):string{if(base<=0n)return'';const negative=value<0n,abs=negative?-value:value,hundredths=abs*10_000n/base;return `${negative?'-':''}${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;}
function margin(price:string,cost:string):string{const p=decimalToScaled(price||'0',COST_DECIMALS),c=decimalToScaled(cost||'0',COST_DECIMALS);return p>0n?percent(p-c,p):'';}
function itemLabel(item:SavedItem):string{return(item.descriptionEn||item.descriptionAr||item.sku||'Product').trim();}
function tokens(value:string):Set<string>{return new Set(norm(value).split(' ').filter(token=>token.length>=2));}
function similarity(left:string,right:string):number{const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let common=0;for(const token of a)if(b.has(token))common+=1;return common/(a.size+b.size-common);}
function sourceName(row:AiQuoteSourceItem):string{return row.descriptionEn||row.descriptionAr||row.sku||'';}
function confidence(value:unknown,fallback=0):number{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):fallback;}

export function matchQuoteProduct(items:SavedItem[],row:AiQuoteSourceItem):{item:SavedItem|null;confidence:number;basis:AiQuoteMatchBasis}{
  const sku=normalizeSavedItemSku(row.sku||'');
  if(sku){const exact=items.find(item=>normalizeSavedItemSku(item.sku??'')===sku);if(exact)return{item:exact,confidence:1,basis:'sku'};}
  const en=norm(row.descriptionEn),ar=norm(row.descriptionAr);
  const exact=items.find(item=>(en&&norm(item.descriptionEn)===en)||(ar&&norm(item.descriptionAr)===ar));
  if(exact)return{item:exact,confidence:.96,basis:'name-exact'};
  let best:SavedItem|null=null,bestScore=0;
  for(const item of items){const score=Math.max(similarity(row.descriptionEn,item.descriptionEn),similarity(row.descriptionAr,item.descriptionAr),similarity(sourceName(row),item.descriptionEn),similarity(sourceName(row),item.descriptionAr));if(score>bestScore){best=item;bestScore=score;}}
  if(best&&bestScore>=.72)return{item:best,confidence:Math.min(.88,.58+bestScore*.4),basis:'name-likely'};
  return{item:null,confidence:0,basis:'none'};
}

export function matchQuoteCustomer(customers:Customer[],draft:AiQuoteSourceDraft):{customer:Customer|null;confidence:number}{
  const email=draft.customerEmail.trim().toLowerCase(),mobile=phone(draft.customerPhone),name=norm(draft.customerName);
  if(email){const match=customers.find(customer=>customer.email.trim().toLowerCase()===email);if(match)return{customer:match,confidence:1};}
  if(mobile){const match=customers.find(customer=>phone(customer.phone)===mobile);if(match)return{customer:match,confidence:.96};}
  if(name){const match=customers.find(customer=>[customer.companyNameEn,customer.companyNameAr].some(value=>norm(value)===name));if(match)return{customer:match,confidence:.9};}
  return{customer:null,confidence:0};
}

function sameDocumentItem(row:AiQuoteSourceItem,item:SavedItem,line:DocumentItem):boolean{
  const sourceEn=norm(row.descriptionEn),sourceAr=norm(row.descriptionAr),itemEn=norm(item.descriptionEn),itemAr=norm(item.descriptionAr),lineEn=norm(line.descriptionEn),lineAr=norm(line.descriptionAr);
  return Boolean((sourceEn&&lineEn===sourceEn)||(sourceAr&&lineAr===sourceAr)||(itemEn&&lineEn===itemEn)||(itemAr&&lineAr===itemAr));
}
function lastCustomerPrice(vault:VaultPayload,customerId:string,row:AiQuoteSourceItem,item:SavedItem,currency:string):string{
  if(!customerId)return'';
  const docs=vault.documents.filter(doc=>doc.lifecycleStatus!=='voided'&&doc.status==='final'&&['invoice','proforma'].includes(doc.kind)&&doc.currency.toUpperCase()===currency&&doc.customerSnapshot?.sourceCustomerId===customerId).sort((a,b)=>(b.issueDate||b.updatedAt).localeCompare(a.issueDate||a.updatedAt)||b.updatedAt.localeCompare(a.updatedAt));
  for(const doc of docs){const line=doc.items.find(candidate=>sameDocumentItem(row,item,candidate)&&candidate.unitPrice.trim());if(line)return line.unitPrice.trim();}
  return'';
}

export function buildAiQuoteReview(vault:VaultPayload,draft:AiQuoteSourceDraft):AiQuoteReview{
  const currency=(draft.currency||vault.appSettings.smartDefaults.currency||vault.company.defaultCurrency||'USD').toUpperCase();
  const customerMatch=matchQuoteCustomer(vault.customers,draft);
  const lines=draft.items.map((row,index):AiQuoteReviewLine=>{
    const match=matchQuoteProduct(vault.savedItems.filter(item=>!item.archived),row),saved=match.item;
    const cost=saved?.lastUnitCost?.trim()||'',costCurrency=(saved?.lastCostCurrency||saved?.lastCurrency||'').toUpperCase();
    const lastSalePrice=saved?.lastUnitPrice?.trim()||'',lastSaleCurrency=(saved?.lastCurrency||'').toUpperCase();
    const customerPrice=saved?lastCustomerPrice(vault,customerMatch.customer?.id||'',row,saved,currency):'';
    const policyPrice=saved&&cost&&costCurrency===currency?pricingSuggestedUnitPrice(cost,vault.company.commercial.pricing):'';
    const proposedPrice=row.unitPrice.trim()||customerPrice||(lastSaleCurrency===currency?lastSalePrice:'')||policyPrice;
    const warnings:AiQuoteWarning[]=[];
    if(!saved)warnings.push('unknown-product');
    else if(match.confidence<.85)warnings.push('low-match-confidence');
    if(row.quantityAmbiguous===true||confidence(row.quantityConfidence,1)<.7)warnings.push('ambiguous-quantity');
    if(saved&&!cost)warnings.push('missing-cost');
    if(saved&&cost&&costCurrency&&costCurrency!==currency)warnings.push('currency-mismatch');
    if(saved&&cost&&costCurrency===currency&&proposedPrice){const p=decimalToScaled(proposedPrice,COST_DECIMALS),c=decimalToScaled(cost,COST_DECIMALS),policy=policyPrice?decimalToScaled(policyPrice,COST_DECIMALS):0n;if(p<c)warnings.push('below-cost');else if(policy>0n&&p<policy)warnings.push('below-policy');}
    return{index,source:row,matchId:saved?.id||'',matchLabel:saved?itemLabel(saved):'',matchConfidence:match.confidence,matchBasis:match.basis,cost,costCurrency,lastSalePrice,lastSaleCurrency,lastCustomerPrice:customerPrice,policyPrice,proposedPrice,marginPercent:saved&&cost&&costCurrency===currency&&proposedPrice?margin(proposedPrice,cost):'',warnings};
  });
  const warnings:string[]=[];if(!customerMatch.customer&&draft.customerName.trim())warnings.push('customer-not-matched');if(!draft.currency.trim())warnings.push('currency-not-explicit');if(lines.some(line=>!line.proposedPrice))warnings.push('one-or-more-prices-need-review');
  return{currency,customerId:customerMatch.customer?.id||'',customerName:customerMatch.customer?(customerMatch.customer.companyNameEn||customerMatch.customer.companyNameAr):draft.customerName,customerMatchConfidence:customerMatch.confidence,lines,warnings};
}

function trimMoney(value:string):string{return value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value;}
function multiplyMoney(value:string,percentValue:string):string{
  const amount=decimalToScaled(value||'0',4),pct=decimalToScaled(percentValue||'0',4);if(amount<0n||pct<0n)return'';const scaled=(amount*(1_000_000n+pct)+500_000n)/1_000_000n;return trimMoney(`${scaled/10_000n}.${(scaled%10_000n).toString().padStart(4,'0')}`);
}
function commandPercent(command:string,keyword:RegExp):string{const normalized=digits(command).normalize('NFKC');const match=normalized.match(keyword);return match?.[1]||'';}

export function applyAiQuotePricingCommand(vault:VaultPayload,draft:AiQuoteSourceDraft,command:string):AiQuotePricingCommandResult{
  const review=buildAiQuoteReview(vault,draft),value=digits(command).normalize('NFKC').toLowerCase();let mode:'margin'|'markup'|'customer'|'last'|'policy'|'increase'|''='';let percentValue='';
  percentValue=commandPercent(value,/(?:margin|هامش(?:\s+ربح)?)[^0-9]{0,18}(\d{1,3}(?:\.\d{1,2})?)\s*%?/iu);if(percentValue)mode='margin';
  if(!mode){percentValue=commandPercent(value,/(?:markup|مارك\s*أب|ماركاب|زيادة\s+على\s+التكلفة)[^0-9]{0,18}(\d{1,4}(?:\.\d{1,2})?)\s*%?/iu);if(percentValue)mode='markup';}
  if(!mode&&/(?:last customer price|customer last price|آخر سعر.*العميل|سعر العميل السابق)/iu.test(value))mode='customer';
  if(!mode&&/(?:last sale price|saved price|آخر سعر بيع|السعر المحفوظ)/iu.test(value))mode='last';
  if(!mode&&/(?:company policy|pricing policy|سياسة الشركة|سياسة التسعير)/iu.test(value))mode='policy';
  if(!mode){percentValue=commandPercent(value,/(?:increase|raise|add|ارفع|زد|زيادة)[^0-9]{0,18}(\d{1,3}(?:\.\d{1,2})?)\s*%/iu);if(percentValue)mode='increase';}
  if(!mode)return{draft,applied:0,message:'unsupported-command'};
  let applied=0;
  const items=draft.items.map((row,index)=>{const line=review.lines[index];if(!line)return row;let price='';
    if(mode==='customer')price=line.lastCustomerPrice;
    else if(mode==='last')price=line.lastSaleCurrency===review.currency?line.lastSalePrice:'';
    else if(mode==='policy')price=line.policyPrice;
    else if(mode==='increase'){const base=line.proposedPrice||row.unitPrice;if(base)price=multiplyMoney(base,percentValue);}
    else if((mode==='margin'||mode==='markup')&&line.cost&&line.costCurrency===review.currency){price=pricingSuggestedUnitPrice(line.cost,{method:mode,percent:percentValue,rounding:vault.company.commercial.pricing.rounding});}
    if(!price)return row;applied+=1;return{...row,unitPrice:price};
  });
  return{draft:{...draft,items},applied,message:mode};
}

export function aiQuoteDocumentItem(row:AiQuoteSourceItem,vault:VaultPayload,currency:string):DocumentItem{
  const match=matchQuoteProduct(vault.savedItems.filter(item=>!item.archived),row),saved=match.item;
  if(saved){const line=documentItemFromSavedItem(saved);line.quantity=row.quantity;line.unit=row.unit||line.unit;line.unitPrice=row.unitPrice||(saved.lastCurrency.toUpperCase()===currency.toUpperCase()?saved.lastUnitPrice:'');return line;}
  return{id:makeId('item'),descriptionEn:row.descriptionEn,descriptionAr:row.descriptionAr,hsCode:'',origin:'',packing:'',quantity:row.quantity,unit:row.unit||'PCS',unitPrice:row.unitPrice,unitCost:''};
}
