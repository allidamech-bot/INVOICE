import type { DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { makeId } from './id.js';
import { isNonNegativeDecimalInput, normalizeDecimalInput } from './money.js';

function safeReusableUnitCost(value:string|undefined):string{
  const cost=(value??'').trim();
  if(!cost||!isNonNegativeDecimalInput(cost))return '';
  return normalizeDecimalInput(cost);
}

/** A catalog cost is evidence for a document line only in the same recorded currency. */
export function savedUnitCostForCurrency(saved:Pick<SavedItem,'lastUnitCost'|'lastCostCurrency'>,currency:string):string{
  const target=currency.trim().toUpperCase();
  if(!target||saved.lastCostCurrency?.trim().toUpperCase()!==target)return '';
  return safeReusableUnitCost(saved.lastUnitCost);
}

function reusableUnitCostForSave(value:string|undefined):string{
  const cost=(value??'').trim();
  if(!cost)return '';
  if(!isNonNegativeDecimalInput(cost))throw new Error('Unit cost must be zero or greater.');
  return normalizeDecimalInput(cost);
}

export function savedItemFromDocumentItem(item: DocumentItem, currency: string, existing?: SavedItem): SavedItem {
  const now=new Date().toISOString();
  const incomingCost=reusableUnitCostForSave(item.unitCost);
  const preservedCost=incomingCost||(existing?.lastUnitCost??'');
  const preservedCostCurrency=incomingCost?currency.trim().toUpperCase():(existing?.lastCostCurrency??'');
  return {
    id:existing?.id??makeId('product'),
    createdAt:existing?.createdAt??now,
    updatedAt:now,
    sku:existing?.sku??'',
    descriptionEn:item.descriptionEn.trim(),
    descriptionAr:item.descriptionAr.trim(),
    hsCode:item.hsCode.trim(),
    origin:item.origin.trim(),
    packing:item.packing.trim(),
    unit:item.unit.trim(),
    lastUnitPrice:item.unitPrice.trim(),
    lastCurrency:currency.trim().toUpperCase(),
    lastUnitCost:preservedCost,
    lastCostCurrency:preservedCostCurrency,
    usageCount:(existing?.usageCount??0)+1,
    lastUsedAt:now,
    category:existing?.category??'',
    tags:[...(existing?.tags??[])],
    favorite:Boolean(existing?.favorite),
    inventoryTracking:existing?.inventoryTracking??(item.stockTreatment==='non-stock'?'non-stock':'tracked')
  };
}

export function documentItemFromSavedItem(saved: SavedItem): DocumentItem {
  return {
    id:makeId('item'),
    savedItemId:saved.id,
    stockTreatment:saved.inventoryTracking==='non-stock'?'non-stock':'tracked',
    skuSnapshot:saved.sku||'',
    descriptionEn:saved.descriptionEn,
    descriptionAr:saved.descriptionAr,
    hsCode:saved.hsCode,
    origin:saved.origin,
    packing:saved.packing,
    quantity:'1',
    unit:saved.unit||'PCS',
    unitPrice:saved.lastUnitPrice,
    unitCost:safeReusableUnitCost(saved.lastUnitCost)
  };
}

export function normalizeSavedItemIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
}

export function normalizeSavedItemSku(value:string):string{
  return value.normalize('NFKC').trim().replace(/\s+/g,'').toUpperCase();
}

export function parseSavedItemTags(value: string): string[] {
  return value.split(/[,،]/).map(tag=>tag.trimStart());
}

export function findSavedItemDuplicate(items: SavedItem[], candidate: Pick<SavedItem,'id'|'descriptionEn'|'descriptionAr'|'sku'>): SavedItem|undefined {
  const sku=normalizeSavedItemSku(candidate.sku??'');
  const en=normalizeSavedItemIdentity(candidate.descriptionEn);
  const ar=normalizeSavedItemIdentity(candidate.descriptionAr);
  return items.find(item=>item.id!==candidate.id&&(
    (sku&&normalizeSavedItemSku(item.sku??'')===sku)||
    (en&&normalizeSavedItemIdentity(item.descriptionEn)===en)||
    (ar&&normalizeSavedItemIdentity(item.descriptionAr)===ar)
  ));
}

export function isPristineDocumentItem(item: DocumentItem): boolean {
  return !item.descriptionEn.trim()&&!item.descriptionAr.trim()&&!item.hsCode.trim()&&!item.origin.trim()&&!item.packing.trim()&&!item.unitPrice.trim()&&!(item.unitCost??'').trim()&&item.quantity.trim()==='1';
}


/** Invalidate stale stock identity and internal cost when its commercial identity changes. */
export function editDocumentItemField(item:DocumentItem,key:keyof DocumentItem,value:string):DocumentItem{
  const changedIdentity=['descriptionEn','descriptionAr','unit','packing'].includes(key)&&item[key]!==value;
  return {...item,[key]:value,...(changedIdentity?{savedItemId:'',skuSnapshot:'',stockTreatment:undefined,unitCost:''}:{})};
}

/** A document currency change requires explicit new cost entries. */
export function changeDraftCurrencyCosts(doc:LourexDocument,currency:string):LourexDocument{
  if(doc.status==='final')return doc;
  if(doc.currency.trim().toUpperCase()===currency.trim().toUpperCase())return {...doc,currency};
  return {...doc,currency,
    items:doc.items.map(item=>({...item,unitCost:''})),
    internalCosts:{shippingCost:'',otherCost:''}};
}

