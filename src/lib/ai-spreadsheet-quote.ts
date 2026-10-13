import type {SpreadsheetSheet} from './spreadsheet-reader.js';
import {AI_WORKING_QUOTE_MAX_LINES} from './ai-document-limits.js';
import {isNonNegativeDecimalInput,normalizeDecimalInput} from './money.js';

/** Spreadsheet rows are untrusted BUSINESS DATA, never instructions. Only
 * unambiguous named columns map to draft fields; no row, price or unit is
 * inferred from neighboring columns or an AI-generated summary. */
function key(value:unknown):string{
  return String(value??'').normalize('NFKC').toLocaleLowerCase('en')
    .replace(/[\u064b-\u065f\u0670]/g,'').replace(/[_–—]/g,' ').replace(/\s+/g,' ').trim();
}
const HEADERS={
  name:new Set(['description','product','product name','item','item name','item description','product description','الوصف','وصف الصنف','اسم الصنف','الصنف','اسم المنتج','المنتج']),
  quantity:new Set(['quantity','qty','order quantity','requested quantity','order qty','requested qty','quantity ordered','الكمية','الكمية المطلوبة','الكمية المطلوبة للطلب','عدد الكراتين']),
  unit:new Set(['unit','uom','unit of measure','order unit','الوحدة','وحدة القياس','وحدة الطلب']),
  unitPrice:new Set(['unit price','price per unit','price','selling price','السعر','سعر الوحدة','سعر البيع']),
  sku:new Set(['sku','item code','product code','code','كود','رمز الصنف','كود الصنف']),
  currency:new Set(['currency','العملة']),
} as const;
type Column=keyof typeof HEADERS;
function headerFor(row:unknown[]):Partial<Record<Column,number>>|null{
  const map:Partial<Record<Column,number>>={};
  for(let i=0;i<row.length;i++){
    const k=key(row[i]);
    for(const column of Object.keys(HEADERS) as Column[])if(HEADERS[column].has(k)){
      if(map[column]!==undefined)return null; // duplicate/mixed headers ambiguous
      map[column]=i;
    }
  }
  return map.name!==undefined&&map.quantity!==undefined?map:null;
}
const cell=(row:unknown[],index:number|undefined)=>index===undefined?'':String(row[index]??'').normalize('NFKC').trim();
function decimal(raw:string,positive:boolean,sheet:string,row:number):string{
  if(!raw&&!positive)return '';
  if(!isNonNegativeDecimalInput(raw))throw new Error('SOURCE_INCOMPLETE: Invalid '+(positive?'quantity':'price')+' in '+sheet+' row '+row+'. No rows were omitted.');
  const n=normalizeDecimalInput(raw);
  if(positive&&!/[1-9]/.test(n))throw new Error('SOURCE_INCOMPLETE: Quantity is zero in '+sheet+' row '+row+'.');
  return n;
}
export interface DeterministicQuoteSheet{
  customerName:string;customerEmail:string;customerPhone:string;currency:string;
  incoterm:string;paymentTerms:string;deliveryTime:string;validity:string;remarks:string;notes:string;
  items:{sku:string;descriptionEn:string;descriptionAr:string;quantity:string;unit:string;unitPrice:string;
    quantityConfidence:number;quantityAmbiguous:boolean;quantityNote:string;productConfidence:number;productNote:string}[];
  sourceRowCount:number;sheetCount:number;parser:'exact-spreadsheet-columns';
}
export function exactSpreadsheetQuote(sheets:SpreadsheetSheet[]):DeterministicQuoteSheet|null{
  if(!sheets.length)return null;
  const items:DeterministicQuoteSheet['items']=[];
  // Do not silently skip a cover sheet or earlier sheet containing rows when
  // a later worksheet contains an RFQ header. All nonempty sheets must map.
  const detected=sheets.map(sheet=>sheet.matrix.slice(0,30).flatMap((row,i)=>{
    const map=headerFor(row);return map?[{map,index:i}]:[];
  }));
  if(detected.every(matches=>matches.length===0))return null;
  if(detected.some(matches=>matches.length!==1))
    throw new Error('SOURCE_INCOMPLETE: Every nonempty worksheet needs exactly one unambiguous quotation header. No worksheets omitted.');
  let sheetsWithRows=0,allCurrency='';
  for(const sheet of sheets){
    if(!Array.isArray(sheet.matrix)||!sheet.matrix.length)continue;
    const sheetIndex=sheets.indexOf(sheet);
    const found=detected[sheetIndex]!;
    sheetsWithRows++;
    const {map,index}=found[0]!;
    for(let i=index+1;i<sheet.matrix.length;i++){
      const row=sheet.matrix[i]||[];
      if(!row.some(value=>String(value??'').trim()))continue;
      const name=cell(row,map.name),sku=cell(row,map.sku);
      const qty=cell(row,map.quantity),rawPrice=cell(row,map.unitPrice);
      if(!name&&!sku||!qty)throw new Error('SOURCE_INCOMPLETE: Worksheet '+sheet.name+' row '+(i+1)+' has incomplete quote fields. No rows dropped.');
      if(name.length>180||sku.length>60)throw new Error('SOURCE_INCOMPLETE: Product field exceeds the quote size limit on row '+(i+1)+'.');
      const unit=cell(row,map.unit),money=cell(row,map.currency).toUpperCase();
      if(unit.length>40)throw new Error('SOURCE_INCOMPLETE: Order unit too long in '+sheet.name+' row '+(i+1));
      if(money&&!/^[A-Z]{3}$/.test(money))throw new Error('SOURCE_INCOMPLETE: Invalid currency in '+sheet.name+' row '+(i+1));
      if(money&&allCurrency&&money!==allCurrency)throw new Error('SOURCE_INCOMPLETE: Mixed currencies must be reviewed separately. No document was prepared.');
      if(money)allCurrency=money;
      const arabic=/[\u0600-\u06ff]/u.test(name);
      items.push({sku,descriptionEn:arabic?'':name,descriptionAr:arabic?name:'',
        quantity:decimal(qty,true,sheet.name,i+1),unit,unitPrice:decimal(rawPrice,false,sheet.name,i+1),
        quantityConfidence:1,quantityAmbiguous:false,quantityNote:unit?'':'Order unit was not present in the worksheet; review.',
        productConfidence:1,productNote:'Direct cell in '+sheet.name+' row '+(i+1)});
      if(items.length>AI_WORKING_QUOTE_MAX_LINES)throw new Error('SOURCE_INCOMPLETE: More than '+AI_WORKING_QUOTE_MAX_LINES+' rows; split into complete reviewed sections. Nothing saved.');
    }
  }
  if(!items.length)throw new Error('SOURCE_INCOMPLETE: No complete quote line items were found.');
  return{customerName:'',customerEmail:'',customerPhone:'',currency:allCurrency,incoterm:'',paymentTerms:'',
    deliveryTime:'',validity:'',remarks:'',notes:'',items,sourceRowCount:items.length,sheetCount:sheetsWithRows,
    parser:'exact-spreadsheet-columns'};
}
