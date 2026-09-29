import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { allocateLandedCost, purchaseTotals } from './operations.js';
import { decimalToScaled } from './money.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';

export interface ProcurementDraftOffer{
  purchaseId:string;
  purchaseNumber:string;
  supplierId:string;
  supplierName:string;
  currency:string;
  itemId:string;
  itemName:string;
  sku:string;
  quantity:string;
  unit:string;
  unitCost:string;
  landedUnitCost:string;
  freight:string;
  duty:string;
  otherCosts:string;
  paymentTerms:string;
  moq:string;
  leadTime:string;
  matchConfidence:number;
  matchBasis:'saved-item'|'sku'|'description'|'likely-description';
}
export interface ProcurementDraftComparison{
  key:string;
  itemName:string;
  currency:string;
  offers:ProcurementDraftOffer[];
  lowestUnitCostPurchaseId:string;
  lowestLandedCostPurchaseId:string;
  warning:string;
}
export interface ProcurementDraftContext{
  basis:'deterministic-draft-supplier-offers';
  comparisons:ProcurementDraftComparison[];
  uncomparableOffers:number;
  limitations:string[];
}

type Line=PurchaseRecord['items'][number];
function supplierName(purchase:PurchaseRecord):string{return(purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'Unknown supplier').trim();}
function lineName(line:Line,saved?:SavedItem):string{return(saved?.descriptionEn||saved?.descriptionAr||line.descriptionEn||line.descriptionAr||line.sku||'Unnamed item').trim();}
function tokens(value:string):Set<string>{return new Set(normalizeSavedItemIdentity(value).split(' ').filter(token=>token.length>=2));}
function similarity(left:string,right:string):number{const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let common=0;for(const token of a)if(b.has(token))common+=1;return common/(a.size+b.size-common);}
function noteValue(notes:string,label:string):string{const line=notes.split(/\r?\n/).find(row=>row.toLowerCase().startsWith(`${label.toLowerCase()}:`));return line?line.slice(line.indexOf(':')+1).trim():'';}
function paymentTerms(notes:string):string{return noteValue(notes,'Payment terms');}
function lineIdentity(line:Line,savedById:Map<string,SavedItem>):{key:string;itemId:string;name:string;confidence:number;basis:ProcurementDraftOffer['matchBasis']}|null{
  if(line.savedItemId){const saved=savedById.get(line.savedItemId);return{key:`item:${line.savedItemId}`,itemId:line.savedItemId,name:lineName(line,saved),confidence:1,basis:'saved-item'};}
  const sku=normalizeSavedItemSku(line.sku);if(sku)return{key:`sku:${sku}`,itemId:'',name:lineName(line),confidence:.98,basis:'sku'};
  const en=normalizeSavedItemIdentity(line.descriptionEn),ar=normalizeSavedItemIdentity(line.descriptionAr),name=en||ar;if(!name)return null;
  return{key:`name:${name}`,itemId:'',name:lineName(line),confidence:.94,basis:'description'};
}
function comparableKey(identity:{key:string;name:string},existingKeys:Array<{key:string;name:string}>):{key:string;confidence:number;basis:ProcurementDraftOffer['matchBasis']}{
  if(existingKeys.some(row=>row.key===identity.key))return{key:identity.key,confidence:1,basis:identity.key.startsWith('item:')?'saved-item':identity.key.startsWith('sku:')?'sku':'description'};
  let best:{key:string;score:number}|null=null;for(const row of existingKeys){if(!row.key.startsWith('name:'))continue;const score=similarity(identity.name,row.name);if(!best||score>best.score)best={key:row.key,score};}
  if(best&&best.score>=.78)return{key:best.key,confidence:Math.min(.9,.6+best.score*.35),basis:'likely-description'};
  return{key:identity.key,confidence:.94,basis:'description'};
}
function lowerCost(offers:ProcurementDraftOffer[],field:'unitCost'|'landedUnitCost'):string{
  const rows=offers.filter(row=>row[field].trim()).sort((a,b)=>{const av=decimalToScaled(a[field],12),bv=decimalToScaled(b[field],12);return av<bv?-1:av>bv?1:0;});return rows[0]?.purchaseId||'';
}

export function buildProcurementDraftContext(vault:VaultPayload):ProcurementDraftContext{
  const savedById=new Map(vault.savedItems.map(item=>[item.id,item]));const grouped=new Map<string,{name:string;currency:string;offers:ProcurementDraftOffer[]}>();let uncomparableOffers=0;const identities:Array<{key:string;name:string}>=[];
  for(const purchase of vault.purchases.filter(row=>row.status==='draft')){
    const allocated=allocateLandedCost(purchase),totals=purchaseTotals(purchase);const supplier=supplierName(purchase);const terms=paymentTerms(purchase.notes),moq=noteValue(purchase.notes,'MOQ'),leadTime=noteValue(purchase.notes,'Lead time');
    for(const [index,line] of purchase.items.entries()){
      if(!line.unitCost.trim()){uncomparableOffers+=1;continue;}
      const identity=lineIdentity(line,savedById);if(!identity){uncomparableOffers+=1;continue;}
      const match=comparableKey(identity,identities);if(!identities.some(row=>row.key===match.key))identities.push({key:match.key,name:identity.name});
      const key=`${match.key}|${purchase.currency.toUpperCase()}`;const bucket=grouped.get(key)??{name:identity.name,currency:purchase.currency.toUpperCase(),offers:[]};const landed=allocated.items[index]?.landedUnitCost||line.unitCost;
      bucket.offers.push({purchaseId:purchase.id,purchaseNumber:purchase.number,supplierId:purchase.supplierSnapshot?.sourceSupplierId||'',supplierName:supplier,currency:purchase.currency.toUpperCase(),itemId:identity.itemId,itemName:identity.name,sku:line.sku,quantity:line.quantity,unit:line.unit,unitCost:line.unitCost,landedUnitCost:landed,freight:totals.freight,duty:totals.duty,otherCosts:totals.other,paymentTerms:terms,moq,leadTime,matchConfidence:Math.min(identity.confidence,match.confidence),matchBasis:match.basis});grouped.set(key,bucket);
    }
  }
  const comparisons:ProcurementDraftComparison[]=[];
  for(const [key,bucket] of grouped){if(bucket.offers.length<2)continue;const distinctSuppliers=new Set(bucket.offers.map(row=>row.supplierId||row.supplierName));if(distinctSuppliers.size<2)continue;comparisons.push({key,itemName:bucket.name,currency:bucket.currency,offers:bucket.offers.sort((a,b)=>a.unitCost.localeCompare(b.unitCost)),lowestUnitCostPurchaseId:lowerCost(bucket.offers,'unitCost'),lowestLandedCostPurchaseId:lowerCost(bucket.offers,'landedUnitCost'),warning:bucket.offers.some(row=>row.matchConfidence<.8)?'Some product matches are likely rather than exact and require review.':''});}
  comparisons.sort((a,b)=>b.offers.length-a.offers.length||a.itemName.localeCompare(b.itemName));
  return{basis:'deterministic-draft-supplier-offers',comparisons:comparisons.slice(0,30),uncomparableOffers,limitations:['comparisons-require-the-same-currency','no-fx-conversion','landed-cost-uses-existing-LOUREX-allocation','lowest-cost-is-an-observation-not-a-supplier-recommendation','drafts-remain-unposted-until-user-action','likely-description-matches-require-review']};
}
