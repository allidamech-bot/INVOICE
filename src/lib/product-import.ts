import type { SavedItem } from '../types.js';
import { makeId } from './id.js';
import { decimalToScaled, isDecimalInput, normalizeDecimalInput } from './money.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity, normalizeSavedItemSku, parseSavedItemTags } from './saved-items.js';

export type ProductImportAction='create'|'update'|'skip'|'error';
export type ProductImportField='sku'|'descriptionEn'|'descriptionAr'|'hsCode'|'origin'|'packing'|'unit'|'lastUnitPrice'|'lastCurrency'|'lastUnitCost'|'lastCostCurrency'|'category'|'tags'|'favorite';

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
  sku:[
    'sku','item sku','product sku','item code','itemcode','product code','productcode','code','reference','ref','article no','article number','item no','item number',
    'كود الصنف','رمز الصنف','كود المنتج','رقم الصنف','مرجع الصنف','الرمز'
  ],
  descriptionEn:[
    'description en','description english','english description','product name','product name en','item name','item name en','name en','english name','name','description','product','item',
    'اسم المنتج انجليزي','اسم الصنف انجليزي','الوصف بالانجليزية','الوصف الانجليزي','الاسم بالانجليزية','الاسم الانجليزي'
  ],
  descriptionAr:[
    'description ar','description arabic','arabic description','product name ar','item name ar','name ar','arabic name',
    'اسم المنتج عربي','اسم الصنف عربي','الوصف بالعربية','الوصف العربي','الاسم بالعربية','الاسم العربي','اسم المنتج','اسم الصنف'
  ],
  hsCode:['hs code','hscode','hs','hs-code','customs code','custom code','tariff code','harmonized code','commodity code','كود hs','رمز hs','الرمز الجمركي','التعرفة الجمركية'],
  origin:['origin','country of origin','origin country','made in','country','coo','المنشأ','بلد المنشأ','دولة المنشأ','صنع في'],
  packing:[
    'packing','packaging','pack','pack size','packing size','case pack','carton pack','carton qty','carton quantity','pcs carton','pieces carton','units carton','case size','package',
    'التعبئة','التغليف','حجم التعبئة','تعبئة الكرتون','عدد بالكرتون','عدد في الكرتون','العبوة'
  ],
  unit:['unit','uom','unit of measure','sales unit','selling unit','measure unit','الوحدة','وحدة','وحدة القياس','وحدة البيع'],
  lastUnitPrice:[
    'price','unit price','selling price','sale price','sales price','sell price','unit selling price','price per unit','price unit','last price','last unit price','wholesale price','customer price','list price','net price','offer price','unit rate','rate',
    'price usd','unit price usd','selling price usd','price sar','unit price sar','selling price sar','price eur','unit price eur','unit euro exw','unit eur exw','unit usd exw','unit sar exw','unit euro fob','unit eur fob','unit usd fob','unit euro cif','unit eur cif','unit usd cif',
    'سعر','السعر','سعر الوحدة','سعر البيع','سعر مبيع','سعر المبيع','سعر الجملة','سعر العرض','السعر بالدولار','سعر بالدولار','السعر بالريال','سعر بالريال','اخر سعر','آخر سعر'
  ],
  lastCurrency:['currency','currency code','sale currency','price currency','selling currency','curr','العملة','رمز العملة','عملة البيع','عملة السعر'],
  lastUnitCost:[
    'cost','unit cost','purchase price','buying price','buy price','purchase cost','buying cost','cost price','unit purchase price','landed cost','last cost','last unit cost',
    'cost usd','unit cost usd','purchase price usd','cost sar','unit cost sar','purchase price sar','cost eur','unit cost eur',
    'التكلفة','تكلفة','تكلفة الوحدة','سعر الشراء','سعر شراء','تكلفة الشراء','تكلفة الصنف','اخر تكلفة','آخر تكلفة'
  ],
  lastCostCurrency:['cost currency','purchase currency','buying currency','cost currency code','عملة التكلفة','عملة الشراء','رمز عملة التكلفة'],
  category:['category','group','product category','item category','type','family','department','classification','التصنيف','الفئة','المجموعة','النوع'],
  tags:['tags','tag','keywords','keyword','labels','وسوم','الوسوم','كلمات مفتاحية','الكلمات المفتاحية'],
  favorite:['favorite','favourite','starred','is favorite','مفضلة','المفضلة','مفضل']
};

