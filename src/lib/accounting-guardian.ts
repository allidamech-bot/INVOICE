import type { CompanySettings, Customer, LourexDocument, PaymentRecord, SavedItem } from '../types.js';
import { customerCreditStatus, pricingSuggestedUnitPrice } from './commercial-controls.js';
import { decimalToScaled, isDecimalInput, isNonNegativeDecimalInput } from './money.js';
import { documentPriceOptional, documentUsesCommercialDefaults, isSupplierDocumentKind } from './document-kinds.js';
import { findSavedItemMatch, normalizeSavedItemIdentity } from './saved-items.js';

export type AccountingGuardianCode=
  |'missing-customer'
  |'missing-supplier'
  |'zero-quantity'
  |'zero-price'
  |'duplicate-line'
  |'missing-commercial-data'
  |'extreme-discount'
  |'suspicious-price-change'
  |'missing-cost'
  |'cost-currency-mismatch'
  |'below-cost'
  |'below-pricing-policy'
  |'credit-limit-exceeded'
  |'credit-currency-mismatch';
export type AccountingGuardianSeverity='info'|'warning'|'critical';
export interface AccountingGuardianIssue{
  code:AccountingGuardianCode;
  severity:AccountingGuardianSeverity;
  level:'warning'|'attention';
  itemIndex:number;
  itemName:string;
  currency:string;
  price:string;
  cost:string;
  suggestedPrice:string;
  detail:string;
}
export interface AccountingGuardianReview{
  basis:'deterministic-accounting-guardian';
  issues:AccountingGuardianIssue[];
  checkedItems:number;
  costComplete:boolean;
  status:'clear'|'attention';
  counts:{info:number;warning:number;critical:number};
  limitations:string[];
}

const SCALE=12;
const PERCENT_SCALE=4;
const EXTREME_DISCOUNT_PERCENT=25n*10_000n;
const SUSPICIOUS_PRICE_CHANGE_PERCENT=25n;
function lineName(doc:LourexDocument,index:number):string{const item=doc.items[index];return(item?.descriptionEn||item?.descriptionAr||`Item ${index+1}`).trim();}
function applicable(doc:LourexDocument):boolean{return !documentPriceOptional(doc.kind)&&!isSupplierDocumentKind(doc.kind)&&doc.role!=='credit-note';}
function issue(code:AccountingGuardianCode,severity:AccountingGuardianSeverity,itemIndex:number,itemName:string,currency:string,price='',cost='',suggestedPrice='',detail=''):AccountingGuardianIssue{return{code,severity,level:severity==='info'?'attention':'warning',itemIndex,itemName,currency,price,cost,suggestedPrice,detail};}
function percentDifference(current:string,reference:string):bigint{
  if(!current||!reference||!isNonNegativeDecimalInput(current)||!isNonNegativeDecimalInput(reference))return 0n;
  const now=decimalToScaled(current,SCALE),base=decimalToScaled(reference,SCALE);if(base<=0n)return 0n;const diff=now>=base?now-base:base-now;return diff*100n/base;
}
function duplicateLineKey(doc:LourexDocument,index:number):string{
  const item=doc.items[index]!;const description=normalizeSavedItemIdentity(item.descriptionEn)||normalizeSavedItemIdentity(item.descriptionAr);if(!description)return'';
  return `${description}|${item.unit.trim().toUpperCase()}`;
}

