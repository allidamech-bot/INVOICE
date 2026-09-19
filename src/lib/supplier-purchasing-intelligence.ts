import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { decimalToScaled } from './money.js';
import { purchaseAccountingIsValid, purchaseTotals } from './operations.js';

export type PurchaseAlertType='cost-change'|'landed-overhead'|'unlinked-lines';

export interface SupplierPurchaseObservation {
  supplierId:string;
  supplierName:string;
  purchaseId:string;
  purchaseNumber:string;
  purchaseDate:string;
  unitCost:string;
  landedUnitCost:string;
}
export interface SupplierItemComparison {
  itemId:string;
  itemName:string;
  currency:string;
  basis:'latest-posted-observation-per-supplier';
  observations:SupplierPurchaseObservation[];
  lowestUnitCostSupplierId:string;
  lowestUnitCostSupplierName:string;
  lowestUnitCost:string;
  lowestLandedCostSupplierId:string;
  lowestLandedCostSupplierName:string;
  lowestLandedUnitCost:string;
}
export interface PurchaseCostBreakdown {
  purchaseId:string;
  purchaseNumber:string;
  date:string;
  supplierId:string;
  supplierName:string;
  currency:string;
  subtotal:string;
  freight:string;
  duty:string;
  otherCosts:string;
  extraCosts:string;
  landedTotal:string;
  extraCostPercent:string;
  unlinkedLines:number;
  signals:string[];
}
export interface SupplierCostTrend {
  itemId:string;
  itemName:string;
  supplierId:string;
  supplierName:string;
  currency:string;
  currentDate:string;
  previousDate:string;
  currentUnitCost:string;
  previousUnitCost:string;
  currentLandedUnitCost:string;
  previousLandedUnitCost:string;
  unitCostChangePercent:string;
  landedCostChangePercent:string;
  direction:'up'|'down';
}
export interface PurchaseAlert {
  type:PurchaseAlertType;
  purchaseId:string;
  purchaseNumber:string;
  supplierName:string;
  itemId:string;
  itemName:string;
  currency:string;
  value:string;
  threshold:string;
  detail:string;
}
export interface SupplierPurchasingContext {
  version:1;
  basis:'deterministic-supplier-purchasing';
  asOf:string;
  comparisons:SupplierItemComparison[];
  costTrends:SupplierCostTrend[];
  recentPurchases:PurchaseCostBreakdown[];
  alerts:PurchaseAlert[];
  draftPurchases:number;
  limitations:string[];
}

interface CostObservation extends SupplierPurchaseObservation {itemId:string;itemName:string;currency:string;}
const COST_DECIMALS=12;

