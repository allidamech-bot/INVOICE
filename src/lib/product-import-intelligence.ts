import type { ProductImportField } from './product-import.js';

export type ProductImportConfidence='high'|'medium'|'low'|'unmapped';
export type ProductImportMappingReason='exact'|'header'|'samples'|'conflict'|'unmapped';

export interface ProductImportColumnSuggestion {
  index:number;
  header:string;
  field:ProductImportField|null;
  confidence:ProductImportConfidence;
  reason:ProductImportMappingReason;
  samples:string[];
}

export interface ProductImportAnalysis {
  headerIndex:number;
  columnCount:number;
  columns:ProductImportColumnSuggestion[];
  recognizedFields:ProductImportField[];
  needsReview:boolean;
}

export type ProductImportColumnMap=Array<ProductImportField|null>;

const CANONICAL_HEADERS:Record<ProductImportField,string>={
  sku:'SKU',
  descriptionEn:'Description EN',
  descriptionAr:'Description AR',
  hsCode:'HS Code',
  origin:'Origin',
  packing:'Packing',
  unit:'Unit',
  lastUnitPrice:'Unit Price',
  lastCurrency:'Currency',
  lastUnitCost:'Unit Cost',
  lastCostCurrency:'Cost Currency',
  category:'Category',
  tags:'Tags',
  favorite:'Favorite'
};

const EXACT_ALIASES:Partial<Record<ProductImportField,string[]>>={
  sku:['sku','item sku','product sku','item code','product code','code','reference','ref','article no','article number','item no','item number','artikelnummer','artikel nr','stok kodu','stock code','артикул','كود الصنف','رمز الصنف','كود المنتج','رقم الصنف'],
  descriptionEn:['description en','description english','english description','product name','item name','name','description','product','item','nombre','nom','bezeichnung','artikel','urun adi','ürün adı','название','наименование'],
  descriptionAr:['description ar','description arabic','arabic description','product name ar','item name ar','name ar','arabic name','اسم المنتج','اسم الصنف','الوصف','الوصف العربي','الاسم العربي'],
  hsCode:['hs code','hscode','hs','customs code','tariff code','harmonized code','commodity code','رمز جمركي','الرمز الجمركي','كود hs','رمز hs'],
  origin:['origin','country of origin','origin country','made in','coo','origine','origen','ursprung','mensei','menşei','происхождение','المنشأ','بلد المنشأ','دولة المنشأ'],
  packing:['packing','packaging','pack','pack size','packing size','case pack','carton pack','carton qty','carton quantity','case size','package','emballage','empaque','verpackung','ambalaj','упаковка','التعبئة','التغليف','حجم التعبئة','عدد في الكرتون'],
  unit:['unit','uom','unit of measure','sales unit','selling unit','measure unit','unite','unidad','einheit','birim','единица','الوحدة','وحدة','وحدة القياس'],
  lastUnitPrice:['price','unit price','selling price','sale price','sales price','sell price','price per unit','last price','wholesale price','list price','net price','offer price','unit rate','rate','prix','precio','preis','fiyat','цена','سعر','السعر','سعر الوحدة','سعر البيع','سعر المبيع','سعر الجملة','سعر العرض'],
  lastCurrency:['currency','currency code','sale currency','price currency','selling currency','curr','devise','moneda','wahrung','währung','doviz','döviz','валюта','العملة','رمز العملة','عملة البيع','عملة السعر'],
  lastUnitCost:['cost','unit cost','purchase price','buying price','buy price','purchase cost','buying cost','cost price','unit purchase price','landed cost','last cost','supplier price','vendor price','supplier cost','vendor cost','kosten','maliyet','себестоимость','التكلفة','تكلفة','تكلفة الوحدة','سعر الشراء','تكلفة الشراء'],
  lastCostCurrency:['cost currency','purchase currency','buying currency','supplier currency','vendor currency','cost currency code','عملة التكلفة','عملة الشراء','رمز عملة التكلفة'],
  category:['category','group','product category','item category','type','family','department','classification','categorie','categoria','kategorie','kategori','категория','التصنيف','الفئة','المجموعة','النوع'],
  tags:['tags','tag','keywords','keyword','labels','mots cles','palabras clave','etiket','теги','وسوم','الوسوم','كلمات مفتاحية'],
  favorite:['favorite','favourite','starred','is favorite','favori','favorito','favorit','избранное','مفضلة','المفضلة','مفضل']
};

