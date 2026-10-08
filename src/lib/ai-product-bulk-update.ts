import type {SavedItem, VaultPayload} from '../types.js';
import {isNonNegativeDecimalInput, normalizeDecimalInput} from './money.js';
import {normalizeSavedItemIdentity, normalizeSavedItemSku} from './saved-items.js';

export const AI_BULK_PRODUCT_LIMIT=120;
export type AiBulkProductPatch=Partial<Pick<SavedItem,'sku'|'category'|'lastUnitPrice'|'lastCurrency'>>;
export interface AiBulkProductPreview{
  itemId:string;
  name:string;
  sku:string;
  before:Record<string,string>;
  after:Record<string,string>;
}
export interface AiBulkProductRow{
  itemId:string;
  workspaceId:string;
  beforeUpdatedAt:string;
  before:Record<string,string>;
  patch:AiBulkProductPatch;
  preview:AiBulkProductPreview;
}
export interface AiBulkProductBatch{
  workspaceId:string;
  rows:AiBulkProductRow[];
}
const FIELDS=['sku','category','lastUnitPrice','lastCurrency'] as const;
const DEFAULT_WORKSPACE_ID='default';
function text(value:unknown,max=160):string{
  if(typeof value!=='string'||value.length>max*3)throw new Error('Bulk edit requires an explicit text value.');
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
function workspaceOf(item:SavedItem):string{return item.workspaceId||DEFAULT_WORKSPACE_ID;}
function snapshot(item:SavedItem):Record<string,string>{
  return {sku:item.sku||'',category:item.category||'',lastUnitPrice:item.lastUnitPrice||'',lastCurrency:item.lastCurrency||''};
}
function pickPatch(raw:unknown):AiBulkProductPatch{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Product patch is missing.');
  const input=raw as Record<string,unknown>,patch:AiBulkProductPatch={};
  if(!Object.keys(input).length||Object.keys(input).some(key=>!FIELDS.includes(key as typeof FIELDS[number])))throw new Error('Bulk product update includes an unsupported field.');
  for(const field of FIELDS){
    if(!(field in input))continue;
    const value=text(input[field],field==='category'?100:field==='sku'?80:40);
    if(field==='sku'){if(!value||!/^[\p{L}\p{N}_.\-\/]+$/u.test(value))throw new Error('Invalid SKU in bulk edit.');patch.sku=value;}
    if(field==='category'){if(!value)throw new Error('Category cannot be empty.');patch.category=value;}
    if(field==='lastUnitPrice'){if(!isNonNegativeDecimalInput(value))throw new Error('Invalid non-negative product price.');patch.lastUnitPrice=normalizeDecimalInput(value);}
    if(field==='lastCurrency'){if(!/^[A-Z]{3}$/.test(value.toUpperCase()))throw new Error('An ISO currency is required for prices.');patch.lastCurrency=value.toUpperCase();}
  }
  return patch;
}
function resolve(existing:SavedItem[],ref:Record<string,unknown>):SavedItem{
  const itemId=typeof ref.itemId==='string'?ref.itemId.trim():'';
  const sku=typeof ref.sku==='string'?normalizeSavedItemSku(ref.sku):'';
  const name=typeof ref.name==='string'?normalizeSavedItemIdentity(ref.name):'';
  if(!itemId&&!sku&&!name)throw new Error('Identify each product by an exact SKU, name or record ID.');
  const matches=existing.filter(item=>
    (!itemId||item.id===itemId)&&
    (!sku||normalizeSavedItemSku(item.sku||'')===sku)&&
    (!name||normalizeSavedItemIdentity(item.descriptionEn)===name||normalizeSavedItemIdentity(item.descriptionAr)===name)
  );
  if(matches.length!==1)throw new Error(matches.length?'Ambiguous product identity.':'Product was not found in the active company.');
  if(matches[0]!.archived)throw new Error('Archived products cannot be edited by AI.');
  return matches[0]!;
}
export function prepareAiBulkProductUpdate(vault:VaultPayload,requested:unknown):AiBulkProductBatch{
  if(!Array.isArray(requested)||!requested.length||requested.length>AI_BULK_PRODUCT_LIMIT)
    throw new Error('Provide 1–120 explicit product edits per approval.');
  const workspaceId=vault.appSettings.activeWorkspaceId||DEFAULT_WORKSPACE_ID;
  const existing=vault.savedItems.filter(item=>workspaceOf(item)===workspaceId);
  const seen=new Set<string>();
  const rows:AiBulkProductRow[]=[];
  for(const raw of requested){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid bulk product edit.');
    const entry=raw as Record<string,unknown>;
    const item=resolve(existing,entry);
    if(seen.has(item.id))throw new Error('The same product appears twice in this bulk plan.');
    seen.add(item.id);
    const patch=pickPatch(entry.patch);
    const before=snapshot(item),after={...before,...patch};
    if('lastUnitPrice'in patch&&!after.lastCurrency)throw new Error('A known currency is required before setting a price.');
    if(FIELDS.every(key=>before[key]===after[key]))throw new Error('Bulk edit contains a product with no changes.');
    rows.push({itemId:item.id,workspaceId,beforeUpdatedAt:item.updatedAt||'',before,patch,
      preview:{itemId:item.id,name:item.descriptionEn||item.descriptionAr||item.sku||'Product',sku:item.sku||'',before,after}});
  }
  const finalItems=existing.map(item=>{
    const row=rows.find(entry=>entry.itemId===item.id);
    return row?{...item,...row.patch}:item;
  });
  for(const row of rows){
    const item=finalItems.find(candidate=>candidate.id===row.itemId)!;
    const sku=normalizeSavedItemSku(item.sku||'');
    if(sku&&finalItems.some(other=>other.id!==item.id&&normalizeSavedItemSku(other.sku||'')===sku))
      throw new Error('Bulk plan would create a duplicate SKU.');
  }
  return{workspaceId,rows};
}
export function applyAiBulkProductUpdate(vault:VaultPayload,batch:AiBulkProductBatch,now=new Date().toISOString()):VaultPayload{
  if(!batch||!Array.isArray(batch.rows)||!batch.rows.length||batch.rows.length>AI_BULK_PRODUCT_LIMIT)
    throw new Error('Invalid approved bulk update.');
  if((vault.appSettings.activeWorkspaceId||DEFAULT_WORKSPACE_ID)!==batch.workspaceId)
    throw new Error('Active company changed after AI preview. No products were saved.');
  const seen=new Set<string>();
  const existing=vault.savedItems.filter(item=>workspaceOf(item)===batch.workspaceId);
  for(const row of batch.rows){
    if(!row||seen.has(row.itemId)||row.workspaceId!==batch.workspaceId)throw new Error('Invalid duplicate or cross-company approved row.');
    seen.add(row.itemId);
    const current=existing.find(item=>item.id===row.itemId);
    if(!current||current.archived||current.updatedAt!==row.beforeUpdatedAt||JSON.stringify(snapshot(current))!==JSON.stringify(row.before))
      throw new Error('Product changed since preview. Review the entire batch again; nothing was saved.');
    const cleaned=pickPatch(row.patch);
    if(JSON.stringify(cleaned)!==JSON.stringify(row.patch)||JSON.stringify(row.preview?.before)!==JSON.stringify(row.before)||JSON.stringify(row.preview?.after)!==JSON.stringify({...row.before,...row.patch}))throw new Error('Approved price or metadata changed since preview.');
  }
  const savedItems=vault.savedItems.map(item=>{
    const row=batch.rows.find(entry=>entry.itemId===item.id&&workspaceOf(item)===batch.workspaceId);
    return row?{...item,...row.patch,updatedAt:now}:item;
  });
  const scoped=savedItems.filter(item=>workspaceOf(item)===batch.workspaceId);
  for(const row of batch.rows){
    const candidate=scoped.find(item=>item.id===row.itemId)!;
    const sku=normalizeSavedItemSku(candidate.sku||'');
    if(sku&&scoped.some(item=>item.id!==candidate.id&&normalizeSavedItemSku(item.sku||'')===sku))
      throw new Error('Duplicate SKU detected at save time. Nothing was saved.');
  }
  return{...vault,savedItems};
}