function normalizeHeader(value:unknown):string{
  return String(value??'')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/ـ/g,'')
    .replace(/[\u200E\u200F\u202A-\u202E]/g,'')
    .trim()
    .toLowerCase()
    .replace(/[()\[\]{}:;,.\/\\|]+/g,' ')
    .replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const ALIAS_TO_FIELD=new Map<string,ProductImportField>();
(Object.keys(HEADER_ALIASES) as ProductImportField[]).forEach(field=>{
  HEADER_ALIASES[field].forEach(alias=>ALIAS_TO_FIELD.set(normalizeHeader(alias),field));
});

function includesAny(value:string,tokens:string[]):boolean{return tokens.some(token=>value.includes(token));}

function inferHeaderField(value:unknown):ProductImportField|null{
  const normalized=normalizeHeader(value);
  if(!normalized)return null;
  const exact=ALIAS_TO_FIELD.get(normalized);
  if(exact)return exact;

  const compact=normalized.replace(/\s+/g,'');
  if(compact==='sku'||compact==='itemsku'||compact==='productsku')return 'sku';
  if((normalized.includes('hs')&&includesAny(normalized,['code','رمز','كود']))||includesAny(normalized,['customs code','tariff code','harmonized']))return 'hsCode';
  if(includesAny(normalized,['cost currency','purchase currency','buying currency','عملة التكلفة','عملة الشراء']))return 'lastCostCurrency';
  if(includesAny(normalized,['currency','عملة'])&&!includesAny(normalized,['price','سعر','cost','تكلفة']))return 'lastCurrency';
  if(includesAny(normalized,['cost','purchase price','buying price','buy price','تكلفة','سعر الشراء','سعر شراء']))return 'lastUnitCost';
  if(currencyHint(value)&&includesAny(normalized,['unit','price','rate','exw','fob','cif','cfr','dap','ddp','fca','fas']))return 'lastUnitPrice';
  if(includesAny(normalized,['price','rate','سعر'])&&!includesAny(normalized,['purchase','buying','buy price','cost','شراء','تكلفة']))return 'lastUnitPrice';
  if(includesAny(normalized,['origin','made in','coo','منشأ','صنع في']))return 'origin';
  if(includesAny(normalized,['packing','packaging','pack size','case pack','carton','تعبئة','تغليف','كرتون']))return 'packing';
  if(includesAny(normalized,['unit','uom','وحدة']))return 'unit';
  if(includesAny(normalized,['category','classification','group','family','تصنيف','فئة','مجموعة']))return 'category';
  if(includesAny(normalized,['tag','keyword','وسوم','كلمات مفتاحية']))return 'tags';
  if(includesAny(normalized,['favorite','favourite','starred','مفض']))return 'favorite';
  if(includesAny(normalized,['arabic',' ar','عربي','العربي','بالعربية']))return 'descriptionAr';
  if(includesAny(normalized,['english',' en','انجليزي','الانجليزي','بالانجليزية']))return 'descriptionEn';
  if(includesAny(normalized,['product name','item name','description','اسم المنتج','اسم الصنف','الوصف']))return 'descriptionEn';
  return null;
}

function cell(value:unknown):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='boolean')return value?'true':'false';
  return String(value).trim();
}

function delimitedSeparator(source:string):','|';'|'\t'{
  const counts={',':0,';':0,'\t':0};
  let quoted=false;let lines=0;
  for(let index=0;index<source.length&&lines<8;index+=1){
    const char=source[index]!;
    if(char==='"'){
      if(quoted&&source[index+1]==='"'){index+=1;continue;}
      quoted=!quoted;continue;
    }
    if(quoted)continue;
    if(char==='\n'){lines+=1;continue;}
    if(char===','||char===';'||char==='\t')counts[char]+=1;
  }
  if(counts['\t']>counts[',']&&counts['\t']>counts[';'])return '\t';
  if(counts[';']>counts[','])return ';';
  return ',';
}

