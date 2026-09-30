import type { PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { allocateLandedCost } from './operations.js';
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
  landedCostComplete:boolean;
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
type Identity={key:string;itemId:string;name:string;confidence:number;basis:ProcurementDraftOffer['matchBasis']};
type KnownIdentity={key:string;name:string;explicit:boolean};
function supplierName(purchase:PurchaseRecord):string{return(purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||'Unknown supplier').trim();}
function lineName(line:Line,saved?:SavedItem):string{return(saved?.descriptionEn||saved?.descriptionAr||line.descriptionEn||line.descriptionAr||line.sku||'Unnamed item').trim();}
function tokens(value:string):Set<string>{return new Set(normalizeSavedItemIdentity(value).split(' ').filter(token=>token.length>=2));}
function similarity(left:string,right:string):number{const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let common=0;for(const token of a)if(b.has(token))common+=1;return common/(a.size+b.size-common);}
function noteValue(notes:string,label:string):string{const line=notes.split(/\r?\n/).find(row=>row.toLowerCase().startsWith(`${label.toLowerCase()}:`));return line?line.slice(line.indexOf(':')+1).trim():'';}
function paymentTerms(notes:string):string{return noteValue(notes,'Payment terms');}
function lineIdentity(line:Line,savedById:Map<string,SavedItem>):Identity|null{
  if(line.savedItemId){const saved=savedById.get(line.savedItemId);if(saved)return{key:`item:${line.savedItemId}`,itemId:line.savedItemId,name:lineName(line,saved),confidence:1,basis:'saved-item'};}
  const sku=normalizeSavedItemSku(line.sku);if(sku)return{key:`sku:${sku}`,itemId:'',name:lineName(line),confidence:.98,basis:'sku'};
  const en=normalizeSavedItemIdentity(line.descriptionEn),ar=normalizeSavedItemIdentity(line.descriptionAr),name=en||ar;if(!name)return null;
  return{key:`name:${name}`,itemId:'',name:lineName(line),confidence:.94,basis:'description'};
}
function isExplicitKey(key:string):boolean{return key.startsWith('item:')||key.startsWith('sku:');}
function comparableKey(identity:Identity,existingKeys:KnownIdentity[]):{key:string;confidence:number;basis:ProcurementDraftOffer['matchBasis']}{
  const exact=existingKeys.find(row=>row.key===identity.key);if(exact)return{key:identity.key,confidence:1,basis:identity.basis};
  const incomingExplicit=isExplicitKey(identity.key);let best:{key:string;score:number}|null=null;
  for(const row of existingKeys){if(incomingExplicit&&row.explicit)continue;const score=similarity(identity.name,row.name);if(!best||score>best.score)best={key:row.key,score};}
  if(best&&best.score>=.82)return{key:best.key,confidence:Math.min(.9,.62+best.score*.32),basis:'likely-description'};
  return{key:identity.key,confidence:identity.confidence,basis:identity.basis};
}
function numericCompare(left:string,right:string):number{try{const a=decimalToScaled(left,12),b=decimalToScaled(right,12);return a<b?-1:a>b?1:0;}catch{return left.localeCompare(right);}}
function lowerCost(offers:ProcurementDraftOffer[],field:'unitCost'|'landedUnitCost'):string{
  const rows=offers.filter(row=>row[field].trim()&&(field==='unitCost'||row.landedCostComplete)).sort((a,b)=>numericCompare(a[field],b[field]));return rows[0]?.purchaseId||'';
}
function landedComponentsComplete(purchase:PurchaseRecord):boolean{return Boolean(purchase.freight.trim()&&purchase.duty.trim()&&purchase.otherCosts.trim());}

export function buildProcurementDraftContext(vault:VaultPayload):ProcurementDraftContext{
  const savedById=new Map(vault.savedItems.map(item=>[item.id,item]));const grouped=new Map<string,{name:string;currency:string;offers:ProcurementDraftOffer[]}>();let uncomparableOffers=0;const identities:KnownIdentity[]=[];
  for(const purchase of vault.purchases.filter(row=>row.status==='draft')){
    const landedCostComplete=landedComponentsComplete(purchase);const allocated=landedCostComplete?allocateLandedCost(purchase):null;const supplier=supplierName(purchase);const terms=paymentTerms(purchase.notes),moq=noteValue(purchase.notes,'MOQ'),leadTime=noteValue(purchase.notes,'Lead time');
    for(const [index,line] of purchase.items.entries()){
      if(!line.unitCost.trim()){uncomparableOffers+=1;continue;}
      const identity=lineIdentity(line,savedById);if(!identity){uncomparableOffers+=1;continue;}
      const match=comparableKey(identity,identities);if(!identities.some(row=>row.key===match.key))identities.push({key:match.key,name:identity.name,explicit:isExplicitKey(identity.key)});
      const currency=purchase.currency.trim().toUpperCase();if(!currency){uncomparableOffers+=1;continue;}
      const key=`${match.key}|${currency}`;const bucket=grouped.get(key)??{name:identity.name,currency,offers:[]};const landed=landedCostComplete?(allocated?.items[index]?.landedUnitCost||line.unitCost):'';
      bucket.offers.push({purchaseId:purchase.id,purchaseNumber:purchase.number,supplierId:purchase.supplierSnapshot?.sourceSupplierId||'',supplierName:supplier,currency,itemId:identity.itemId,itemName:identity.name,sku:line.sku,quantity:line.quantity,unit:line.unit,unitCost:line.unitCost,landedUnitCost:landed,landedCostComplete,freight:purchase.freight.trim(),duty:purchase.duty.trim(),otherCosts:purchase.otherCosts.trim(),paymentTerms:terms,moq,leadTime,matchConfidence:Math.min(identity.confidence,match.confidence),matchBasis:match.basis});grouped.set(key,bucket);
    }
  }
  const comparisons:ProcurementDraftComparison[]=[];
  for(const [key,bucket] of grouped){
    if(bucket.offers.length<2)continue;const distinctSuppliers=new Set(bucket.offers.map(row=>row.supplierId||row.supplierName));if(distinctSuppliers.size<2)continue;
    const offers=[...bucket.offers].sort((a,b)=>numericCompare(a.unitCost,b.unitCost));const warnings:string[]=[];
    if(offers.some(row=>row.matchBasis==='likely-description'))warnings.push('Some product matches are likely rather than exact and require review.');
    if(offers.some(row=>!row.landedCostComplete))warnings.push('Some offers have unknown freight, duty or other landed-cost components; landed-cost ranking is withheld for those offers.');
    comparisons.push({key,itemName:bucket.name,currency:bucket.currency,offers,lowestUnitCostPurchaseId:lowerCost(offers,'unitCost'),lowestLandedCostPurchaseId:lowerCost(offers,'landedUnitCost'),warning:warnings.join(' ')});
  }
  comparisons.sort((a,b)=>b.offers.length-a.offers.length||a.itemName.localeCompare(b.itemName));
  return{basis:'deterministic-draft-supplier-offers',comparisons:comparisons.slice(0,30),uncomparableOffers,limitations:['comparisons-require-the-same-currency','no-fx-conversion','landed-cost-rankings-require-explicit-freight-duty-and-other-cost-values','landed-cost-uses-existing-LOUREX-allocation','lowest-cost-is-an-observation-not-a-supplier-recommendation','drafts-remain-unposted-until-user-action','explicit-different-product-identifiers-are-never-fuzzy-merged','likely-description-matches-require-review']};
}