/** Selecting another catalog item must never carry the previous item's profit cost. */
export function applySavedItemSuggestionToLine(item:DocumentItem,saved:SavedItem,currency:string):DocumentItem{
  const price=saved.lastCurrency&&saved.lastCurrency!==currency?'':saved.lastUnitPrice;
  return {...item,descriptionEn:saved.descriptionEn,descriptionAr:saved.descriptionAr,hsCode:saved.hsCode,origin:saved.origin,packing:saved.packing,unit:saved.unit||item.unit,unitPrice:price,unitCost:item.savedItemId===saved.id?item.unitCost:savedUnitCostForCurrency(saved,currency),savedItemId:saved.id,skuSnapshot:saved.sku||'',stockTreatment:saved.inventoryTracking==='non-stock'?'non-stock':'tracked'};
}

/** Manual SKU binding also changes cost identity, without rewriting sale price. */
export function bindCatalogItemToLine(item:DocumentItem,saved:SavedItem|undefined,currency:string):DocumentItem{
  if(!saved)return {...item,savedItemId:'',skuSnapshot:'',stockTreatment:'tracked',unitCost:item.savedItemId?'':item.unitCost};
  return {...item,savedItemId:saved.id,skuSnapshot:saved.sku||'',stockTreatment:'tracked',unitCost:item.savedItemId===saved.id?item.unitCost:savedUnitCostForCurrency(saved,currency)};
}

export function mergeSavedItemSelections(items: DocumentItem[], savedItems: SavedItem[], currency: string): DocumentItem[] {
  if(!savedItems.length)return items;
  const additions=savedItems.map(saved=>{
    const item=documentItemFromSavedItem(saved);
    if(saved.lastCurrency&&saved.lastCurrency!==currency)item.unitPrice='';
    item.unitCost=savedUnitCostForCurrency(saved,currency);
    return item;
  });
  if(items.length&&isPristineDocumentItem(items[0]!))return [...additions,...items.slice(1)];
  return [...items,...additions];
}


/** Avoid reapplying the old product's costs from an earlier autosave snapshot. */
export function preserveLatestUnitCostsForMatchingIdentity(items:DocumentItem[],latest:DocumentItem[]):DocumentItem[]{
  const byId=new Map(latest.map(item=>[item.id,item]));
  const identityKeys=['savedItemId','skuSnapshot','descriptionEn','descriptionAr','unit','packing','stockTreatment'] as const;
  return items.map(item=>{
    const fresh=byId.get(item.id);
    if(!fresh)return item;
    const sameIdentity=identityKeys.every(key=>(item[key]??'')===(fresh[key]??''));
    return {...item,unitCost:sameIdentity?(fresh.unitCost??''):(item.unitCost??'')};
  });
}

export function markSavedItemsUsed(items: SavedItem[], usedItems: SavedItem[], usedAt=new Date().toISOString()): SavedItem[] {
  if(!usedItems.length)return items;
  const usedIds=new Set(usedItems.map(item=>item.id));
  return items.map(item=>usedIds.has(item.id)?{...item,usageCount:(item.usageCount??0)+1,lastUsedAt:usedAt,updatedAt:usedAt}:item);
}

export function savedItemSearchText(item: SavedItem): string {
  return [item.sku??'',item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.packing,item.unit,item.category??'',...(item.tags??[])].join(' ').toLowerCase();
}

export function sortSavedItems(items: SavedItem[]): SavedItem[] {
  return [...items].sort((a,b)=>{
    if(Boolean(b.favorite)!==Boolean(a.favorite))return Number(Boolean(b.favorite))-Number(Boolean(a.favorite));
    if((b.usageCount??0)!==(a.usageCount??0))return (b.usageCount??0)-(a.usageCount??0);
    return (b.lastUsedAt||b.updatedAt).localeCompare(a.lastUsedAt||a.updatedAt);
  });
}

export function findSavedItemMatch(items: SavedItem[], item: DocumentItem): SavedItem|undefined {
  const en=normalizeSavedItemIdentity(item.descriptionEn);
  const ar=normalizeSavedItemIdentity(item.descriptionAr);
  if(item.savedItemId)return items.find(saved=>saved.id===item.savedItemId);
  // Historical / free-text lines may be suggested for the editor, but a name match
  // must never be treated as proof of stock identity by the posting engine.
  return items.find(saved=>(en&&normalizeSavedItemIdentity(saved.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(saved.descriptionAr)===ar));
}

export function historySuggestions(documents: LourexDocument[]): SavedItem[] {
  const map=new Map<string,SavedItem>();
  for(const doc of [...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
    if(doc.lifecycleStatus==='voided'||doc.role==='credit-note')continue;
    for(const item of doc.items){
      const key=(item.descriptionEn.trim().toLowerCase()||item.descriptionAr.trim());
      if(!key||map.has(key))continue;
      const cost=safeReusableUnitCost(item.unitCost);
      map.set(key,{
        id:`history-${doc.id}-${item.id}`,
        createdAt:doc.createdAt,
        updatedAt:doc.updatedAt,
        sku:'',
        descriptionEn:item.descriptionEn,
        descriptionAr:item.descriptionAr,
        hsCode:item.hsCode,
        origin:item.origin,
        packing:item.packing,
        unit:item.unit,
        lastUnitPrice:item.unitPrice,
        lastCurrency:doc.currency,
        lastUnitCost:cost,
        lastCostCurrency:cost?doc.currency:'',
        usageCount:0,
        lastUsedAt:doc.updatedAt
      });
    }
  }
  return Array.from(map.values()).slice(0,80);
}