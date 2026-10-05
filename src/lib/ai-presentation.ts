export type AiPresentationLanguage='en'|'ar';

const FIELD_LABELS:Record<string,[string,string]>={
  sku:['SKU','رمز المنتج'],
  hsCode:['HS Code','الرمز الجمركي'],
  cost:['Cost','التكلفة'],
  unitCost:['Unit cost','تكلفة الوحدة'],
  descriptionAr:['Arabic description','الوصف العربي'],
  descriptionEn:['English description','الوصف الإنجليزي'],
  origin:['Origin','بلد المنشأ'],
  packing:['Packing','التعبئة'],
  unit:['Unit','الوحدة'],
  currency:['Currency','العملة'],
  salePrice:['Selling price','سعر البيع'],
  sellingPrice:['Selling price','سعر البيع'],
  barcode:['Barcode','الباركود'],
  category:['Category','التصنيف'],
};

const KIND_LABELS:Record<string,[string,string]>={
  collection:['Collections','التحصيل'],
  'quote-expiry':['Quotation follow-up','متابعة عرض السعر'],
  'stale-quotation':['Quotation follow-up','متابعة عرض السعر'],
  'purchase-draft':['Purchase review','مراجعة المشتريات'],
  pricing:['Pricing','التسعير'],
  'cost-change':['Supplier cost','تكلفة المورد'],
  'product-data':['Product data','بيانات المنتج'],
  inventory:['Inventory','المخزون'],
  'credit-limit':['Credit exposure','التعرض الائتماني'],
  'supplier-obligation':['Supplier obligations','التزامات الموردين'],
  treasury:['Treasury','الخزينة'],
  'expense-trend':['Expense trend','اتجاه المصروفات'],
  'conditional-task':['Reminder','تذكير'],
};

const MEMORY_KIND_LABELS:Record<string,[string,string]>={note:['Note','ملاحظة'],preference:['Preference','تفضيل'],fact:['Saved detail','معلومة محفوظة'],instruction:['Instruction','تعليمات']};
const STATUS_LABELS:Record<string,[string,string]>={open:['Open','مفتوحة'],done:['Completed','مكتملة'],completed:['Completed','مكتملة'],cancelled:['Cancelled','ملغاة']};
const RECURRENCE_LABELS:Record<string,[string,string]>={daily:['Daily','يوميًا'],weekly:['Weekly','أسبوعيًا'],monthly:['Monthly','شهريًا'],yearly:['Yearly','سنويًا']};

function pick(pair:[string,string]|undefined,language:AiPresentationLanguage,fallback:string):string{return pair?.[language==='ar'?1:0]||fallback;}
function readableFallback(value:string):string{return value.replace(/[_-]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase()).trim();}

export function aiFieldLabel(field:string,language:AiPresentationLanguage='en'):string{return pick(FIELD_LABELS[field],language,readableFallback(field));}
export function aiKindLabel(kind:string,language:AiPresentationLanguage='en'):string{return pick(KIND_LABELS[kind],language,readableFallback(kind));}
export function aiMemoryKindLabel(kind:string,language:AiPresentationLanguage='en'):string{return pick(MEMORY_KIND_LABELS[kind],language,readableFallback(kind));}
export function aiTaskStatusLabel(status:string,language:AiPresentationLanguage='en'):string{return pick(STATUS_LABELS[status],language,readableFallback(status));}
export function aiRecurrenceLabel(recurrence:string,language:AiPresentationLanguage='en'):string{if(!recurrence||recurrence==='none')return'';return pick(RECURRENCE_LABELS[recurrence],language,readableFallback(recurrence));}
export function aiPriorityLabel(category:string,language:AiPresentationLanguage='en'):string{const pair:Record<string,[string,string]>={urgent:['Critical','عاجلة'],attention:['High','مرتفعة'],opportunity:['Opportunity','فرصة'],info:['Normal','عادية']};return pick(pair[category],language,readableFallback(category));}

export function humanizeMissingFieldDetail(detail:string,language:AiPresentationLanguage='en'):string{
  const match=detail.trim().match(/^Missing:\s*(.+?)\.?$/i);if(!match)return detail;
  const fields=match[1]??'';const labels=fields.split(',').map(value=>value.trim()).filter(Boolean).map(value=>aiFieldLabel(value,language));
  if(!labels.length)return detail;
  return language==='ar'?`البيانات الناقصة: ${labels.join('، ')}.`:`Missing: ${labels.join(', ')}.`;
}

export function aiSignalDetail(detail:string,kind:string,language:AiPresentationLanguage='en'):string{return kind==='product-data'?humanizeMissingFieldDetail(detail,language):detail;}