export function parseCsvMatrix(text:string):string[][]{
  const source=text.replace(/^\uFEFF/,'');
  const separator=delimitedSeparator(source);
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
    if(ch===separator){row.push(value.trim());value='';continue;}
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
    ['SKU','Description EN','Description AR','HS Code','Origin','Packing','Unit','Unit Price','Currency','Unit Cost','Cost Currency','Category','Tags','Favorite'],
    ['RB-250-ORG','Red Bull Original 250ml','ريد بول أصلي 250 مل','220299','Türkiye','24 × 250 ml / Carton','Carton','24.50','USD','18.10','USD','Energy Drinks','250ml, Original','yes']
  ].map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
}

function boolValue(value:string):boolean|undefined{
  if(!value)return undefined;
  const normalized=value.trim().toLowerCase();
  if(['1','true','yes','y','favorite','favourite','نعم','مفضلة'].includes(normalized))return true;
  if(['0','false','no','n','لا'].includes(normalized))return false;
  return undefined;
}

function mappedHeaders(row:unknown[]):Array<ProductImportField|null>{
  return row.map(value=>inferHeaderField(value));
}

function firstHeaderRow(matrix:unknown[][]):number{
  let bestIndex=-1;
  let bestScore=0;
  const scanLimit=Math.min(matrix.length,30);
  for(let index=0;index<scanLimit;index+=1){
    const row=matrix[index]??[];
    if(!row.some(value=>normalizeHeader(value)!==''))continue;
    const score=mappedHeaders(row).filter(Boolean).length;
    if(score>bestScore){bestScore=score;bestIndex=index;}
  }
  if(bestIndex>=0)return bestIndex;
  return matrix.findIndex(row=>row.some(value=>normalizeHeader(value)!==''));
}

function currencyHint(value:unknown):string{
  const raw=String(value??'').normalize('NFKC').toUpperCase();
  if(/\bUSD\b|US\s*DOLLAR|\$/.test(raw)||raw.includes('دولار'))return 'USD';
  if(/\bSAR\b/.test(raw)||raw.includes('ر.س')||raw.includes('ريال'))return 'SAR';
  if(/\bEUR\b|\bEURO\b|€/.test(raw)||raw.includes('يورو'))return 'EUR';
  if(/\bGBP\b|£/.test(raw)||raw.includes('جنيه'))return 'GBP';
  if(/\bAED\b/.test(raw)||raw.includes('درهم'))return 'AED';
  if(/\bTRY\b|TL\b|₺/.test(raw)||raw.includes('ليرة تركية'))return 'TRY';
  return '';
}

export function normalizeImportedDecimal(value:string):string{
  const trimmed=value.trim();
  if(!trimmed)return '';
  const eastern='٠١٢٣٤٥٦٧٨٩';
  const persian='۰۱۲۳۴۵۶۷۸۹';
  const localized=trimmed.normalize('NFKC')
    .replace(/[٠-٩]/g,char=>String(eastern.indexOf(char)))
    .replace(/[۰-۹]/g,char=>String(persian.indexOf(char)))
    .replace(/٫/g,'.')
    .replace(/٬/g,',');
  if(isDecimalInput(localized))return normalizeDecimalInput(localized);

  let numeric=localized
    .replace(/[\u00A0\s]/g,'')
    .replace(/[A-Za-z]{3}/g,'')
    .replace(/[\$€£₺﷼]/g,'')
    .replace(/[^0-9,\.\-+]/g,'');
  if(!numeric)return trimmed;

  const commaCount=(numeric.match(/,/g)||[]).length;
  const dotCount=(numeric.match(/\./g)||[]).length;
  if(commaCount&&dotCount){
    if(numeric.lastIndexOf(',')>numeric.lastIndexOf('.'))numeric=numeric.replace(/\./g,'').replace(/,/g,'.');
    else numeric=numeric.replace(/,/g,'');
  }else if(commaCount){
    if(/^[-+]?\d{1,3}(,\d{3})+$/.test(numeric))numeric=numeric.replace(/,/g,'');
    else if(commaCount===1)numeric=numeric.replace(',','.');
    else{
      const last=numeric.lastIndexOf(',');
      numeric=numeric.slice(0,last).replace(/,/g,'')+'.'+numeric.slice(last+1);
    }
  }else if(dotCount>1){
    if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(numeric))numeric=numeric.replace(/\./g,'');
    else{
      const last=numeric.lastIndexOf('.');
      numeric=numeric.slice(0,last).replace(/\./g,'')+'.'+numeric.slice(last+1);
    }
  }
  return isDecimalInput(numeric)?normalizeDecimalInput(numeric):trimmed;
}