function normalize(value:unknown):string{
  return String(value??'')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
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

function cell(value:unknown):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  return String(value).trim();
}

function hasAny(value:string,tokens:string[]):boolean{return tokens.some(token=>value.includes(token));}

const COST_WORDS=['cost','purchase','buying','buy price','supplier','vendor','kosten','maliyet','себестоимость','تكلفة','شراء','مورد'];
const PRICE_WORDS=['price','rate','prix','precio','preis','fiyat','цена','سعر'];
const SALE_WORDS=['sale','sales','selling','sell ','retail','wholesale','list price','offer price','customer','بيع','مبيع','جملة','عرض'];
const TRADE_WORDS=['exw','fob','cif','cfr','dap','ddp','fca','fas'];
const CURRENCY_WORDS=['currency','devise','moneda','wahrung','doviz','валюта','عملة'];

function currencyHint(value:unknown):string{
  const raw=String(value??'').normalize('NFKC').toUpperCase();
  if(/\bUSD\b|US\s*DOLLAR|\$/.test(raw)||raw.includes('دولار'))return 'USD';
  if(/\bSAR\b/.test(raw)||raw.includes('ر.س')||raw.includes('ريال'))return 'SAR';
  if(/\bEUR\b|\bEURO\b|€/.test(raw)||raw.includes('يورو'))return 'EUR';
  if(/\bGBP\b|£/.test(raw)||raw.includes('جنيه'))return 'GBP';
  if(/\bAED\b/.test(raw)||raw.includes('درهم'))return 'AED';
  if(/\bTRY\b|\bTL\b|₺/.test(raw)||raw.includes('ليرة تركية'))return 'TRY';
  return '';
}

function exactField(header:string):ProductImportField|null{
  for(const [field,aliases] of Object.entries(EXACT_ALIASES) as Array<[ProductImportField,string[]|undefined]>){
    if(aliases?.some(alias=>normalize(alias)===header))return field;
  }
  return null;
}

interface RawSuggestion {field:ProductImportField|null;confidence:ProductImportConfidence;reason:ProductImportMappingReason;score:number;}

