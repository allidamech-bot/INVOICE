import type { CompanySettings, Customer, LourexDocument, PaymentRecord, SavedItem } from '../types.js';
import { customerCreditStatus, pricingSuggestedUnitPrice } from './commercial-controls.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';
import { findSavedItemMatch } from './saved-items.js';

export type AccountingGuardianCode=
  |'missing-cost'
  |'cost-currency-mismatch'
  |'below-cost'
  |'below-pricing-policy'
  |'credit-limit-exceeded'
  |'credit-currency-mismatch';
export interface AccountingGuardianIssue{
  code:AccountingGuardianCode;
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
  limitations:string[];
}

const SCALE=12;
function lineName(doc:LourexDocument,index:number):string{
  const item=doc.items[index];return(item?.descriptionEn||item?.descriptionAr||`Item ${index+1}`).trim();
}
function applicable(doc:LourexDocument):boolean{
  return !documentPriceOptional(doc.kind)&&!isSupplierDocumentKind(doc.kind)&&doc.role!=='credit-note';
}

export function buildAccountingGuardianReview(doc:LourexDocument,company:CompanySettings,savedItems:SavedItem[],customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[]):AccountingGuardianReview{
  const issues:AccountingGuardianIssue[]=[];
  if(applicable(doc)){
    doc.items.forEach((item,index)=>{
      const match=findSavedItemMatch(savedItems,item);const explicitCost=(item.unitCost||'').trim();
      const savedCost=(match?.lastUnitCost||'').trim();const savedCostCurrency=(match?.lastCostCurrency||'').trim().toUpperCase();
      const currency=doc.currency.trim().toUpperCase();
      let cost=explicitCost;
      if(!cost&&savedCost&&savedCostCurrency===currency)cost=savedCost;
      const price=item.unitPrice.trim();const itemName=lineName(doc,index);
      if(!cost){
        if(savedCost&&savedCostCurrency&&savedCostCurrency!==currency)issues.push({code:'cost-currency-mismatch',level:'attention',itemIndex:index,itemName,currency,price,cost:savedCost,suggestedPrice:'',detail:`Saved cost currency ${savedCostCurrency} does not match document currency ${currency}.`});
        else issues.push({code:'missing-cost',level:'attention',itemIndex:index,itemName,currency,price,cost:'',suggestedPrice:'',detail:'No comparable unit cost is available for this line.'});
        return;
      }
      if(!isNonNegativeDecimalInput(cost)||!isNonNegativeDecimalInput(price))return;
      const suggestedPrice=pricingSuggestedUnitPrice(cost,company.commercial.pricing);
      const priceScaled=decimalToScaled(price,SCALE),costScaled=decimalToScaled(cost,SCALE);
      if(priceScaled<costScaled){issues.push({code:'below-cost',level:'warning',itemIndex:index,itemName,currency,price,cost,suggestedPrice,detail:'Selling price is below comparable unit cost.'});return;}
      if(suggestedPrice&&priceScaled<decimalToScaled(suggestedPrice,SCALE))issues.push({code:'below-pricing-policy',level:'attention',itemIndex:index,itemName,currency,price,cost,suggestedPrice,detail:'Selling price is below the current company pricing-policy suggestion.'});
    });
  }
  if(doc.kind==='invoice'&&doc.role!=='credit-note'){
    const credit=customerCreditStatus(doc,customers,documents,payments);
    if(credit&&!credit.comparable)issues.push({code:'credit-currency-mismatch',level:'attention',itemIndex:-1,itemName:credit.customerName,currency:credit.currency,price:credit.projected,cost:credit.limit,suggestedPrice:'',detail:`Customer credit limit uses ${credit.creditCurrency}; LOUREX does not perform FX conversion.`});
    else if(credit?.exceeded)issues.push({code:'credit-limit-exceeded',level:'warning',itemIndex:-1,itemName:credit.customerName,currency:credit.currency,price:credit.projected,cost:credit.limit,suggestedPrice:'',detail:'Projected customer exposure exceeds the saved credit limit.'});
  }
  const costIssues=issues.filter(issue=>issue.code==='missing-cost'||issue.code==='cost-currency-mismatch');
  return{basis:'deterministic-accounting-guardian',issues,checkedItems:applicable(doc)?doc.items.length:0,costComplete:costIssues.length===0,status:issues.length?'attention':'clear',limitations:['currencies-remain-separate','no-fx-conversion','no-fraud-inference','guardian-does-not-post-or-finalize-records']};
}
