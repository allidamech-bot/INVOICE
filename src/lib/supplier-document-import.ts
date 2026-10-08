import { normalizeImportedDecimal } from './product-import.js';

export interface SupplierImportItem {
  sku:string;
  descriptionEn:string;
  descriptionAr:string;
  quantity:string;
  unit:string;
  unitCost:string;
}

export interface SupplierImportDraft {
  supplierName:string;
  supplierTaxId:string;
  documentNumber:string;
  date:string;
  currency:string;
  freight:string;
  duty:string;
  otherCosts:string;
  paymentTerms:string;
  notes:string;
  items:SupplierImportItem[];
  sourceSheets?:Array<{name:string;itemCount:number}>;
  skippedSheets?:string[];
}

type SupplierColumn='sku'|'descriptionEn'|'descriptionAr'|'quantity'|'unit'|'unitCost'|'currency';

const ALIASES:Record<SupplierColumn,string[]>={
  sku:['sku','item code','product code','code','reference','ref','كود الصنف','رمز الصنف','كود المنتج','رقم الصنف'],
  descriptionEn:['product name','item name','description','description en','english description','name','product','item','اسم المنتج انجليزي','اسم الصنف انجليزي'],
  descriptionAr:['description ar','arabic description','arabic name','اسم المنتج','اسم الصنف','الوصف','الوصف العربي','الاسم العربي'],
  quantity:['quantity','qty','order qty','ordered quantity','pieces','units','الكمية','كمية','العدد','عدد'],
  unit:['unit','uom','unit of measure','measure','الوحدة','وحدة','وحدة القياس'],
  unitCost:['unit cost','purchase price','buy price','buying price','supplier price','vendor price','cost','price','unit price','rate','سعر الشراء','تكلفة الوحدة','التكلفة','سعر المورد','السعر'],
  currency:['currency','curr','currency code','العملة','رمز العملة']
};

function clean(value:unknown):string{
  if(value===null||value===undefined)return '';
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  return String(value).normalize('NFKC').trim();
}

function normalized(value:unknown):string{
  return clean(value)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/ـ/g,'')
    .replace(/[\u200E\u200F\u202A-\u202E]/g,'')
    .toLowerCase()
    .replace(/[()\[\]{}:;,.\/\\|]+/g,' ')
    .replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const ALIAS_MAP=new Map<string,SupplierColumn>();
(Object.keys(ALIASES) as SupplierColumn[]).forEach(field=>ALIASES[field].forEach(alias=>ALIAS_MAP.set(normalized(alias),field)));

function headerField(value:unknown):SupplierColumn|null{
  const text=normalized(value);
  if(!text)return null;
  const exact=ALIAS_MAP.get(text);if(exact)return exact;
  if((text.includes('sku')||text.includes('item code')||text.includes('product code')||text.includes('كود')||text.includes('رمز'))&&!text.includes('currency'))return 'sku';
  if(text.includes('currency')||text.includes('عملة'))return 'currency';
  if(text.includes('quantity')||text==='qty'||text.includes('كمية')||text==='العدد')return 'quantity';
  if(text.includes('unit')||text.includes('uom')||text.includes('وحدة')){
    if(text.includes('cost')||text.includes('price')||text.includes('تكلفة')||text.includes('سعر'))return 'unitCost';
    return 'unit';
  }
  if(text.includes('cost')||text.includes('purchase')||text.includes('supplier price')||text.includes('vendor price')||text.includes('price')||text.includes('تكلفة')||text.includes('سعر'))return 'unitCost';
  if(text.includes('arabic')||text.includes('عربي'))return 'descriptionAr';
  if(text.includes('name')||text.includes('description')||text.includes('product')||text.includes('item')||text.includes('اسم')||text.includes('وصف'))return /[\u0600-\u06FF]/.test(text)?'descriptionAr':'descriptionEn';
  return null;
}

function headerIndex(matrix:unknown[][]):number{
  let winner=-1;let score=-1;
  for(let rowIndex=0;rowIndex<Math.min(30,matrix.length);rowIndex+=1){
    const fields=(matrix[rowIndex]??[]).map(headerField).filter((field):field is SupplierColumn=>Boolean(field));
    const distinct=new Set(fields);
    const required=Number(distinct.has('quantity'))+Number(distinct.has('unitCost'))+Number(distinct.has('descriptionEn')||distinct.has('descriptionAr')||distinct.has('sku'));
    const current=distinct.size*5+required*12;
    if(current>score){winner=rowIndex;score=current;}
  }
  return score>=42?winner:-1;
}

