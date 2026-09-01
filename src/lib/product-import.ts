import type { SavedItem } from '../types.js';
import { makeId } from './id.js';
import { decimalToScaled, isDecimalInput, normalizeDecimalInput } from './money.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity, normalizeSavedItemSku, parseSavedItemTags } from './saved-items.js';

export type ProductImportAction='create'|'update'|'skip'|'error';
export type ProductImportField='sku'|'descriptionEn'|'descriptionAr'|'hsCode'|'origin'|'packing'|'unit'|'lastUnitPrice'|'lastCurrency'|'category'|'tags'|'favorite';

export interface ProductImportPlanRow {
  rowNumber:number;
  action:ProductImportAction;
  reason:string;
  item:SavedItem|null;
  matchedId:string;
}

export interface ProductImportPlan {
  rows:ProductImportPlanRow[];
  recognizedFields:ProductImportField[];
  counts:{create:number;update:number;skip:number;error:number};
}

const HEADER_ALIASES:Record<ProductImportField,string[]>={
  sku:['sku','item code','itemcode','product code','productcode','code','كود الصنف','رمز الصنف','كود المنتج'],
  descriptionEn:['description en','description english','english description','product name','name en','english name','name','description','اسم المنتج انجليزي','الوصف بالانجليزية','الوصف الانجليزي'],
  descriptionAr:['description ar','description arabic','arabic description','name ar','arabic name','اسم المنتج عربي','الوصف بالعربية','الوصف العربي'],
  hsCode:['hs code','hscode','hs','customs code','tariff code','كود hs','الرمز الجمركي'],
  origin:['origin','country of origin','made in','المنشأ','بلد المنشأ'],
  packing:['packing','packaging','pack','التعبئة','التغليف'],
  unit:['unit','uom','unit of measure','الوحدة'],
  lastUnitPrice:['price','unit price','last price','last unit price','سعر','السعر','سعر الوحدة','اخر سعر','آخر سعر'],
  lastCurrency:['currency','currency code','العملة'],
  category:['category','group','product category','التصنيف','الفئة'],
  tags:['tags','tag','keywords','وسوم','الوسوم','كلمات مفتاحية'],
  favorite:['favorite','favourite','starred','مفضلة','المفضلة']
};

function normalizeHeader(value:unknown):string{
  return String(value??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ');
}

const ALIAS_TO_FIELD=new Map<string,ProductImportField>();
(Object.keys(HEADER_ALIASES) as ProductImportField[]).forEach(field=>{
  HEADER_ALIASES[field].forEach(alias=>ALIAS_TO_FIELD.set(normalizeHeader(alias),field));
});

function cell(value:unknown):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='boolean')return value?'true':'false';
  return String(value).trim();
}

export function parseCsvMatrix(text:string):string[][]{
  const source=text.replace(/^\uFEFF/,'');
  const rows:string[][]=[];
  let row:string[]=[];
  let value='';
  let quoted=false;
  for(let i=0;i<source.length;i+=1){
    const ch=source[i]!;
    if(quoted){
      if(ch==='"'&&source[i+1]==='"'){value+='"';i+=1;continue;}
      if(ch==='"'){quoted=false;continue;}
      value+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue;}
    if(ch===','){row.push(value.trim());value='';continue;}
    if(ch==='\n'){
      row.push(value.trim());value='';
      if(row.some(entry=>entry!==''))rows.push(row);
      row=[];
      continue;
    }
    if(ch==='\r')continue;
    value+=ch;
  }
  row.push(value.trim());
  if(row.some(entry=>entry!==''))rows.push(row);
  return rows;
}

export function productImportTemplateCsv():string{
  return [
    ['SKU','Description EN','Description AR','HS Code','Origin','Packing','Unit','Unit Price','Currency','Category','Tags','Favorite'],
    ['RB-250-ORG','Red Bull Original 250ml','ريد بول أصلي 250 مل','220299','Türkiye','24 × 250 ml / Carton','Carton','24.50','USD','Energy Drinks','250ml, Original','yes']
  ].map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
}

