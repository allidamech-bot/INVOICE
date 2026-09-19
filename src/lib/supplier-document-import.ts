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
  const items:SupplierImportItem[]=[];
  let detectedCurrency=headerCurrency;
  for(const row of matrix.slice(head+1)){
    if(!row.some(value=>clean(value)))continue;
    const data:Partial<Record<SupplierColumn,string>>={};
    columns.forEach((field,index)=>{if(field)data[field]=clean(row[index]);});
    const quantity=safeDecimal(data.quantity);const unitCost=safeDecimal(data.unitCost);
    const sku=(data.sku??'').trim();const descriptionEn=(data.descriptionEn??'').trim();const descriptionAr=(data.descriptionAr??'').trim();
    if(!quantity||!unitCost||(!sku&&!descriptionEn&&!descriptionAr))continue;
    if(currencyColumn>=0&&!detectedCurrency)detectedCurrency=currencyHint(row[currencyColumn]);
    items.push({sku,descriptionEn,descriptionAr,quantity,unit:(data.unit??'').trim()||'PCS',unitCost});
  }
  if(!items.length)return null;
  const explicitCurrency=metadata(matrix,['currency','invoice currency','عملة','العملة']);
  return {
    supplierName:metadata(matrix,['supplier','supplier name','vendor','vendor name','المورد','اسم المورد']),
    supplierTaxId:metadata(matrix,['vat','vat number','tax id','tax number','الرقم الضريبي','رقم الضريبة']),
    documentNumber:metadata(matrix,['invoice number','invoice no','proforma number','proforma no','document number','رقم الفاتورة','رقم المستند']),
    date:isoDate(metadata(matrix,['date','invoice date','document date','التاريخ','تاريخ الفاتورة'])),
    currency:currencyHint(explicitCurrency)||detectedCurrency,
    freight:safeDecimal(metadata(matrix,['freight','shipping','الشحن']))||'0.00',
    duty:safeDecimal(metadata(matrix,['duty','customs','customs duty','الجمارك','الرسوم الجمركية']))||'0.00',
    otherCosts:safeDecimal(metadata(matrix,['other costs','other charges','تكاليف أخرى','رسوم أخرى']))||'0.00',
    paymentTerms:metadata(matrix,['payment terms','terms of payment','شروط الدفع']),
    notes:'',
    items
  };
}

export function extractSupplierDraftFromSheets(sheets:Array<{matrix:unknown[][]}>):SupplierImportDraft|null{
  for(const sheet of sheets){const draft=extractSupplierDraftLocally(sheet.matrix);if(draft)return draft;}
  return null;
}
