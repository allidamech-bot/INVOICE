import type { DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { makeId } from './id.js';

export function savedItemFromDocumentItem(item: DocumentItem, currency: string, existing?: SavedItem): SavedItem {
  const now=new Date().toISOString();
  return {
    id:existing?.id??makeId('product'),
    createdAt:existing?.createdAt??now,
    updatedAt:now,
    descriptionEn:item.descriptionEn.trim(),
    descriptionAr:item.descriptionAr.trim(),
    hsCode:item.hsCode.trim(),
    origin:item.origin.trim(),
    packing:item.packing.trim(),
    unit:item.unit.trim(),
    lastUnitPrice:item.unitPrice.trim(),
    lastCurrency:currency.trim().toUpperCase(),
    usageCount:(existing?.usageCount??0)+1,
    lastUsedAt:now
  };
}

export function savedItemToDocumentItem(saved: SavedItem): DocumentItem {
  return {
    id:makeId('item'),
    descriptionEn:saved.descriptionEn,
    descriptionAr:saved.descriptionAr,
    hsCode:saved.hsCode,
    origin:saved.origin,
    packing:saved.packing,
    quantity:'1',
    unit:saved.unit||'PCS',
    unitPrice:saved.lastUnitPrice
  };
}

export function savedItemSearchText(item: SavedItem): string {
  return [item.descriptionEn,item.descriptionAr,item.hsCode,item.origin,item.packing,item.unit].join(' ').toLowerCase();
}

export function sortSavedItems(items: SavedItem[]): SavedItem[] {
  return [...items].sort((a,b)=>{
    if((b.usageCount??0)!==(a.usageCount??0))return (b.usageCount??0)-(a.usageCount??0);
    return (b.lastUsedAt||b.updatedAt).localeCompare(a.lastUsedAt||a.updatedAt);
  });
}

export function findSavedItemMatch(items: SavedItem[], item: DocumentItem): SavedItem|undefined {
  const en=item.descriptionEn.trim().toLowerCase();
  const ar=item.descriptionAr.trim();
  return items.find(saved=>(en&&saved.descriptionEn.trim().toLowerCase()===en)||(ar&&saved.descriptionAr.trim()===ar));
}

export function historySuggestions(documents: LourexDocument[]): SavedItem[] {
  const map=new Map<string,SavedItem>();
  for(const doc of [...documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
    for(const item of doc.items){
      const key=(item.descriptionEn.trim().toLowerCase()||item.descriptionAr.trim());
      if(!key||map.has(key))continue;
      map.set(key,{
        id:`history-${doc.id}-${item.id}`,
        createdAt:doc.createdAt,
        updatedAt:doc.updatedAt,
        descriptionEn:item.descriptionEn,
        descriptionAr:item.descriptionAr,
        hsCode:item.hsCode,
        origin:item.origin,
        packing:item.packing,
        unit:item.unit,
        lastUnitPrice:item.unitPrice,
        lastCurrency:doc.currency,
        usageCount:0,
        lastUsedAt:doc.updatedAt
      });
    }
  }
  return Array.from(map.values()).slice(0,80);
}
