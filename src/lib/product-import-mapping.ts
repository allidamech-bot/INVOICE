import type { ProductImportField } from './product-import.js';

export type ProductImportMapping=Record<number,ProductImportField|null>;

export interface ProductImportColumnInspection{
  index:number;
  header:string;
  samples:string[];
  detected:ProductImportField|null;
}

export interface ProductImportInspection{
  headerIndex:number;
  columns:ProductImportColumnInspection[];
}

export const PRODUCT_IMPORT_FIELD_ORDER:ProductImportField[]=[
  'descriptionEn','descriptionAr','sku','lastUnitPrice','lastCurrency','lastUnitCost','lastCostCurrency','packing','unit','origin','hsCode','category','tags','favorite'
];

const CANONICAL_HEADER:Record<ProductImportField,string>={
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

const INCOTERMS=['exw','fob','cif','cfr','dap','ddp','fca','fas'];
const COST_WORDS=['purchase price','buying price','buy price','purchase cost','buying cost','cost price','unit cost','landed cost','cost','تكلفة الوحدة','سعر الشراء','تكلفة الشراء','التكلفة','تكلفة'];
const SALE_WORDS=['selling price','sale price','sales price','sell price','wholesale price','customer price','list price','net price','offer price','سعر البيع','سعر المبيع','سعر الجملة','سعر العرض'];

function text(value:unknown):string{return String(value??'').normalize('NFKC').trim();}
function normalized(value:unknown):string{
  return text(value)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/ـ/g,'')
    .replace(/[\u200E\u200F\u202A-\u202E]/g,'')
    .toLocaleLowerCase()
    .replace(/[()\[\]{}:;,.\/\\|]+/g,' ')
    .replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function hasAny(value:string,tokens:string[]):boolean{return tokens.some(token=>value.includes(token));}

function currencyHint(value:unknown):string{
  const raw=text(value).toUpperCase();
  if(/\bUSD\b|US\s*DOLLAR|\$/.test(raw)||raw.includes('دولار'))return 'USD';
  if(/\bSAR\b/.test(raw)||raw.includes('ر.س')||raw.includes('ريال'))return 'SAR';
  if(/\bEUR\b|\bEURO\b|€/.test(raw)||raw.includes('يورو'))return 'EUR';
  if(/\bGBP\b|£/.test(raw)||raw.includes('جنيه'))return 'GBP';
  if(/\bAED\b/.test(raw)||raw.includes('درهم'))return 'AED';
  if(/\bTRY\b|\bTL\b|₺/.test(raw)||raw.includes('ليرة تركية'))return 'TRY';
  return '';
}

function detectField(value:unknown):ProductImportField|null{
  const n=normalized(value);
  if(!n)return null;
  const compact=n.replace(/\s+/g,'');

  if(['sku','itemsku','productsku','itemcode','productcode','articleno','articlenumber','article','reference','ref'].includes(compact)||hasAny(n,['كود الصنف','رمز الصنف','رقم الصنف']))return 'sku';
  if((n.includes('hs')&&hasAny(n,['code','كود','رمز']))||hasAny(n,['customs code','tariff code','harmonized code','الرمز الجمركي']))return 'hsCode';
  if(hasAny(n,['cost currency','purchase currency','buying currency','عملة التكلفة','عملة الشراء']))return 'lastCostCurrency';
  if(hasAny(n,['sale currency','price currency','currency code','currency','عملة'])&&!hasAny(n,['cost','purchase','buying','تكلفة','شراء']))return 'lastCurrency';

  // Accounting safety: purchase/cost semantics always win before generic "price" matching.
  if(hasAny(n,COST_WORDS))return 'lastUnitCost';
  if(hasAny(n,SALE_WORDS))return 'lastUnitPrice';

  // Incoterm-only monetary headings (for example "Unit EURO EXW") are intentionally
  // left for user review. They usually describe supplier/commercial basis, not whether
  // LOUREX should store the value as a sale price or a purchase cost.
  const hasIncoterm=hasAny(n,INCOTERMS);
  const looksMonetary=Boolean(currencyHint(value))||hasAny(n,['price','rate','unit price','سعر','السعر']);
  if(hasIncoterm&&looksMonetary)return null;

  if(hasAny(n,['unit price','price per unit','price unit','price','unit rate','rate','سعر الوحدة','السعر','سعر']))return 'lastUnitPrice';
  if(hasAny(n,['country of origin','origin country','made in','origin','coo','بلد المنشأ','دولة المنشأ','المنشأ','صنع في']))return 'origin';
  if(hasAny(n,['pack size','case pack','case qty','case quantity','carton pack','carton qty','carton quantity','packing','packaging','package','تعبئة','تغليف','عدد بالكرتون']))return 'packing';
  if(hasAny(n,['uom','unit of measure','sales unit','selling unit','measure unit','الوحدة','وحدة القياس']))return 'unit';
  if(hasAny(n,['product category','item category','classification','category','family','group','التصنيف','الفئة','المجموعة']))return 'category';
  if(hasAny(n,['keyword','keywords','tags','tag','وسوم','كلمات مفتاحية']))return 'tags';
  if(hasAny(n,['favorite','favourite','starred','مفض']))return 'favorite';
  if(hasAny(n,['description arabic','arabic description','product name ar','item name ar','name ar','arabic name','اسم المنتج عربي','اسم الصنف عربي','الوصف العربي','الاسم العربي']))return 'descriptionAr';
  if(hasAny(n,['description english','english description','product name en','item name en','name en','english name','product name','item name','item title','product title','description','product','name','اسم المنتج انجليزي','اسم الصنف انجليزي','الوصف الانجليزي','الاسم الانجليزي']))return 'descriptionEn';
  if(hasAny(n,['اسم المنتج','اسم الصنف']))return 'descriptionAr';
  return null;
}

function rowScore(row:unknown[]):number{
  const detected=row.map(detectField).filter(Boolean).length;
  const nonEmpty=row.filter(value=>text(value)!=='').length;
  return detected*100+Math.min(nonEmpty,20);
}

export function inspectProductImportMatrix(matrix:unknown[][]):ProductImportInspection{
  if(!matrix.length)return {headerIndex:-1,columns:[]};
  let headerIndex=-1;
  let bestScore=-1;
  const limit=Math.min(matrix.length,30);
  for(let index=0;index<limit;index+=1){
    const row=matrix[index]??[];
    if(!row.some(value=>text(value)!==''))continue;
    const score=rowScore(row);
    if(score>bestScore){bestScore=score;headerIndex=index;}
  }
  if(headerIndex<0)return {headerIndex:-1,columns:[]};

  const header=matrix[headerIndex]??[];
  const dataRows=matrix.slice(headerIndex+1,headerIndex+7);
  const width=Math.max(header.length,...dataRows.map(row=>row.length));
  const columns:ProductImportColumnInspection[]=[];
  for(let index=0;index<width;index+=1){
    const headerText=text(header[index]);
    const samples=dataRows.map(row=>text(row[index])).filter(Boolean).slice(0,3);
    if(!headerText&&!samples.length)continue;
    columns.push({index,header:headerText||`Column ${index+1}`,samples,detected:detectField(header[index])});
  }
  return {headerIndex,columns};
}

export function initialProductImportMapping(inspection:ProductImportInspection):ProductImportMapping{
  const mapping:ProductImportMapping={};
  const used=new Set<ProductImportField>();
  inspection.columns.forEach(column=>{
    const field=column.detected;
    if(field&&!used.has(field)){mapping[column.index]=field;used.add(field);}
    else mapping[column.index]=null;
  });
  return mapping;
}

function mappedHeader(field:ProductImportField,column:ProductImportColumnInspection):string{
  const base=CANONICAL_HEADER[field];
  if(field!=='lastUnitPrice'&&field!=='lastUnitCost')return base;
  const hints=[currencyHint(column.header),...column.samples.map(currencyHint)].filter(Boolean);
  const unique=Array.from(new Set(hints));
  return unique.length===1?`${base} ${unique[0]}`:base;
}

export function applyProductImportMapping(matrix:unknown[][],inspection:ProductImportInspection,mapping:ProductImportMapping):unknown[][]{
  if(inspection.headerIndex<0)return matrix.map(row=>[...row]);
  const result=matrix.map(row=>[...row]);
  const header=[...(result[inspection.headerIndex]??[])];
  inspection.columns.forEach(column=>{
    const field=mapping[column.index]??null;
    header[column.index]=field?mappedHeader(field,column):`__IGNORE_${column.index}__`;
  });
  result[inspection.headerIndex]=header;
  return result;
}