function boolValue(value:string):boolean|undefined{
  if(!value)return undefined;
  const normalized=value.trim().toLocaleLowerCase();
  if(['1','true','yes','y','favorite','favourite','نعم','مفضلة'].includes(normalized))return true;
  if(['0','false','no','n','لا'].includes(normalized))return false;
  return undefined;
}

function firstHeaderRow(matrix:unknown[][]):number{
  return matrix.findIndex(row=>row.some(value=>normalizeHeader(value)!==''));
}

function mappedHeaders(row:unknown[]):Array<ProductImportField|null>{
  return row.map(value=>ALIAS_TO_FIELD.get(normalizeHeader(value))??null);
}

function incomingObject(row:unknown[],headers:Array<ProductImportField|null>):Partial<Record<ProductImportField,string>>{
  const result:Partial<Record<ProductImportField,string>>={};
  headers.forEach((field,index)=>{if(field)result[field]=cell(row[index]);});
  return result;
}

function mergeImported(existing:SavedItem,incoming:Partial<Record<ProductImportField,string>>,now:string):SavedItem{
  const next:SavedItem={...existing,updatedAt:now};
  const assign=(key:'sku'|'descriptionEn'|'descriptionAr'|'hsCode'|'origin'|'packing'|'unit'|'category',value:string|undefined)=>{if(value?.trim())next[key]=value.trim();};
  assign('sku',incoming.sku);
  assign('descriptionEn',incoming.descriptionEn);
  assign('descriptionAr',incoming.descriptionAr);
  assign('hsCode',incoming.hsCode);
  assign('origin',incoming.origin);
  assign('packing',incoming.packing);
  assign('unit',incoming.unit);
  assign('category',incoming.category);
  if(incoming.lastUnitPrice?.trim())next.lastUnitPrice=normalizeDecimalInput(incoming.lastUnitPrice);
  if(incoming.lastCurrency?.trim())next.lastCurrency=incoming.lastCurrency.trim().toUpperCase();
  if(incoming.tags?.trim())next.tags=Array.from(new Set(parseSavedItemTags(incoming.tags).map(tag=>tag.trim()).filter(Boolean)));
  const favorite=boolValue(incoming.favorite??'');
  if(favorite!==undefined)next.favorite=favorite;
  return next;
}

function createImported(incoming:Partial<Record<ProductImportField,string>>,defaultCurrency:string,now:string):SavedItem{
  return {
    id:makeId('product'),createdAt:now,updatedAt:now,
    sku:(incoming.sku??'').trim(),
    descriptionEn:(incoming.descriptionEn??'').trim(),descriptionAr:(incoming.descriptionAr??'').trim(),
    hsCode:(incoming.hsCode??'').trim(),origin:(incoming.origin??'').trim(),packing:(incoming.packing??'').trim(),
    unit:(incoming.unit??'').trim()||'PCS',lastUnitPrice:incoming.lastUnitPrice?.trim()?normalizeDecimalInput(incoming.lastUnitPrice):'',
    lastCurrency:(incoming.lastCurrency??'').trim().toUpperCase()||defaultCurrency.trim().toUpperCase()||'USD',
    usageCount:0,lastUsedAt:now,category:(incoming.category??'').trim(),
    tags:Array.from(new Set(parseSavedItemTags(incoming.tags??'').map(tag=>tag.trim()).filter(Boolean))),
    favorite:boolValue(incoming.favorite??'')??false
  };
}

function identityKey(item:Pick<SavedItem,'descriptionEn'|'descriptionAr'>):string{
  return normalizeSavedItemIdentity(item.descriptionEn)||normalizeSavedItemIdentity(item.descriptionAr);
}

function incomingNameKeys(incoming:Partial<Record<ProductImportField,string>>):string[]{
  return [incoming.descriptionEn??'',incoming.descriptionAr??'']
    .map(normalizeSavedItemIdentity)
    .filter(Boolean)
    .map(value=>`name:${value}`);
}