function suggestFromHeader(value:unknown):RawSuggestion{
  const header=normalize(value);
  if(!header)return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
  const exact=exactField(header);
  if(exact)return {field:exact,confidence:'high',reason:'exact',score:100};

  const isCost=hasAny(header,COST_WORDS);
  const isTrade=hasAny(header,TRADE_WORDS);
  const isExplicitSale=hasAny(header,SALE_WORDS);
  const isPrice=hasAny(header,PRICE_WORDS);
  const headerCurrency=currencyHint(value);

  if(hasAny(header,['cost currency','purchase currency','buying currency','supplier currency','vendor currency','عملة التكلفة','عملة الشراء']))return {field:'lastCostCurrency',confidence:'high',reason:'header',score:94};
  if((hasAny(header,CURRENCY_WORDS)||header==='curr')&&isCost)return {field:'lastCostCurrency',confidence:'high',reason:'header',score:92};
  if((hasAny(header,CURRENCY_WORDS)||header==='curr')&&!isCost&&!isPrice&&!isTrade)return {field:'lastCurrency',confidence:'medium',reason:'header',score:78};
  if((header.includes('hs')&&hasAny(header,['code','رمز','كود']))||hasAny(header,['customs code','tariff','harmonized','commodity code','جمرك']))return {field:'hsCode',confidence:'high',reason:'header',score:92};
  if(hasAny(header,['sku','item code','product code','article','artikel','reference','stock code','stok kodu','артикул','كود الصنف','رمز الصنف','رقم الصنف']))return {field:'sku',confidence:'high',reason:'header',score:91};
  if(isCost)return {field:'lastUnitCost',confidence:'high',reason:'header',score:93};
  if(isTrade&&!isExplicitSale&&(Boolean(headerCurrency)||isPrice||hasAny(header,['value','amount'])))return {field:'lastUnitCost',confidence:headerCurrency?'high':'medium',reason:'header',score:headerCurrency?89:81};
  if(isTrade&&!isExplicitSale)return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
  if(isExplicitSale&&(isPrice||headerCurrency||header.includes('unit')))return {field:'lastUnitPrice',confidence:'high',reason:'header',score:92};
  if(isPrice)return {field:'lastUnitPrice',confidence:headerCurrency?'high':'medium',reason:'header',score:headerCurrency?90:84};
  if(hasAny(header,['origin','made in','coo','origine','origen','ursprung','mensei','menşei','происхожд','منشأ','صنع في']))return {field:'origin',confidence:'high',reason:'header',score:90};
  if(hasAny(header,['packing','packaging','pack size','case pack','carton','emballage','empaque','verpackung','ambalaj','упаков','تعبئة','تغليف','كرتون']))return {field:'packing',confidence:'high',reason:'header',score:90};
  if(hasAny(header,['unit','uom','unite','unidad','einheit','birim','единиц','وحدة']))return {field:'unit',confidence:'medium',reason:'header',score:76};
  if(hasAny(header,['category','classification','group','family','categorie','categoria','kategorie','kategori','категор','تصنيف','فئة','مجموعة']))return {field:'category',confidence:'medium',reason:'header',score:76};
  if(hasAny(header,['tag','keyword','label','mots cles','palabras clave','etiket','теги','وسوم','كلمات مفتاحية']))return {field:'tags',confidence:'medium',reason:'header',score:76};
  if(hasAny(header,['favorite','favourite','starred','favori','favorito','favorit','избран','مفض']))return {field:'favorite',confidence:'medium',reason:'header',score:76};
  if(hasAny(header,['arabic',' ar','عربي','العربي','بالعربية']))return {field:'descriptionAr',confidence:'high',reason:'header',score:88};
  if(hasAny(header,['english',' en','انجليزي','الانجليزي','بالانجليزية']))return {field:'descriptionEn',confidence:'high',reason:'header',score:88};
  if(hasAny(header,['name','description','product','item','nombre','nom','bezeichnung','artikel','urun','ürün','назван','наимен','اسم المنتج','اسم الصنف','الوصف']))return {field:/[\u0600-\u06FF]/.test(header)?'descriptionAr':'descriptionEn',confidence:'medium',reason:'header',score:74};
  return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
}

function asciiNumeric(value:string):string{
  const eastern='٠١٢٣٤٥٦٧٨٩';
  const persian='۰۱۲۳۴۵۶۷۸۹';
  return value.normalize('NFKC')
    .replace(/[٠-٩]/g,char=>String(eastern.indexOf(char)))
    .replace(/[۰-۹]/g,char=>String(persian.indexOf(char)))
    .replace(/٫/g,'.')
    .replace(/٬/g,',');
}

function looksNumeric(value:string):boolean{
  const stripped=asciiNumeric(value).replace(/[\s\u00A0]/g,'').replace(/[A-Za-z]{3}/g,'').replace(/[\$€£₺﷼]/g,'').replace(/,/g,'');
  return /^[-+]?\d+(?:\.\d+)?$/.test(stripped);
}