function mappedColumns(row:unknown[]):Array<SupplierColumn|null>{
  const result=row.map(headerField);
  const seen=new Set<SupplierColumn>();
  return result.map(field=>{if(!field||seen.has(field))return null;seen.add(field);return field;});
}

function safeDecimal(value:unknown):string{
  const decimal=normalizeImportedDecimal(clean(value));
  return /^\d+(?:\.\d+)?$/.test(decimal)?decimal:'';
}

function currencyHint(value:unknown):string{
  const text=clean(value).toUpperCase();
  const code=text.match(/\b(USD|EUR|SAR|TRY|AED|GBP)\b/)?.[1];
  if(code)return code;
  if(text.includes('$')||text.includes('دولار'))return 'USD';
  if(text.includes('€')||text.includes('يورو'))return 'EUR';
  if(text.includes('ر.س')||text.includes('ريال'))return 'SAR';
  if(text.includes('₺')||text.includes('ليرة تركية'))return 'TRY';
  return '';
}

function metadata(matrix:unknown[][],aliases:string[]):string{
  const wanted=aliases.map(normalized);
  for(const row of matrix.slice(0,35)){
    for(let index=0;index<row.length;index+=1){
      const raw=clean(row[index]);const key=normalized(raw);
      if(wanted.includes(key)){
        const adjacent=clean(row[index+1]);if(adjacent)return adjacent;
      }
      for(const alias of wanted){
        if(key.startsWith(`${alias} `))return raw.slice(raw.toLowerCase().indexOf(alias)+alias.length).replace(/^\s*[:#-]?\s*/,'').trim();
      }
    }
  }
  return '';
}

function isoDate(value:string):string{
  const text=value.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;
  const match=text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if(!match)return '';
  const day=Number(match[1]),month=Number(match[2]);
  if(day<1||day>31||month<1||month>12)return '';
  return `${match[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function extractSupplierDraftLocally(matrix:unknown[][]):SupplierImportDraft|null{
  const head=headerIndex(matrix);if(head<0)return null;
  const columns=mappedColumns(matrix[head]??[]);
  const hasIdentity=columns.includes('sku')||columns.includes('descriptionEn')||columns.includes('descriptionAr');
  if(!hasIdentity||!columns.includes('quantity')||!columns.includes('unitCost'))return null;
  const currencyColumn=columns.indexOf('currency');
  const headerCurrency=(matrix[head]??[]).map(currencyHint).find(Boolean)||'';
  const explicitCurrency=currencyHint(metadata(matrix,['currency','invoice currency','عملة','العملة']));
  if(explicitCurrency&&headerCurrency&&explicitCurrency!==headerCurrency)throw new Error(`Supplier import: document currency ${explicitCurrency} conflicts with table header ${headerCurrency}.`);
  const items:SupplierImportItem[]=[];
  let detectedCurrency=explicitCurrency||headerCurrency;
  for(let index=head+1;index<matrix.length;index+=1){
    const row=matrix[index]??[];
    if(!row.some(value=>clean(value)))continue;
    // A repeated table heading is not a product line.
    const fields=new Set(row.map(headerField).filter(Boolean));
    if(fields.has('quantity')&&fields.has('unitCost')&&(fields.has('sku')||fields.has('descriptionEn')||fields.has('descriptionAr')))continue;
    const data:Partial<Record<SupplierColumn,string>>={};
    columns.forEach((field,column)=>{if(field)data[field]=clean(row[column]);});
    const sku=(data.sku??'').trim(),descriptionEn=(data.descriptionEn??'').trim(),descriptionAr=(data.descriptionAr??'').trim();
    const identity=[sku,descriptionEn,descriptionAr].map(normalized).filter(Boolean);
    // Recognized invoice summary lines are not supplier items.
    if(!sku&&identity.length>0&&identity.every(value=>/^(?:subtotal|grand total|total|vat|tax|freight|shipping|discount|الإجمالي|اجمالي|المجموع|الضريبة|الشحن)$/.test(value)))continue;
    const quantity=safeDecimal(data.quantity),unitCost=safeDecimal(data.unitCost);
    if(!quantity||!unitCost||(!sku&&!descriptionEn&&!descriptionAr))throw new Error(`Supplier import: row ${index+1} is incomplete (SKU/name, quantity and unit cost are required). Nothing was imported.`);
    const columnCurrency=clean(data.currency);
    const rowCurrency=currencyHint(columnCurrency)||currencyHint(data.unitCost);
    if(columnCurrency&&!currencyHint(columnCurrency))throw new Error(`Supplier import: row ${index+1} has an unrecognized currency: ${columnCurrency.slice(0,32)}.`);
    if(rowCurrency&&detectedCurrency&&rowCurrency!==detectedCurrency)throw new Error(`Supplier import: mixed currencies at row ${index+1} (${detectedCurrency} / ${rowCurrency}). Separate by currency before saving.`);
    if(rowCurrency)detectedCurrency=rowCurrency;
    items.push({sku,descriptionEn,descriptionAr,quantity,unit:(data.unit??'').trim(),unitCost});
  }
  if(!items.length)return null;
  return {
    supplierName:metadata(matrix,['supplier','supplier name','vendor','vendor name','المورد','اسم المورد']),
    supplierTaxId:metadata(matrix,['vat','vat number','tax id','tax number','الرقم الضريبي','رقم الضريبة']),
    documentNumber:metadata(matrix,['invoice number','invoice no','proforma number','proforma no','document number','رقم الفاتورة','رقم المستند']),
    date:isoDate(metadata(matrix,['date','invoice date','document date','التاريخ','تاريخ الفاتورة'])),
    currency:detectedCurrency,
    freight:safeDecimal(metadata(matrix,['freight','shipping','الشحن'])),
    duty:safeDecimal(metadata(matrix,['duty','customs','customs duty','الجمارك','الرسوم الجمركية'])),
    otherCosts:safeDecimal(metadata(matrix,['other costs','other charges','تكاليف أخرى','رسوم أخرى'])),
    paymentTerms:metadata(matrix,['payment terms','terms of payment','شروط الدفع']),
    notes:'',
    items
  };
}

/** Combine source fragments only when their commercial identity and currency agree.
 * Used by workbooks and multi-file review; nothing is committed here. */
export function combineSupplierImportDrafts(sources:Array<{name:string;draft:SupplierImportDraft}>):SupplierImportDraft{
  if(!sources.length)throw new Error('No supplier import sources were provided.');
  const merged:SupplierImportDraft={...sources[0]!.draft,items:[],sourceSheets:[],skippedSheets:[]};
  const fields:Array<keyof Omit<SupplierImportDraft,'items'|'notes'|'sourceSheets'|'skippedSheets'>>=[
    'supplierName','supplierTaxId','documentNumber','date','currency','freight','duty','otherCosts','paymentTerms'
  ];
  for(const {name,draft} of sources){
    if(!Array.isArray(draft.items)||!draft.items.length)throw new Error(`Supplier import: "${name}" has no purchase lines. Nothing was saved.`);
    for(const field of fields){
      const value=draft[field].trim(),existing=merged[field].trim();
      if(value&&existing&&value!==existing)throw new Error(`Supplier import: "${name}" conflicts on ${field} (${existing} / ${value}). Split the source documents before saving.`);
      if(value&&!existing)merged[field]=value;
    }
    merged.items.push(...draft.items);
    if(draft.sourceSheets?.length)merged.sourceSheets!.push(...draft.sourceSheets.map(row=>({name:`${name} / ${row.name}`,itemCount:row.itemCount})));
    else merged.sourceSheets!.push({name,itemCount:draft.items.length});
    merged.skippedSheets!.push(...(draft.skippedSheets??[]).map(sheet=>`${name} / ${sheet}`));
  }
  return merged;
}

export function extractSupplierDraftFromSheets(sheets:Array<{name?:string;matrix:unknown[][]}>):SupplierImportDraft|null{
  const sources:Array<{name:string;draft:SupplierImportDraft}>=[];
  const skipped:string[]=[];
  for(let index=0;index<sheets.length;index+=1){
    const sheet=sheets[index]!,name=sheet.name||`Sheet ${index+1}`;
    if(headerIndex(sheet.matrix)<0){skipped.push(name);continue;}
    let draft:SupplierImportDraft|null;
    try{draft=extractSupplierDraftLocally(sheet.matrix);}
    catch(error){throw new Error(`${name}: ${error instanceof Error?error.message:String(error)}`);}
    if(!draft)throw new Error(`Supplier import: worksheet "${name}" has recognizable headers but no complete lines. No draft was saved.`);
    sources.push({name,draft});
  }
  if(!sources.length)return null;
  const merged=combineSupplierImportDrafts(sources);
  merged.skippedSheets=skipped;
  return merged;
}
