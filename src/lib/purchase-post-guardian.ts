import type { SavedItem } from '../types.js';
import { decimalToScaled, isDecimalInput } from './money.js';

export type PurchaseGuardianSeverity='info'|'warning'|'critical';
export type PurchaseGuardianCode='unmatched-item'|'zero-cost'|'duplicate-line'|'currency-mismatch'|'cost-change'|'landed-cost-uplift'|'landed-total-uplift';
export interface PurchaseGuardianDraftItem{savedItemId:string;sku:string;descriptionEn:string;descriptionAr:string;quantity:string;unitCost:string;landedUnitCost:string;}
export interface PurchaseGuardianDraft{number:string;currency:string;supplierId:string;freight:string;duty:string;otherCosts:string;items:PurchaseGuardianDraftItem[];}
export interface PurchaseGuardianIssue{code:PurchaseGuardianCode;severity:PurchaseGuardianSeverity;itemIndex:number;title:string;detail:string;}
export interface PurchaseGuardianReview{issues:PurchaseGuardianIssue[];critical:number;warnings:number;info:number;}

const SCALE=12;
function abs(value:bigint):bigint{return value<0n?-value:value;}
function pctChange(current:string,previous:string):bigint{const now=decimalToScaled(current,SCALE),before=decimalToScaled(previous,SCALE);if(before===0n)return 0n;return abs(now-before)*10_000n/abs(before);}
function percentText(basisPoints:bigint):string{return `${basisPoints/100n}.${(basisPoints%100n).toString().padStart(2,'0')}%`;}
function costPositive(value:string):boolean{return isDecimalInput(value)&&decimalToScaled(value,SCALE)>0n;}
function normalized(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}
function lineKey(row:PurchaseGuardianDraftItem):string{return row.savedItemId?`id:${row.savedItemId}`:row.sku.trim()?`sku:${normalized(row.sku)}`:`name:${normalized(row.descriptionEn||row.descriptionAr)}`;}
function itemName(row:PurchaseGuardianDraftItem,index:number):string{return(row.sku||row.descriptionEn||row.descriptionAr||`Item ${index+1}`).trim();}
function add(issues:PurchaseGuardianIssue[],code:PurchaseGuardianCode,severity:PurchaseGuardianSeverity,itemIndex:number,title:string,detail:string):void{issues.push({code,severity,itemIndex,title,detail});}

export function reviewPurchaseBeforePost(draft:PurchaseGuardianDraft,savedItems:SavedItem[]):PurchaseGuardianReview{
  const issues:PurchaseGuardianIssue[]=[];const currency=draft.currency.trim().toUpperCase();const savedById=new Map(savedItems.map(item=>[item.id,item]));const seen=new Map<string,number>();
  draft.items.forEach((row,index)=>{
    const name=itemName(row,index),saved=row.savedItemId?savedById.get(row.savedItemId):undefined;
    if(!row.savedItemId)add(issues,'unmatched-item','warning',index,'Unmatched purchase line',`${name} is not linked to a saved product. Posting will not update a product master cost for this line.`);
    if(!costPositive(row.unitCost))add(issues,'zero-cost','critical',index,'Zero or missing purchase cost',`${name} has no positive unit cost. Review the supplier cost before posting.`);
    const key=lineKey(row);if(key&&key!=='name:'){const prior=seen.get(key);if(prior!==undefined)add(issues,'duplicate-line','warning',index,'Possible duplicate purchase line',`${name} appears more than once in this purchase. Review quantities before posting.`);else seen.set(key,index);}
    if(saved){
      const priorCost=(saved.lastUnitCost||'').trim(),priorCurrency=(saved.lastCostCurrency||'').trim().toUpperCase();
      if(priorCost&&priorCurrency&&currency&&priorCurrency!==currency)add(issues,'currency-mismatch','warning',index,'Cost currency changed',`${name} was last costed in ${priorCurrency}; this purchase is ${currency}. LOUREX will not compare these costs as if they were the same currency.`);
      if(priorCost&&priorCurrency===currency&&costPositive(row.unitCost)&&costPositive(priorCost)){const change=pctChange(row.unitCost,priorCost);if(change>=2_000n)add(issues,'cost-change',change>=5_000n?'critical':'warning',index,'Large purchase cost change',`${name} changed ${percentText(change)} from the last recorded ${currency} unit cost.`);}
    }
    if(costPositive(row.unitCost)&&costPositive(row.landedUnitCost)){const uplift=pctChange(row.landedUnitCost,row.unitCost);if(decimalToScaled(row.landedUnitCost,SCALE)>decimalToScaled(row.unitCost,SCALE)&&uplift>=2_000n)add(issues,'landed-cost-uplift',uplift>=5_000n?'critical':'warning',index,'High landed-cost uplift',`${name} landed unit cost is ${percentText(uplift)} above supplier unit cost. Review freight, duty and other allocations.`);}
  });
  const itemSubtotal=draft.items.reduce((sum,row)=>sum+(costPositive(row.quantity)&&costPositive(row.unitCost)?decimalToScaled(row.quantity,4)*decimalToScaled(row.unitCost,8):0n),0n);
  const extras=decimalToScaled(draft.freight||'0',4)+decimalToScaled(draft.duty||'0',4)+decimalToScaled(draft.otherCosts||'0',4);
  if(itemSubtotal>0n&&extras>0n){const normalizedSubtotal=itemSubtotal/100_000_000n;const normalizedExtras=extras;const uplift=normalizedSubtotal>0n?normalizedExtras*10_000n/normalizedSubtotal:0n;if(uplift>=2_000n)add(issues,'landed-total-uplift',uplift>=5_000n?'critical':'warning',-1,'High landed-cost allocation',`Freight, duty and other acquisition costs add approximately ${percentText(uplift)} over the item subtotal.`);}
  return{issues,critical:issues.filter(issue=>issue.severity==='critical').length,warnings:issues.filter(issue=>issue.severity==='warning').length,info:issues.filter(issue=>issue.severity==='info').length};
}
