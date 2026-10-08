import type {SavedItem,VaultPayload} from '../types.js';
import {makeId} from './id.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';
import {findSavedItemDuplicate} from './saved-items.js';

export const AI_PRODUCT_SOURCE_IMPORT_MAX=120;
export interface AiProductSourceFact{fileName:string;route:string;confidence:number;extracted:string;}
export interface AiProductSourceImportRow{fileName:string;item:SavedItem;preview:{itemId:string;name:string;sku:string;before:Record<string,string>;after:Record<string,string>};}
export interface AiProductSourceImportBatch{workspaceId:string;rows:AiProductSourceImportRow[];}
function str(value:unknown,max=200):string{
  if(typeof value!=='string'||value.length>max*3)throw new Error('Product source contains an invalid or oversized text value.');
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
function curr(value:unknown):string{const c=str(value??'',8).toUpperCase();if(c&&!/^[A-Z]{3}$/.test(c))throw new Error('Product source contains an invalid currency.');return c;}
function money(value:unknown):string{
  const n=str(value??'',48);
  if(!n)return'';
  if(!isNonNegativeDecimalInput(n))throw new Error('Product source has an invalid or negative price/cost.');
  return normalizeDecimalInput(n);
}
function itemFromSource(raw:unknown,sourceCurrency:string,workspaceId:string):SavedItem{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Malformed product row in source.');
  const record=raw as Record<string,unknown>;
  const descriptionEn=str(record.descriptionEn??'',200),descriptionAr=str(record.descriptionAr??'',200),sku=str(record.sku??'',80);
  if(!descriptionEn&&!descriptionAr)throw new Error('Every new product needs a source-supported name; SKU alone is not enough.');
  const lastUnitPrice=money(record.salePrice??''),lastUnitCost=money(record.unitCost??'');
  const lastCurrency=curr(record.saleCurrency??'')||((lastUnitPrice&&sourceCurrency)||'');
  const lastCostCurrency=curr(record.costCurrency??'')||((lastUnitCost&&sourceCurrency)||'');
  if((lastUnitPrice&&!lastCurrency)||(lastUnitCost&&!lastCostCurrency))throw new Error('Source prices/costs require their explicit currency. No assumption was made.');
  const now=new Date().toISOString();
  return{id:makeId('product'),workspaceId,createdAt:now,updatedAt:now,sku,
    descriptionEn,descriptionAr,hsCode:str(record.hsCode??'',40),origin:str(record.origin??'',100),
    packing:str(record.packing??'',120),unit:str(record.unit??'',40),lastUnitPrice,lastCurrency,
    lastUnitCost,lastCostCurrency,category:str(record.category??'',100),tags:[],favorite:false,
    usageCount:0,lastUsedAt:'',archived:false};
}
function preview(item:SavedItem):AiProductSourceImportRow['preview']{
  return{itemId:item.id,name:item.descriptionEn||item.descriptionAr,sku:item.sku||'',before:{},
    after:{sku:item.sku||'',descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,
      category:item.category||'',lastUnitPrice:item.lastUnitPrice,lastCurrency:item.lastCurrency,
      lastUnitCost:item.lastUnitCost||'',lastCostCurrency:item.lastCostCurrency||'',
      packing:item.packing,unit:item.unit,origin:item.origin,hsCode:item.hsCode}};
}
function workspace(item:SavedItem):string{return item.workspaceId||'default';}
function assertUnique(rows:SavedItem[],existing:SavedItem[]):void{
  const all=[...existing];
  for(const item of rows){
    if(all.some(previous=>previous.id===item.id)||findSavedItemDuplicate(all,item))
      throw new Error('Source contains an existing or duplicated product identity. Nothing was saved; review the complete list.');
    all.push(item);
  }
}
export function requestedAiProductImport(message:string):boolean{
  const text=String(message||'').normalize('NFKC').toLowerCase().trim();
  if(text.length>500||!text)return false;
  if(/(?:do not|don't|dont|never|without|no need to|preview only|review only|just show|only show)\s+(?:save|register|import|add|store|create|the|these|any)?|(?:لا\s*(?:تحفظ|تسجل|تسجّل|تضيف|تستورد)|بدون\s*(?:حفظ|تسجيل|إضافة|اضافة)|معاينة\s*فقط|للمراجعة\s*فقط|فقط\s*اعرض)/iu.test(text))return false;
  const action=/(?:save|register|import|add|store|حفظ|احفظ|سجل|سجّل|أضف|اضف|استورد|خزن)/iu.test(text);
  const product=/(?:product|items?|catalog|list|all of them|them|الأصناف|اصناف|المنتجات|منتجات|الكتالوج|القائمة|كلها|جميعها|هم)/iu.test(text);
  return action&&product;
}
/** Entire list is staged, or the entire request fails. Never shorten rows to fit a tool result. */
export function prepareAiProductSourceImport(vault:VaultPayload,rawSources:unknown):AiProductSourceImportBatch{
  if(!Array.isArray(rawSources)||!rawSources.length||rawSources.length>4)throw new Error('Expected 1–4 attached product sources.');
  const workspaceId=vault.appSettings.activeWorkspaceId||'default';
  const active=vault.savedItems.filter(item=>workspace(item)===workspaceId);
  const rows:AiProductSourceImportRow[]=[];
  for(const raw of rawSources){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid attachment metadata.');
    const source=raw as Record<string,unknown>;
    if(source.route!=='product_list')throw new Error('All selected attachments must be verified product catalogs or price lists.');
    if(!Number.isFinite(source.confidence)||Number(source.confidence)<0.6)
      throw new Error('Low-confidence product classification. Use the Product Import workspace to review the original file.');
    const extracted=source.extracted;
    if(typeof extracted!=='string'||!extracted.trim()||extracted.length>120_000)
      throw new Error('Product source extraction is missing or truncated. No records were saved.');
    let parsed:unknown;
    try{parsed=JSON.parse(extracted);}catch{throw new Error('Product source extraction is incomplete. Use the full-file Product Import workflow; no rows were saved.');}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid product source extraction.');
    const draft=parsed as Record<string,unknown>;
    if(!Array.isArray(draft.items)||!draft.items.length||draft.items.length>AI_PRODUCT_SOURCE_IMPORT_MAX)
      throw new Error('Product list is empty or exceeds the safe AI import size. Review the full-file importer instead.');
    const sourceCurrency=curr(draft.sourceCurrency??'');
    const fileName=str(source.fileName??'',180);
    if(!fileName)throw new Error('Attachment has no file name.');
    for(const record of draft.items){
      const item=itemFromSource(record,sourceCurrency,workspaceId);
      rows.push({fileName,item,preview:preview(item)});
      if(rows.length>AI_PRODUCT_SOURCE_IMPORT_MAX)throw new Error('Combined files exceed 120 products. Nothing was imported.');
    }
  }
  assertUnique(rows.map(row=>row.item),active);
  return{workspaceId,rows};
}
/** Called inside the single persisted vault mutation after explicit approval. */
export function applyAiProductSourceImport(vault:VaultPayload,batch:AiProductSourceImportBatch):VaultPayload{
  if(!batch||!Array.isArray(batch.rows)||!batch.rows.length||batch.rows.length>AI_PRODUCT_SOURCE_IMPORT_MAX)
    throw new Error('Invalid product import approval.');
  if((vault.appSettings.activeWorkspaceId||'default')!==batch.workspaceId)
    throw new Error('The active company changed. No items were imported.');
  const existing=vault.savedItems.filter(item=>workspace(item)===batch.workspaceId);
  const rows:SavedItem[]=[];
  const ids=new Set<string>();
  for(const row of batch.rows){
    if(!row||!row.item||row.item.workspaceId!==batch.workspaceId||ids.has(row.item.id))
      throw new Error('Invalid or duplicate import row.');
    ids.add(row.item.id);
    const rechecked=itemFromSource({
      sku:row.item.sku,descriptionEn:row.item.descriptionEn,descriptionAr:row.item.descriptionAr,
      salePrice:row.item.lastUnitPrice,saleCurrency:row.item.lastCurrency,
      unitCost:row.item.lastUnitCost,costCurrency:row.item.lastCostCurrency,
      category:row.item.category,hsCode:row.item.hsCode,origin:row.item.origin,
      packing:row.item.packing,unit:row.item.unit
    },'',batch.workspaceId);
    for(const key of ['sku','descriptionEn','descriptionAr','lastUnitPrice','lastCurrency','lastUnitCost','lastCostCurrency','category','hsCode','origin','packing','unit'] as const){
      if((rechecked[key]||'')!==(row.item[key]||''))throw new Error('An approved product field changed. Preview the entire import again.');
    }
    if(JSON.stringify(preview(row.item))!==JSON.stringify(row.preview))throw new Error('Approved source preview changed. No items were imported.');
    rows.push({...row.item});
  }
  assertUnique(rows,existing);
  return{...vault,savedItems:[...vault.savedItems,...rows]};
}