function sampleSuggestion(headerValue:unknown,samples:string[]):RawSuggestion{
  if(!samples.length)return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
  const header=normalize(headerValue);
  const ratio=(predicate:(value:string)=>boolean)=>samples.filter(predicate).length/samples.length;
  const currencyCodeRatio=ratio(value=>/^(USD|EUR|SAR|GBP|AED|TRY)$/i.test(value.trim()));
  const boolRatio=ratio(value=>/^(1|0|true|false|yes|no|y|n|نعم|لا)$/i.test(value.trim()));
  const unitRatio=ratio(value=>/^(pcs?|piece|pieces|unit|units|carton|ctn|box|pallet|kg|g|gram|grams|ml|l|liter|litre|set|ea|each|قطعة|كرتون|صندوق|كغ|كيلو)$/i.test(normalize(value)));
  const packingRatio=ratio(value=>/\d+\s*(?:x|×|pcs?|pieces?|ctn|cartons?|boxes?|packs?|kg|g|ml|l)\b/i.test(asciiNumeric(value)));
  const numericRatio=ratio(looksNumeric);
  const currencyNumberRatio=ratio(value=>Boolean(currencyHint(value))&&looksNumeric(value));
  const isCost=hasAny(header,COST_WORDS);
  const isTrade=hasAny(header,TRADE_WORDS);
  const isExplicitSale=hasAny(header,SALE_WORDS);

  if(currencyCodeRatio>=.75)return {field:isCost?'lastCostCurrency':'lastCurrency',confidence:'medium',reason:'samples',score:68};
  if(boolRatio>=.8)return {field:'favorite',confidence:'low',reason:'samples',score:54};
  if(unitRatio>=.7)return {field:'unit',confidence:'medium',reason:'samples',score:64};
  if(packingRatio>=.65)return {field:'packing',confidence:'low',reason:'samples',score:57};
  if(isTrade&&!isExplicitSale&&(currencyNumberRatio>=.6||numericRatio>=.8))return {field:'lastUnitCost',confidence:'medium',reason:'samples',score:67};
  if(isTrade&&!isCost&&!isExplicitSale)return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
  if(currencyNumberRatio>=.6)return {field:isCost?'lastUnitCost':'lastUnitPrice',confidence:'medium',reason:'samples',score:66};
  if(numericRatio>=.8&&isCost)return {field:'lastUnitCost',confidence:'medium',reason:'samples',score:62};
  if(numericRatio>=.8&&hasAny(header,['value','amount',...PRICE_WORDS]))return {field:'lastUnitPrice',confidence:'low',reason:'samples',score:58};
  return {field:null,confidence:'unmapped',reason:'unmapped',score:0};
}

function activeSamples(matrix:unknown[][],headerIndex:number,columnIndex:number):string[]{
  const samples:string[]=[];
  for(let rowIndex=headerIndex+1;rowIndex<matrix.length&&samples.length<5;rowIndex+=1){
    const value=cell(matrix[rowIndex]?.[columnIndex]);
    if(value)samples.push(value);
  }
  return samples;
}

function recognizedFieldCount(row:unknown[]):number{
  const fields=row
    .map(value=>cell(value))
    .filter(Boolean)
    .map(value=>suggestFromHeader(value).field)
    .filter((field):field is ProductImportField=>Boolean(field));
  return new Set(fields).size;
}

function headerRowScore(matrix:unknown[][],rowIndex:number):number{
  const row=matrix[rowIndex]??[];
  const values=row.map(cell).filter(Boolean);
  if(!values.length)return -1;

  const suggestions=values
    .map(value=>suggestFromHeader(value).field)
    .filter((field):field is ProductImportField=>Boolean(field));
  const recognized=suggestions.length;
  const distinctRecognized=new Set(suggestions).size;
  const textish=values.filter(value=>!looksNumeric(value)).length;
  const nextRows=matrix.slice(rowIndex+1,rowIndex+4);
  const nextWidths=nextRows.map(next=>next.filter(value=>cell(value)!=='').length);
  const maxNextWidth=Math.max(...nextWidths,0);
  const maxNextRecognized=Math.max(...nextRows.map(recognizedFieldCount),0);
  const continuity=nextWidths.filter(width=>width>=Math.min(2,Math.max(1,values.length))).length;
  const density=recognized/values.length;
  const narrowTitlePenalty=values.length===1&&maxNextWidth>=2&&maxNextRecognized>=2?40:0;

  return distinctRecognized*14+recognized*5+Math.min(values.length,12)*1.7+density*4+(textish===values.length?2:0)+continuity*1.5-narrowTitlePenalty;
}

function detectHeaderRow(matrix:unknown[][]):number{
  let bestIndex=-1;
  let bestScore=-1;
  const limit=Math.min(matrix.length,30);
  for(let index=0;index<limit;index+=1){
    const score=headerRowScore(matrix,index);
    if(score>bestScore){bestScore=score;bestIndex=index;}
  }
  return bestIndex;
}

