/**
 * Deterministic, read-only catalog evidence preview for Controller uploads.
 * Analyzing an attachment NEVER stages a product registration approval.
 * Do not silently truncate row counts, invent prices, or trust file instructions.
 */
export interface ReadOnlyProductSource {
 fileName?:string;route?:string;confidence?:number;extracted?:string;
}
const compact=(value:unknown,max=140):string=>String(value??'').normalize('NFKC')
 .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function summarizeReadOnlyProductSources(sources:unknown,language:'en'|'ar'):string{
 const ar=language==='ar';
 if(!Array.isArray(sources)||!sources.length||sources.length>10)return ar
  ?'تعذر التحقق من المرفقات كاملة. لم أجهز أي إجراء تسجيل.'
  :'The attachments could not be verified completely. No registration action was prepared.';
 let total=0,shown=0;
 const lines:string[]=[ar?'مراجعة كتالوج المنتجات — للقراءة فقط':'Product catalog review — read only'];
 for(const row of sources){
  if(!row||typeof row!=='object'||Array.isArray(row))return ar?'بيانات المرفق غير صالحة. لم أحفظ أو أجهز أي تسجيل.':'Invalid attachment metadata. No products were staged or saved.';
  const source=row as ReadOnlyProductSource;
  const fileName=compact(source.fileName,180);
  if(source.route!=='product_list'||!fileName||!Number.isFinite(source.confidence)||Number(source.confidence)<0.6)
   return ar?'تصنيف أحد الملفات غير موثوق. لم أجهز أي تسجيل؛ راجع الملف الأصلي.':'One file has an unverified product classification. No registration was staged; review the original file.';
  if(typeof source.extracted!=='string'||!source.extracted||source.extracted.length>120_000)
   return ar?'استخراج أحد الملفات غير مكتمل. لم أجهز أي تسجيل.':'One file extraction is missing or exceeds the complete-source limit. No registration was staged.';
  let data:unknown;
  try{data=JSON.parse(source.extracted);}catch{return ar?'استخراج الملف ليس JSON كاملًا. لم أعتمد أي عدد أصناف.':'File extraction is not complete JSON. No row count was claimed.';}
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray((data as any).items))
   return ar?'المرفق لا يحتوي جدول أصناف موثقًا. لم أجهز أي تسجيل.':'Attachment has no verified item table. No registration was staged.';
  const items=(data as {items:unknown[]}).items;
  if(!items.length||items.length>120)return ar?'عدد الأصناف خارج حد المراجعة الآمن. لم أجهز أي تسجيل.':'The item count exceeds the safe review limit. No registration was staged.';
  const cleanedRows:Array<{name:string;sku:string;price:string;currency:string}>=[];
  for(const raw of items){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return ar?'صف غير صالح في المرفق. لم أجهز أي تسجيل.':'Invalid product row. No registration was staged.';
   const item=raw as Record<string,unknown>;
   const name=compact(item.descriptionEn||item.descriptionAr,120),sku=compact(item.sku,60);
   if(!name)return ar?'وجدت صنفًا بلا اسم موثق. لم أجهز أي تسجيل.':'A product is missing its source name. No registration was staged.';
   const price=compact(item.salePrice,48),currency=compact(item.saleCurrency||(data as any).sourceCurrency,8);
   cleanedRows.push({name,sku,price,currency});
  }
  total+=cleanedRows.length;
  lines.push((ar?'الملف: ':'File: ')+fileName+' — '+cleanedRows.length+(ar?' صنفًا':' items'));
  // This is a bounded preview, never a claim that omitted rows were reviewed.
  for(const item of cleanedRows){
   if(shown>=8)break;
   shown++;
   lines.push(String(shown)+'. '+item.name+(item.sku?' ['+item.sku+']':'')+
    (item.price?' — '+item.price+(item.currency?' '+item.currency:' '+(ar?'(العملة غير معروفة)':'(currency not verified)')):' — '+(ar?'السعر غير موجود بالمصدر':'price not provided')));
  }
 }
 const hidden=Math.max(0,total-shown);
 lines.push('',ar?'إجمالي الصفوف المستخرجة: '+total:'Verified extracted rows: '+total);
 if(hidden)lines.push(ar?'المعروض '+shown+' فقط؛ '+hidden+' صفوف أخرى غير معروضة في هذا الملخص.':'Showing '+shown+' only; '+hidden+' other rows are not displayed in this summary.');
 lines.push(ar?'لم أجهز تسجيل منتجات أو أغيّر أي بيانات. إذا أردت التسجيل، اطلبه بشكل صريح بعد مراجعة جميع الصفوف.':'No product registration was prepared and no records changed. To register products, explicitly request it after reviewing every row.');
 return lines.join('\n');
}