export function planProductImport(matrix:unknown[][],existingItems:SavedItem[],defaultCurrency:string,updateExisting=true):ProductImportPlan{
  const headerIndex=firstHeaderRow(matrix);
  if(headerIndex<0)return {rows:[],recognizedFields:[],counts:{create:0,update:0,skip:0,error:0}};
  const headers=mappedHeaders(matrix[headerIndex]??[]);
  const recognizedFields=Array.from(new Set(headers.filter((field):field is ProductImportField=>Boolean(field))));
  if(!recognizedFields.length)throw new Error('No supported product columns were found in this file.');

  const bySku=new Map<string,SavedItem>();
  existingItems.forEach(item=>{const sku=normalizeSavedItemSku(item.sku??'');if(sku&&!bySku.has(sku))bySku.set(sku,item);});
  const seenFileSkus=new Set<string>();
  const seenFileNames=new Set<string>();
  const seenCreates=new Set<string>();
  const rows:ProductImportPlanRow[]=[];
  const now=new Date().toISOString();

  matrix.slice(headerIndex+1).forEach((raw,rowOffset)=>{
    if(!raw.some(value=>cell(value)!==''))return;
    const rowNumber=headerIndex+rowOffset+2;
    const incoming=incomingObject(raw,headers);
    const sku=normalizeSavedItemSku(incoming.sku??'');
    if(sku&&seenFileSkus.has(sku)){
      rows.push({rowNumber,action:'error',reason:'Duplicate SKU inside the import file.',item:null,matchedId:''});
      return;
    }
    if(sku)seenFileSkus.add(sku);

    const nameKeys=incomingNameKeys(incoming);
    if(nameKeys.some(key=>seenFileNames.has(key))){
      rows.push({rowNumber,action:'error',reason:'Duplicate product name inside the import file.',item:null,matchedId:''});
      return;
    }
    nameKeys.forEach(key=>seenFileNames.add(key));

    if(incoming.lastUnitPrice?.trim()&&(!isDecimalInput(incoming.lastUnitPrice)||decimalToScaled(incoming.lastUnitPrice)<0n)){
      rows.push({rowNumber,action:'error',reason:'Unit price is not a valid non-negative number.',item:null,matchedId:''});
      return;
    }

    const probe:SavedItem={
      id:'__import__',createdAt:now,updatedAt:now,sku:incoming.sku??'',descriptionEn:incoming.descriptionEn??'',descriptionAr:incoming.descriptionAr??'',
      hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:defaultCurrency||'USD',usageCount:0,lastUsedAt:now
    };
    const skuMatch=sku?bySku.get(sku):undefined;
    const nameMatch=findSavedItemDuplicate(existingItems,probe);
    const matched=skuMatch??nameMatch;

    if(matched){
      if(!updateExisting){rows.push({rowNumber,action:'skip',reason:skuMatch?'SKU already exists.':'Product name already exists.',item:null,matchedId:matched.id});return;}
      const candidate=mergeImported(matched,incoming,now);
      const conflict=findSavedItemDuplicate(existingItems,candidate);
      if(conflict&&conflict.id!==matched.id){rows.push({rowNumber,action:'error',reason:'The imported SKU or product name conflicts with another saved item.',item:null,matchedId:matched.id});return;}
      rows.push({rowNumber,action:'update',reason:skuMatch?'Matched by SKU.':'Matched by product name.',item:candidate,matchedId:matched.id});
      return;
    }

    if(!(incoming.descriptionEn??'').trim()&&!(incoming.descriptionAr??'').trim()){
      rows.push({rowNumber,action:'error',reason:'A new product needs an English or Arabic description.',item:null,matchedId:''});
      return;
    }
    const created=createImported(incoming,defaultCurrency,now);
    const createKey=sku?`sku:${sku}`:`name:${identityKey(created)}`;
    if(createKey.endsWith(':')||seenCreates.has(createKey)){
      rows.push({rowNumber,action:'error',reason:'This product is repeated inside the import file.',item:null,matchedId:''});
      return;
    }
    seenCreates.add(createKey);
    rows.push({rowNumber,action:'create',reason:'New product.',item:created,matchedId:''});
  });

  const counts={create:0,update:0,skip:0,error:0};
  rows.forEach(row=>{counts[row.action]+=1;});
  return {rows,recognizedFields,counts};
}

export function importableProducts(plan:ProductImportPlan):SavedItem[]{
  return plan.rows.filter(row=>(row.action==='create'||row.action==='update')&&row.item).map(row=>row.item as SavedItem);
}