export function analyzeProductImport(matrix:unknown[][]):ProductImportAnalysis{
  const headerIndex=detectHeaderRow(matrix);
  if(headerIndex<0)return {headerIndex:-1,columnCount:0,columns:[],recognizedFields:[],needsReview:true};
  const headerRow=matrix[headerIndex]??[];
  const sampleRows=matrix.slice(headerIndex+1,Math.min(matrix.length,headerIndex+21));
  const columnCount=Math.max(headerRow.length,...sampleRows.map(row=>row.length),0);
  const candidates:Array<ProductImportColumnSuggestion&{score:number;coverage:number}>=[];

  for(let index=0;index<columnCount;index+=1){
    const header=cell(headerRow[index]);
    const samples=activeSamples(matrix,headerIndex,index);
    if(!header&&!samples.length)continue;
    const headerSuggestion=suggestFromHeader(header);
    const sampleBased=sampleSuggestion(header,samples);
    const selected=headerSuggestion.field?headerSuggestion:sampleBased;
    candidates.push({
      index,
      header:header||`Column ${index+1}`,
      field:selected.field,
      confidence:selected.confidence,
      reason:selected.reason,
      samples,
      score:selected.score,
      coverage:samples.length
    });
  }

  const winners=new Map<ProductImportField,number>();
  candidates.forEach((candidate,candidateIndex)=>{
    if(!candidate.field)return;
    const existingIndex=winners.get(candidate.field);
    if(existingIndex===undefined){winners.set(candidate.field,candidateIndex);return;}
    const existing=candidates[existingIndex]!;
    const existingStrength=existing.score+existing.coverage*3;
    const candidateStrength=candidate.score+candidate.coverage*3;
    if(candidateStrength>existingStrength){
      existing.field=null;existing.confidence='unmapped';existing.reason='conflict';
      winners.set(candidate.field,candidateIndex);
    }else{
      candidate.field=null;candidate.confidence='unmapped';candidate.reason='conflict';
    }
  });

  const columns:ProductImportColumnSuggestion[]=candidates.map(({score:_score,coverage:_coverage,...candidate})=>candidate);
  const recognizedFields=Array.from(new Set(columns.map(column=>column.field).filter((field):field is ProductImportField=>Boolean(field))));
  const needsReview=columns.some(column=>column.confidence==='low'||column.confidence==='unmapped');
  return {headerIndex,columnCount,columns,recognizedFields,needsReview};
}

export function suggestedProductImportMap(analysis:ProductImportAnalysis):ProductImportColumnMap{
  const mapping=Array.from({length:analysis.columnCount},()=>null as ProductImportField|null);
  analysis.columns.forEach(column=>{mapping[column.index]=column.field;});
  return mapping;
}

export function applyProductImportMapping(matrix:unknown[][],analysis:ProductImportAnalysis,mapping:ProductImportColumnMap):unknown[][]{
  if(analysis.headerIndex<0)throw new Error('No spreadsheet header row could be detected.');
  const selected=mapping.filter((field):field is ProductImportField=>Boolean(field));
  const unique=new Set(selected);
  if(unique.size!==selected.length)throw new Error('Each LOUREX field can only be mapped to one source column.');
  if(!selected.length)throw new Error('Map at least one product field before continuing.');

  const output=matrix.map(row=>Array.from(row));
  const originalHeader=matrix[analysis.headerIndex]??[];
  const header=Array.from(output[analysis.headerIndex]??[]);
  while(header.length<analysis.columnCount)header.push('');
  for(let index=0;index<analysis.columnCount;index+=1){
    const field=mapping[index]??null;
    if(!field){header[index]=`Ignored column ${index+1}`;continue;}
    const currency=currencyHint(originalHeader[index]);
    if(field==='lastUnitPrice'&&currency)header[index]=`Unit Price ${currency}`;
    else if(field==='lastUnitCost'&&currency)header[index]=`Unit Cost ${currency}`;
    else header[index]=CANONICAL_HEADERS[field];
  }
  output[analysis.headerIndex]=header;
  return output;
}