function supplierName(purchase:PurchaseRecord):string{return (purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'Unknown supplier').trim();}
function itemName(item:SavedItem|undefined,line:PurchaseRecord['items'][number]):string{return (item?.descriptionEn||item?.descriptionAr||line.descriptionEn||line.descriptionAr||line.sku||'Unnamed item').trim();}
function moneyFromCents(value:bigint):string{const negative=value<0n;const abs=negative?-value:value;return `${negative?'-':''}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function percent(current:string,previous:string):string{const now=decimalToScaled(current||'0',COST_DECIMALS),before=decimalToScaled(previous||'0',COST_DECIMALS);if(before<=0n)return'';const diff=now-before;const negative=diff<0n;const abs=negative?-diff:diff;const hundredths=abs*10_000n/before;return `${negative?'-':''}${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;}
function ratioPercent(value:string,base:string):string{const numerator=decimalToScaled(value||'0',2),denominator=decimalToScaled(base||'0',2);if(denominator<=0n)return'';const hundredths=numerator*10_000n/denominator;return `${hundredths/100n}.${(hundredths%100n).toString().padStart(2,'0')}`;}
function absolutePercent(value:string):bigint{return decimalToScaled(value.replace('-','')||'0',2);}
function queryTokens(message:string):string[]{return message.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token=>token.length>=2);}
function queryScore(text:string,tokens:string[]):number{const value=text.normalize('NFKC').toLowerCase();return tokens.reduce((score,token)=>score+(value.includes(token)?1:0),0);}
function postedPurchases(vault:VaultPayload,asOf:string):PurchaseRecord[]{return vault.purchases.filter(purchase=>purchase.status==='posted'&&purchase.date<=asOf&&purchaseAccountingIsValid(purchase)).sort((a,b)=>b.date.localeCompare(a.date)||b.postedAt.localeCompare(a.postedAt));}
function costObservations(vault:VaultPayload,asOf:string):CostObservation[]{
  const savedById=new Map(vault.savedItems.map(item=>[item.id,item]));const result:CostObservation[]=[];
  for(const purchase of postedPurchases(vault,asOf)){const supplierId=purchase.supplierSnapshot?.sourceSupplierId||'',name=supplierName(purchase);for(const line of purchase.items){if(!line.savedItemId||!line.unitCost.trim())continue;result.push({itemId:line.savedItemId,itemName:itemName(savedById.get(line.savedItemId),line),currency:purchase.currency.toUpperCase(),supplierId,supplierName:name,purchaseId:purchase.id,purchaseNumber:purchase.number,purchaseDate:purchase.date,unitCost:line.unitCost,landedUnitCost:line.landedUnitCost||line.unitCost});}}
  return result;
}
function breakdown(purchase:PurchaseRecord):PurchaseCostBreakdown{
  const totals=purchaseTotals(purchase);const extraCents=decimalToScaled(totals.freight,2)+decimalToScaled(totals.duty,2)+decimalToScaled(totals.other,2);const extraCosts=moneyFromCents(extraCents);const extraCostPercent=ratioPercent(extraCosts,totals.subtotal);const unlinkedLines=purchase.items.filter(line=>!line.savedItemId).length;const signals:string[]=[];if(extraCostPercent&&decimalToScaled(extraCostPercent,2)>=2000n)signals.push('landed-overhead-20-plus');if(unlinkedLines)signals.push('unlinked-purchase-lines');return{purchaseId:purchase.id,purchaseNumber:purchase.number,date:purchase.date,supplierId:purchase.supplierSnapshot?.sourceSupplierId||'',supplierName:supplierName(purchase),currency:purchase.currency.toUpperCase(),subtotal:totals.subtotal,freight:totals.freight,duty:totals.duty,otherCosts:totals.other,extraCosts,landedTotal:totals.landedTotal,extraCostPercent,unlinkedLines,signals};
}

