import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { allocateLandedCost } from './operations.js';

export type PurchaseGuardianSeverity='info'|'warning'|'critical';
export type PurchaseGuardianCode='missing-supplier'|'missing-currency'|'missing-unit'|'missing-landed-cost-components'|'unmatched-item'|'zero-cost'|'cost-currency-mismatch'|'abnormal-landed-cost'|'duplicate-line';
export interface PurchaseGuardianIssue{code:PurchaseGuardianCode;severity:PurchaseGuardianSeverity;lineIndex:number;itemName:string;detail:string;}
export interface PurchaseGuardianReview{basis:'deterministic-purchase-guardian';purchaseId:string;purchaseNumber:string;issues:PurchaseGuardianIssue[];counts:{info:number;warning:number;critical:number};status:'clear'|'attention';limitations:string[];}

const SCALE=12;
function itemName(line:PurchaseRecord['items'][number],index:number):string{return(line.descriptionEn||line.descriptionAr||line.sku||`Item ${index+1}`).trim();}
function pct(current:string,previous:string):number|null{if(!isNonNegativeDecimalInput(current)||!isNonNegativeDecimalInput(previous))return null;const now=decimalToScaled(current,SCALE),before=decimalToScaled(previous,SCALE);if(before<=0n)return null;const value=Number((now-before)*10_000n/before)/100;return Number.isFinite(value)?value:null;}
function lineKey(line:PurchaseRecord['items'][number]):string{
  if(line.savedItemId.trim())return`item:${line.savedItemId.trim()}`;
  if(line.sku.trim())return`sku:${line.sku.trim().toUpperCase()}`;
  const en=line.descriptionEn.trim().toLowerCase(),ar=line.descriptionAr.trim();if(!en&&!ar)return'';
  return`name:${en}|${ar}`;
}
function landedComponentsComplete(purchase:PurchaseRecord):boolean{return Boolean(purchase.freight.trim()&&purchase.duty.trim()&&purchase.otherCosts.trim());}
function add(issues:PurchaseGuardianIssue[],code:PurchaseGuardianCode,severity:PurchaseGuardianSeverity,lineIndex:number,itemNameValue:string,detail:string):void{issues.push({code,severity,lineIndex,itemName:itemNameValue,detail});}

export function buildPurchaseGuardianReview(purchase:PurchaseRecord,savedItems:SavedItem[]):PurchaseGuardianReview{
  const issues:PurchaseGuardianIssue[]=[];const currency=purchase.currency.trim().toUpperCase();const landedComplete=landedComponentsComplete(purchase);const allocated=landedComplete?allocateLandedCost(purchase):null;const savedById=new Map(savedItems.map(item=>[item.id,item]));const seen=new Map<string,number>();
  if(!purchase.supplierSnapshot?.sourceSupplierId)add(issues,'missing-supplier','critical',-1,'Supplier','Supplier identity is missing.');
  if(!currency)add(issues,'missing-currency','critical',-1,'Currency','Purchase currency is missing. Currency-sensitive comparisons are withheld.');
  if(!landedComplete){const missing=[!purchase.freight.trim()?'freight':'',!purchase.duty.trim()?'duty':'',!purchase.otherCosts.trim()?'other costs':''].filter(Boolean).join(', ');add(issues,'missing-landed-cost-components','warning',-1,'Landed cost',`Landed-cost components are not fully stated (${missing}). LOUREX will not treat missing values as zero or compare landed cost until they are reviewed.`);}
  purchase.items.forEach((line,index)=>{
    const name=itemName(line,index);const saved=line.savedItemId?savedById.get(line.savedItemId):undefined;const unitCost=line.unitCost.trim();
    if(!line.unit.trim())add(issues,'missing-unit','warning',index,name,'Item unit is missing. LOUREX will not assume PCS or another unit; review it before posting.');
    if(!line.savedItemId)add(issues,'unmatched-item','warning',index,name,'This purchase line is not linked to a saved product. Posting it will not update a saved product cost or create a purchase inventory movement for that product.');
    if(!unitCost||!isNonNegativeDecimalInput(unitCost)||decimalToScaled(unitCost,SCALE)<=0n)add(issues,'zero-cost','critical',index,name,'Unit cost is missing, invalid or zero. Review the supplier cost before posting.');
    if(currency&&saved?.lastCostCurrency&&saved.lastCostCurrency.toUpperCase()!==currency)add(issues,'cost-currency-mismatch','info',index,name,`Saved prior cost uses ${saved.lastCostCurrency}; this purchase uses ${currency}. LOUREX will not perform FX comparison.`);
    if(landedComplete&&currency&&unitCost&&isNonNegativeDecimalInput(unitCost)&&decimalToScaled(unitCost,SCALE)>0n&&saved?.lastUnitCost&&saved.lastCostCurrency?.toUpperCase()===currency){const landed=allocated?.items[index]?.landedUnitCost||unitCost;const change=pct(landed,saved.lastUnitCost);if(change!==null&&Math.abs(change)>=20){const severity:PurchaseGuardianSeverity=Math.abs(change)>=50?'critical':'warning';add(issues,'abnormal-landed-cost',severity,index,name,`Landed unit cost ${landed} ${currency} differs ${change>=0?'+':''}${change.toFixed(1)}% from saved prior cost ${saved.lastUnitCost} ${currency}. This is a review signal, not proof of an error.`);}}
    const key=lineKey(line);if(key){const first=seen.get(key);if(first!==undefined)add(issues,'duplicate-line','warning',index,name,`Possible duplicate purchase line; a matching line already appears at item ${first+1}.`);else seen.set(key,index);}
  });
  const counts={info:issues.filter(issue=>issue.severity==='info').length,warning:issues.filter(issue=>issue.severity==='warning').length,critical:issues.filter(issue=>issue.severity==='critical').length};
  return{basis:'deterministic-purchase-guardian',purchaseId:purchase.id,purchaseNumber:purchase.number,issues,counts,status:issues.length?'attention':'clear',limitations:['review-only-no-posting','currencies-remain-separate','no-fx-conversion','landed-cost-comparison-withheld-when-any-landed-component-is-missing','missing-units-are-never-defaulted','20-percent-and-50-percent-landed-cost-thresholds-are-review-signals-not-accounting-rules','unmatched-lines-are-never-auto-linked','no-autonomous-fix-or-post']};
}

export function reviewDraftPurchases(vault:VaultPayload):PurchaseGuardianReview[]{return vault.purchases.filter(purchase=>purchase.status==='draft').map(purchase=>buildPurchaseGuardianReview(purchase,vault.savedItems)).sort((a,b)=>b.counts.critical-a.counts.critical||b.counts.warning-a.counts.warning||a.purchaseNumber.localeCompare(b.purchaseNumber));}