function incomingObject(row:unknown[],headers:Array<ProductImportField|null>,headerRow:unknown[]):Partial<Record<ProductImportField,string>>{
  const result:Partial<Record<ProductImportField,string>>={};
  headers.forEach((field,index)=>{
    if(!field)return;
    const raw=cell(row[index]);
    result[field]=(field==='lastUnitPrice'||field==='lastUnitCost')?normalizeImportedDecimal(raw):raw;
  });
  if(!result.lastCurrency){
    const priceIndex=headers.findIndex(field=>field==='lastUnitPrice');
    if(priceIndex>=0)result.lastCurrency=currencyHint(headerRow[priceIndex]);
  }
  if(!result.lastCostCurrency){
    const costIndex=headers.findIndex(field=>field==='lastUnitCost');
    if(costIndex>=0)result.lastCostCurrency=currencyHint(headerRow[costIndex]);
  }
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
  if(incoming.lastUnitCost?.trim())next.lastUnitCost=normalizeDecimalInput(incoming.lastUnitCost);
  if(incoming.lastCostCurrency?.trim())next.lastCostCurrency=incoming.lastCostCurrency.trim().toUpperCase();
  else if(incoming.lastUnitCost?.trim()&&!next.lastCostCurrency)next.lastCostCurrency=next.lastCurrency;
  if(incoming.tags?.trim())next.tags=Array.from(new Set(parseSavedItemTags(incoming.tags).map(tag=>tag.trim()).filter(Boolean)));
  const favorite=boolValue(incoming.favorite??'');
  if(favorite!==undefined)next.favorite=favorite;
  return next;
}

function createImported(incoming:Partial<Record<ProductImportField,string>>,defaultCurrency:string,now:string):SavedItem{
  const saleCurrency=(incoming.lastCurrency??'').trim().toUpperCase()||defaultCurrency.trim().toUpperCase()||'USD';
  const cost=(incoming.lastUnitCost??'').trim();
  const costCurrency=(incoming.lastCostCurrency??'').trim().toUpperCase()||saleCurrency;
  return {
    id:makeId('product'),createdAt:now,updatedAt:now,
    sku:(incoming.sku??'').trim(),
    descriptionEn:(incoming.descriptionEn??'').trim(),descriptionAr:(incoming.descriptionAr??'').trim(),
    hsCode:(incoming.hsCode??'').trim(),origin:(incoming.origin??'').trim(),packing:(incoming.packing??'').trim(),
    unit:(incoming.unit??'').trim()||'PCS',lastUnitPrice:incoming.lastUnitPrice?.trim()?normalizeDecimalInput(incoming.lastUnitPrice):'',
    lastCurrency:saleCurrency,lastUnitCost:cost?normalizeDecimalInput(cost):'',lastCostCurrency:cost?costCurrency:'',
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
  const headerRow=matrix[headerIndex]??[];
  const headers=mappedHeaders(headerRow);
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
    const incoming=incomingObject(raw,headers,headerRow);
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
    if(incoming.lastUnitCost?.trim()&&(!isDecimalInput(incoming.lastUnitCost)||decimalToScaled(incoming.lastUnitCost,12)<0n)){
      rows.push({rowNumber,action:'error',reason:'Unit cost is not a valid non-negative number.',item:null,matchedId:''});
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