export function buildAccountingGuardianReview(doc:LourexDocument,company:CompanySettings,savedItems:SavedItem[],customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[]):AccountingGuardianReview{
  const issues:AccountingGuardianIssue[]=[];const currency=doc.currency.trim().toUpperCase();
  if(isSupplierDocumentKind(doc.kind)){if(!doc.supplierSnapshot)issues.push(issue('missing-supplier','critical',-1,'Supplier',currency,'','','','Supplier identity is missing.'));}
  else if(doc.kind!=='draft'&&!doc.customerSnapshot)issues.push(issue('missing-customer','critical',-1,'Customer',currency,'','','','Customer identity is missing.'));

  const duplicateSeen=new Map<string,number>();
  doc.items.forEach((item,index)=>{
    const itemName=lineName(doc,index);const quantity=item.quantity.trim();
    if(quantity&&isDecimalInput(quantity)&&decimalToScaled(quantity,SCALE)===0n)issues.push(issue('zero-quantity','critical',index,itemName,currency,item.unitPrice,'','','Quantity is zero.'));
    if(!documentPriceOptional(doc.kind)&&item.unitPrice.trim()&&isDecimalInput(item.unitPrice)&&decimalToScaled(item.unitPrice,SCALE)===0n)issues.push(issue('zero-price','critical',index,itemName,currency,item.unitPrice,'','','Selling price is zero.'));
    const key=duplicateLineKey(doc,index);if(key){const first=duplicateSeen.get(key);if(first!==undefined)issues.push(issue('duplicate-line','warning',index,itemName,currency,item.unitPrice,'','','The same product and unit appear more than once in this document. Review quantity and price before finalizing.'));else duplicateSeen.set(key,index);}
  });

  if(documentUsesCommercialDefaults(doc.kind)){
    const missing=[!doc.terms.paymentTerms.trim()?'payment terms':'',!doc.terms.incoterm.trim()?'incoterm':'',!doc.terms.deliveryTime.trim()?'delivery time':''].filter(Boolean);
    if(missing.length)issues.push(issue('missing-commercial-data','info',-1,'Commercial terms',currency,'','','',`Missing: ${missing.join(', ')}.`));
  }
  if(doc.adjustments.discountEnabled&&doc.adjustments.discountMode==='percent'&&isNonNegativeDecimalInput(doc.adjustments.discountValue)){
    const value=decimalToScaled(doc.adjustments.discountValue,PERCENT_SCALE);if(value>=EXTREME_DISCOUNT_PERCENT)issues.push(issue('extreme-discount','warning',-1,'Discount',currency,doc.adjustments.discountValue,'','','Discount percentage is at or above the Guardian review threshold of 25%.'));
  }

  if(applicable(doc)){
    doc.items.forEach((item,index)=>{
      const match=findSavedItemMatch(savedItems,item);const explicitCost=(item.unitCost||'').trim();const savedCost=(match?.lastUnitCost||'').trim();const savedCostCurrency=(match?.lastCostCurrency||'').trim().toUpperCase();let cost=explicitCost;if(!cost&&savedCost&&savedCostCurrency===currency)cost=savedCost;
      const price=item.unitPrice.trim();const itemName=lineName(doc,index);
      if(match?.lastUnitPrice&&match.lastCurrency.trim().toUpperCase()===currency&&price&&percentDifference(price,match.lastUnitPrice)>=SUSPICIOUS_PRICE_CHANGE_PERCENT)issues.push(issue('suspicious-price-change','warning',index,itemName,currency,price,match.lastUnitPrice,'',`Selling price differs by at least 25% from the saved selling price ${match.lastUnitPrice} ${currency}.`));
      if(!cost){if(savedCost&&savedCostCurrency&&savedCostCurrency!==currency)issues.push(issue('cost-currency-mismatch','warning',index,itemName,currency,price,savedCost,'',`Saved cost currency ${savedCostCurrency} does not match document currency ${currency}.`));else issues.push(issue('missing-cost','warning',index,itemName,currency,price,'','','No comparable unit cost is available for this line.'));return;}
      if(!isNonNegativeDecimalInput(cost)||!isNonNegativeDecimalInput(price))return;
      const suggestedPrice=pricingSuggestedUnitPrice(cost,company.commercial.pricing);const priceScaled=decimalToScaled(price,SCALE),costScaled=decimalToScaled(cost,SCALE);
      if(priceScaled<costScaled){issues.push(issue('below-cost','critical',index,itemName,currency,price,cost,suggestedPrice,'Selling price is below comparable unit cost.'));return;}
      if(suggestedPrice&&priceScaled<decimalToScaled(suggestedPrice,SCALE))issues.push(issue('below-pricing-policy','warning',index,itemName,currency,price,cost,suggestedPrice,'Selling price is below the current company pricing-policy suggestion.'));
    });
  }
  if(doc.kind==='invoice'&&doc.role!=='credit-note'){
    const credit=customerCreditStatus(doc,customers,documents,payments);
    if(credit&&!credit.comparable)issues.push(issue('credit-currency-mismatch','info',-1,credit.customerName,credit.currency,credit.projected,credit.limit,'',`Customer credit limit uses ${credit.creditCurrency}; LOUREX does not perform FX conversion.`));
    else if(credit?.exceeded)issues.push(issue('credit-limit-exceeded','critical',-1,credit.customerName,credit.currency,credit.projected,credit.limit,'','Projected customer exposure exceeds the saved credit limit.'));
  }
  const costIssues=issues.filter(entry=>entry.code==='missing-cost'||entry.code==='cost-currency-mismatch');const counts={info:issues.filter(entry=>entry.severity==='info').length,warning:issues.filter(entry=>entry.severity==='warning').length,critical:issues.filter(entry=>entry.severity==='critical').length};
  return{basis:'deterministic-accounting-guardian',issues,checkedItems:applicable(doc)?doc.items.length:0,costComplete:costIssues.length===0,status:issues.length?'attention':'clear',counts,limitations:['currencies-remain-separate','no-fx-conversion','no-fraud-inference','25-percent-discount-and-price-change-thresholds-are-review-signals-not-accounting-rules','guardian-does-not-post-or-finalize-records']};
}
