import type { DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { makeId } from './id.js';

export function savedItemFromDocumentItem(item: DocumentItem, currency: string, existing?: SavedItem): SavedItem {
  const now=new Date().toISOString();
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
    lastUnitCost:item.unitCost?.trim()??'',
    lastCostCurrency:item.unitCost?.trim()?currency.trim().toUpperCase():(existing?.lastCostCurrency??''),
    usageCount:(existing?.usageCount??0)+1,
    lastUsedAt:now,
    category:existing?.category??'',
    tags:[...(existing?.tags??[])],
    favorite:Boolean(existing?.favorite)
  };
}

export function documentItemFromSavedItem(saved: SavedItem): DocumentItem {
  return {
    id:makeId('item'),
    descriptionEn:saved.descriptionEn,
    descriptionAr:saved.descriptionAr,
    hsCode:saved.hsCode,
    origin:saved.origin,
    packing:saved.packing,
    quantity:'1',
    unit:saved.unit||'PCS',
    unitPrice:saved.lastUnitPrice,
    unitCost:saved.lastUnitCost??''
  };
}

export function normalizeSavedItemIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
}

export function normalizeSavedItemSku(value:string):string{
  return value.normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase();
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

export function mergeSavedItemSelections(items: DocumentItem[], savedItems: SavedItem[], currency: string): DocumentItem[] {
  if(!savedItems.length)return items;
  const additions=savedItems.map(saved=>{
    const item=documentItemFromSavedItem(saved);
    if(saved.lastCurrency&&saved.lastCurrency!==currency)item.unitPrice='';
    if(saved.lastCostCurrency&&saved.lastCostCurrency!==currency)item.unitCost='';
    return item;
  });
  if(items.length&&isPristineDocumentItem(items[0]!))return [...additions,...items.slice(1)];
  return [...items,...additions];
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
  return items.find(saved=>(en&&normalizeSavedItemIdentity(saved.descriptionEn)===en)||(ar&&normalizeSavedItemIdentity(saved.descriptionAr)===ar));
}

export function historySuggestions(documents: LourexDocument[]): SavedItem[] {
  const map=new Map<string,SavedItem>();
  for(const doc of [...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
    if(doc.lifecycleStatus==='voided'||doc.role==='credit-note')continue;
    for(const item of doc.items){
      const key=(item.descriptionEn.trim().toLowerCase()||item.descriptionAr.trim());
      if(!key||map.has(key))continue;
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
        lastUnitCost:item.unitCost??'',
        lastCostCurrency:item.unitCost?.trim()?doc.currency:'',
        usageCount:0,
        lastUsedAt:doc.updatedAt
      });
    }
  }
  return Array.from(map.values()).slice(0,80);
}