export function buildSupplierPurchasingContext(vault:VaultPayload,message:string,asOf:string):SupplierPurchasingContext{
  const tokens=queryTokens(message),observations=costObservations(vault,asOf),purchases=postedPurchases(vault,asOf);const comparisons:SupplierItemComparison[]=[];const trends:SupplierCostTrend[]=[];const alerts:PurchaseAlert[]=[];
  const byItemCurrency=new Map<string,CostObservation[]>();for(const row of observations){const key=`${row.itemId}|${row.currency}`;const list=byItemCurrency.get(key)??[];list.push(row);byItemCurrency.set(key,list);}
  for(const rows of byItemCurrency.values()){
    const latestBySupplier=new Map<string,CostObservation>();for(const row of rows){const key=row.supplierId||row.supplierName;if(!latestBySupplier.has(key))latestBySupplier.set(key,row);}
    const latest=[...latestBySupplier.values()];if(latest.length>=2){const byUnit=[...latest].sort((a,b)=>{const av=decimalToScaled(a.unitCost,COST_DECIMALS),bv=decimalToScaled(b.unitCost,COST_DECIMALS);return av<bv?-1:av>bv?1:0;});const byLanded=[...latest].sort((a,b)=>{const av=decimalToScaled(a.landedUnitCost,COST_DECIMALS),bv=decimalToScaled(b.landedUnitCost,COST_DECIMALS);return av<bv?-1:av>bv?1:0;});const unit=byUnit[0]!,landed=byLanded[0]!;comparisons.push({itemId:unit.itemId,itemName:unit.itemName,currency:unit.currency,basis:'latest-posted-observation-per-supplier',observations:latest.slice(0,8).map(({supplierId,supplierName,purchaseId,purchaseNumber,purchaseDate,unitCost,landedUnitCost})=>({supplierId,supplierName,purchaseId,purchaseNumber,purchaseDate,unitCost,landedUnitCost})),lowestUnitCostSupplierId:unit.supplierId,lowestUnitCostSupplierName:unit.supplierName,lowestUnitCost:unit.unitCost,lowestLandedCostSupplierId:landed.supplierId,lowestLandedCostSupplierName:landed.supplierName,lowestLandedUnitCost:landed.landedUnitCost});}
    const bySupplier=new Map<string,CostObservation[]>();for(const row of rows){const key=row.supplierId||row.supplierName;const list=bySupplier.get(key)??[];list.push(row);bySupplier.set(key,list);}for(const supplierRows of bySupplier.values()){if(supplierRows.length<2)continue;const current=supplierRows[0]!,previous=supplierRows.find(row=>row.unitCost!==current.unitCost||row.landedUnitCost!==current.landedUnitCost);if(!previous)continue;const unitChange=percent(current.unitCost,previous.unitCost),landedChange=percent(current.landedUnitCost,previous.landedUnitCost);const unitScaled=decimalToScaled(unitChange||'0',2),landedScaled=decimalToScaled(landedChange||'0',2);const direction=(unitScaled!==0n?unitScaled:landedScaled)>=0n?'up':'down';const trend:SupplierCostTrend={itemId:current.itemId,itemName:current.itemName,supplierId:current.supplierId,supplierName:current.supplierName,currency:current.currency,currentDate:current.purchaseDate,previousDate:previous.purchaseDate,currentUnitCost:current.unitCost,previousUnitCost:previous.unitCost,currentLandedUnitCost:current.landedUnitCost,previousLandedUnitCost:previous.landedUnitCost,unitCostChangePercent:unitChange,landedCostChangePercent:landedChange,direction};trends.push(trend);const unitAlert=unitChange&&absolutePercent(unitChange)>=2000n,landedAlert=landedChange&&absolutePercent(landedChange)>=2000n;if(unitAlert||landedAlert){const value=unitAlert?unitChange:landedChange;const label=unitAlert?'Unit cost':'Landed unit cost';alerts.push({type:'cost-change',purchaseId:current.purchaseId,purchaseNumber:current.purchaseNumber,supplierName:current.supplierName,itemId:current.itemId,itemName:current.itemName,currency:current.currency,value,threshold:'20.00',detail:`${label} changed ${value}% versus the previous posted observation from this supplier.`});}}
  }
  const recent=purchases.map(breakdown);for(const row of recent){if(row.extraCostPercent&&decimalToScaled(row.extraCostPercent,2)>=2000n)alerts.push({type:'landed-overhead',purchaseId:row.purchaseId,purchaseNumber:row.purchaseNumber,supplierName:row.supplierName,itemId:'',itemName:'',currency:row.currency,value:row.extraCostPercent,threshold:'20.00',detail:`Freight, duty and other landed costs equal ${row.extraCostPercent}% of item subtotal.`});if(row.unlinkedLines)alerts.push({type:'unlinked-lines',purchaseId:row.purchaseId,purchaseNumber:row.purchaseNumber,supplierName:row.supplierName,itemId:'',itemName:'',currency:row.currency,value:String(row.unlinkedLines),threshold:'1',detail:`${row.unlinkedLines} posted purchase line(s) are not linked to saved products.`});}
  const comparisonScore=(row:SupplierItemComparison)=>queryScore(`${row.itemName} ${row.observations.map(item=>item.supplierName).join(' ')}`,tokens);const trendScore=(row:SupplierCostTrend)=>queryScore(`${row.itemName} ${row.supplierName}`,tokens);const purchaseScore=(row:PurchaseCostBreakdown)=>queryScore(`${row.purchaseNumber} ${row.supplierName}`,tokens);const alertScore=(row:PurchaseAlert)=>queryScore(`${row.purchaseNumber} ${row.supplierName} ${row.itemName}`,tokens);
  comparisons.sort((a,b)=>comparisonScore(b)-comparisonScore(a)||a.itemName.localeCompare(b.itemName));trends.sort((a,b)=>trendScore(b)-trendScore(a)||b.currentDate.localeCompare(a.currentDate));recent.sort((a,b)=>purchaseScore(b)-purchaseScore(a)||b.date.localeCompare(a.date));alerts.sort((a,b)=>alertScore(b)-alertScore(a)||b.purchaseNumber.localeCompare(a.purchaseNumber));
  return{version:1,basis:'deterministic-supplier-purchasing',asOf,comparisons:comparisons.slice(0,16),costTrends:trends.slice(0,20),recentPurchases:recent.slice(0,20),alerts:alerts.slice(0,24),draftPurchases:vault.purchases.filter(purchase=>purchase.status==='draft').length,limitations:['currencies-remain-separate','supplier-comparisons-use-latest-posted-observation-per-supplier','lowest-observed-cost-is-not-an-overall-supplier-recommendation','landed-cost-overhead-alert-threshold-is-20-percent-of-item-subtotal','unit-or-landed-cost-change-alert-threshold-is-20-percent','only-posted-accounting-valid-purchases-feed-intelligence','supplier-document-import-remains-review-required-draft-only']};
}
